# 校园闲置物品智能交易平台

基于 Vue 3、FastAPI、PostgreSQL、MinIO、LangGraph 和 ChatOpenAI 的校园闲置物品交易毕业设计项目。

当前支持动态商品标签、智能需求匹配、图片存储、评论收藏、商品聊天、线下预约与交易完成确认。

## 1. 环境要求

- Python 3.11 或更高版本。
- Node.js 18 或更高版本。
- PostgreSQL 17（或兼容 PostgreSQL 的版本）。
- 可访问的 MinIO 服务。

## 2. 首次准备

### 2.1 创建 PostgreSQL 数据库

在 PostgreSQL 中创建数据库：

```sql
CREATE DATABASE campus_market;
```

项目首次启动时会自动创建数据表；后续代码新增的常用字段也会自动补充。开发阶段暂未使用 Alembic 迁移命令。

### 2.2 配置后端环境变量

进入后端目录并创建 `.env`：

```powershell
cd backend
Copy-Item .env.example .env
```

编辑 `backend/.env`，至少填写以下内容：

```ini
# PostgreSQL
DATABASE_URL=postgresql+psycopg://postgres:你的数据库密码@127.0.0.1:5432/campus_market

# JWT：自行填写足够长的随机字符串
JWT_SECRET_KEY=请替换为随机长字符串
JWT_EXPIRE_MINUTES=10080

# MinIO：不要把 http:// 写成 https://，除非服务器真的启用了 HTTPS
MINIO_ENDPOINT=192.168.174.20:19000
MINIO_ACCESS_KEY=你的MinIO账号
MINIO_SECRET_KEY=你的MinIO密码
MINIO_BUCKET=campus-market
MINIO_SECURE=false

# OpenAI 兼容模型接口
OPENAI_API_KEY=你的模型API密钥
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ENABLE_LLM_GENERATION=true

# 首次生成类别标签：优先质量
TEMPLATE_OPENAI_MODEL=kimi-k3.1-pro
TEMPLATE_LLM_TIMEOUT_SECONDS=45

# 买家类别识别和 query_plan：优先速度
MATCH_OPENAI_MODEL=deepseek-v4.1-flash-1017
MATCH_LLM_TIMEOUT_SECONDS=5
```

如果使用旧项目的 S3 风格变量，也兼容：`S3_ENDPOINT_URL`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET`。

### 2.3 准备 MinIO Bucket

在 MinIO 管理台创建 Bucket：

```text
campus-market
```

图片对象默认由后端保存为私有对象，再通过 `/api/v1/files/...` 受控读取。

## 3. 启动项目

建议打开两个终端，分别启动后端和前端。

### 3.1 启动后端

首次运行需要安装 Python 依赖：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

之后每次启动后端：

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

看到类似输出即表示成功：

```text
Uvicorn running on http://127.0.0.1:8000
```

可访问健康检查接口：

```text
http://127.0.0.1:8000/api/v1/health
```

### 3.2 启动前端

首次运行需要安装 Node 依赖：

```powershell
cd frontend
npm install
```

之后每次启动前端：

```powershell
cd frontend
npm run dev
```

打开浏览器访问：

```text
http://localhost:5173/campus-market/
```

前端会将 `/api` 请求自动代理至后端 `http://127.0.0.1:8000`。

## 4. 核心功能

### 卖家

- 注册、登录、修改昵称/头像/手机号。
- 输入物品名称后复用或生成动态标签模板。
- 发布最多 3 张图片的商品，第一张为封面。
- 下架后编辑价格、描述、标签和图片，再重新上架。
- 查看预约、确认/拒绝预约、确认交易完成。

### 买家

- 用自然语言描述购买需求。
- LangGraph 执行“类别识别 → 查询标签模板 → 生成 query_plan → SQL 预筛选 → 三态判断”。
- 查看明确匹配和待确认商品，并展示匹配理由。
- 收藏、评论、联系卖家、发起预约。
- 提交交易成功或交易失败原因。

### 预约与交易

```text
在售中 → 卖家确认预约 → 预约中
预约中 → 买家确认成功 → 待卖家确认完成
待卖家确认完成 → 卖家确认 → 已售出

预约中 → 买家标记交易失败 → 在售中
预约中 → 买家取消预约 → 在售中
```

系统不处理在线支付和物流；双方在线下验货、付款和交接。

## 5. 智能匹配说明

LLM 不直接生成 SQL。它只生成受 Pydantic 约束的 `query_plan`：

```json
{
  "max_price": 600,
  "filters": [
    { "field": "resolution", "op": "eq", "value": "1080P" }
  ],
  "unresolved": []
}
```

Python 校验标签字段后，通过 SQLAlchemy 对商品状态、类别和价格进行参数化查询；未填写关键标签的商品会进入“待确认”，不会被直接认定为满足条件。

## 6. 运行测试

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest .\tests -q
```

构建前端：

```powershell
cd frontend
npm run build
```

## 7. 常见问题

### 图片上传失败，提示 SSL 错误

如果 MinIO 地址是 `http://192.168.174.20:19000`，必须配置：

```ini
MINIO_ENDPOINT=192.168.174.20:19000
MINIO_SECURE=false
```

### 数据库工具中看不到表

确认后端已经成功启动一次，并在数据库工具中刷新数据库结构；项目会在启动时自动建表。

### 标签模板全部变成品牌、型号、成色

这通常代表模型调用超时或失败，系统使用了通用 fallback 模板。请检查 `ENABLE_LLM_GENERATION`、API Key、模型代码和网络；显示器、耳机、充电宝已有专用本地兜底模板。

### 买家匹配很慢

检查 `MATCH_OPENAI_MODEL` 是否使用了较快的模型，并确认 `MATCH_LLM_TIMEOUT_SECONDS` 没有设置过大。当前模型调用为零重试，超时后会进入受控回退逻辑，不会无限等待。

## 8. 相关文档

- [项目实施规划](项目实施规划.md)：当前实现范围、业务状态、数据模型和后续计划。
- `backend/.env.example`：后端环境变量示例。
