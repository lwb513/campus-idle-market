import { onMounted, onUnmounted, reactive, ref } from 'vue';
import axios from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Bell, Calendar, ChatDotRound, Goods, ShoppingBag, Star } from '@element-plus/icons-vue';
const currentUser = ref(null);
const activePage = ref('sell');
const profileDrawer = ref(false);
const profileSaving = ref(false);
const avatarUploading = ref(false);
const profileForm = reactive({ nickname: '', phone: '' });
const authMode = ref('login');
const authLoading = ref(false);
const authForm = reactive({ username: '', nickname: '', phone: '', password: '' });
const items = ref([]);
const loadingItems = ref(false);
const dialogVisible = ref(false);
const resolving = ref(false);
const publishing = ref(false);
const template = ref(null);
const imageFiles = ref([]);
const detailVisible = ref(false);
const detailLoading = ref(false);
const selectedItem = ref(null);
const comments = ref([]);
const commentText = ref('');
const commentSubmitting = ref(false);
const buyerQuery = ref('');
const matchLoading = ref(false);
const matchSession = ref(null);
const clarificationAnswer = ref('');
const reservationVisible = ref(false);
const reservationSubmitting = ref(false);
const reservationForm = reactive({ agreedPrice: undefined, appointmentTime: '', location: '' });
const reservations = ref([]);
const reservationsLoading = ref(false);
const failureDialogVisible = ref(false);
const failedReservation = ref(null);
const failureSubmitting = ref(false);
const failureForm = reactive({ reason: '' });
const reservationEditVisible = ref(false);
const editingReservation = ref(null);
const reservationEditSubmitting = ref(false);
const reservationEditForm = reactive({ appointmentTime: '', location: '' });
const favorites = ref([]);
const notifications = ref([]);
const notificationsLoading = ref(false);
const chatThreads = ref([]);
const chatLines = ref([]);
const activeChat = ref(null);
const chatText = ref('');
const chatSending = ref(false);
const chatImageFile = ref(null);
let liveUpdateTimer;
const editItemVisible = ref(false);
const editingItem = ref(null);
const itemActionLoading = ref(false);
const editItemForm = reactive({ price: undefined, description: '', attributes: {} });
const editImageFiles = ref([]);
const form = reactive({ itemName: '', price: undefined, description: '', attributes: {} });
async function loadItems() {
    loadingItems.value = true;
    try {
        const { data } = await axios.get('/api/v1/items/mine');
        items.value = data;
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '加载在售商品失败');
    }
    finally {
        loadingItems.value = false;
    }
}
async function loadReservations() {
    reservationsLoading.value = true;
    try {
        const { data } = await axios.get('/api/v1/reservations/mine');
        reservations.value = data;
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '加载预约单失败');
    }
    finally {
        reservationsLoading.value = false;
    }
}
async function loadFavorites() {
    const { data } = await axios.get('/api/v1/favorites');
    favorites.value = data;
}
async function loadNotifications() {
    notificationsLoading.value = true;
    try {
        const { data } = await axios.get('/api/v1/notifications');
        notifications.value = data;
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '加载通知失败');
    }
    finally {
        notificationsLoading.value = false;
    }
}
async function loadChatThreads() {
    const { data } = await axios.get('/api/v1/chat/threads');
    chatThreads.value = data;
}
async function loadChatLines() {
    if (!activeChat.value)
        return;
    const { data } = await axios.get(`/api/v1/chat/items/${activeChat.value.item.id}/with/${activeChat.value.peer_id}`);
    chatLines.value = data;
}
async function openChat(peerId, item) {
    activePage.value = 'chat';
    activeChat.value = { item, peer_id: peerId, peer_nickname: item.seller_nickname || '校园用户', peer_avatar_url: item.seller_avatar_url, latest_content: '', latest_at: '', unread_count: 0 };
    chatLines.value = [];
    await Promise.all([loadChatThreads(), loadChatLines()]);
}
async function selectChat(thread) {
    activeChat.value = thread;
    await loadChatLines();
}
async function sendChatMessage() {
    if (!activeChat.value || (!chatText.value.trim() && !chatImageFile.value?.raw))
        return;
    chatSending.value = true;
    try {
        let imageObjectKey = null;
        if (chatImageFile.value?.raw) {
            const formData = new FormData();
            formData.append('file', chatImageFile.value.raw);
            const uploaded = await axios.post('/api/v1/uploads/images', formData);
            imageObjectKey = uploaded.data.object_key;
        }
        const { data } = await axios.post('/api/v1/chat/messages', { item_id: activeChat.value.item.id, receiver_id: activeChat.value.peer_id, content: chatText.value, image_object_key: imageObjectKey });
        chatLines.value.push(data);
        chatText.value = '';
        chatImageFile.value = null;
        await loadChatThreads();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '消息发送失败');
    }
    finally {
        chatSending.value = false;
    }
}
function selectChatImage(file) {
    chatImageFile.value = file;
}
const unreadCount = () => notifications.value.filter((item) => !item.is_read).length;
const unreadChatCount = () => chatThreads.value.reduce((total, thread) => total + thread.unread_count, 0);
const isFavorite = (itemId) => favorites.value.some((item) => item.id === itemId);
function startLiveUpdates() {
    if (liveUpdateTimer)
        window.clearInterval(liveUpdateTimer);
    liveUpdateTimer = window.setInterval(() => {
        if (!currentUser.value)
            return;
        void loadNotifications();
        void loadChatThreads();
        if (activePage.value === 'chat') {
            void loadChatLines();
        }
    }, 8000);
}
function selectPage(page) {
    activePage.value = page;
    if (activePage.value === 'reservations')
        void loadReservations();
    if (activePage.value === 'favorites')
        void loadFavorites();
    if (activePage.value === 'notifications')
        void loadNotifications();
    if (activePage.value === 'chat')
        void loadChatThreads();
}
function reservationStatusText(status) {
    return { pending: '待确认', confirmed: '已确认', buyer_completed: '待卖家确认完成', completed: '交易成功', failed: '交易失败', rejected: '已拒绝', cancelled: '已取消' }[status] ?? status;
}
function reservationStatusType(status) {
    return { pending: 'warning', confirmed: 'success', buyer_completed: 'warning', completed: 'success', failed: 'danger', rejected: 'info', cancelled: 'info' }[status] ?? 'info';
}
function itemStatusText(status) {
    return { on_sale: '在售中', reserved: '预约中', sold: '已售出', off_shelf: '已下架' }[status] ?? status;
}
function formatAppointmentTime(value) {
    return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
async function changeReservationStatus(reservation, action) {
    const actionText = { confirm: '确认', reject: '拒绝', cancel: '取消' }[action];
    try {
        await ElMessageBox.confirm(`${actionText}这条预约吗？`, `${actionText}预约`, { confirmButtonText: actionText, cancelButtonText: '返回', type: action === 'confirm' ? 'success' : 'warning' });
        await axios.post(`/api/v1/reservations/${reservation.id}/${action}`);
        ElMessage.success(`预约已${actionText}`);
        await loadReservations();
        await loadItems();
    }
    catch (error) {
        if (error !== 'cancel' && error !== 'close')
            ElMessage.error(error.response?.data?.detail ?? '操作失败');
    }
}
async function completeTransaction(reservation) {
    try {
        await ElMessageBox.confirm('请确认你们已线下验货、付款并完成交接。该操作会将商品标记为“已售出”。', '确认交易成功', { confirmButtonText: '确认成功', cancelButtonText: '暂不确认', type: 'success' });
        await axios.post(`/api/v1/reservations/${reservation.id}/complete`);
        ElMessage.success('已提交交易成功，等待卖家最终确认');
        await loadReservations();
        await loadItems();
    }
    catch (error) {
        if (error !== 'cancel' && error !== 'close')
            ElMessage.error(error.response?.data?.detail ?? '操作失败');
    }
}
async function sellerConfirmTransaction(reservation) {
    try {
        await ElMessageBox.confirm('确认后商品将标记为“已售出”，无法再参与搜索和预约。', '确认交易完成', { confirmButtonText: '确认完成', cancelButtonText: '返回', type: 'success' });
        await axios.post(`/api/v1/reservations/${reservation.id}/complete-confirm`);
        ElMessage.success('交易已完成，商品已标记为已售出');
        await loadReservations();
        await loadItems();
    }
    catch (error) {
        if (error !== 'cancel' && error !== 'close')
            ElMessage.error(error.response?.data?.detail ?? '操作失败');
    }
}
function openFailureDialog(reservation) {
    failedReservation.value = reservation;
    failureForm.reason = '';
    failureDialogVisible.value = true;
}
async function submitTransactionFailure() {
    if (!failedReservation.value || !failureForm.reason.trim())
        return ElMessage.warning('请填写交易失败原因');
    failureSubmitting.value = true;
    try {
        await axios.post(`/api/v1/reservations/${failedReservation.value.id}/fail`, { failure_reason: failureForm.reason });
        ElMessage.success('交易已终止，商品已恢复在售');
        failureDialogVisible.value = false;
        await loadReservations();
        await loadItems();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '操作失败');
    }
    finally {
        failureSubmitting.value = false;
    }
}
function openReservationEdit(reservation) {
    editingReservation.value = reservation;
    reservationEditForm.appointmentTime = reservation.appointment_time.slice(0, 19);
    reservationEditForm.location = reservation.location;
    reservationEditVisible.value = true;
}
async function saveReservationEdit() {
    if (!editingReservation.value || !reservationEditForm.appointmentTime || !reservationEditForm.location.trim())
        return ElMessage.warning('请填写交接时间和地点');
    reservationEditSubmitting.value = true;
    try {
        await axios.patch(`/api/v1/reservations/${editingReservation.value.id}`, { appointment_time: reservationEditForm.appointmentTime, location: reservationEditForm.location });
        ElMessage.success('预约信息已修改，等待对方重新确认');
        reservationEditVisible.value = false;
        await loadReservations();
        await loadItems();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '修改失败');
    }
    finally {
        reservationEditSubmitting.value = false;
    }
}
async function toggleFavorite() {
    if (!selectedItem.value)
        return;
    try {
        if (isFavorite(selectedItem.value.id)) {
            await axios.delete(`/api/v1/items/${selectedItem.value.id}/favorite`);
            ElMessage.success('已取消收藏');
        }
        else {
            await axios.post(`/api/v1/items/${selectedItem.value.id}/favorite`);
            ElMessage.success('已收藏');
        }
        await loadFavorites();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '操作失败');
    }
}
async function markNotificationsRead() {
    await axios.post('/api/v1/notifications/read-all');
    notifications.value = notifications.value.map((item) => ({ ...item, is_read: true }));
}
async function markNotificationRead(notification) {
    if (notification.is_read)
        return;
    try {
        await axios.post(`/api/v1/notifications/${notification.id}/read`);
        notification.is_read = true;
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '标记已读失败');
    }
}
async function startMatch() {
    if (!buyerQuery.value.trim())
        return ElMessage.warning('请描述你想购买的物品');
    matchLoading.value = true;
    try {
        const { data } = await axios.post('/api/v1/match/sessions', { query: buyerQuery.value });
        matchSession.value = data;
        clarificationAnswer.value = '';
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '需求匹配失败');
    }
    finally {
        matchLoading.value = false;
    }
}
async function continueMatch() {
    if (!matchSession.value || !clarificationAnswer.value.trim())
        return ElMessage.warning('请补充相关信息');
    matchLoading.value = true;
    try {
        const { data } = await axios.post(`/api/v1/match/sessions/${matchSession.value.id}/clarify`, { answer: clarificationAnswer.value });
        matchSession.value = data;
        clarificationAnswer.value = '';
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '继续匹配失败');
    }
    finally {
        matchLoading.value = false;
    }
}
function setToken(token) {
    localStorage.setItem('campus_market_token', token);
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
}
async function submitAuth() {
    if (!authForm.username || !authForm.password || (authMode.value === 'register' && (!authForm.nickname || !authForm.phone)))
        return ElMessage.warning('请填写完整信息');
    authLoading.value = true;
    try {
        const endpoint = authMode.value === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
        const payload = authMode.value === 'login'
            ? { username: authForm.username, password: authForm.password }
            : { username: authForm.username, nickname: authForm.nickname, phone: authForm.phone, password: authForm.password };
        const { data } = await axios.post(endpoint, payload);
        setToken(data.access_token);
        currentUser.value = data.user;
        authForm.password = '';
        await loadItems();
        await Promise.all([loadFavorites(), loadNotifications(), loadChatThreads()]);
        startLiveUpdates();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '登录失败，请稍后再试');
    }
    finally {
        authLoading.value = false;
    }
}
function logout() {
    localStorage.removeItem('campus_market_token');
    delete axios.defaults.headers.common.Authorization;
    currentUser.value = null;
    items.value = [];
    if (liveUpdateTimer)
        window.clearInterval(liveUpdateTimer);
    liveUpdateTimer = undefined;
    resetForm();
}
function openProfile() {
    if (!currentUser.value)
        return;
    profileForm.nickname = currentUser.value.nickname;
    profileForm.phone = currentUser.value.phone ?? '';
    profileDrawer.value = true;
}
async function saveProfile() {
    if (!profileForm.nickname.trim() || !profileForm.phone.trim())
        return ElMessage.warning('昵称和手机号不能为空');
    profileSaving.value = true;
    try {
        const { data } = await axios.patch('/api/v1/auth/me', { nickname: profileForm.nickname, phone: profileForm.phone });
        currentUser.value = data;
        ElMessage.success('昵称已更新');
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '更新失败');
    }
    finally {
        profileSaving.value = false;
    }
}
async function uploadAvatar(file) {
    if (!file.raw)
        return;
    avatarUploading.value = true;
    try {
        const data = new FormData();
        data.append('file', file.raw);
        const response = await axios.post('/api/v1/auth/me/avatar', data);
        currentUser.value = response.data;
        ElMessage.success('头像已更新');
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '头像上传失败');
    }
    finally {
        avatarUploading.value = false;
    }
}
function openPublishDialog() { dialogVisible.value = true; }
async function openItemDetail(itemId) {
    detailVisible.value = true;
    detailLoading.value = true;
    selectedItem.value = null;
    comments.value = [];
    try {
        const [itemResponse, commentResponse] = await Promise.all([
            axios.get(`/api/v1/items/${itemId}`),
            axios.get(`/api/v1/items/${itemId}/comments`),
        ]);
        selectedItem.value = itemResponse.data;
        comments.value = commentResponse.data;
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '加载商品详情失败');
        detailVisible.value = false;
    }
    finally {
        detailLoading.value = false;
    }
}
async function submitComment() {
    if (!selectedItem.value || !commentText.value.trim())
        return ElMessage.warning('请输入评论内容');
    commentSubmitting.value = true;
    try {
        const { data } = await axios.post(`/api/v1/items/${selectedItem.value.id}/comments`, { content: commentText.value });
        comments.value.unshift(data);
        commentText.value = '';
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '评论发布失败');
    }
    finally {
        commentSubmitting.value = false;
    }
}
function formatCommentTime(value) {
    return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function openReservation() {
    if (!selectedItem.value)
        return;
    reservationForm.agreedPrice = Number(selectedItem.value.price);
    reservationForm.appointmentTime = '';
    reservationForm.location = '';
    reservationVisible.value = true;
}
async function submitReservation() {
    if (!selectedItem.value || !reservationForm.agreedPrice || !reservationForm.appointmentTime || !reservationForm.location.trim())
        return ElMessage.warning('请填写约定价格、交接时间和地点');
    reservationSubmitting.value = true;
    try {
        await axios.post('/api/v1/reservations', { item_id: selectedItem.value.id, agreed_price: reservationForm.agreedPrice, appointment_time: reservationForm.appointmentTime, location: reservationForm.location });
        ElMessage.success('预约已提交，等待卖家确认');
        reservationVisible.value = false;
        await loadReservations();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '提交预约失败');
    }
    finally {
        reservationSubmitting.value = false;
    }
}
async function deleteComment(comment) {
    try {
        await ElMessageBox.confirm('删除后无法恢复，确认删除这条评论吗？', '删除评论', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' });
        await axios.delete(`/api/v1/comments/${comment.id}`);
        comments.value = comments.value.filter((item) => item.id !== comment.id);
        ElMessage.success('评论已删除');
    }
    catch (error) {
        if (error !== 'cancel' && error !== 'close')
            ElMessage.error(error.response?.data?.detail ?? '删除评论失败');
    }
}
async function offShelfItem(item) {
    try {
        await ElMessageBox.confirm('下架后商品不会出现在买家搜索结果中，并且可以修改价格和描述。', '暂时下架商品', { confirmButtonText: '确认下架', cancelButtonText: '取消', type: 'warning' });
        itemActionLoading.value = true;
        await axios.post(`/api/v1/items/${item.id}/off-shelf`);
        ElMessage.success('商品已下架');
        await loadItems();
    }
    catch (error) {
        if (error !== 'cancel' && error !== 'close')
            ElMessage.error(error.response?.data?.detail ?? '下架失败');
    }
    finally {
        itemActionLoading.value = false;
    }
}
async function restoreItem(item) {
    itemActionLoading.value = true;
    try {
        await axios.post(`/api/v1/items/${item.id}/on-sale`);
        ElMessage.success('商品已重新上架');
        await loadItems();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '上架失败');
    }
    finally {
        itemActionLoading.value = false;
    }
}
function openEditItem(item) {
    editingItem.value = item;
    editItemForm.price = Number(item.price);
    editItemForm.description = item.description ?? '';
    editItemForm.attributes = { ...item.attributes };
    editImageFiles.value = item.images.map((image, index) => ({ name: `商品图片 ${index + 1}`, url: image.url, status: 'success', uid: -(index + 1), objectKey: image.object_key }));
    editItemVisible.value = true;
}
function makeCover(index) {
    const [image] = editImageFiles.value.splice(index, 1);
    if (image)
        editImageFiles.value.unshift(image);
}
async function uploadEditImages() {
    return Promise.all(editImageFiles.value.map(async (file) => {
        if (file.objectKey)
            return file.objectKey;
        if (!file.raw)
            throw new Error('图片文件无效，请重新选择');
        const data = new FormData();
        data.append('file', file.raw);
        const response = await axios.post('/api/v1/uploads/images', data);
        return response.data.object_key;
    }));
}
async function saveItemEdit() {
    if (!editingItem.value || !editItemForm.price)
        return ElMessage.warning('请填写有效的价格');
    itemActionLoading.value = true;
    try {
        const imageObjectKeys = await uploadEditImages();
        await axios.patch(`/api/v1/items/${editingItem.value.id}`, { price: editItemForm.price, description: editItemForm.description || null, attributes: editItemForm.attributes, image_object_keys: imageObjectKeys });
        ElMessage.success('商品信息已保存');
        editItemVisible.value = false;
        await loadItems();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '保存失败');
    }
    finally {
        itemActionLoading.value = false;
    }
}
async function deleteSellerItem(item) {
    try {
        await ElMessageBox.confirm(`确定永久删除“${item.item_name}”吗？删除后无法恢复。`, '删除商品', { confirmButtonText: '永久删除', cancelButtonText: '取消', type: 'error' });
        itemActionLoading.value = true;
        await axios.delete(`/api/v1/items/${item.id}`);
        ElMessage.success('商品已删除');
        await loadItems();
    }
    catch (error) {
        if (error !== 'cancel' && error !== 'close')
            ElMessage.error(error.response?.data?.detail ?? '删除失败');
    }
    finally {
        itemActionLoading.value = false;
    }
}
function resetForm() {
    form.itemName = '';
    form.price = undefined;
    form.description = '';
    form.attributes = {};
    template.value = null;
    imageFiles.value = [];
}
function booleanValue(key) {
    const value = form.attributes[key];
    return value === true ? 'true' : value === false ? 'false' : '';
}
function setBooleanValue(key, value) {
    if (value === '')
        delete form.attributes[key];
    else
        form.attributes[key] = value === 'true';
}
function editBooleanValue(key) {
    const value = editItemForm.attributes[key];
    return value === true ? 'true' : value === false ? 'false' : '';
}
function setEditBooleanValue(key, value) {
    if (value === '')
        delete editItemForm.attributes[key];
    else
        editItemForm.attributes[key] = value === 'true';
}
async function confirmItemName() {
    if (!form.itemName.trim())
        return ElMessage.warning('请先输入物品名称');
    resolving.value = true;
    try {
        const { data } = await axios.post('/api/v1/publish/templates/resolve', { item_name: form.itemName });
        template.value = data;
        form.attributes = {};
        ElMessage.success(data.reused ? '已使用已有标签模板' : '已生成新的可选标签');
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? '生成标签失败，请稍后重试');
    }
    finally {
        resolving.value = false;
    }
}
async function uploadImages() {
    return Promise.all(imageFiles.value.map(async (file) => {
        if (!file.raw)
            throw new Error('图片文件无效，请重新选择');
        const data = new FormData();
        data.append('file', file.raw);
        const response = await axios.post('/api/v1/uploads/images', data);
        return response.data.object_key;
    }));
}
async function publish() {
    if (!template.value || form.price === undefined)
        return ElMessage.warning('请确认物品名称并填写价格');
    publishing.value = true;
    try {
        const imageObjectKeys = await uploadImages();
        await axios.post('/api/v1/items', {
            item_name: form.itemName,
            template_id: template.value.id,
            price: form.price,
            description: form.description || null,
            attributes: form.attributes,
            image_object_keys: imageObjectKeys,
        });
        ElMessage.success('商品已发布');
        dialogVisible.value = false;
        resetForm();
        await loadItems();
    }
    catch (error) {
        ElMessage.error(error.response?.data?.detail ?? error.message ?? '发布失败');
    }
    finally {
        publishing.value = false;
    }
}
onMounted(async () => {
    const token = localStorage.getItem('campus_market_token');
    if (!token)
        return;
    setToken(token);
    try {
        const { data } = await axios.get('/api/v1/auth/me');
        currentUser.value = data;
        await loadItems();
        await Promise.all([loadFavorites(), loadNotifications(), loadChatThreads()]);
        startLiveUpdates();
    }
    catch {
        logout();
    }
});
onUnmounted(() => { if (liveUpdateTimer)
    window.clearInterval(liveUpdateTimer); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (!__VLS_ctx.currentUser) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "auth-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "auth-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.authMode === 'login' ? '登录账户' : '创建账户');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "auth-tip" },
    });
    const __VLS_0 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onSubmit': {} },
        labelPosition: "top",
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onSubmit': {} },
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onSubmit: (__VLS_ctx.submitAuth)
    };
    __VLS_3.slots.default;
    const __VLS_8 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        label: "用户名",
    }));
    const __VLS_10 = __VLS_9({
        label: "用户名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        modelValue: (__VLS_ctx.authForm.username),
        autocomplete: "username",
        placeholder: "3 至 30 个字符，不含空格",
    }));
    const __VLS_14 = __VLS_13({
        modelValue: (__VLS_ctx.authForm.username),
        autocomplete: "username",
        placeholder: "3 至 30 个字符，不含空格",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    if (__VLS_ctx.authMode === 'register') {
        const __VLS_16 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            label: "昵称",
        }));
        const __VLS_18 = __VLS_17({
            label: "昵称",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        const __VLS_20 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            modelValue: (__VLS_ctx.authForm.nickname),
            placeholder: "页面展示名称",
        }));
        const __VLS_22 = __VLS_21({
            modelValue: (__VLS_ctx.authForm.nickname),
            placeholder: "页面展示名称",
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        var __VLS_19;
    }
    if (__VLS_ctx.authMode === 'register') {
        const __VLS_24 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            label: "手机号",
        }));
        const __VLS_26 = __VLS_25({
            label: "手机号",
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_27.slots.default;
        const __VLS_28 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            modelValue: (__VLS_ctx.authForm.phone),
            inputmode: "numeric",
            maxlength: "11",
            placeholder: "用于线下预约时联系对方",
        }));
        const __VLS_30 = __VLS_29({
            modelValue: (__VLS_ctx.authForm.phone),
            inputmode: "numeric",
            maxlength: "11",
            placeholder: "用于线下预约时联系对方",
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        var __VLS_27;
    }
    const __VLS_32 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        label: "密码",
    }));
    const __VLS_34 = __VLS_33({
        label: "密码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    const __VLS_36 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.authForm.password),
        type: "password",
        showPassword: true,
        autocomplete: "current-password",
        placeholder: "至少 6 位",
    }));
    const __VLS_38 = __VLS_37({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.authForm.password),
        type: "password",
        showPassword: true,
        autocomplete: "current-password",
        placeholder: "至少 6 位",
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    let __VLS_40;
    let __VLS_41;
    let __VLS_42;
    const __VLS_43 = {
        onKeyup: (__VLS_ctx.submitAuth)
    };
    var __VLS_39;
    var __VLS_35;
    const __VLS_44 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ 'onClick': {} },
        type: "primary",
        size: "large",
        ...{ class: "auth-button" },
        loading: (__VLS_ctx.authLoading),
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onClick': {} },
        type: "primary",
        size: "large",
        ...{ class: "auth-button" },
        loading: (__VLS_ctx.authLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onClick: (__VLS_ctx.submitAuth)
    };
    __VLS_47.slots.default;
    (__VLS_ctx.authMode === 'login' ? '登录' : '注册并登录');
    var __VLS_47;
    var __VLS_3;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "auth-switch" },
    });
    (__VLS_ctx.authMode === 'login' ? '还没有账户？' : '已有账户？');
    const __VLS_52 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_54 = __VLS_53({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    let __VLS_56;
    let __VLS_57;
    let __VLS_58;
    const __VLS_59 = {
        onClick: (...[$event]) => {
            if (!(!__VLS_ctx.currentUser))
                return;
            __VLS_ctx.authMode = __VLS_ctx.authMode === 'login' ? 'register' : 'login';
        }
    };
    __VLS_55.slots.default;
    (__VLS_ctx.authMode === 'login' ? '去注册' : '去登录');
    var __VLS_55;
}
else {
    const __VLS_60 = {}.ElContainer;
    /** @type {[typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, typeof __VLS_components.ElContainer, typeof __VLS_components.elContainer, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ class: "app-shell" },
    }));
    const __VLS_62 = __VLS_61({
        ...{ class: "app-shell" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    var __VLS_64 = {};
    __VLS_63.slots.default;
    const __VLS_65 = {}.ElAside;
    /** @type {[typeof __VLS_components.ElAside, typeof __VLS_components.elAside, typeof __VLS_components.ElAside, typeof __VLS_components.elAside, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
        width: "220px",
        ...{ class: "side-nav" },
    }));
    const __VLS_67 = __VLS_66({
        width: "220px",
        ...{ class: "side-nav" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_68.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.currentUser))
                    return;
                __VLS_ctx.activePage = 'sell';
            } },
        ...{ class: "nav-brand" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "nav-caption" },
    });
    const __VLS_69 = {}.ElMenu;
    /** @type {[typeof __VLS_components.ElMenu, typeof __VLS_components.elMenu, typeof __VLS_components.ElMenu, typeof __VLS_components.elMenu, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
        ...{ 'onSelect': {} },
        defaultActive: (__VLS_ctx.activePage),
    }));
    const __VLS_71 = __VLS_70({
        ...{ 'onSelect': {} },
        defaultActive: (__VLS_ctx.activePage),
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    let __VLS_73;
    let __VLS_74;
    let __VLS_75;
    const __VLS_76 = {
        onSelect: (__VLS_ctx.selectPage)
    };
    __VLS_72.slots.default;
    const __VLS_77 = {}.ElMenuItem;
    /** @type {[typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
        index: "sell",
    }));
    const __VLS_79 = __VLS_78({
        index: "sell",
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    __VLS_80.slots.default;
    const __VLS_81 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({}));
    const __VLS_83 = __VLS_82({}, ...__VLS_functionalComponentArgsRest(__VLS_82));
    __VLS_84.slots.default;
    const __VLS_85 = {}.Goods;
    /** @type {[typeof __VLS_components.Goods, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({}));
    const __VLS_87 = __VLS_86({}, ...__VLS_functionalComponentArgsRest(__VLS_86));
    var __VLS_84;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_80;
    const __VLS_89 = {}.ElMenuItem;
    /** @type {[typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, ]} */ ;
    // @ts-ignore
    const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
        index: "buy",
    }));
    const __VLS_91 = __VLS_90({
        index: "buy",
    }, ...__VLS_functionalComponentArgsRest(__VLS_90));
    __VLS_92.slots.default;
    const __VLS_93 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({}));
    const __VLS_95 = __VLS_94({}, ...__VLS_functionalComponentArgsRest(__VLS_94));
    __VLS_96.slots.default;
    const __VLS_97 = {}.ShoppingBag;
    /** @type {[typeof __VLS_components.ShoppingBag, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({}));
    const __VLS_99 = __VLS_98({}, ...__VLS_functionalComponentArgsRest(__VLS_98));
    var __VLS_96;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_92;
    const __VLS_101 = {}.ElMenuItem;
    /** @type {[typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
        index: "favorites",
    }));
    const __VLS_103 = __VLS_102({
        index: "favorites",
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    __VLS_104.slots.default;
    const __VLS_105 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({}));
    const __VLS_107 = __VLS_106({}, ...__VLS_functionalComponentArgsRest(__VLS_106));
    __VLS_108.slots.default;
    const __VLS_109 = {}.Star;
    /** @type {[typeof __VLS_components.Star, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({}));
    const __VLS_111 = __VLS_110({}, ...__VLS_functionalComponentArgsRest(__VLS_110));
    var __VLS_108;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_104;
    const __VLS_113 = {}.ElMenuItem;
    /** @type {[typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        index: "chat",
    }));
    const __VLS_115 = __VLS_114({
        index: "chat",
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    __VLS_116.slots.default;
    const __VLS_117 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({}));
    const __VLS_119 = __VLS_118({}, ...__VLS_functionalComponentArgsRest(__VLS_118));
    __VLS_120.slots.default;
    const __VLS_121 = {}.ChatDotRound;
    /** @type {[typeof __VLS_components.ChatDotRound, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({}));
    const __VLS_123 = __VLS_122({}, ...__VLS_functionalComponentArgsRest(__VLS_122));
    var __VLS_120;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.unreadChatCount()) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
            ...{ class: "nav-chat-dot" },
        });
    }
    var __VLS_116;
    const __VLS_125 = {}.ElMenuItem;
    /** @type {[typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, ]} */ ;
    // @ts-ignore
    const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
        index: "reservations",
    }));
    const __VLS_127 = __VLS_126({
        index: "reservations",
    }, ...__VLS_functionalComponentArgsRest(__VLS_126));
    __VLS_128.slots.default;
    const __VLS_129 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({}));
    const __VLS_131 = __VLS_130({}, ...__VLS_functionalComponentArgsRest(__VLS_130));
    __VLS_132.slots.default;
    const __VLS_133 = {}.Calendar;
    /** @type {[typeof __VLS_components.Calendar, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({}));
    const __VLS_135 = __VLS_134({}, ...__VLS_functionalComponentArgsRest(__VLS_134));
    var __VLS_132;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    var __VLS_128;
    const __VLS_137 = {}.ElMenuItem;
    /** @type {[typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, typeof __VLS_components.ElMenuItem, typeof __VLS_components.elMenuItem, ]} */ ;
    // @ts-ignore
    const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
        index: "notifications",
    }));
    const __VLS_139 = __VLS_138({
        index: "notifications",
    }, ...__VLS_functionalComponentArgsRest(__VLS_138));
    __VLS_140.slots.default;
    const __VLS_141 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({}));
    const __VLS_143 = __VLS_142({}, ...__VLS_functionalComponentArgsRest(__VLS_142));
    __VLS_144.slots.default;
    const __VLS_145 = {}.Bell;
    /** @type {[typeof __VLS_components.Bell, ]} */ ;
    // @ts-ignore
    const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({}));
    const __VLS_147 = __VLS_146({}, ...__VLS_functionalComponentArgsRest(__VLS_146));
    var __VLS_144;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.unreadCount()) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "nav-unread-count" },
        });
        (__VLS_ctx.unreadCount());
    }
    var __VLS_140;
    var __VLS_72;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "nav-bottom" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "nav-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_149 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
        ...{ 'onClick': {} },
        ...{ class: "nav-logout" },
        type: "danger",
        plain: true,
    }));
    const __VLS_151 = __VLS_150({
        ...{ 'onClick': {} },
        ...{ class: "nav-logout" },
        type: "danger",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    let __VLS_153;
    let __VLS_154;
    let __VLS_155;
    const __VLS_156 = {
        onClick: (__VLS_ctx.logout)
    };
    __VLS_152.slots.default;
    var __VLS_152;
    var __VLS_68;
    const __VLS_157 = {}.ElMain;
    /** @type {[typeof __VLS_components.ElMain, typeof __VLS_components.elMain, typeof __VLS_components.ElMain, typeof __VLS_components.elMain, ]} */ ;
    // @ts-ignore
    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
        ...{ class: "workspace" },
    }));
    const __VLS_159 = __VLS_158({
        ...{ class: "workspace" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_158));
    __VLS_160.slots.default;
    if (__VLS_ctx.activePage === 'sell') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
            ...{ class: "seller-page" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "page-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "header-actions" },
        });
        const __VLS_161 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
            ...{ 'onClick': {} },
            ...{ class: "profile-trigger" },
            text: true,
        }));
        const __VLS_163 = __VLS_162({
            ...{ 'onClick': {} },
            ...{ class: "profile-trigger" },
            text: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_162));
        let __VLS_165;
        let __VLS_166;
        let __VLS_167;
        const __VLS_168 = {
            onClick: (__VLS_ctx.openProfile)
        };
        __VLS_164.slots.default;
        const __VLS_169 = {}.ElAvatar;
        /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
        // @ts-ignore
        const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
            size: (46),
            src: (__VLS_ctx.currentUser.avatar_url),
        }));
        const __VLS_171 = __VLS_170({
            size: (46),
            src: (__VLS_ctx.currentUser.avatar_url),
        }, ...__VLS_functionalComponentArgsRest(__VLS_170));
        __VLS_172.slots.default;
        (__VLS_ctx.currentUser.nickname.slice(0, 1).toUpperCase());
        var __VLS_172;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.currentUser.nickname);
        var __VLS_164;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "item-section" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingItems) }, null, null);
        if (!__VLS_ctx.loadingItems && __VLS_ctx.items.length === 0) {
            const __VLS_173 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
                description: "暂时没有在售商品",
            }));
            const __VLS_175 = __VLS_174({
                description: "暂时没有在售商品",
            }, ...__VLS_functionalComponentArgsRest(__VLS_174));
            __VLS_176.slots.default;
            const __VLS_177 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
                ...{ 'onClick': {} },
                type: "primary",
            }));
            const __VLS_179 = __VLS_178({
                ...{ 'onClick': {} },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_178));
            let __VLS_181;
            let __VLS_182;
            let __VLS_183;
            const __VLS_184 = {
                onClick: (__VLS_ctx.openPublishDialog)
            };
            __VLS_180.slots.default;
            var __VLS_180;
            var __VLS_176;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "item-grid" },
            });
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.items))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentUser))
                                return;
                            if (!(__VLS_ctx.activePage === 'sell'))
                                return;
                            if (!!(!__VLS_ctx.loadingItems && __VLS_ctx.items.length === 0))
                                return;
                            __VLS_ctx.openItemDetail(item.id);
                        } },
                    key: (item.id),
                    ...{ class: "item-card clickable" },
                });
                if (item.images[0]) {
                    const __VLS_185 = {}.ElImage;
                    /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                    // @ts-ignore
                    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
                        ...{ class: "cover" },
                        src: (item.images[0].url),
                        fit: "cover",
                    }));
                    const __VLS_187 = __VLS_186({
                        ...{ class: "cover" },
                        src: (item.images[0].url),
                        fit: "cover",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "cover placeholder" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "item-content" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "item-heading" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
                (item.item_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: (`status-${item.status}`) },
                });
                (__VLS_ctx.itemStatusText(item.status));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (Number(item.price).toFixed(2));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                (item.description || '卖家暂未填写补充描述');
                if (Object.keys(item.attributes).length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "tags" },
                    });
                    for (const [value, key] of __VLS_getVForSourceType((item.attributes))) {
                        const __VLS_189 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
                            key: (String(key)),
                            effect: "plain",
                        }));
                        const __VLS_191 = __VLS_190({
                            key: (String(key)),
                            effect: "plain",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_190));
                        __VLS_192.slots.default;
                        (item.attribute_labels[String(key)] || key);
                        (value === true ? '是' : value === false ? '否' : value);
                        var __VLS_192;
                    }
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: () => { } },
                    ...{ class: "seller-item-actions" },
                });
                if (item.status === 'on_sale') {
                    const __VLS_193 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
                        ...{ 'onClick': {} },
                        size: "small",
                        plain: true,
                        loading: (__VLS_ctx.itemActionLoading),
                    }));
                    const __VLS_195 = __VLS_194({
                        ...{ 'onClick': {} },
                        size: "small",
                        plain: true,
                        loading: (__VLS_ctx.itemActionLoading),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_194));
                    let __VLS_197;
                    let __VLS_198;
                    let __VLS_199;
                    const __VLS_200 = {
                        onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentUser))
                                return;
                            if (!(__VLS_ctx.activePage === 'sell'))
                                return;
                            if (!!(!__VLS_ctx.loadingItems && __VLS_ctx.items.length === 0))
                                return;
                            if (!(item.status === 'on_sale'))
                                return;
                            __VLS_ctx.offShelfItem(item);
                        }
                    };
                    __VLS_196.slots.default;
                    var __VLS_196;
                }
                else if (item.status === 'off_shelf') {
                    const __VLS_201 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "primary",
                        plain: true,
                    }));
                    const __VLS_203 = __VLS_202({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "primary",
                        plain: true,
                    }, ...__VLS_functionalComponentArgsRest(__VLS_202));
                    let __VLS_205;
                    let __VLS_206;
                    let __VLS_207;
                    const __VLS_208 = {
                        onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentUser))
                                return;
                            if (!(__VLS_ctx.activePage === 'sell'))
                                return;
                            if (!!(!__VLS_ctx.loadingItems && __VLS_ctx.items.length === 0))
                                return;
                            if (!!(item.status === 'on_sale'))
                                return;
                            if (!(item.status === 'off_shelf'))
                                return;
                            __VLS_ctx.openEditItem(item);
                        }
                    };
                    __VLS_204.slots.default;
                    var __VLS_204;
                    const __VLS_209 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "success",
                        plain: true,
                        loading: (__VLS_ctx.itemActionLoading),
                    }));
                    const __VLS_211 = __VLS_210({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "success",
                        plain: true,
                        loading: (__VLS_ctx.itemActionLoading),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_210));
                    let __VLS_213;
                    let __VLS_214;
                    let __VLS_215;
                    const __VLS_216 = {
                        onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentUser))
                                return;
                            if (!(__VLS_ctx.activePage === 'sell'))
                                return;
                            if (!!(!__VLS_ctx.loadingItems && __VLS_ctx.items.length === 0))
                                return;
                            if (!!(item.status === 'on_sale'))
                                return;
                            if (!(item.status === 'off_shelf'))
                                return;
                            __VLS_ctx.restoreItem(item);
                        }
                    };
                    __VLS_212.slots.default;
                    var __VLS_212;
                    const __VLS_217 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "danger",
                        plain: true,
                        loading: (__VLS_ctx.itemActionLoading),
                    }));
                    const __VLS_219 = __VLS_218({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "danger",
                        plain: true,
                        loading: (__VLS_ctx.itemActionLoading),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_218));
                    let __VLS_221;
                    let __VLS_222;
                    let __VLS_223;
                    const __VLS_224 = {
                        onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentUser))
                                return;
                            if (!(__VLS_ctx.activePage === 'sell'))
                                return;
                            if (!!(!__VLS_ctx.loadingItems && __VLS_ctx.items.length === 0))
                                return;
                            if (!!(item.status === 'on_sale'))
                                return;
                            if (!(item.status === 'off_shelf'))
                                return;
                            __VLS_ctx.deleteSellerItem(item);
                        }
                    };
                    __VLS_220.slots.default;
                    var __VLS_220;
                }
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "publish-cta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        const __VLS_225 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
            ...{ 'onClick': {} },
            type: "primary",
            size: "large",
        }));
        const __VLS_227 = __VLS_226({
            ...{ 'onClick': {} },
            type: "primary",
            size: "large",
        }, ...__VLS_functionalComponentArgsRest(__VLS_226));
        let __VLS_229;
        let __VLS_230;
        let __VLS_231;
        const __VLS_232 = {
            onClick: (__VLS_ctx.openPublishDialog)
        };
        __VLS_228.slots.default;
        var __VLS_228;
    }
    else if (__VLS_ctx.activePage === 'buy') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
            ...{ class: "buy-page" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "page-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "header-actions" },
        });
        const __VLS_233 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
            ...{ 'onClick': {} },
            ...{ class: "profile-trigger" },
            text: true,
        }));
        const __VLS_235 = __VLS_234({
            ...{ 'onClick': {} },
            ...{ class: "profile-trigger" },
            text: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_234));
        let __VLS_237;
        let __VLS_238;
        let __VLS_239;
        const __VLS_240 = {
            onClick: (__VLS_ctx.openProfile)
        };
        __VLS_236.slots.default;
        const __VLS_241 = {}.ElAvatar;
        /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
        // @ts-ignore
        const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
            size: (46),
            src: (__VLS_ctx.currentUser.avatar_url),
        }));
        const __VLS_243 = __VLS_242({
            size: (46),
            src: (__VLS_ctx.currentUser.avatar_url),
        }, ...__VLS_functionalComponentArgsRest(__VLS_242));
        __VLS_244.slots.default;
        (__VLS_ctx.currentUser.nickname.slice(0, 1).toUpperCase());
        var __VLS_244;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.currentUser.nickname);
        var __VLS_236;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "buy-search-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "buyer-search-row" },
        });
        const __VLS_245 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
            ...{ 'onKeyup': {} },
            modelValue: (__VLS_ctx.buyerQuery),
            size: "large",
            placeholder: "输入购买需求",
        }));
        const __VLS_247 = __VLS_246({
            ...{ 'onKeyup': {} },
            modelValue: (__VLS_ctx.buyerQuery),
            size: "large",
            placeholder: "输入购买需求",
        }, ...__VLS_functionalComponentArgsRest(__VLS_246));
        let __VLS_249;
        let __VLS_250;
        let __VLS_251;
        const __VLS_252 = {
            onKeyup: (__VLS_ctx.startMatch)
        };
        var __VLS_248;
        const __VLS_253 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
            ...{ 'onClick': {} },
            type: "primary",
            size: "large",
            loading: (__VLS_ctx.matchLoading),
        }));
        const __VLS_255 = __VLS_254({
            ...{ 'onClick': {} },
            type: "primary",
            size: "large",
            loading: (__VLS_ctx.matchLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_254));
        let __VLS_257;
        let __VLS_258;
        let __VLS_259;
        const __VLS_260 = {
            onClick: (__VLS_ctx.startMatch)
        };
        __VLS_256.slots.default;
        var __VLS_256;
        if (__VLS_ctx.matchSession?.status === 'needs_clarification') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "clarification-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "clarification-mark" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.matchSession.question);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "clarification-row" },
            });
            const __VLS_261 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.clarificationAnswer),
                placeholder: "请输入补充信息",
            }));
            const __VLS_263 = __VLS_262({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.clarificationAnswer),
                placeholder: "请输入补充信息",
            }, ...__VLS_functionalComponentArgsRest(__VLS_262));
            let __VLS_265;
            let __VLS_266;
            let __VLS_267;
            const __VLS_268 = {
                onKeyup: (__VLS_ctx.continueMatch)
            };
            var __VLS_264;
            const __VLS_269 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.matchLoading),
            }));
            const __VLS_271 = __VLS_270({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.matchLoading),
            }, ...__VLS_functionalComponentArgsRest(__VLS_270));
            let __VLS_273;
            let __VLS_274;
            let __VLS_275;
            const __VLS_276 = {
                onClick: (__VLS_ctx.continueMatch)
            };
            __VLS_272.slots.default;
            var __VLS_272;
        }
        else if (__VLS_ctx.matchSession?.status === 'completed') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "match-summary" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            if (__VLS_ctx.matchSession.criteria.item_name) {
                const __VLS_277 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({
                    type: "primary",
                }));
                const __VLS_279 = __VLS_278({
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_278));
                __VLS_280.slots.default;
                (__VLS_ctx.matchSession.criteria.item_name);
                var __VLS_280;
            }
            if (__VLS_ctx.matchSession.criteria.max_price !== null && __VLS_ctx.matchSession.criteria.max_price !== undefined) {
                const __VLS_281 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({}));
                const __VLS_283 = __VLS_282({}, ...__VLS_functionalComponentArgsRest(__VLS_282));
                __VLS_284.slots.default;
                (__VLS_ctx.matchSession.criteria.max_price);
                var __VLS_284;
            }
            for (const [value, key] of __VLS_getVForSourceType((__VLS_ctx.matchSession.criteria.constraints))) {
                const __VLS_285 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
                    key: (String(key)),
                }));
                const __VLS_287 = __VLS_286({
                    key: (String(key)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_286));
                __VLS_288.slots.default;
                (key);
                (value === true ? '是' : value);
                var __VLS_288;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "match-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "match-section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.matchSession.matched.length);
            if (__VLS_ctx.matchSession.matched.length === 0) {
                const __VLS_289 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_290 = __VLS_asFunctionalComponent(__VLS_289, new __VLS_289({
                    description: "没有找到明确满足条件的商品",
                    imageSize: (76),
                }));
                const __VLS_291 = __VLS_290({
                    description: "没有找到明确满足条件的商品",
                    imageSize: (76),
                }, ...__VLS_functionalComponentArgsRest(__VLS_290));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "item-grid" },
                });
                for (const [candidate] of __VLS_getVForSourceType((__VLS_ctx.matchSession.matched))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(!__VLS_ctx.currentUser))
                                    return;
                                if (!!(__VLS_ctx.activePage === 'sell'))
                                    return;
                                if (!(__VLS_ctx.activePage === 'buy'))
                                    return;
                                if (!!(__VLS_ctx.matchSession?.status === 'needs_clarification'))
                                    return;
                                if (!(__VLS_ctx.matchSession?.status === 'completed'))
                                    return;
                                if (!!(__VLS_ctx.matchSession.matched.length === 0))
                                    return;
                                __VLS_ctx.openItemDetail(candidate.item.id);
                            } },
                        key: (candidate.item.id),
                        ...{ class: "item-card clickable" },
                    });
                    if (candidate.item.images[0]) {
                        const __VLS_293 = {}.ElImage;
                        /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                        // @ts-ignore
                        const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
                            ...{ class: "cover" },
                            src: (candidate.item.images[0].url),
                            fit: "cover",
                        }));
                        const __VLS_295 = __VLS_294({
                            ...{ class: "cover" },
                            src: (candidate.item.images[0].url),
                            fit: "cover",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_294));
                    }
                    else {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "cover placeholder" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "item-content" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "item-heading" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
                    (candidate.item.item_name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (Number(candidate.item.price).toFixed(2));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                    (candidate.reasons.join('；'));
                }
            }
            if (__VLS_ctx.matchSession.uncertain.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                    ...{ class: "match-section uncertain-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "match-section-title" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.matchSession.uncertain.length);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "section-note" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "item-grid" },
                });
                for (const [candidate] of __VLS_getVForSourceType((__VLS_ctx.matchSession.uncertain))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(!__VLS_ctx.currentUser))
                                    return;
                                if (!!(__VLS_ctx.activePage === 'sell'))
                                    return;
                                if (!(__VLS_ctx.activePage === 'buy'))
                                    return;
                                if (!!(__VLS_ctx.matchSession?.status === 'needs_clarification'))
                                    return;
                                if (!(__VLS_ctx.matchSession?.status === 'completed'))
                                    return;
                                if (!(__VLS_ctx.matchSession.uncertain.length))
                                    return;
                                __VLS_ctx.openItemDetail(candidate.item.id);
                            } },
                        key: (candidate.item.id),
                        ...{ class: "item-card clickable" },
                    });
                    if (candidate.item.images[0]) {
                        const __VLS_297 = {}.ElImage;
                        /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                        // @ts-ignore
                        const __VLS_298 = __VLS_asFunctionalComponent(__VLS_297, new __VLS_297({
                            ...{ class: "cover" },
                            src: (candidate.item.images[0].url),
                            fit: "cover",
                        }));
                        const __VLS_299 = __VLS_298({
                            ...{ class: "cover" },
                            src: (candidate.item.images[0].url),
                            fit: "cover",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_298));
                    }
                    else {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "cover placeholder" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "item-content" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "item-heading" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
                    (candidate.item.item_name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (Number(candidate.item.price).toFixed(2));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                    (candidate.unknown_fields.join('、'));
                }
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "buy-placeholder" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "buy-icon" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        }
    }
    else if (__VLS_ctx.activePage === 'reservations') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
            ...{ class: "reservation-page" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "page-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "header-actions" },
        });
        const __VLS_301 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_302 = __VLS_asFunctionalComponent(__VLS_301, new __VLS_301({
            ...{ 'onClick': {} },
            ...{ class: "profile-trigger" },
            text: true,
        }));
        const __VLS_303 = __VLS_302({
            ...{ 'onClick': {} },
            ...{ class: "profile-trigger" },
            text: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_302));
        let __VLS_305;
        let __VLS_306;
        let __VLS_307;
        const __VLS_308 = {
            onClick: (__VLS_ctx.openProfile)
        };
        __VLS_304.slots.default;
        const __VLS_309 = {}.ElAvatar;
        /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
        // @ts-ignore
        const __VLS_310 = __VLS_asFunctionalComponent(__VLS_309, new __VLS_309({
            size: (46),
            src: (__VLS_ctx.currentUser.avatar_url),
        }));
        const __VLS_311 = __VLS_310({
            size: (46),
            src: (__VLS_ctx.currentUser.avatar_url),
        }, ...__VLS_functionalComponentArgsRest(__VLS_310));
        __VLS_312.slots.default;
        (__VLS_ctx.currentUser.nickname.slice(0, 1).toUpperCase());
        var __VLS_312;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.currentUser.nickname);
        var __VLS_304;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "reservation-list" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.reservationsLoading) }, null, null);
        if (!__VLS_ctx.reservationsLoading && __VLS_ctx.reservations.length === 0) {
            const __VLS_313 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_314 = __VLS_asFunctionalComponent(__VLS_313, new __VLS_313({
                description: "暂无预约单",
            }));
            const __VLS_315 = __VLS_314({
                description: "暂无预约单",
            }, ...__VLS_functionalComponentArgsRest(__VLS_314));
        }
        for (const [reservation] of __VLS_getVForSourceType((__VLS_ctx.reservations))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                key: (reservation.id),
                ...{ class: "reservation-card" },
            });
            if (reservation.item.images[0]) {
                const __VLS_317 = {}.ElImage;
                /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                // @ts-ignore
                const __VLS_318 = __VLS_asFunctionalComponent(__VLS_317, new __VLS_317({
                    ...{ class: "reservation-cover" },
                    src: (reservation.item.images[0].url),
                    fit: "cover",
                }));
                const __VLS_319 = __VLS_318({
                    ...{ class: "reservation-cover" },
                    src: (reservation.item.images[0].url),
                    fit: "cover",
                }, ...__VLS_functionalComponentArgsRest(__VLS_318));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "reservation-cover placeholder" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "reservation-content" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "reservation-heading" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "reservation-role" },
            });
            (reservation.role === 'buyer' ? '我发起的预约' : '我收到的预约');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
            (reservation.item.item_name);
            const __VLS_321 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_322 = __VLS_asFunctionalComponent(__VLS_321, new __VLS_321({
                type: (__VLS_ctx.reservationStatusType(reservation.status)),
                effect: "light",
            }));
            const __VLS_323 = __VLS_322({
                type: (__VLS_ctx.reservationStatusType(reservation.status)),
                effect: "light",
            }, ...__VLS_functionalComponentArgsRest(__VLS_322));
            __VLS_324.slots.default;
            (__VLS_ctx.reservationStatusText(reservation.status));
            var __VLS_324;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (reservation.counterpart_nickname);
            (['confirmed', 'buyer_completed', 'completed', 'failed'].includes(reservation.status) ? (reservation.counterpart_phone || '暂未填写') : '预约确认后可见');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (Number(reservation.agreed_price).toFixed(2));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.formatAppointmentTime(reservation.appointment_time));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (reservation.location);
            if (reservation.status === 'failed' && reservation.failure_reason) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "failure-reason" },
                });
                (reservation.failure_reason);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "reservation-actions" },
            });
            if (reservation.role === 'seller' && reservation.status === 'pending') {
                const __VLS_325 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
                    ...{ 'onClick': {} },
                    type: "success",
                }));
                const __VLS_327 = __VLS_326({
                    ...{ 'onClick': {} },
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_326));
                let __VLS_329;
                let __VLS_330;
                let __VLS_331;
                const __VLS_332 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!(reservation.role === 'seller' && reservation.status === 'pending'))
                            return;
                        __VLS_ctx.changeReservationStatus(reservation, 'confirm');
                    }
                };
                __VLS_328.slots.default;
                var __VLS_328;
                const __VLS_333 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_334 = __VLS_asFunctionalComponent(__VLS_333, new __VLS_333({
                    ...{ 'onClick': {} },
                }));
                const __VLS_335 = __VLS_334({
                    ...{ 'onClick': {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_334));
                let __VLS_337;
                let __VLS_338;
                let __VLS_339;
                const __VLS_340 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!(reservation.role === 'seller' && reservation.status === 'pending'))
                            return;
                        __VLS_ctx.changeReservationStatus(reservation, 'reject');
                    }
                };
                __VLS_336.slots.default;
                var __VLS_336;
            }
            else if (reservation.role === 'buyer' && reservation.status === 'confirmed') {
                const __VLS_341 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({
                    ...{ 'onClick': {} },
                    type: "success",
                }));
                const __VLS_343 = __VLS_342({
                    ...{ 'onClick': {} },
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_342));
                let __VLS_345;
                let __VLS_346;
                let __VLS_347;
                const __VLS_348 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!!(reservation.role === 'seller' && reservation.status === 'pending'))
                            return;
                        if (!(reservation.role === 'buyer' && reservation.status === 'confirmed'))
                            return;
                        __VLS_ctx.completeTransaction(reservation);
                    }
                };
                __VLS_344.slots.default;
                var __VLS_344;
                const __VLS_349 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_350 = __VLS_asFunctionalComponent(__VLS_349, new __VLS_349({
                    ...{ 'onClick': {} },
                    type: "danger",
                    plain: true,
                }));
                const __VLS_351 = __VLS_350({
                    ...{ 'onClick': {} },
                    type: "danger",
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_350));
                let __VLS_353;
                let __VLS_354;
                let __VLS_355;
                const __VLS_356 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!!(reservation.role === 'seller' && reservation.status === 'pending'))
                            return;
                        if (!(reservation.role === 'buyer' && reservation.status === 'confirmed'))
                            return;
                        __VLS_ctx.openFailureDialog(reservation);
                    }
                };
                __VLS_352.slots.default;
                var __VLS_352;
            }
            else if (reservation.role === 'seller' && reservation.status === 'buyer_completed') {
                const __VLS_357 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_358 = __VLS_asFunctionalComponent(__VLS_357, new __VLS_357({
                    ...{ 'onClick': {} },
                    type: "success",
                }));
                const __VLS_359 = __VLS_358({
                    ...{ 'onClick': {} },
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_358));
                let __VLS_361;
                let __VLS_362;
                let __VLS_363;
                const __VLS_364 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!!(reservation.role === 'seller' && reservation.status === 'pending'))
                            return;
                        if (!!(reservation.role === 'buyer' && reservation.status === 'confirmed'))
                            return;
                        if (!(reservation.role === 'seller' && reservation.status === 'buyer_completed'))
                            return;
                        __VLS_ctx.sellerConfirmTransaction(reservation);
                    }
                };
                __VLS_360.slots.default;
                var __VLS_360;
            }
            else if (reservation.role === 'buyer' && reservation.status === 'pending') {
                const __VLS_365 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_366 = __VLS_asFunctionalComponent(__VLS_365, new __VLS_365({
                    ...{ 'onClick': {} },
                    type: "danger",
                    plain: true,
                }));
                const __VLS_367 = __VLS_366({
                    ...{ 'onClick': {} },
                    type: "danger",
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_366));
                let __VLS_369;
                let __VLS_370;
                let __VLS_371;
                const __VLS_372 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!!(reservation.role === 'seller' && reservation.status === 'pending'))
                            return;
                        if (!!(reservation.role === 'buyer' && reservation.status === 'confirmed'))
                            return;
                        if (!!(reservation.role === 'seller' && reservation.status === 'buyer_completed'))
                            return;
                        if (!(reservation.role === 'buyer' && reservation.status === 'pending'))
                            return;
                        __VLS_ctx.changeReservationStatus(reservation, 'cancel');
                    }
                };
                __VLS_368.slots.default;
                var __VLS_368;
            }
            if (['pending', 'confirmed'].includes(reservation.status)) {
                const __VLS_373 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_374 = __VLS_asFunctionalComponent(__VLS_373, new __VLS_373({
                    ...{ 'onClick': {} },
                    plain: true,
                }));
                const __VLS_375 = __VLS_374({
                    ...{ 'onClick': {} },
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_374));
                let __VLS_377;
                let __VLS_378;
                let __VLS_379;
                const __VLS_380 = {
                    onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!(['pending', 'confirmed'].includes(reservation.status)))
                            return;
                        __VLS_ctx.openReservationEdit(reservation);
                    }
                };
                __VLS_376.slots.default;
                var __VLS_376;
            }
            const __VLS_381 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_382 = __VLS_asFunctionalComponent(__VLS_381, new __VLS_381({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_383 = __VLS_382({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_382));
            let __VLS_385;
            let __VLS_386;
            let __VLS_387;
            const __VLS_388 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.currentUser))
                        return;
                    if (!!(__VLS_ctx.activePage === 'sell'))
                        return;
                    if (!!(__VLS_ctx.activePage === 'buy'))
                        return;
                    if (!(__VLS_ctx.activePage === 'reservations'))
                        return;
                    __VLS_ctx.openItemDetail(reservation.item.id);
                }
            };
            __VLS_384.slots.default;
            var __VLS_384;
        }
    }
    else if (__VLS_ctx.activePage === 'favorites') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
            ...{ class: "reservation-page" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "page-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "item-section" },
        });
        if (__VLS_ctx.favorites.length === 0) {
            const __VLS_389 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_390 = __VLS_asFunctionalComponent(__VLS_389, new __VLS_389({
                description: "还没有收藏商品",
            }));
            const __VLS_391 = __VLS_390({
                description: "还没有收藏商品",
            }, ...__VLS_functionalComponentArgsRest(__VLS_390));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "item-grid" },
            });
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.favorites))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentUser))
                                return;
                            if (!!(__VLS_ctx.activePage === 'sell'))
                                return;
                            if (!!(__VLS_ctx.activePage === 'buy'))
                                return;
                            if (!!(__VLS_ctx.activePage === 'reservations'))
                                return;
                            if (!(__VLS_ctx.activePage === 'favorites'))
                                return;
                            if (!!(__VLS_ctx.favorites.length === 0))
                                return;
                            __VLS_ctx.openItemDetail(item.id);
                        } },
                    key: (item.id),
                    ...{ class: "item-card clickable" },
                });
                if (item.images[0]) {
                    const __VLS_393 = {}.ElImage;
                    /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                    // @ts-ignore
                    const __VLS_394 = __VLS_asFunctionalComponent(__VLS_393, new __VLS_393({
                        ...{ class: "cover" },
                        src: (item.images[0].url),
                        fit: "cover",
                    }));
                    const __VLS_395 = __VLS_394({
                        ...{ class: "cover" },
                        src: (item.images[0].url),
                        fit: "cover",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_394));
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "cover placeholder" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "item-content" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "item-heading" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
                (item.item_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: (`status-${item.status}`) },
                });
                (__VLS_ctx.itemStatusText(item.status));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (Number(item.price).toFixed(2));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                (item.description || '卖家暂未填写补充描述');
            }
        }
    }
    else if (__VLS_ctx.activePage === 'chat') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
            ...{ class: "chat-page" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "page-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "chat-layout" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
            ...{ class: "chat-threads" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        if (__VLS_ctx.chatThreads.length === 0) {
            const __VLS_397 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_398 = __VLS_asFunctionalComponent(__VLS_397, new __VLS_397({
                description: "暂无聊天记录",
                imageSize: (56),
            }));
            const __VLS_399 = __VLS_398({
                description: "暂无聊天记录",
                imageSize: (56),
            }, ...__VLS_functionalComponentArgsRest(__VLS_398));
        }
        for (const [thread] of __VLS_getVForSourceType((__VLS_ctx.chatThreads))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'favorites'))
                            return;
                        if (!(__VLS_ctx.activePage === 'chat'))
                            return;
                        __VLS_ctx.selectChat(thread);
                    } },
                key: (`${thread.item.id}-${thread.peer_id}`),
                ...{ class: "chat-thread" },
                ...{ class: ({ active: __VLS_ctx.activeChat?.item.id === thread.item.id && __VLS_ctx.activeChat?.peer_id === thread.peer_id }) },
            });
            const __VLS_401 = {}.ElAvatar;
            /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
            // @ts-ignore
            const __VLS_402 = __VLS_asFunctionalComponent(__VLS_401, new __VLS_401({
                size: (34),
                src: (thread.peer_avatar_url),
            }));
            const __VLS_403 = __VLS_402({
                size: (34),
                src: (thread.peer_avatar_url),
            }, ...__VLS_functionalComponentArgsRest(__VLS_402));
            __VLS_404.slots.default;
            (thread.peer_nickname.slice(0, 1));
            var __VLS_404;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
            (thread.peer_nickname);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (thread.item.item_name);
            (Number(thread.item.price).toFixed(2));
            (thread.latest_content);
            if (thread.unread_count) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
                    ...{ class: "chat-unread-dot" },
                });
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "chat-window" },
        });
        if (__VLS_ctx.activeChat) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
                ...{ class: "chat-item-header" },
            });
            if (__VLS_ctx.activeChat.item.images[0]) {
                const __VLS_405 = {}.ElImage;
                /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                // @ts-ignore
                const __VLS_406 = __VLS_asFunctionalComponent(__VLS_405, new __VLS_405({
                    src: (__VLS_ctx.activeChat.item.images[0].url),
                    fit: "cover",
                }));
                const __VLS_407 = __VLS_406({
                    src: (__VLS_ctx.activeChat.item.images[0].url),
                    fit: "cover",
                }, ...__VLS_functionalComponentArgsRest(__VLS_406));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
            (__VLS_ctx.activeChat.peer_nickname);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.activeChat.item.item_name);
            (Number(__VLS_ctx.activeChat.item.price).toFixed(2));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (__VLS_ctx.activeChat.item.id);
            for (const [value, key] of __VLS_getVForSourceType((__VLS_ctx.activeChat.item.attributes))) {
                (String(key));
                (__VLS_ctx.activeChat.item.attribute_labels[String(key)] || key);
                (value === true ? '是' : value === false ? '否' : value);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "chat-messages" },
            });
            if (__VLS_ctx.chatLines.length === 0) {
                const __VLS_409 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_410 = __VLS_asFunctionalComponent(__VLS_409, new __VLS_409({
                    description: "发送第一条消息，开始沟通",
                    imageSize: (65),
                }));
                const __VLS_411 = __VLS_410({
                    description: "发送第一条消息，开始沟通",
                    imageSize: (65),
                }, ...__VLS_functionalComponentArgsRest(__VLS_410));
            }
            for (const [line] of __VLS_getVForSourceType((__VLS_ctx.chatLines))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (line.id),
                    ...{ class: "chat-line" },
                    ...{ class: ({ mine: line.is_mine }) },
                });
                const __VLS_413 = {}.ElAvatar;
                /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
                // @ts-ignore
                const __VLS_414 = __VLS_asFunctionalComponent(__VLS_413, new __VLS_413({
                    size: (30),
                    src: (line.sender_avatar_url),
                }));
                const __VLS_415 = __VLS_414({
                    size: (30),
                    src: (line.sender_avatar_url),
                }, ...__VLS_functionalComponentArgsRest(__VLS_414));
                __VLS_416.slots.default;
                (line.sender_nickname.slice(0, 1));
                var __VLS_416;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                if (line.content) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                    (line.content);
                }
                if (line.image_url) {
                    const __VLS_417 = {}.ElImage;
                    /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                    // @ts-ignore
                    const __VLS_418 = __VLS_asFunctionalComponent(__VLS_417, new __VLS_417({
                        ...{ class: "chat-image" },
                        src: (line.image_url),
                        previewSrcList: ([line.image_url]),
                        previewTeleported: true,
                        fit: "cover",
                    }));
                    const __VLS_419 = __VLS_418({
                        ...{ class: "chat-image" },
                        src: (line.image_url),
                        previewSrcList: ([line.image_url]),
                        previewTeleported: true,
                        fit: "cover",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_418));
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                (__VLS_ctx.formatCommentTime(line.created_at));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "chat-compose" },
            });
            const __VLS_421 = {}.ElUpload;
            /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
            // @ts-ignore
            const __VLS_422 = __VLS_asFunctionalComponent(__VLS_421, new __VLS_421({
                ...{ 'onChange': {} },
                accept: "image/jpeg,image/png,image/webp",
                showFileList: (false),
                autoUpload: (false),
            }));
            const __VLS_423 = __VLS_422({
                ...{ 'onChange': {} },
                accept: "image/jpeg,image/png,image/webp",
                showFileList: (false),
                autoUpload: (false),
            }, ...__VLS_functionalComponentArgsRest(__VLS_422));
            let __VLS_425;
            let __VLS_426;
            let __VLS_427;
            const __VLS_428 = {
                onChange: (__VLS_ctx.selectChatImage)
            };
            __VLS_424.slots.default;
            const __VLS_429 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_430 = __VLS_asFunctionalComponent(__VLS_429, new __VLS_429({
                type: (__VLS_ctx.chatImageFile ? 'primary' : 'default'),
                plain: true,
            }));
            const __VLS_431 = __VLS_430({
                type: (__VLS_ctx.chatImageFile ? 'primary' : 'default'),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_430));
            __VLS_432.slots.default;
            (__VLS_ctx.chatImageFile ? '已选择' : '');
            var __VLS_432;
            var __VLS_424;
            const __VLS_433 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_434 = __VLS_asFunctionalComponent(__VLS_433, new __VLS_433({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.chatText),
                type: "textarea",
                rows: (2),
                maxlength: "1000",
                showWordLimit: true,
                placeholder: "输入消息…",
            }));
            const __VLS_435 = __VLS_434({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.chatText),
                type: "textarea",
                rows: (2),
                maxlength: "1000",
                showWordLimit: true,
                placeholder: "输入消息…",
            }, ...__VLS_functionalComponentArgsRest(__VLS_434));
            let __VLS_437;
            let __VLS_438;
            let __VLS_439;
            const __VLS_440 = {
                onKeyup: (__VLS_ctx.sendChatMessage)
            };
            var __VLS_436;
            const __VLS_441 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_442 = __VLS_asFunctionalComponent(__VLS_441, new __VLS_441({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.chatSending),
            }));
            const __VLS_443 = __VLS_442({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.chatSending),
            }, ...__VLS_functionalComponentArgsRest(__VLS_442));
            let __VLS_445;
            let __VLS_446;
            let __VLS_447;
            const __VLS_448 = {
                onClick: (__VLS_ctx.sendChatMessage)
            };
            __VLS_444.slots.default;
            var __VLS_444;
        }
        else {
            const __VLS_449 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_450 = __VLS_asFunctionalComponent(__VLS_449, new __VLS_449({
                description: "从左侧选择会话，或在商品详情中联系卖家",
            }));
            const __VLS_451 = __VLS_450({
                description: "从左侧选择会话，或在商品详情中联系卖家",
            }, ...__VLS_functionalComponentArgsRest(__VLS_450));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
            ...{ class: "reservation-page" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "page-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "eyebrow" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        if (__VLS_ctx.unreadCount()) {
            const __VLS_453 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_454 = __VLS_asFunctionalComponent(__VLS_453, new __VLS_453({
                ...{ 'onClick': {} },
                plain: true,
            }));
            const __VLS_455 = __VLS_454({
                ...{ 'onClick': {} },
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_454));
            let __VLS_457;
            let __VLS_458;
            let __VLS_459;
            const __VLS_460 = {
                onClick: (__VLS_ctx.markNotificationsRead)
            };
            __VLS_456.slots.default;
            var __VLS_456;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "notification-list" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.notificationsLoading) }, null, null);
        if (!__VLS_ctx.notificationsLoading && __VLS_ctx.notifications.length === 0) {
            const __VLS_461 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_462 = __VLS_asFunctionalComponent(__VLS_461, new __VLS_461({
                description: "暂无消息",
            }));
            const __VLS_463 = __VLS_462({
                description: "暂无消息",
            }, ...__VLS_functionalComponentArgsRest(__VLS_462));
        }
        for (const [notification] of __VLS_getVForSourceType((__VLS_ctx.notifications))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                ...{ onClick: (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!!(__VLS_ctx.activePage === 'sell'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'buy'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'reservations'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'favorites'))
                            return;
                        if (!!(__VLS_ctx.activePage === 'chat'))
                            return;
                        __VLS_ctx.markNotificationRead(notification);
                    } },
                key: (notification.id),
                ...{ class: "notification-card" },
                ...{ class: ({ unread: !notification.is_read }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "notification-dot" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            (notification.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (notification.content);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (__VLS_ctx.formatCommentTime(notification.created_at));
        }
    }
    var __VLS_160;
    const __VLS_465 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_466 = __VLS_asFunctionalComponent(__VLS_465, new __VLS_465({
        ...{ 'onClosed': {} },
        modelValue: (__VLS_ctx.dialogVisible),
        ...{ class: "publish-dialog" },
        width: "min(680px, calc(100vw - 32px))",
        destroyOnClose: true,
    }));
    const __VLS_467 = __VLS_466({
        ...{ 'onClosed': {} },
        modelValue: (__VLS_ctx.dialogVisible),
        ...{ class: "publish-dialog" },
        width: "min(680px, calc(100vw - 32px))",
        destroyOnClose: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_466));
    let __VLS_469;
    let __VLS_470;
    let __VLS_471;
    const __VLS_472 = {
        onClosed: (__VLS_ctx.resetForm)
    };
    __VLS_468.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_468.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dialog-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.template ? '2 / 2' : '1 / 2');
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "dialog-intro" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "intro-icon" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_473 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_474 = __VLS_asFunctionalComponent(__VLS_473, new __VLS_473({
        labelPosition: "top",
        ...{ class: "publish-form" },
    }));
    const __VLS_475 = __VLS_474({
        labelPosition: "top",
        ...{ class: "publish-form" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_474));
    __VLS_476.slots.default;
    const __VLS_477 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_478 = __VLS_asFunctionalComponent(__VLS_477, new __VLS_477({
        label: "物品名称",
        required: true,
    }));
    const __VLS_479 = __VLS_478({
        label: "物品名称",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_478));
    __VLS_480.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "name-row" },
    });
    const __VLS_481 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_482 = __VLS_asFunctionalComponent(__VLS_481, new __VLS_481({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.form.itemName),
        placeholder: "例如：充电宝",
    }));
    const __VLS_483 = __VLS_482({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.form.itemName),
        placeholder: "例如：充电宝",
    }, ...__VLS_functionalComponentArgsRest(__VLS_482));
    let __VLS_485;
    let __VLS_486;
    let __VLS_487;
    const __VLS_488 = {
        onKeyup: (__VLS_ctx.confirmItemName)
    };
    var __VLS_484;
    const __VLS_489 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_490 = __VLS_asFunctionalComponent(__VLS_489, new __VLS_489({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.resolving),
    }));
    const __VLS_491 = __VLS_490({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.resolving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_490));
    let __VLS_493;
    let __VLS_494;
    let __VLS_495;
    const __VLS_496 = {
        onClick: (__VLS_ctx.confirmItemName)
    };
    __VLS_492.slots.default;
    var __VLS_492;
    var __VLS_480;
    if (__VLS_ctx.template) {
        const __VLS_497 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_498 = __VLS_asFunctionalComponent(__VLS_497, new __VLS_497({
            title: (__VLS_ctx.template.reused ? `正在使用“${__VLS_ctx.template.display_name}”的已有标签模板` : '已生成新的标签模板'),
            type: "success",
            closable: (false),
            showIcon: true,
        }));
        const __VLS_499 = __VLS_498({
            title: (__VLS_ctx.template.reused ? `正在使用“${__VLS_ctx.template.display_name}”的已有标签模板` : '已生成新的标签模板'),
            type: "success",
            closable: (false),
            showIcon: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_498));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        const __VLS_501 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_502 = __VLS_asFunctionalComponent(__VLS_501, new __VLS_501({
            label: "价格（元）",
            required: true,
        }));
        const __VLS_503 = __VLS_502({
            label: "价格（元）",
            required: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_502));
        __VLS_504.slots.default;
        const __VLS_505 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_506 = __VLS_asFunctionalComponent(__VLS_505, new __VLS_505({
            modelValue: (__VLS_ctx.form.price),
            min: (0.01),
            precision: (2),
            controls: (false),
        }));
        const __VLS_507 = __VLS_506({
            modelValue: (__VLS_ctx.form.price),
            min: (0.01),
            precision: (2),
            controls: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_506));
        var __VLS_504;
        const __VLS_509 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_510 = __VLS_asFunctionalComponent(__VLS_509, new __VLS_509({
            label: "商品图片",
        }));
        const __VLS_511 = __VLS_510({
            label: "商品图片",
        }, ...__VLS_functionalComponentArgsRest(__VLS_510));
        __VLS_512.slots.default;
        const __VLS_513 = {}.ElUpload;
        /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
        // @ts-ignore
        const __VLS_514 = __VLS_asFunctionalComponent(__VLS_513, new __VLS_513({
            fileList: (__VLS_ctx.imageFiles),
            listType: "picture-card",
            accept: "image/jpeg,image/png,image/webp",
            autoUpload: (false),
            limit: (3),
        }));
        const __VLS_515 = __VLS_514({
            fileList: (__VLS_ctx.imageFiles),
            listType: "picture-card",
            accept: "image/jpeg,image/png,image/webp",
            autoUpload: (false),
            limit: (3),
        }, ...__VLS_functionalComponentArgsRest(__VLS_514));
        __VLS_516.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "upload-add" },
        });
        {
            const { tip: __VLS_thisSlot } = __VLS_516.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "upload-tip" },
            });
        }
        var __VLS_516;
        var __VLS_512;
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.template.labels))) {
            const __VLS_517 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_518 = __VLS_asFunctionalComponent(__VLS_517, new __VLS_517({
                key: (field.key),
                label: (field.label),
            }));
            const __VLS_519 = __VLS_518({
                key: (field.key),
                label: (field.label),
            }, ...__VLS_functionalComponentArgsRest(__VLS_518));
            __VLS_520.slots.default;
            if (field.type === 'string') {
                const __VLS_521 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_522 = __VLS_asFunctionalComponent(__VLS_521, new __VLS_521({
                    modelValue: (__VLS_ctx.form.attributes[field.key]),
                    placeholder: (field.hint || `填写${field.label}`),
                }));
                const __VLS_523 = __VLS_522({
                    modelValue: (__VLS_ctx.form.attributes[field.key]),
                    placeholder: (field.hint || `填写${field.label}`),
                }, ...__VLS_functionalComponentArgsRest(__VLS_522));
            }
            else if (field.type === 'number') {
                const __VLS_525 = {}.ElInputNumber;
                /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                // @ts-ignore
                const __VLS_526 = __VLS_asFunctionalComponent(__VLS_525, new __VLS_525({
                    modelValue: (__VLS_ctx.form.attributes[field.key]),
                    min: (0),
                    controls: (false),
                }));
                const __VLS_527 = __VLS_526({
                    modelValue: (__VLS_ctx.form.attributes[field.key]),
                    min: (0),
                    controls: (false),
                }, ...__VLS_functionalComponentArgsRest(__VLS_526));
            }
            else if (field.type === 'enum') {
                const __VLS_529 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_530 = __VLS_asFunctionalComponent(__VLS_529, new __VLS_529({
                    modelValue: (__VLS_ctx.form.attributes[field.key]),
                    clearable: true,
                    placeholder: (`选择${field.label}`),
                }));
                const __VLS_531 = __VLS_530({
                    modelValue: (__VLS_ctx.form.attributes[field.key]),
                    clearable: true,
                    placeholder: (`选择${field.label}`),
                }, ...__VLS_functionalComponentArgsRest(__VLS_530));
                __VLS_532.slots.default;
                for (const [option] of __VLS_getVForSourceType((field.options))) {
                    const __VLS_533 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_534 = __VLS_asFunctionalComponent(__VLS_533, new __VLS_533({
                        key: (option),
                        label: (option),
                        value: (option),
                    }));
                    const __VLS_535 = __VLS_534({
                        key: (option),
                        label: (option),
                        value: (option),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_534));
                }
                var __VLS_532;
            }
            else {
                const __VLS_537 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_538 = __VLS_asFunctionalComponent(__VLS_537, new __VLS_537({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.booleanValue(field.key)),
                    clearable: true,
                    placeholder: "未填写",
                }));
                const __VLS_539 = __VLS_538({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.booleanValue(field.key)),
                    clearable: true,
                    placeholder: "未填写",
                }, ...__VLS_functionalComponentArgsRest(__VLS_538));
                let __VLS_541;
                let __VLS_542;
                let __VLS_543;
                const __VLS_544 = {
                    'onUpdate:modelValue': (...[$event]) => {
                        if (!!(!__VLS_ctx.currentUser))
                            return;
                        if (!(__VLS_ctx.template))
                            return;
                        if (!!(field.type === 'string'))
                            return;
                        if (!!(field.type === 'number'))
                            return;
                        if (!!(field.type === 'enum'))
                            return;
                        __VLS_ctx.setBooleanValue(field.key, $event);
                    }
                };
                __VLS_540.slots.default;
                const __VLS_545 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_546 = __VLS_asFunctionalComponent(__VLS_545, new __VLS_545({
                    label: "是",
                    value: "true",
                }));
                const __VLS_547 = __VLS_546({
                    label: "是",
                    value: "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_546));
                const __VLS_549 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_550 = __VLS_asFunctionalComponent(__VLS_549, new __VLS_549({
                    label: "否",
                    value: "false",
                }));
                const __VLS_551 = __VLS_550({
                    label: "否",
                    value: "false",
                }, ...__VLS_functionalComponentArgsRest(__VLS_550));
                var __VLS_540;
            }
            if (field.hint) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                    ...{ class: "hint" },
                });
                (field.hint);
            }
            var __VLS_520;
        }
        const __VLS_553 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_554 = __VLS_asFunctionalComponent(__VLS_553, new __VLS_553({
            label: "描述",
        }));
        const __VLS_555 = __VLS_554({
            label: "描述",
        }, ...__VLS_functionalComponentArgsRest(__VLS_554));
        __VLS_556.slots.default;
        const __VLS_557 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_558 = __VLS_asFunctionalComponent(__VLS_557, new __VLS_557({
            modelValue: (__VLS_ctx.form.description),
            type: "textarea",
            rows: (4),
            placeholder: "可填写使用情况、瑕疵、交易地点等补充信息",
        }));
        const __VLS_559 = __VLS_558({
            modelValue: (__VLS_ctx.form.description),
            type: "textarea",
            rows: (4),
            placeholder: "可填写使用情况、瑕疵、交易地点等补充信息",
        }, ...__VLS_functionalComponentArgsRest(__VLS_558));
        var __VLS_556;
    }
    var __VLS_476;
    if (__VLS_ctx.template) {
        {
            const { footer: __VLS_thisSlot } = __VLS_468.slots;
            const __VLS_561 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_562 = __VLS_asFunctionalComponent(__VLS_561, new __VLS_561({
                ...{ 'onClick': {} },
            }));
            const __VLS_563 = __VLS_562({
                ...{ 'onClick': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_562));
            let __VLS_565;
            let __VLS_566;
            let __VLS_567;
            const __VLS_568 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.currentUser))
                        return;
                    if (!(__VLS_ctx.template))
                        return;
                    __VLS_ctx.dialogVisible = false;
                }
            };
            __VLS_564.slots.default;
            var __VLS_564;
            const __VLS_569 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_570 = __VLS_asFunctionalComponent(__VLS_569, new __VLS_569({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.publishing),
            }));
            const __VLS_571 = __VLS_570({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.publishing),
            }, ...__VLS_functionalComponentArgsRest(__VLS_570));
            let __VLS_573;
            let __VLS_574;
            let __VLS_575;
            const __VLS_576 = {
                onClick: (__VLS_ctx.publish)
            };
            __VLS_572.slots.default;
            var __VLS_572;
        }
    }
    var __VLS_468;
    const __VLS_577 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_578 = __VLS_asFunctionalComponent(__VLS_577, new __VLS_577({
        modelValue: (__VLS_ctx.editItemVisible),
        title: "编辑已下架商品",
        width: "min(620px, calc(100vw - 32px))",
        destroyOnClose: true,
    }));
    const __VLS_579 = __VLS_578({
        modelValue: (__VLS_ctx.editItemVisible),
        title: "编辑已下架商品",
        width: "min(620px, calc(100vw - 32px))",
        destroyOnClose: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_578));
    __VLS_580.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "reservation-tip" },
    });
    const __VLS_581 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_582 = __VLS_asFunctionalComponent(__VLS_581, new __VLS_581({
        labelPosition: "top",
    }));
    const __VLS_583 = __VLS_582({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_582));
    __VLS_584.slots.default;
    const __VLS_585 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_586 = __VLS_asFunctionalComponent(__VLS_585, new __VLS_585({
        label: "价格（元）",
        required: true,
    }));
    const __VLS_587 = __VLS_586({
        label: "价格（元）",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_586));
    __VLS_588.slots.default;
    const __VLS_589 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_590 = __VLS_asFunctionalComponent(__VLS_589, new __VLS_589({
        modelValue: (__VLS_ctx.editItemForm.price),
        min: (0.01),
        precision: (2),
        controls: (false),
    }));
    const __VLS_591 = __VLS_590({
        modelValue: (__VLS_ctx.editItemForm.price),
        min: (0.01),
        precision: (2),
        controls: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_590));
    var __VLS_588;
    const __VLS_593 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_594 = __VLS_asFunctionalComponent(__VLS_593, new __VLS_593({
        label: "商品图片",
    }));
    const __VLS_595 = __VLS_594({
        label: "商品图片",
    }, ...__VLS_functionalComponentArgsRest(__VLS_594));
    __VLS_596.slots.default;
    const __VLS_597 = {}.ElUpload;
    /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
    // @ts-ignore
    const __VLS_598 = __VLS_asFunctionalComponent(__VLS_597, new __VLS_597({
        fileList: (__VLS_ctx.editImageFiles),
        listType: "picture-card",
        accept: "image/jpeg,image/png,image/webp",
        autoUpload: (false),
        limit: (3),
    }));
    const __VLS_599 = __VLS_598({
        fileList: (__VLS_ctx.editImageFiles),
        listType: "picture-card",
        accept: "image/jpeg,image/png,image/webp",
        autoUpload: (false),
        limit: (3),
    }, ...__VLS_functionalComponentArgsRest(__VLS_598));
    __VLS_600.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "upload-add" },
    });
    {
        const { tip: __VLS_thisSlot } = __VLS_600.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-tip" },
        });
    }
    var __VLS_600;
    if (__VLS_ctx.editImageFiles.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cover-sort" },
        });
        for (const [file, index] of __VLS_getVForSourceType((__VLS_ctx.editImageFiles))) {
            const __VLS_601 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_602 = __VLS_asFunctionalComponent(__VLS_601, new __VLS_601({
                ...{ 'onClick': {} },
                key: (file.uid),
                size: "small",
                type: (index === 0 ? 'primary' : 'default'),
                plain: true,
            }));
            const __VLS_603 = __VLS_602({
                ...{ 'onClick': {} },
                key: (file.uid),
                size: "small",
                type: (index === 0 ? 'primary' : 'default'),
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_602));
            let __VLS_605;
            let __VLS_606;
            let __VLS_607;
            const __VLS_608 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.currentUser))
                        return;
                    if (!(__VLS_ctx.editImageFiles.length))
                        return;
                    __VLS_ctx.makeCover(index);
                }
            };
            __VLS_604.slots.default;
            (index === 0 ? '当前封面' : `图片 ${index + 1}：设为封面`);
            var __VLS_604;
        }
    }
    var __VLS_596;
    const __VLS_609 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_610 = __VLS_asFunctionalComponent(__VLS_609, new __VLS_609({
        contentPosition: "left",
    }));
    const __VLS_611 = __VLS_610({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_610));
    __VLS_612.slots.default;
    var __VLS_612;
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.editingItem?.label_definitions || []))) {
        const __VLS_613 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_614 = __VLS_asFunctionalComponent(__VLS_613, new __VLS_613({
            key: (field.key),
            label: (field.label),
        }));
        const __VLS_615 = __VLS_614({
            key: (field.key),
            label: (field.label),
        }, ...__VLS_functionalComponentArgsRest(__VLS_614));
        __VLS_616.slots.default;
        if (field.type === 'string') {
            const __VLS_617 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_618 = __VLS_asFunctionalComponent(__VLS_617, new __VLS_617({
                modelValue: (__VLS_ctx.editItemForm.attributes[field.key]),
                placeholder: (field.hint || `填写${field.label}`),
            }));
            const __VLS_619 = __VLS_618({
                modelValue: (__VLS_ctx.editItemForm.attributes[field.key]),
                placeholder: (field.hint || `填写${field.label}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_618));
        }
        else if (field.type === 'number') {
            const __VLS_621 = {}.ElInputNumber;
            /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
            // @ts-ignore
            const __VLS_622 = __VLS_asFunctionalComponent(__VLS_621, new __VLS_621({
                modelValue: (__VLS_ctx.editItemForm.attributes[field.key]),
                min: (0),
                controls: (false),
            }));
            const __VLS_623 = __VLS_622({
                modelValue: (__VLS_ctx.editItemForm.attributes[field.key]),
                min: (0),
                controls: (false),
            }, ...__VLS_functionalComponentArgsRest(__VLS_622));
        }
        else if (field.type === 'enum') {
            const __VLS_625 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_626 = __VLS_asFunctionalComponent(__VLS_625, new __VLS_625({
                modelValue: (__VLS_ctx.editItemForm.attributes[field.key]),
                clearable: true,
                placeholder: (`选择${field.label}`),
            }));
            const __VLS_627 = __VLS_626({
                modelValue: (__VLS_ctx.editItemForm.attributes[field.key]),
                clearable: true,
                placeholder: (`选择${field.label}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_626));
            __VLS_628.slots.default;
            for (const [option] of __VLS_getVForSourceType((field.options))) {
                const __VLS_629 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_630 = __VLS_asFunctionalComponent(__VLS_629, new __VLS_629({
                    key: (option),
                    label: (option),
                    value: (option),
                }));
                const __VLS_631 = __VLS_630({
                    key: (option),
                    label: (option),
                    value: (option),
                }, ...__VLS_functionalComponentArgsRest(__VLS_630));
            }
            var __VLS_628;
        }
        else {
            const __VLS_633 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_634 = __VLS_asFunctionalComponent(__VLS_633, new __VLS_633({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.editBooleanValue(field.key)),
                clearable: true,
                placeholder: "未填写",
            }));
            const __VLS_635 = __VLS_634({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.editBooleanValue(field.key)),
                clearable: true,
                placeholder: "未填写",
            }, ...__VLS_functionalComponentArgsRest(__VLS_634));
            let __VLS_637;
            let __VLS_638;
            let __VLS_639;
            const __VLS_640 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(!__VLS_ctx.currentUser))
                        return;
                    if (!!(field.type === 'string'))
                        return;
                    if (!!(field.type === 'number'))
                        return;
                    if (!!(field.type === 'enum'))
                        return;
                    __VLS_ctx.setEditBooleanValue(field.key, $event);
                }
            };
            __VLS_636.slots.default;
            const __VLS_641 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_642 = __VLS_asFunctionalComponent(__VLS_641, new __VLS_641({
                label: "是",
                value: "true",
            }));
            const __VLS_643 = __VLS_642({
                label: "是",
                value: "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_642));
            const __VLS_645 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_646 = __VLS_asFunctionalComponent(__VLS_645, new __VLS_645({
                label: "否",
                value: "false",
            }));
            const __VLS_647 = __VLS_646({
                label: "否",
                value: "false",
            }, ...__VLS_functionalComponentArgsRest(__VLS_646));
            var __VLS_636;
        }
        if (field.hint) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
                ...{ class: "hint" },
            });
            (field.hint);
        }
        var __VLS_616;
    }
    const __VLS_649 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_650 = __VLS_asFunctionalComponent(__VLS_649, new __VLS_649({
        label: "描述",
    }));
    const __VLS_651 = __VLS_650({
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_650));
    __VLS_652.slots.default;
    const __VLS_653 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_654 = __VLS_asFunctionalComponent(__VLS_653, new __VLS_653({
        modelValue: (__VLS_ctx.editItemForm.description),
        type: "textarea",
        rows: (5),
        maxlength: "2000",
        showWordLimit: true,
        placeholder: "填写商品补充说明",
    }));
    const __VLS_655 = __VLS_654({
        modelValue: (__VLS_ctx.editItemForm.description),
        type: "textarea",
        rows: (5),
        maxlength: "2000",
        showWordLimit: true,
        placeholder: "填写商品补充说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_654));
    var __VLS_652;
    var __VLS_584;
    {
        const { footer: __VLS_thisSlot } = __VLS_580.slots;
        const __VLS_657 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_658 = __VLS_asFunctionalComponent(__VLS_657, new __VLS_657({
            ...{ 'onClick': {} },
        }));
        const __VLS_659 = __VLS_658({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_658));
        let __VLS_661;
        let __VLS_662;
        let __VLS_663;
        const __VLS_664 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.currentUser))
                    return;
                __VLS_ctx.editItemVisible = false;
            }
        };
        __VLS_660.slots.default;
        var __VLS_660;
        const __VLS_665 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_666 = __VLS_asFunctionalComponent(__VLS_665, new __VLS_665({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.itemActionLoading),
        }));
        const __VLS_667 = __VLS_666({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.itemActionLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_666));
        let __VLS_669;
        let __VLS_670;
        let __VLS_671;
        const __VLS_672 = {
            onClick: (__VLS_ctx.saveItemEdit)
        };
        __VLS_668.slots.default;
        var __VLS_668;
    }
    var __VLS_580;
    const __VLS_673 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_674 = __VLS_asFunctionalComponent(__VLS_673, new __VLS_673({
        modelValue: (__VLS_ctx.detailVisible),
        ...{ class: "detail-dialog" },
        width: "min(860px, calc(100vw - 28px))",
        destroyOnClose: true,
    }));
    const __VLS_675 = __VLS_674({
        modelValue: (__VLS_ctx.detailVisible),
        ...{ class: "detail-dialog" },
        width: "min(860px, calc(100vw - 28px))",
        destroyOnClose: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_674));
    __VLS_676.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_676.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dialog-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-body" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.detailLoading) }, null, null);
    if (__VLS_ctx.selectedItem) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-main" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-gallery" },
        });
        if (__VLS_ctx.selectedItem.images.length) {
            const __VLS_677 = {}.ElCarousel;
            /** @type {[typeof __VLS_components.ElCarousel, typeof __VLS_components.elCarousel, typeof __VLS_components.ElCarousel, typeof __VLS_components.elCarousel, ]} */ ;
            // @ts-ignore
            const __VLS_678 = __VLS_asFunctionalComponent(__VLS_677, new __VLS_677({
                height: "310px",
                indicatorPosition: "outside",
            }));
            const __VLS_679 = __VLS_678({
                height: "310px",
                indicatorPosition: "outside",
            }, ...__VLS_functionalComponentArgsRest(__VLS_678));
            __VLS_680.slots.default;
            for (const [image] of __VLS_getVForSourceType((__VLS_ctx.selectedItem.images))) {
                const __VLS_681 = {}.ElCarouselItem;
                /** @type {[typeof __VLS_components.ElCarouselItem, typeof __VLS_components.elCarouselItem, typeof __VLS_components.ElCarouselItem, typeof __VLS_components.elCarouselItem, ]} */ ;
                // @ts-ignore
                const __VLS_682 = __VLS_asFunctionalComponent(__VLS_681, new __VLS_681({
                    key: (image.object_key),
                }));
                const __VLS_683 = __VLS_682({
                    key: (image.object_key),
                }, ...__VLS_functionalComponentArgsRest(__VLS_682));
                __VLS_684.slots.default;
                const __VLS_685 = {}.ElImage;
                /** @type {[typeof __VLS_components.ElImage, typeof __VLS_components.elImage, ]} */ ;
                // @ts-ignore
                const __VLS_686 = __VLS_asFunctionalComponent(__VLS_685, new __VLS_685({
                    src: (image.url),
                    previewSrcList: (__VLS_ctx.selectedItem.images.map(itemImage => itemImage.url)),
                    fit: "contain",
                    previewTeleported: true,
                }));
                const __VLS_687 = __VLS_686({
                    src: (image.url),
                    previewSrcList: (__VLS_ctx.selectedItem.images.map(itemImage => itemImage.url)),
                    fit: "contain",
                    previewTeleported: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_686));
                var __VLS_684;
            }
            var __VLS_680;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "detail-no-image" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-info" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "item-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        (__VLS_ctx.selectedItem.item_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: (`status-${__VLS_ctx.selectedItem.status}`) },
        });
        (__VLS_ctx.itemStatusText(__VLS_ctx.selectedItem.status));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (Number(__VLS_ctx.selectedItem.price).toFixed(2));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "detail-description" },
        });
        (__VLS_ctx.selectedItem.description || '卖家暂未填写商品描述。');
        if (__VLS_ctx.selectedItem.seller_id !== __VLS_ctx.currentUser.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "seller-summary" },
            });
            const __VLS_689 = {}.ElAvatar;
            /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
            // @ts-ignore
            const __VLS_690 = __VLS_asFunctionalComponent(__VLS_689, new __VLS_689({
                size: (34),
                src: (__VLS_ctx.selectedItem.seller_avatar_url),
            }));
            const __VLS_691 = __VLS_690({
                size: (34),
                src: (__VLS_ctx.selectedItem.seller_avatar_url),
            }, ...__VLS_functionalComponentArgsRest(__VLS_690));
            __VLS_692.slots.default;
            (__VLS_ctx.selectedItem.seller_nickname?.slice(0, 1));
            var __VLS_692;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.selectedItem.seller_nickname || '校园用户');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (__VLS_ctx.selectedItem.seller_completed_count);
        }
        if (Object.keys(__VLS_ctx.selectedItem.attributes).length) {
            const __VLS_693 = {}.ElDescriptions;
            /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
            // @ts-ignore
            const __VLS_694 = __VLS_asFunctionalComponent(__VLS_693, new __VLS_693({
                column: (1),
                border: true,
                size: "small",
            }));
            const __VLS_695 = __VLS_694({
                column: (1),
                border: true,
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_694));
            __VLS_696.slots.default;
            for (const [value, key] of __VLS_getVForSourceType((__VLS_ctx.selectedItem.attributes))) {
                const __VLS_697 = {}.ElDescriptionsItem;
                /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
                // @ts-ignore
                const __VLS_698 = __VLS_asFunctionalComponent(__VLS_697, new __VLS_697({
                    key: (String(key)),
                    label: (__VLS_ctx.selectedItem.attribute_labels[String(key)] || String(key)),
                }));
                const __VLS_699 = __VLS_698({
                    key: (String(key)),
                    label: (__VLS_ctx.selectedItem.attribute_labels[String(key)] || String(key)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_698));
                __VLS_700.slots.default;
                (value === true ? '是' : value === false ? '否' : value);
                var __VLS_700;
            }
            var __VLS_696;
        }
        if (__VLS_ctx.selectedItem.seller_id !== __VLS_ctx.currentUser.id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "detail-buttons" },
            });
            const __VLS_701 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_702 = __VLS_asFunctionalComponent(__VLS_701, new __VLS_701({
                ...{ 'onClick': {} },
                ...{ class: "reservation-button" },
                disabled: (__VLS_ctx.selectedItem.status !== 'on_sale'),
                type: "primary",
                size: "large",
            }));
            const __VLS_703 = __VLS_702({
                ...{ 'onClick': {} },
                ...{ class: "reservation-button" },
                disabled: (__VLS_ctx.selectedItem.status !== 'on_sale'),
                type: "primary",
                size: "large",
            }, ...__VLS_functionalComponentArgsRest(__VLS_702));
            let __VLS_705;
            let __VLS_706;
            let __VLS_707;
            const __VLS_708 = {
                onClick: (__VLS_ctx.openReservation)
            };
            __VLS_704.slots.default;
            var __VLS_704;
            const __VLS_709 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_710 = __VLS_asFunctionalComponent(__VLS_709, new __VLS_709({
                ...{ 'onClick': {} },
                size: "large",
                plain: true,
            }));
            const __VLS_711 = __VLS_710({
                ...{ 'onClick': {} },
                size: "large",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_710));
            let __VLS_713;
            let __VLS_714;
            let __VLS_715;
            const __VLS_716 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.currentUser))
                        return;
                    if (!(__VLS_ctx.selectedItem))
                        return;
                    if (!(__VLS_ctx.selectedItem.seller_id !== __VLS_ctx.currentUser.id))
                        return;
                    __VLS_ctx.openChat(__VLS_ctx.selectedItem.seller_id, __VLS_ctx.selectedItem);
                }
            };
            __VLS_712.slots.default;
            var __VLS_712;
            const __VLS_717 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_718 = __VLS_asFunctionalComponent(__VLS_717, new __VLS_717({
                ...{ 'onClick': {} },
                size: "large",
                plain: true,
            }));
            const __VLS_719 = __VLS_718({
                ...{ 'onClick': {} },
                size: "large",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_718));
            let __VLS_721;
            let __VLS_722;
            let __VLS_723;
            const __VLS_724 = {
                onClick: (__VLS_ctx.toggleFavorite)
            };
            __VLS_720.slots.default;
            (__VLS_ctx.isFavorite(__VLS_ctx.selectedItem.id) ? '取消收藏' : '收藏商品');
            var __VLS_720;
        }
        else {
            const __VLS_725 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_726 = __VLS_asFunctionalComponent(__VLS_725, new __VLS_725({
                ...{ class: "own-item-tag" },
                type: "info",
                effect: "plain",
            }));
            const __VLS_727 = __VLS_726({
                ...{ class: "own-item-tag" },
                type: "info",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_726));
            __VLS_728.slots.default;
            var __VLS_728;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "comment-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.comments.length);
        const __VLS_729 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_730 = __VLS_asFunctionalComponent(__VLS_729, new __VLS_729({
            modelValue: (__VLS_ctx.commentText),
            type: "textarea",
            rows: (3),
            maxlength: "500",
            showWordLimit: true,
            placeholder: "写下你的评论或想了解的问题…",
        }));
        const __VLS_731 = __VLS_730({
            modelValue: (__VLS_ctx.commentText),
            type: "textarea",
            rows: (3),
            maxlength: "500",
            showWordLimit: true,
            placeholder: "写下你的评论或想了解的问题…",
        }, ...__VLS_functionalComponentArgsRest(__VLS_730));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "comment-action" },
        });
        const __VLS_733 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_734 = __VLS_asFunctionalComponent(__VLS_733, new __VLS_733({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.commentSubmitting),
        }));
        const __VLS_735 = __VLS_734({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.commentSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_734));
        let __VLS_737;
        let __VLS_738;
        let __VLS_739;
        const __VLS_740 = {
            onClick: (__VLS_ctx.submitComment)
        };
        __VLS_736.slots.default;
        var __VLS_736;
        if (__VLS_ctx.comments.length === 0) {
            const __VLS_741 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_742 = __VLS_asFunctionalComponent(__VLS_741, new __VLS_741({
                description: "还没有评论，来说点什么吧",
                imageSize: (72),
            }));
            const __VLS_743 = __VLS_742({
                description: "还没有评论，来说点什么吧",
                imageSize: (72),
            }, ...__VLS_functionalComponentArgsRest(__VLS_742));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "comment-list" },
            });
            for (const [comment] of __VLS_getVForSourceType((__VLS_ctx.comments))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
                    key: (comment.id),
                    ...{ class: "comment" },
                });
                const __VLS_745 = {}.ElAvatar;
                /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
                // @ts-ignore
                const __VLS_746 = __VLS_asFunctionalComponent(__VLS_745, new __VLS_745({
                    size: (34),
                    src: (comment.author_avatar_url),
                }));
                const __VLS_747 = __VLS_746({
                    size: (34),
                    src: (comment.author_avatar_url),
                }, ...__VLS_functionalComponentArgsRest(__VLS_746));
                __VLS_748.slots.default;
                (comment.author_nickname.slice(0, 1));
                var __VLS_748;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "comment-meta" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (comment.author_nickname);
                if (comment.is_seller) {
                    const __VLS_749 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_750 = __VLS_asFunctionalComponent(__VLS_749, new __VLS_749({
                        size: "small",
                        type: "success",
                        effect: "light",
                    }));
                    const __VLS_751 = __VLS_750({
                        size: "small",
                        type: "success",
                        effect: "light",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_750));
                    __VLS_752.slots.default;
                    var __VLS_752;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.formatCommentTime(comment.created_at));
                if (comment.is_author) {
                    const __VLS_753 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_754 = __VLS_asFunctionalComponent(__VLS_753, new __VLS_753({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "danger",
                        size: "small",
                    }));
                    const __VLS_755 = __VLS_754({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "danger",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_754));
                    let __VLS_757;
                    let __VLS_758;
                    let __VLS_759;
                    const __VLS_760 = {
                        onClick: (...[$event]) => {
                            if (!!(!__VLS_ctx.currentUser))
                                return;
                            if (!(__VLS_ctx.selectedItem))
                                return;
                            if (!!(__VLS_ctx.comments.length === 0))
                                return;
                            if (!(comment.is_author))
                                return;
                            __VLS_ctx.deleteComment(comment);
                        }
                    };
                    __VLS_756.slots.default;
                    var __VLS_756;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
                (comment.content);
            }
        }
    }
    var __VLS_676;
    const __VLS_761 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_762 = __VLS_asFunctionalComponent(__VLS_761, new __VLS_761({
        modelValue: (__VLS_ctx.reservationVisible),
        ...{ class: "reservation-dialog" },
        title: "发起线下交接预约",
        width: "min(480px, calc(100vw - 32px))",
    }));
    const __VLS_763 = __VLS_762({
        modelValue: (__VLS_ctx.reservationVisible),
        ...{ class: "reservation-dialog" },
        title: "发起线下交接预约",
        width: "min(480px, calc(100vw - 32px))",
    }, ...__VLS_functionalComponentArgsRest(__VLS_762));
    __VLS_764.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "reservation-tip" },
    });
    const __VLS_765 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_766 = __VLS_asFunctionalComponent(__VLS_765, new __VLS_765({
        labelPosition: "top",
    }));
    const __VLS_767 = __VLS_766({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_766));
    __VLS_768.slots.default;
    const __VLS_769 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_770 = __VLS_asFunctionalComponent(__VLS_769, new __VLS_769({
        label: "约定价格（元）",
        required: true,
    }));
    const __VLS_771 = __VLS_770({
        label: "约定价格（元）",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_770));
    __VLS_772.slots.default;
    const __VLS_773 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_774 = __VLS_asFunctionalComponent(__VLS_773, new __VLS_773({
        modelValue: (__VLS_ctx.reservationForm.agreedPrice),
        min: (0.01),
        precision: (2),
        controls: (false),
    }));
    const __VLS_775 = __VLS_774({
        modelValue: (__VLS_ctx.reservationForm.agreedPrice),
        min: (0.01),
        precision: (2),
        controls: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_774));
    var __VLS_772;
    const __VLS_777 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_778 = __VLS_asFunctionalComponent(__VLS_777, new __VLS_777({
        label: "交接时间",
        required: true,
    }));
    const __VLS_779 = __VLS_778({
        label: "交接时间",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_778));
    __VLS_780.slots.default;
    const __VLS_781 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_782 = __VLS_asFunctionalComponent(__VLS_781, new __VLS_781({
        modelValue: (__VLS_ctx.reservationForm.appointmentTime),
        type: "datetime",
        valueFormat: "YYYY-MM-DDTHH:mm:ss",
        placeholder: "选择时间",
    }));
    const __VLS_783 = __VLS_782({
        modelValue: (__VLS_ctx.reservationForm.appointmentTime),
        type: "datetime",
        valueFormat: "YYYY-MM-DDTHH:mm:ss",
        placeholder: "选择时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_782));
    var __VLS_780;
    const __VLS_785 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_786 = __VLS_asFunctionalComponent(__VLS_785, new __VLS_785({
        label: "交接地点",
        required: true,
    }));
    const __VLS_787 = __VLS_786({
        label: "交接地点",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_786));
    __VLS_788.slots.default;
    const __VLS_789 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_790 = __VLS_asFunctionalComponent(__VLS_789, new __VLS_789({
        modelValue: (__VLS_ctx.reservationForm.location),
        placeholder: "例如：图书馆一楼大厅",
    }));
    const __VLS_791 = __VLS_790({
        modelValue: (__VLS_ctx.reservationForm.location),
        placeholder: "例如：图书馆一楼大厅",
    }, ...__VLS_functionalComponentArgsRest(__VLS_790));
    var __VLS_788;
    var __VLS_768;
    {
        const { footer: __VLS_thisSlot } = __VLS_764.slots;
        const __VLS_793 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_794 = __VLS_asFunctionalComponent(__VLS_793, new __VLS_793({
            ...{ 'onClick': {} },
        }));
        const __VLS_795 = __VLS_794({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_794));
        let __VLS_797;
        let __VLS_798;
        let __VLS_799;
        const __VLS_800 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.currentUser))
                    return;
                __VLS_ctx.reservationVisible = false;
            }
        };
        __VLS_796.slots.default;
        var __VLS_796;
        const __VLS_801 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_802 = __VLS_asFunctionalComponent(__VLS_801, new __VLS_801({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.reservationSubmitting),
        }));
        const __VLS_803 = __VLS_802({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.reservationSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_802));
        let __VLS_805;
        let __VLS_806;
        let __VLS_807;
        const __VLS_808 = {
            onClick: (__VLS_ctx.submitReservation)
        };
        __VLS_804.slots.default;
        var __VLS_804;
    }
    var __VLS_764;
    const __VLS_809 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_810 = __VLS_asFunctionalComponent(__VLS_809, new __VLS_809({
        modelValue: (__VLS_ctx.failureDialogVisible),
        title: "标记交易失败",
        width: "min(480px, calc(100vw - 32px))",
        destroyOnClose: true,
    }));
    const __VLS_811 = __VLS_810({
        modelValue: (__VLS_ctx.failureDialogVisible),
        title: "标记交易失败",
        width: "min(480px, calc(100vw - 32px))",
        destroyOnClose: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_810));
    __VLS_812.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "reservation-tip" },
    });
    const __VLS_813 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_814 = __VLS_asFunctionalComponent(__VLS_813, new __VLS_813({
        labelPosition: "top",
    }));
    const __VLS_815 = __VLS_814({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_814));
    __VLS_816.slots.default;
    const __VLS_817 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_818 = __VLS_asFunctionalComponent(__VLS_817, new __VLS_817({
        label: "失败原因",
        required: true,
    }));
    const __VLS_819 = __VLS_818({
        label: "失败原因",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_818));
    __VLS_820.slots.default;
    const __VLS_821 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_822 = __VLS_asFunctionalComponent(__VLS_821, new __VLS_821({
        modelValue: (__VLS_ctx.failureForm.reason),
        allowCreate: true,
        filterable: true,
        defaultFirstOption: true,
        placeholder: "选择或填写原因",
    }));
    const __VLS_823 = __VLS_822({
        modelValue: (__VLS_ctx.failureForm.reason),
        allowCreate: true,
        filterable: true,
        defaultFirstOption: true,
        placeholder: "选择或填写原因",
    }, ...__VLS_functionalComponentArgsRest(__VLS_822));
    __VLS_824.slots.default;
    const __VLS_825 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_826 = __VLS_asFunctionalComponent(__VLS_825, new __VLS_825({
        label: "物品与描述不符",
        value: "物品与描述不符",
    }));
    const __VLS_827 = __VLS_826({
        label: "物品与描述不符",
        value: "物品与描述不符",
    }, ...__VLS_functionalComponentArgsRest(__VLS_826));
    const __VLS_829 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_830 = __VLS_asFunctionalComponent(__VLS_829, new __VLS_829({
        label: "物品存在未说明的瑕疵",
        value: "物品存在未说明的瑕疵",
    }));
    const __VLS_831 = __VLS_830({
        label: "物品存在未说明的瑕疵",
        value: "物品存在未说明的瑕疵",
    }, ...__VLS_functionalComponentArgsRest(__VLS_830));
    const __VLS_833 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_834 = __VLS_asFunctionalComponent(__VLS_833, new __VLS_833({
        label: "双方未能按约定时间地点交接",
        value: "双方未能按约定时间地点交接",
    }));
    const __VLS_835 = __VLS_834({
        label: "双方未能按约定时间地点交接",
        value: "双方未能按约定时间地点交接",
    }, ...__VLS_functionalComponentArgsRest(__VLS_834));
    const __VLS_837 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_838 = __VLS_asFunctionalComponent(__VLS_837, new __VLS_837({
        label: "卖家无法提供商品",
        value: "卖家无法提供商品",
    }));
    const __VLS_839 = __VLS_838({
        label: "卖家无法提供商品",
        value: "卖家无法提供商品",
    }, ...__VLS_functionalComponentArgsRest(__VLS_838));
    const __VLS_841 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_842 = __VLS_asFunctionalComponent(__VLS_841, new __VLS_841({
        label: "其他原因",
        value: "其他原因",
    }));
    const __VLS_843 = __VLS_842({
        label: "其他原因",
        value: "其他原因",
    }, ...__VLS_functionalComponentArgsRest(__VLS_842));
    var __VLS_824;
    var __VLS_820;
    var __VLS_816;
    {
        const { footer: __VLS_thisSlot } = __VLS_812.slots;
        const __VLS_845 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_846 = __VLS_asFunctionalComponent(__VLS_845, new __VLS_845({
            ...{ 'onClick': {} },
        }));
        const __VLS_847 = __VLS_846({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_846));
        let __VLS_849;
        let __VLS_850;
        let __VLS_851;
        const __VLS_852 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.currentUser))
                    return;
                __VLS_ctx.failureDialogVisible = false;
            }
        };
        __VLS_848.slots.default;
        var __VLS_848;
        const __VLS_853 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_854 = __VLS_asFunctionalComponent(__VLS_853, new __VLS_853({
            ...{ 'onClick': {} },
            type: "danger",
            loading: (__VLS_ctx.failureSubmitting),
        }));
        const __VLS_855 = __VLS_854({
            ...{ 'onClick': {} },
            type: "danger",
            loading: (__VLS_ctx.failureSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_854));
        let __VLS_857;
        let __VLS_858;
        let __VLS_859;
        const __VLS_860 = {
            onClick: (__VLS_ctx.submitTransactionFailure)
        };
        __VLS_856.slots.default;
        var __VLS_856;
    }
    var __VLS_812;
    const __VLS_861 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_862 = __VLS_asFunctionalComponent(__VLS_861, new __VLS_861({
        modelValue: (__VLS_ctx.reservationEditVisible),
        title: "修改交接信息",
        width: "min(480px, calc(100vw - 32px))",
        destroyOnClose: true,
    }));
    const __VLS_863 = __VLS_862({
        modelValue: (__VLS_ctx.reservationEditVisible),
        title: "修改交接信息",
        width: "min(480px, calc(100vw - 32px))",
        destroyOnClose: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_862));
    __VLS_864.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "reservation-tip" },
    });
    const __VLS_865 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_866 = __VLS_asFunctionalComponent(__VLS_865, new __VLS_865({
        labelPosition: "top",
    }));
    const __VLS_867 = __VLS_866({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_866));
    __VLS_868.slots.default;
    const __VLS_869 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_870 = __VLS_asFunctionalComponent(__VLS_869, new __VLS_869({
        label: "交接时间",
        required: true,
    }));
    const __VLS_871 = __VLS_870({
        label: "交接时间",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_870));
    __VLS_872.slots.default;
    const __VLS_873 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_874 = __VLS_asFunctionalComponent(__VLS_873, new __VLS_873({
        modelValue: (__VLS_ctx.reservationEditForm.appointmentTime),
        type: "datetime",
        valueFormat: "YYYY-MM-DDTHH:mm:ss",
        placeholder: "选择时间",
    }));
    const __VLS_875 = __VLS_874({
        modelValue: (__VLS_ctx.reservationEditForm.appointmentTime),
        type: "datetime",
        valueFormat: "YYYY-MM-DDTHH:mm:ss",
        placeholder: "选择时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_874));
    var __VLS_872;
    const __VLS_877 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_878 = __VLS_asFunctionalComponent(__VLS_877, new __VLS_877({
        label: "交接地点",
        required: true,
    }));
    const __VLS_879 = __VLS_878({
        label: "交接地点",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_878));
    __VLS_880.slots.default;
    const __VLS_881 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_882 = __VLS_asFunctionalComponent(__VLS_881, new __VLS_881({
        modelValue: (__VLS_ctx.reservationEditForm.location),
        placeholder: "例如：图书馆一楼大厅",
    }));
    const __VLS_883 = __VLS_882({
        modelValue: (__VLS_ctx.reservationEditForm.location),
        placeholder: "例如：图书馆一楼大厅",
    }, ...__VLS_functionalComponentArgsRest(__VLS_882));
    var __VLS_880;
    var __VLS_868;
    {
        const { footer: __VLS_thisSlot } = __VLS_864.slots;
        const __VLS_885 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_886 = __VLS_asFunctionalComponent(__VLS_885, new __VLS_885({
            ...{ 'onClick': {} },
        }));
        const __VLS_887 = __VLS_886({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_886));
        let __VLS_889;
        let __VLS_890;
        let __VLS_891;
        const __VLS_892 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.currentUser))
                    return;
                __VLS_ctx.reservationEditVisible = false;
            }
        };
        __VLS_888.slots.default;
        var __VLS_888;
        const __VLS_893 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_894 = __VLS_asFunctionalComponent(__VLS_893, new __VLS_893({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.reservationEditSubmitting),
        }));
        const __VLS_895 = __VLS_894({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.reservationEditSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_894));
        let __VLS_897;
        let __VLS_898;
        let __VLS_899;
        const __VLS_900 = {
            onClick: (__VLS_ctx.saveReservationEdit)
        };
        __VLS_896.slots.default;
        var __VLS_896;
    }
    var __VLS_864;
    const __VLS_901 = {}.ElDrawer;
    /** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
    // @ts-ignore
    const __VLS_902 = __VLS_asFunctionalComponent(__VLS_901, new __VLS_901({
        modelValue: (__VLS_ctx.profileDrawer),
        title: "个人信息",
        size: "min(420px, 100vw)",
    }));
    const __VLS_903 = __VLS_902({
        modelValue: (__VLS_ctx.profileDrawer),
        title: "个人信息",
        size: "min(420px, 100vw)",
    }, ...__VLS_functionalComponentArgsRest(__VLS_902));
    __VLS_904.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "profile-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "avatar-picker" },
    });
    const __VLS_905 = {}.ElUpload;
    /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
    // @ts-ignore
    const __VLS_906 = __VLS_asFunctionalComponent(__VLS_905, new __VLS_905({
        ...{ 'onChange': {} },
        accept: "image/jpeg,image/png,image/webp",
        showFileList: (false),
        autoUpload: (false),
    }));
    const __VLS_907 = __VLS_906({
        ...{ 'onChange': {} },
        accept: "image/jpeg,image/png,image/webp",
        showFileList: (false),
        autoUpload: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_906));
    let __VLS_909;
    let __VLS_910;
    let __VLS_911;
    const __VLS_912 = {
        onChange: (__VLS_ctx.uploadAvatar)
    };
    __VLS_908.slots.default;
    const __VLS_913 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_914 = __VLS_asFunctionalComponent(__VLS_913, new __VLS_913({
        ...{ class: "avatar-button" },
        text: true,
        loading: (__VLS_ctx.avatarUploading),
    }));
    const __VLS_915 = __VLS_914({
        ...{ class: "avatar-button" },
        text: true,
        loading: (__VLS_ctx.avatarUploading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_914));
    __VLS_916.slots.default;
    const __VLS_917 = {}.ElAvatar;
    /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
    // @ts-ignore
    const __VLS_918 = __VLS_asFunctionalComponent(__VLS_917, new __VLS_917({
        size: (104),
        src: (__VLS_ctx.currentUser.avatar_url),
    }));
    const __VLS_919 = __VLS_918({
        size: (104),
        src: (__VLS_ctx.currentUser.avatar_url),
    }, ...__VLS_functionalComponentArgsRest(__VLS_918));
    __VLS_920.slots.default;
    (__VLS_ctx.currentUser.nickname.slice(0, 1).toUpperCase());
    var __VLS_920;
    var __VLS_916;
    var __VLS_908;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "upload-tip" },
    });
    const __VLS_921 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_922 = __VLS_asFunctionalComponent(__VLS_921, new __VLS_921({
        labelPosition: "top",
        ...{ class: "profile-form" },
    }));
    const __VLS_923 = __VLS_922({
        labelPosition: "top",
        ...{ class: "profile-form" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_922));
    __VLS_924.slots.default;
    const __VLS_925 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_926 = __VLS_asFunctionalComponent(__VLS_925, new __VLS_925({
        label: "昵称",
    }));
    const __VLS_927 = __VLS_926({
        label: "昵称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_926));
    __VLS_928.slots.default;
    const __VLS_929 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_930 = __VLS_asFunctionalComponent(__VLS_929, new __VLS_929({
        modelValue: (__VLS_ctx.profileForm.nickname),
        maxlength: "40",
        showWordLimit: true,
    }));
    const __VLS_931 = __VLS_930({
        modelValue: (__VLS_ctx.profileForm.nickname),
        maxlength: "40",
        showWordLimit: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_930));
    var __VLS_928;
    const __VLS_933 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_934 = __VLS_asFunctionalComponent(__VLS_933, new __VLS_933({
        label: "手机号（预约联系方式）",
    }));
    const __VLS_935 = __VLS_934({
        label: "手机号（预约联系方式）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_934));
    __VLS_936.slots.default;
    const __VLS_937 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_938 = __VLS_asFunctionalComponent(__VLS_937, new __VLS_937({
        modelValue: (__VLS_ctx.profileForm.phone),
        inputmode: "numeric",
        maxlength: "11",
        placeholder: "请输入 11 位手机号",
    }));
    const __VLS_939 = __VLS_938({
        modelValue: (__VLS_ctx.profileForm.phone),
        inputmode: "numeric",
        maxlength: "11",
        placeholder: "请输入 11 位手机号",
    }, ...__VLS_functionalComponentArgsRest(__VLS_938));
    var __VLS_936;
    const __VLS_941 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_942 = __VLS_asFunctionalComponent(__VLS_941, new __VLS_941({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.profileSaving),
    }));
    const __VLS_943 = __VLS_942({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.profileSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_942));
    let __VLS_945;
    let __VLS_946;
    let __VLS_947;
    const __VLS_948 = {
        onClick: (__VLS_ctx.saveProfile)
    };
    __VLS_944.slots.default;
    var __VLS_944;
    var __VLS_924;
    var __VLS_904;
    var __VLS_63;
}
/** @type {__VLS_StyleScopedClasses['auth-page']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-button']} */ ;
/** @type {__VLS_StyleScopedClasses['auth-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['side-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-caption']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-chat-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-unread-count']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-bottom']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-logout']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['seller-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['item-section']} */ ;
/** @type {__VLS_StyleScopedClasses['item-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['item-content']} */ ;
/** @type {__VLS_StyleScopedClasses['item-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['tags']} */ ;
/** @type {__VLS_StyleScopedClasses['seller-item-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['publish-cta']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['buy-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['buy-search-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['buyer-search-row']} */ ;
/** @type {__VLS_StyleScopedClasses['clarification-card']} */ ;
/** @type {__VLS_StyleScopedClasses['clarification-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['clarification-row']} */ ;
/** @type {__VLS_StyleScopedClasses['match-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['match-section']} */ ;
/** @type {__VLS_StyleScopedClasses['match-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['item-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['item-content']} */ ;
/** @type {__VLS_StyleScopedClasses['item-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['match-section']} */ ;
/** @type {__VLS_StyleScopedClasses['uncertain-section']} */ ;
/** @type {__VLS_StyleScopedClasses['match-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-note']} */ ;
/** @type {__VLS_StyleScopedClasses['item-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['item-content']} */ ;
/** @type {__VLS_StyleScopedClasses['item-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['buy-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['buy-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-list']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-card']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-cover']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-content']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-role']} */ ;
/** @type {__VLS_StyleScopedClasses['failure-reason']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['item-section']} */ ;
/** @type {__VLS_StyleScopedClasses['item-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['cover']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['item-content']} */ ;
/** @type {__VLS_StyleScopedClasses['item-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-threads']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-thread']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-unread-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-window']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-item-header']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-messages']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-line']} */ ;
/** @type {__VLS_StyleScopedClasses['mine']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-image']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-compose']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-list']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-card']} */ ;
/** @type {__VLS_StyleScopedClasses['unread']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['publish-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['intro-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['publish-form']} */ ;
/** @type {__VLS_StyleScopedClasses['name-row']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-add']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-add']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['cover-sort']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-body']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-main']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-gallery']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-no-image']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-info']} */ ;
/** @type {__VLS_StyleScopedClasses['item-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-description']} */ ;
/** @type {__VLS_StyleScopedClasses['seller-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-button']} */ ;
/** @type {__VLS_StyleScopedClasses['own-item-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-section']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-title']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-action']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-list']} */ ;
/** @type {__VLS_StyleScopedClasses['comment']} */ ;
/** @type {__VLS_StyleScopedClasses['comment-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['reservation-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['avatar-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['avatar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-form']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Bell: Bell,
            Calendar: Calendar,
            ChatDotRound: ChatDotRound,
            Goods: Goods,
            ShoppingBag: ShoppingBag,
            Star: Star,
            currentUser: currentUser,
            activePage: activePage,
            profileDrawer: profileDrawer,
            profileSaving: profileSaving,
            avatarUploading: avatarUploading,
            profileForm: profileForm,
            authMode: authMode,
            authLoading: authLoading,
            authForm: authForm,
            items: items,
            loadingItems: loadingItems,
            dialogVisible: dialogVisible,
            resolving: resolving,
            publishing: publishing,
            template: template,
            imageFiles: imageFiles,
            detailVisible: detailVisible,
            detailLoading: detailLoading,
            selectedItem: selectedItem,
            comments: comments,
            commentText: commentText,
            commentSubmitting: commentSubmitting,
            buyerQuery: buyerQuery,
            matchLoading: matchLoading,
            matchSession: matchSession,
            clarificationAnswer: clarificationAnswer,
            reservationVisible: reservationVisible,
            reservationSubmitting: reservationSubmitting,
            reservationForm: reservationForm,
            reservations: reservations,
            reservationsLoading: reservationsLoading,
            failureDialogVisible: failureDialogVisible,
            failureSubmitting: failureSubmitting,
            failureForm: failureForm,
            reservationEditVisible: reservationEditVisible,
            reservationEditSubmitting: reservationEditSubmitting,
            reservationEditForm: reservationEditForm,
            favorites: favorites,
            notifications: notifications,
            notificationsLoading: notificationsLoading,
            chatThreads: chatThreads,
            chatLines: chatLines,
            activeChat: activeChat,
            chatText: chatText,
            chatSending: chatSending,
            chatImageFile: chatImageFile,
            editItemVisible: editItemVisible,
            editingItem: editingItem,
            itemActionLoading: itemActionLoading,
            editItemForm: editItemForm,
            editImageFiles: editImageFiles,
            form: form,
            openChat: openChat,
            selectChat: selectChat,
            sendChatMessage: sendChatMessage,
            selectChatImage: selectChatImage,
            unreadCount: unreadCount,
            unreadChatCount: unreadChatCount,
            isFavorite: isFavorite,
            selectPage: selectPage,
            reservationStatusText: reservationStatusText,
            reservationStatusType: reservationStatusType,
            itemStatusText: itemStatusText,
            formatAppointmentTime: formatAppointmentTime,
            changeReservationStatus: changeReservationStatus,
            completeTransaction: completeTransaction,
            sellerConfirmTransaction: sellerConfirmTransaction,
            openFailureDialog: openFailureDialog,
            submitTransactionFailure: submitTransactionFailure,
            openReservationEdit: openReservationEdit,
            saveReservationEdit: saveReservationEdit,
            toggleFavorite: toggleFavorite,
            markNotificationsRead: markNotificationsRead,
            markNotificationRead: markNotificationRead,
            startMatch: startMatch,
            continueMatch: continueMatch,
            submitAuth: submitAuth,
            logout: logout,
            openProfile: openProfile,
            saveProfile: saveProfile,
            uploadAvatar: uploadAvatar,
            openPublishDialog: openPublishDialog,
            openItemDetail: openItemDetail,
            submitComment: submitComment,
            formatCommentTime: formatCommentTime,
            openReservation: openReservation,
            submitReservation: submitReservation,
            deleteComment: deleteComment,
            offShelfItem: offShelfItem,
            restoreItem: restoreItem,
            openEditItem: openEditItem,
            makeCover: makeCover,
            saveItemEdit: saveItemEdit,
            deleteSellerItem: deleteSellerItem,
            resetForm: resetForm,
            booleanValue: booleanValue,
            setBooleanValue: setBooleanValue,
            editBooleanValue: editBooleanValue,
            setEditBooleanValue: setEditBooleanValue,
            confirmItemName: confirmItemName,
            publish: publish,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
