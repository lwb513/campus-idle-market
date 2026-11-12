from __future__ import annotations

import io
import os
from pathlib import PurePosixPath
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from minio import Minio


ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024


def _client() -> tuple[Minio, str]:
    # MINIO_* is this project's preferred naming. S3_* keeps compatibility
    # with the user's existing MinIO deployment configuration.
    raw_endpoint = os.getenv("MINIO_ENDPOINT") or os.getenv("S3_ENDPOINT_URL")
    access_key = os.getenv("MINIO_ACCESS_KEY") or os.getenv("S3_ACCESS_KEY")
    secret_key = os.getenv("MINIO_SECRET_KEY") or os.getenv("S3_SECRET_KEY")
    if not all([raw_endpoint, access_key, secret_key]):
        raise HTTPException(status_code=503, detail="MinIO 尚未配置，暂时无法上传图片")
    parsed = urlparse(raw_endpoint if "://" in raw_endpoint else f"//{raw_endpoint}")
    endpoint = parsed.netloc or parsed.path
    secure = parsed.scheme == "https" or os.getenv("MINIO_SECURE", "false").lower() == "true"
    bucket = os.getenv("MINIO_BUCKET") or os.getenv("S3_BUCKET") or "campus-market"
    return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure), bucket


def _ensure_bucket(client: Minio, bucket: str) -> None:
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)


async def upload_item_image(file: UploadFile, owner_id: int) -> tuple[str, str]:
    return await _upload_image(file, f"items/{owner_id}/unassigned")


async def upload_avatar_image(file: UploadFile, owner_id: int) -> tuple[str, str]:
    return await _upload_image(file, f"avatars/{owner_id}")


async def _upload_image(file: UploadFile, prefix: str) -> tuple[str, str]:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=422, detail="只支持 JPG、PNG 或 WebP 图片")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="图片不能为空")
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="单张图片不能超过 5MB")

    client, bucket = _client()
    suffix = ALLOWED_IMAGE_TYPES[file.content_type]
    object_key = f"{prefix}/{uuid4().hex}{suffix}"
    try:
        _ensure_bucket(client, bucket)
        client.put_object(bucket, object_key, io.BytesIO(content), len(content), content_type=file.content_type)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"图片上传到 MinIO 失败：{exc}") from exc
    return object_key, file.content_type


def read_item_image(object_key: str) -> tuple[bytes, str]:
    path = PurePosixPath(object_key)
    if not (object_key.startswith("items/") or object_key.startswith("avatars/")) or ".." in path.parts:
        raise HTTPException(status_code=404, detail="图片不存在")
    client, bucket = _client()
    response = None
    try:
        response = client.get_object(bucket, object_key)
        return response.read(), response.headers.get("Content-Type", "application/octet-stream")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=404, detail="图片不存在") from exc
    finally:
        if response:
            response.close()
            response.release_conn()
