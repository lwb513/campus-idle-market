<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile, UploadUserFile } from 'element-plus'
import { Bell, Calendar, ChatDotRound, Goods, ShoppingBag, Star } from '@element-plus/icons-vue'

type Label = { key: string; label: string; type: 'string' | 'number' | 'boolean' | 'enum'; options: string[]; hint: string }
type Template = { id: number; display_name: string; labels: Label[]; generation_source: string; reused: boolean }
type ItemImage = { object_key: string; url: string; sort_order: number }
type Item = { id: number; seller_id: number; item_name: string; price: string; description: string | null; attributes: Record<string, unknown>; attribute_labels: Record<string, string>; label_definitions: Label[]; seller_nickname: string | null; seller_avatar_url: string | null; seller_completed_count: number; status: string; images: ItemImage[] }
type User = { id: number; username: string; nickname: string; phone: string | null; avatar_url: string | null }
type AuthResponse = { access_token: string; token_type: string; user: User }
type Comment = { id: number; item_id: number; content: string; author_nickname: string; author_avatar_url: string | null; is_seller: boolean; is_author: boolean; created_at: string }
type MatchCandidate = { item: Item; reasons: string[]; unknown_fields: string[] }
type MatchSession = { id: string; status: 'needs_clarification' | 'completed'; question: string | null; criteria: { item_name?: string | null; max_price?: number | null; constraints: Record<string, unknown> }; matched: MatchCandidate[]; uncertain: MatchCandidate[] }
type Reservation = { id: number; item_id: number; agreed_price: string; appointment_time: string; location: string; status: string; role: 'buyer' | 'seller'; counterpart_nickname: string; counterpart_phone: string | null; failure_reason: string | null; item: Item }
type Notification = { id: number; title: string; content: string; is_read: boolean; created_at: string }
type ChatLine = { id: number; item_id: number; sender_id: number; sender_nickname: string; sender_avatar_url: string | null; content: string; image_url: string | null; created_at: string; is_mine: boolean }
type ChatThread = { item: Item; peer_id: number; peer_nickname: string; peer_avatar_url: string | null; latest_content: string; latest_at: string; unread_count: number }

const currentUser = ref<User | null>(null)
const activePage = ref<'sell' | 'buy' | 'reservations' | 'favorites' | 'notifications' | 'chat'>('sell')
const profileDrawer = ref(false)
const profileSaving = ref(false)
const avatarUploading = ref(false)
const profileForm = reactive({ nickname: '', phone: '' })
const authMode = ref<'login' | 'register'>('login')
const authLoading = ref(false)
const authForm = reactive({ username: '', nickname: '', phone: '', password: '' })
const items = ref<Item[]>([])
const loadingItems = ref(false)
const dialogVisible = ref(false)
const resolving = ref(false)
const publishing = ref(false)
const template = ref<Template | null>(null)
const imageFiles = ref<UploadUserFile[]>([])
const detailVisible = ref(false)
const detailLoading = ref(false)
const selectedItem = ref<Item | null>(null)
const comments = ref<Comment[]>([])
const commentText = ref('')
const commentSubmitting = ref(false)
const buyerQuery = ref('')
const matchLoading = ref(false)
const matchSession = ref<MatchSession | null>(null)
const clarificationAnswer = ref('')
const reservationVisible = ref(false)
const reservationSubmitting = ref(false)
const reservationForm = reactive({ agreedPrice: undefined as number | undefined, appointmentTime: '', location: '' })
const reservations = ref<Reservation[]>([])
const reservationsLoading = ref(false)
const failureDialogVisible = ref(false)
const failedReservation = ref<Reservation | null>(null)
const failureSubmitting = ref(false)
const failureForm = reactive({ reason: '' })
const reservationEditVisible = ref(false)
const editingReservation = ref<Reservation | null>(null)
const reservationEditSubmitting = ref(false)
const reservationEditForm = reactive({ appointmentTime: '', location: '' })
const favorites = ref<Item[]>([])
const notifications = ref<Notification[]>([])
const notificationsLoading = ref(false)
const chatThreads = ref<ChatThread[]>([])
const chatLines = ref<ChatLine[]>([])
const activeChat = ref<ChatThread | null>(null)
const chatText = ref('')
const chatSending = ref(false)
const chatImageFile = ref<UploadFile | null>(null)
let liveUpdateTimer: number | undefined
const editItemVisible = ref(false)
const editingItem = ref<Item | null>(null)
const itemActionLoading = ref(false)
const editItemForm = reactive({ price: undefined as number | undefined, description: '', attributes: {} as Record<string, any> })
const editImageFiles = ref<UploadUserFile[]>([])
const form = reactive({ itemName: '', price: undefined as number | undefined, description: '', attributes: {} as Record<string, any> })

async function loadItems() {
  loadingItems.value = true
  try {
    const { data } = await axios.get<Item[]>('/api/v1/items/mine')
    items.value = data
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '加载在售商品失败')
  } finally { loadingItems.value = false }
}

async function loadReservations() {
  reservationsLoading.value = true
  try {
    const { data } = await axios.get<Reservation[]>('/api/v1/reservations/mine')
    reservations.value = data
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '加载预约单失败')
  } finally { reservationsLoading.value = false }
}

async function loadFavorites() {
  const { data } = await axios.get<Item[]>('/api/v1/favorites')
  favorites.value = data
}

async function loadNotifications() {
  notificationsLoading.value = true
  try {
    const { data } = await axios.get<Notification[]>('/api/v1/notifications')
    notifications.value = data
  } catch (error: any) { ElMessage.error(error.response?.data?.detail ?? '加载通知失败') } finally { notificationsLoading.value = false }
}

async function loadChatThreads() {
  const { data } = await axios.get<ChatThread[]>('/api/v1/chat/threads')
  chatThreads.value = data
}

async function loadChatLines() {
  if (!activeChat.value) return
  const { data } = await axios.get<ChatLine[]>(`/api/v1/chat/items/${activeChat.value.item.id}/with/${activeChat.value.peer_id}`)
  chatLines.value = data
}

async function openChat(peerId: number, item: Item) {
  activePage.value = 'chat'
  activeChat.value = { item, peer_id: peerId, peer_nickname: item.seller_nickname || '校园用户', peer_avatar_url: item.seller_avatar_url, latest_content: '', latest_at: '', unread_count: 0 }
  chatLines.value = []
  await Promise.all([loadChatThreads(), loadChatLines()])
}

async function selectChat(thread: ChatThread) {
  activeChat.value = thread
  await loadChatLines()
}

async function sendChatMessage() {
  if (!activeChat.value || (!chatText.value.trim() && !chatImageFile.value?.raw)) return
  chatSending.value = true
  try {
    let imageObjectKey: string | null = null
    if (chatImageFile.value?.raw) {
      const formData = new FormData()
      formData.append('file', chatImageFile.value.raw)
      const uploaded = await axios.post<{ object_key: string }>('/api/v1/uploads/images', formData)
      imageObjectKey = uploaded.data.object_key
    }
    const { data } = await axios.post<ChatLine>('/api/v1/chat/messages', { item_id: activeChat.value.item.id, receiver_id: activeChat.value.peer_id, content: chatText.value, image_object_key: imageObjectKey })
    chatLines.value.push(data)
    chatText.value = ''
    chatImageFile.value = null
    await loadChatThreads()
  } catch (error: any) { ElMessage.error(error.response?.data?.detail ?? '消息发送失败') } finally { chatSending.value = false }
}

function selectChatImage(file: UploadFile) {
  chatImageFile.value = file
}

const unreadCount = () => notifications.value.filter((item) => !item.is_read).length
const unreadChatCount = () => chatThreads.value.reduce((total, thread) => total + thread.unread_count, 0)
const isFavorite = (itemId: number) => favorites.value.some((item) => item.id === itemId)

function startLiveUpdates() {
  if (liveUpdateTimer) window.clearInterval(liveUpdateTimer)
  liveUpdateTimer = window.setInterval(() => {
    if (!currentUser.value) return
    void loadNotifications()
    void loadChatThreads()
    if (activePage.value === 'chat') {
      void loadChatLines()
    }
  }, 8000)
}

function selectPage(page: string) {
  activePage.value = page as 'sell' | 'buy' | 'reservations' | 'favorites' | 'notifications' | 'chat'
  if (activePage.value === 'reservations') void loadReservations()
  if (activePage.value === 'favorites') void loadFavorites()
  if (activePage.value === 'notifications') void loadNotifications()
  if (activePage.value === 'chat') void loadChatThreads()
}

function reservationStatusText(status: string) {
  return ({ pending: '待确认', confirmed: '已确认', buyer_completed: '待卖家确认完成', completed: '交易成功', failed: '交易失败', rejected: '已拒绝', cancelled: '已取消' } as Record<string, string>)[status] ?? status
}

function reservationStatusType(status: string) {
  return ({ pending: 'warning', confirmed: 'success', buyer_completed: 'warning', completed: 'success', failed: 'danger', rejected: 'info', cancelled: 'info' } as Record<string, 'warning' | 'success' | 'danger' | 'info'>)[status] ?? 'info'
}

function itemStatusText(status: string) {
  return ({ on_sale: '在售中', reserved: '预约中', sold: '已售出', off_shelf: '已下架' } as Record<string, string>)[status] ?? status
}

function formatAppointmentTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function changeReservationStatus(reservation: Reservation, action: 'confirm' | 'reject' | 'cancel') {
  const actionText = ({ confirm: '确认', reject: '拒绝', cancel: '取消' } as Record<string, string>)[action]
  try {
    await ElMessageBox.confirm(`${actionText}这条预约吗？`, `${actionText}预约`, { confirmButtonText: actionText, cancelButtonText: '返回', type: action === 'confirm' ? 'success' : 'warning' })
    await axios.post(`/api/v1/reservations/${reservation.id}/${action}`)
    ElMessage.success(`预约已${actionText}`)
    await loadReservations()
    await loadItems()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.detail ?? '操作失败')
  }
}

async function completeTransaction(reservation: Reservation) {
  try {
    await ElMessageBox.confirm('请确认你们已线下验货、付款并完成交接。该操作会将商品标记为“已售出”。', '确认交易成功', { confirmButtonText: '确认成功', cancelButtonText: '暂不确认', type: 'success' })
    await axios.post(`/api/v1/reservations/${reservation.id}/complete`)
    ElMessage.success('已提交交易成功，等待卖家最终确认')
    await loadReservations()
    await loadItems()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.detail ?? '操作失败')
  }
}

async function sellerConfirmTransaction(reservation: Reservation) {
  try {
    await ElMessageBox.confirm('确认后商品将标记为“已售出”，无法再参与搜索和预约。', '确认交易完成', { confirmButtonText: '确认完成', cancelButtonText: '返回', type: 'success' })
    await axios.post(`/api/v1/reservations/${reservation.id}/complete-confirm`)
    ElMessage.success('交易已完成，商品已标记为已售出')
    await loadReservations()
    await loadItems()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.detail ?? '操作失败')
  }
}

function openFailureDialog(reservation: Reservation) {
  failedReservation.value = reservation
  failureForm.reason = ''
  failureDialogVisible.value = true
}

async function submitTransactionFailure() {
  if (!failedReservation.value || !failureForm.reason.trim()) return ElMessage.warning('请填写交易失败原因')
  failureSubmitting.value = true
  try {
    await axios.post(`/api/v1/reservations/${failedReservation.value.id}/fail`, { failure_reason: failureForm.reason })
    ElMessage.success('交易已终止，商品已恢复在售')
    failureDialogVisible.value = false
    await loadReservations()
    await loadItems()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '操作失败')
  } finally { failureSubmitting.value = false }
}

function openReservationEdit(reservation: Reservation) {
  editingReservation.value = reservation
  reservationEditForm.appointmentTime = reservation.appointment_time.slice(0, 19)
  reservationEditForm.location = reservation.location
  reservationEditVisible.value = true
}

async function saveReservationEdit() {
  if (!editingReservation.value || !reservationEditForm.appointmentTime || !reservationEditForm.location.trim()) return ElMessage.warning('请填写交接时间和地点')
  reservationEditSubmitting.value = true
  try {
    await axios.patch(`/api/v1/reservations/${editingReservation.value.id}`, { appointment_time: reservationEditForm.appointmentTime, location: reservationEditForm.location })
    ElMessage.success('预约信息已修改，等待对方重新确认')
    reservationEditVisible.value = false
    await loadReservations()
    await loadItems()
  } catch (error: any) { ElMessage.error(error.response?.data?.detail ?? '修改失败') } finally { reservationEditSubmitting.value = false }
}

async function toggleFavorite() {
  if (!selectedItem.value) return
  try {
    if (isFavorite(selectedItem.value.id)) {
      await axios.delete(`/api/v1/items/${selectedItem.value.id}/favorite`)
      ElMessage.success('已取消收藏')
    } else {
      await axios.post(`/api/v1/items/${selectedItem.value.id}/favorite`)
      ElMessage.success('已收藏')
    }
    await loadFavorites()
  } catch (error: any) { ElMessage.error(error.response?.data?.detail ?? '操作失败') }
}

async function markNotificationsRead() {
  await axios.post('/api/v1/notifications/read-all')
  notifications.value = notifications.value.map((item) => ({ ...item, is_read: true }))
}

async function markNotificationRead(notification: Notification) {
  if (notification.is_read) return
  try {
    await axios.post(`/api/v1/notifications/${notification.id}/read`)
    notification.is_read = true
  } catch (error: any) { ElMessage.error(error.response?.data?.detail ?? '标记已读失败') }
}

async function startMatch() {
  if (!buyerQuery.value.trim()) return ElMessage.warning('请描述你想购买的物品')
  matchLoading.value = true
  try {
    const { data } = await axios.post<MatchSession>('/api/v1/match/sessions', { query: buyerQuery.value })
    matchSession.value = data
    clarificationAnswer.value = ''
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '需求匹配失败')
  } finally { matchLoading.value = false }
}

async function continueMatch() {
  if (!matchSession.value || !clarificationAnswer.value.trim()) return ElMessage.warning('请补充相关信息')
  matchLoading.value = true
  try {
    const { data } = await axios.post<MatchSession>(`/api/v1/match/sessions/${matchSession.value.id}/clarify`, { answer: clarificationAnswer.value })
    matchSession.value = data
    clarificationAnswer.value = ''
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '继续匹配失败')
  } finally { matchLoading.value = false }
}

function setToken(token: string) {
  localStorage.setItem('campus_market_token', token)
  axios.defaults.headers.common.Authorization = `Bearer ${token}`
}

async function submitAuth() {
  if (!authForm.username || !authForm.password || (authMode.value === 'register' && (!authForm.nickname || !authForm.phone))) return ElMessage.warning('请填写完整信息')
  authLoading.value = true
  try {
    const endpoint = authMode.value === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register'
    const payload = authMode.value === 'login'
      ? { username: authForm.username, password: authForm.password }
      : { username: authForm.username, nickname: authForm.nickname, phone: authForm.phone, password: authForm.password }
    const { data } = await axios.post<AuthResponse>(endpoint, payload)
    setToken(data.access_token)
    currentUser.value = data.user
    authForm.password = ''
    await loadItems()
    await Promise.all([loadFavorites(), loadNotifications(), loadChatThreads()])
    startLiveUpdates()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '登录失败，请稍后再试')
  } finally { authLoading.value = false }
}

function logout() {
  localStorage.removeItem('campus_market_token')
  delete axios.defaults.headers.common.Authorization
  currentUser.value = null
  items.value = []
  if (liveUpdateTimer) window.clearInterval(liveUpdateTimer)
  liveUpdateTimer = undefined
  resetForm()
}

function openProfile() {
  if (!currentUser.value) return
  profileForm.nickname = currentUser.value.nickname
  profileForm.phone = currentUser.value.phone ?? ''
  profileDrawer.value = true
}

async function saveProfile() {
  if (!profileForm.nickname.trim() || !profileForm.phone.trim()) return ElMessage.warning('昵称和手机号不能为空')
  profileSaving.value = true
  try {
    const { data } = await axios.patch<User>('/api/v1/auth/me', { nickname: profileForm.nickname, phone: profileForm.phone })
    currentUser.value = data
    ElMessage.success('昵称已更新')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '更新失败')
  } finally { profileSaving.value = false }
}

async function uploadAvatar(file: UploadFile) {
  if (!file.raw) return
  avatarUploading.value = true
  try {
    const data = new FormData()
    data.append('file', file.raw)
    const response = await axios.post<User>('/api/v1/auth/me/avatar', data)
    currentUser.value = response.data
    ElMessage.success('头像已更新')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '头像上传失败')
  } finally { avatarUploading.value = false }
}

function openPublishDialog() { dialogVisible.value = true }

async function openItemDetail(itemId: number) {
  detailVisible.value = true
  detailLoading.value = true
  selectedItem.value = null
  comments.value = []
  try {
    const [itemResponse, commentResponse] = await Promise.all([
      axios.get<Item>(`/api/v1/items/${itemId}`),
      axios.get<Comment[]>(`/api/v1/items/${itemId}/comments`),
    ])
    selectedItem.value = itemResponse.data
    comments.value = commentResponse.data
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '加载商品详情失败')
    detailVisible.value = false
  } finally { detailLoading.value = false }
}

async function submitComment() {
  if (!selectedItem.value || !commentText.value.trim()) return ElMessage.warning('请输入评论内容')
  commentSubmitting.value = true
  try {
    const { data } = await axios.post<Comment>(`/api/v1/items/${selectedItem.value.id}/comments`, { content: commentText.value })
    comments.value.unshift(data)
    commentText.value = ''
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '评论发布失败')
  } finally { commentSubmitting.value = false }
}

function formatCommentTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function openReservation() {
  if (!selectedItem.value) return
  reservationForm.agreedPrice = Number(selectedItem.value.price)
  reservationForm.appointmentTime = ''
  reservationForm.location = ''
  reservationVisible.value = true
}

async function submitReservation() {
  if (!selectedItem.value || !reservationForm.agreedPrice || !reservationForm.appointmentTime || !reservationForm.location.trim()) return ElMessage.warning('请填写约定价格、交接时间和地点')
  reservationSubmitting.value = true
  try {
    await axios.post('/api/v1/reservations', { item_id: selectedItem.value.id, agreed_price: reservationForm.agreedPrice, appointment_time: reservationForm.appointmentTime, location: reservationForm.location })
    ElMessage.success('预约已提交，等待卖家确认')
    reservationVisible.value = false
    await loadReservations()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '提交预约失败')
  } finally { reservationSubmitting.value = false }
}

async function deleteComment(comment: Comment) {
  try {
    await ElMessageBox.confirm('删除后无法恢复，确认删除这条评论吗？', '删除评论', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    await axios.delete(`/api/v1/comments/${comment.id}`)
    comments.value = comments.value.filter((item) => item.id !== comment.id)
    ElMessage.success('评论已删除')
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.detail ?? '删除评论失败')
  }
}

async function offShelfItem(item: Item) {
  try {
    await ElMessageBox.confirm('下架后商品不会出现在买家搜索结果中，并且可以修改价格和描述。', '暂时下架商品', { confirmButtonText: '确认下架', cancelButtonText: '取消', type: 'warning' })
    itemActionLoading.value = true
    await axios.post(`/api/v1/items/${item.id}/off-shelf`)
    ElMessage.success('商品已下架')
    await loadItems()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.detail ?? '下架失败')
  } finally { itemActionLoading.value = false }
}

async function restoreItem(item: Item) {
  itemActionLoading.value = true
  try {
    await axios.post(`/api/v1/items/${item.id}/on-sale`)
    ElMessage.success('商品已重新上架')
    await loadItems()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '上架失败')
  } finally { itemActionLoading.value = false }
}

function openEditItem(item: Item) {
  editingItem.value = item
  editItemForm.price = Number(item.price)
  editItemForm.description = item.description ?? ''
  editItemForm.attributes = { ...item.attributes }
  editImageFiles.value = item.images.map((image, index) => ({ name: `商品图片 ${index + 1}`, url: image.url, status: 'success', uid: -(index + 1), objectKey: image.object_key } as UploadUserFile))
  editItemVisible.value = true
}

function makeCover(index: number) {
  const [image] = editImageFiles.value.splice(index, 1)
  if (image) editImageFiles.value.unshift(image)
}

async function uploadEditImages(): Promise<string[]> {
  return Promise.all(editImageFiles.value.map(async (file: any) => {
    if (file.objectKey) return file.objectKey as string
    if (!file.raw) throw new Error('图片文件无效，请重新选择')
    const data = new FormData()
    data.append('file', file.raw)
    const response = await axios.post<{ object_key: string }>('/api/v1/uploads/images', data)
    return response.data.object_key
  }))
}

async function saveItemEdit() {
  if (!editingItem.value || !editItemForm.price) return ElMessage.warning('请填写有效的价格')
  itemActionLoading.value = true
  try {
    const imageObjectKeys = await uploadEditImages()
    await axios.patch(`/api/v1/items/${editingItem.value.id}`, { price: editItemForm.price, description: editItemForm.description || null, attributes: editItemForm.attributes, image_object_keys: imageObjectKeys })
    ElMessage.success('商品信息已保存')
    editItemVisible.value = false
    await loadItems()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '保存失败')
  } finally { itemActionLoading.value = false }
}

async function deleteSellerItem(item: Item) {
  try {
    await ElMessageBox.confirm(`确定永久删除“${item.item_name}”吗？删除后无法恢复。`, '删除商品', { confirmButtonText: '永久删除', cancelButtonText: '取消', type: 'error' })
    itemActionLoading.value = true
    await axios.delete(`/api/v1/items/${item.id}`)
    ElMessage.success('商品已删除')
    await loadItems()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.detail ?? '删除失败')
  } finally { itemActionLoading.value = false }
}

function resetForm() {
  form.itemName = ''
  form.price = undefined
  form.description = ''
  form.attributes = {}
  template.value = null
  imageFiles.value = []
}

function booleanValue(key: string): '' | 'true' | 'false' {
  const value = form.attributes[key]
  return value === true ? 'true' : value === false ? 'false' : ''
}

function setBooleanValue(key: string, value: '' | 'true' | 'false') {
  if (value === '') delete form.attributes[key]
  else form.attributes[key] = value === 'true'
}

function editBooleanValue(key: string): '' | 'true' | 'false' {
  const value = editItemForm.attributes[key]
  return value === true ? 'true' : value === false ? 'false' : ''
}

function setEditBooleanValue(key: string, value: '' | 'true' | 'false') {
  if (value === '') delete editItemForm.attributes[key]
  else editItemForm.attributes[key] = value === 'true'
}

async function confirmItemName() {
  if (!form.itemName.trim()) return ElMessage.warning('请先输入物品名称')
  resolving.value = true
  try {
    const { data } = await axios.post<Template>('/api/v1/publish/templates/resolve', { item_name: form.itemName })
    template.value = data
    form.attributes = {}
    ElMessage.success(data.reused ? '已使用已有标签模板' : '已生成新的可选标签')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? '生成标签失败，请稍后重试')
  } finally { resolving.value = false }
}

async function uploadImages(): Promise<string[]> {
  return Promise.all(imageFiles.value.map(async (file) => {
    if (!file.raw) throw new Error('图片文件无效，请重新选择')
    const data = new FormData()
    data.append('file', file.raw)
    const response = await axios.post<{ object_key: string }>('/api/v1/uploads/images', data)
    return response.data.object_key
  }))
}

async function publish() {
  if (!template.value || form.price === undefined) return ElMessage.warning('请确认物品名称并填写价格')
  publishing.value = true
  try {
    const imageObjectKeys = await uploadImages()
    await axios.post('/api/v1/items', {
      item_name: form.itemName,
      template_id: template.value.id,
      price: form.price,
      description: form.description || null,
      attributes: form.attributes,
      image_object_keys: imageObjectKeys,
    })
    ElMessage.success('商品已发布')
    dialogVisible.value = false
    resetForm()
    await loadItems()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail ?? error.message ?? '发布失败')
  } finally { publishing.value = false }
}

onMounted(async () => {
  const token = localStorage.getItem('campus_market_token')
  if (!token) return
  setToken(token)
  try {
    const { data } = await axios.get<User>('/api/v1/auth/me')
    currentUser.value = data
    await loadItems()
    await Promise.all([loadFavorites(), loadNotifications(), loadChatThreads()])
    startLiveUpdates()
  } catch {
    logout()
  }
})

onUnmounted(() => { if (liveUpdateTimer) window.clearInterval(liveUpdateTimer) })
</script>

<template>
  <main v-if="!currentUser" class="auth-page">
    <section class="auth-card">
      <p class="eyebrow">CAMPUS MARKET</p>
      <h1>{{ authMode === 'login' ? '登录账户' : '创建账户' }}</h1>
      <p class="auth-tip">登录后即可发布和管理自己的闲置物品。</p>
      <el-form label-position="top" @submit.prevent="submitAuth">
        <el-form-item label="用户名"><el-input v-model="authForm.username" autocomplete="username" placeholder="3 至 30 个字符，不含空格" /></el-form-item>
        <el-form-item v-if="authMode === 'register'" label="昵称"><el-input v-model="authForm.nickname" placeholder="页面展示名称" /></el-form-item>
        <el-form-item v-if="authMode === 'register'" label="手机号"><el-input v-model="authForm.phone" inputmode="numeric" maxlength="11" placeholder="用于线下预约时联系对方" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="authForm.password" type="password" show-password autocomplete="current-password" placeholder="至少 6 位" @keyup.enter="submitAuth" /></el-form-item>
        <el-button type="primary" size="large" class="auth-button" :loading="authLoading" @click="submitAuth">{{ authMode === 'login' ? '登录' : '注册并登录' }}</el-button>
      </el-form>
      <p class="auth-switch">{{ authMode === 'login' ? '还没有账户？' : '已有账户？' }} <el-button link type="primary" @click="authMode = authMode === 'login' ? 'register' : 'login'">{{ authMode === 'login' ? '去注册' : '去登录' }}</el-button></p>
    </section>
  </main>

  <el-container v-else class="app-shell">
    <el-aside width="220px" class="side-nav">
      <button class="nav-brand" @click="activePage = 'sell'"><span>闲</span><b>校园闲置</b></button>
      <p class="nav-caption">功能导航</p>
      <el-menu :default-active="activePage" @select="selectPage">
        <el-menu-item index="sell"><el-icon><Goods /></el-icon><span>我的在售</span></el-menu-item>
        <el-menu-item index="buy"><el-icon><ShoppingBag /></el-icon><span>购买商品</span></el-menu-item>
        <el-menu-item index="favorites"><el-icon><Star /></el-icon><span>我的收藏</span></el-menu-item>
        <el-menu-item index="chat"><el-icon><ChatDotRound /></el-icon><span>商品聊天</span><i v-if="unreadChatCount()" class="nav-chat-dot"></i></el-menu-item>
        <el-menu-item index="reservations"><el-icon><Calendar /></el-icon><span>我的预约</span></el-menu-item>
        <el-menu-item index="notifications"><el-icon><Bell /></el-icon><span>消息通知</span><span v-if="unreadCount()" class="nav-unread-count">{{ unreadCount() }}</span></el-menu-item>
      </el-menu>
      <div class="nav-bottom"><div class="nav-hint"><span>●</span> 线下交易更安心</div><el-button class="nav-logout" type="danger" plain @click="logout">退出登录</el-button></div>
    </el-aside>
    <el-main class="workspace">
  <main v-if="activePage === 'sell'" class="seller-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">SELLER CENTER</p>
        <h1>我的在售</h1>
        <p>管理正在出售的校园闲置物品。</p>
      </div>
      <div class="header-actions">
        <el-button class="profile-trigger" text @click="openProfile"><el-avatar :size="46" :src="currentUser.avatar_url">{{ currentUser.nickname.slice(0, 1).toUpperCase() }}</el-avatar><span>{{ currentUser.nickname }}</span></el-button>
      </div>
    </header>

    <section v-loading="loadingItems" class="item-section">
      <el-empty v-if="!loadingItems && items.length === 0" description="暂时没有在售商品">
        <el-button type="primary" @click="openPublishDialog">发布第一件商品</el-button>
      </el-empty>
      <div v-else class="item-grid">
        <article v-for="item in items" :key="item.id" class="item-card clickable" @click="openItemDetail(item.id)">
          <el-image v-if="item.images[0]" class="cover" :src="item.images[0].url" fit="cover" />
          <div v-else class="cover placeholder">暂无图片</div>
          <div class="item-content">
            <div class="item-heading"><h2>{{ item.item_name }}</h2><span :class="`status-${item.status}`">{{ itemStatusText(item.status) }}</span></div>
            <strong>¥{{ Number(item.price).toFixed(2) }}</strong>
            <p>{{ item.description || '卖家暂未填写补充描述' }}</p>
            <div v-if="Object.keys(item.attributes).length" class="tags">
              <el-tag v-for="(value, key) in item.attributes" :key="String(key)" effect="plain">{{ item.attribute_labels[String(key)] || key }}：{{ value === true ? '是' : value === false ? '否' : value }}</el-tag>
            </div>
            <div class="seller-item-actions" @click.stop>
              <el-button v-if="item.status === 'on_sale'" size="small" plain :loading="itemActionLoading" @click="offShelfItem(item)">暂时下架</el-button>
              <template v-else-if="item.status === 'off_shelf'">
                <el-button size="small" type="primary" plain @click="openEditItem(item)">编辑商品</el-button>
                <el-button size="small" type="success" plain :loading="itemActionLoading" @click="restoreItem(item)">重新上架</el-button>
                <el-button size="small" type="danger" plain :loading="itemActionLoading" @click="deleteSellerItem(item)">删除</el-button>
              </template>
            </div>
          </div>
        </article>
      </div>
    </section>
    <section class="publish-cta"><div><p class="eyebrow">READY TO SELL?</p><h2>把闲置物品交给需要它的人</h2><p>输入物品名称，填写价格和可选信息，即可发布。</p></div><el-button type="primary" size="large" @click="openPublishDialog">发布商品</el-button></section>
  </main>

  <main v-else-if="activePage === 'buy'" class="buy-page">
    <header class="page-header">
      <div><p class="eyebrow">BUYER CENTER</p><h1>购买商品</h1><p>浏览校园闲置商品，找到适合你的物品。</p></div>
      <div class="header-actions"><el-button class="profile-trigger" text @click="openProfile"><el-avatar :size="46" :src="currentUser.avatar_url">{{ currentUser.nickname.slice(0, 1).toUpperCase() }}</el-avatar><span>{{ currentUser.nickname }}</span></el-button></div>
    </header>
    <section class="buy-search-panel"><p class="eyebrow">SMART MATCH</p><h2>描述你想买的物品</h2><p>例如：“预算 80 元以内、适合宿舍使用的带线充电宝”。</p><div class="buyer-search-row"><el-input v-model="buyerQuery" size="large" placeholder="输入购买需求" @keyup.enter="startMatch" /><el-button type="primary" size="large" :loading="matchLoading" @click="startMatch">开始匹配</el-button></div></section>
    <section v-if="matchSession?.status === 'needs_clarification'" class="clarification-card"><div class="clarification-mark">?</div><div><h2>还需要确认一项信息</h2><p>{{ matchSession.question }}</p><div class="clarification-row"><el-input v-model="clarificationAnswer" placeholder="请输入补充信息" @keyup.enter="continueMatch" /><el-button type="primary" :loading="matchLoading" @click="continueMatch">继续匹配</el-button></div></div></section>
    <template v-else-if="matchSession?.status === 'completed'">
      <section class="match-summary"><span>已按以下条件匹配：</span><el-tag v-if="matchSession.criteria.item_name" type="primary">{{ matchSession.criteria.item_name }}</el-tag><el-tag v-if="matchSession.criteria.max_price !== null && matchSession.criteria.max_price !== undefined">预算 ≤ ¥{{ matchSession.criteria.max_price }}</el-tag><el-tag v-for="(value, key) in matchSession.criteria.constraints" :key="String(key)">{{ key }}：{{ value === true ? '是' : value }}</el-tag></section>
      <section class="match-section"><div class="match-section-title"><h2>明确匹配</h2><span>{{ matchSession.matched.length }} 件</span></div><el-empty v-if="matchSession.matched.length === 0" description="没有找到明确满足条件的商品" :image-size="76" /><div v-else class="item-grid"><article v-for="candidate in matchSession.matched" :key="candidate.item.id" class="item-card clickable" @click="openItemDetail(candidate.item.id)"><el-image v-if="candidate.item.images[0]" class="cover" :src="candidate.item.images[0].url" fit="cover" /><div v-else class="cover placeholder">暂无图片</div><div class="item-content"><div class="item-heading"><h2>{{ candidate.item.item_name }}</h2><span>匹配</span></div><strong>¥{{ Number(candidate.item.price).toFixed(2) }}</strong><p>{{ candidate.reasons.join('；') }}</p></div></article></div></section>
      <section v-if="matchSession.uncertain.length" class="match-section uncertain-section"><div class="match-section-title"><h2>待确认</h2><span>{{ matchSession.uncertain.length }} 件</span></div><p class="section-note">这些商品没有明确冲突，但部分关键属性尚未填写。</p><div class="item-grid"><article v-for="candidate in matchSession.uncertain" :key="candidate.item.id" class="item-card clickable" @click="openItemDetail(candidate.item.id)"><el-image v-if="candidate.item.images[0]" class="cover" :src="candidate.item.images[0].url" fit="cover" /><div v-else class="cover placeholder">暂无图片</div><div class="item-content"><div class="item-heading"><h2>{{ candidate.item.item_name }}</h2><span>待确认</span></div><strong>¥{{ Number(candidate.item.price).toFixed(2) }}</strong><p>待确认：{{ candidate.unknown_fields.join('、') }}</p></div></article></div></section>
    </template>
    <section v-else class="buy-placeholder"><div class="buy-icon">⌕</div><h2>输入需求，开始智能匹配</h2><p>系统会识别你的预算与商品条件；信息不清楚时会先向你追问。</p></section>
  </main>

  <main v-else-if="activePage === 'reservations'" class="reservation-page">
    <header class="page-header"><div><p class="eyebrow">APPOINTMENT CENTER</p><h1>我的预约</h1><p>查看作为买家发起或作为卖家收到的线下交接预约。</p></div><div class="header-actions"><el-button class="profile-trigger" text @click="openProfile"><el-avatar :size="46" :src="currentUser.avatar_url">{{ currentUser.nickname.slice(0, 1).toUpperCase() }}</el-avatar><span>{{ currentUser.nickname }}</span></el-button></div></header>
    <section v-loading="reservationsLoading" class="reservation-list">
      <el-empty v-if="!reservationsLoading && reservations.length === 0" description="暂无预约单" />
      <article v-for="reservation in reservations" :key="reservation.id" class="reservation-card">
        <el-image v-if="reservation.item.images[0]" class="reservation-cover" :src="reservation.item.images[0].url" fit="cover" />
        <div v-else class="reservation-cover placeholder">暂无图片</div>
        <div class="reservation-content">
          <div class="reservation-heading"><div><span class="reservation-role">{{ reservation.role === 'buyer' ? '我发起的预约' : '我收到的预约' }}</span><h2>{{ reservation.item.item_name }}</h2></div><el-tag :type="reservationStatusType(reservation.status)" effect="light">{{ reservationStatusText(reservation.status) }}</el-tag></div>
          <p>对方：{{ reservation.counterpart_nickname }}　手机号：{{ ['confirmed', 'buyer_completed', 'completed', 'failed'].includes(reservation.status) ? (reservation.counterpart_phone || '暂未填写') : '预约确认后可见' }}</p>
          <p>约定价格：<strong>¥{{ Number(reservation.agreed_price).toFixed(2) }}</strong></p>
          <p>交接时间：{{ formatAppointmentTime(reservation.appointment_time) }}</p>
          <p>交接地点：{{ reservation.location }}</p>
          <p v-if="reservation.status === 'failed' && reservation.failure_reason" class="failure-reason">失败原因：{{ reservation.failure_reason }}</p>
          <div class="reservation-actions">
            <template v-if="reservation.role === 'seller' && reservation.status === 'pending'"><el-button type="success" @click="changeReservationStatus(reservation, 'confirm')">确认预约</el-button><el-button @click="changeReservationStatus(reservation, 'reject')">拒绝</el-button></template>
            <template v-else-if="reservation.role === 'buyer' && reservation.status === 'confirmed'"><el-button type="success" @click="completeTransaction(reservation)">交易成功</el-button><el-button type="danger" plain @click="openFailureDialog(reservation)">交易失败</el-button></template>
            <template v-else-if="reservation.role === 'seller' && reservation.status === 'buyer_completed'"><el-button type="success" @click="sellerConfirmTransaction(reservation)">确认交易完成</el-button></template>
            <el-button v-else-if="reservation.role === 'buyer' && reservation.status === 'pending'" type="danger" plain @click="changeReservationStatus(reservation, 'cancel')">取消预约</el-button>
            <el-button v-if="['pending', 'confirmed'].includes(reservation.status)" plain @click="openReservationEdit(reservation)">修改时间地点</el-button>
            <el-button link type="primary" @click="openItemDetail(reservation.item.id)">查看商品</el-button>
          </div>
        </div>
      </article>
    </section>
  </main>

  <main v-else-if="activePage === 'favorites'" class="reservation-page">
    <header class="page-header"><div><p class="eyebrow">MY FAVORITES</p><h1>我的收藏</h1><p>保存感兴趣的商品，方便稍后查看。</p></div></header>
    <section class="item-section"><el-empty v-if="favorites.length === 0" description="还没有收藏商品" /><div v-else class="item-grid"><article v-for="item in favorites" :key="item.id" class="item-card clickable" @click="openItemDetail(item.id)"><el-image v-if="item.images[0]" class="cover" :src="item.images[0].url" fit="cover" /><div v-else class="cover placeholder">暂无图片</div><div class="item-content"><div class="item-heading"><h2>{{ item.item_name }}</h2><span :class="`status-${item.status}`">{{ itemStatusText(item.status) }}</span></div><strong>¥{{ Number(item.price).toFixed(2) }}</strong><p>{{ item.description || '卖家暂未填写补充描述' }}</p></div></article></div></section>
  </main>

  <main v-else-if="activePage === 'chat'" class="chat-page">
    <header class="page-header"><div><p class="eyebrow">ITEM CHAT</p><h1>商品聊天</h1><p>围绕具体商品与对方沟通，确认细节后再预约。</p></div></header>
    <section class="chat-layout"><aside class="chat-threads"><h3>会话</h3><el-empty v-if="chatThreads.length === 0" description="暂无聊天记录" :image-size="56" /><button v-for="thread in chatThreads" :key="`${thread.item.id}-${thread.peer_id}`" class="chat-thread" :class="{ active: activeChat?.item.id === thread.item.id && activeChat?.peer_id === thread.peer_id }" @click="selectChat(thread)"><el-avatar :size="34" :src="thread.peer_avatar_url">{{ thread.peer_nickname.slice(0, 1) }}</el-avatar><span><b>{{ thread.peer_nickname }}</b><small>{{ thread.item.item_name }} · ¥{{ Number(thread.item.price).toFixed(2) }} · {{ thread.latest_content }}</small></span><i v-if="thread.unread_count" class="chat-unread-dot"></i></button></aside><section class="chat-window"><template v-if="activeChat"><header class="chat-item-header"><el-image v-if="activeChat.item.images[0]" :src="activeChat.item.images[0].url" fit="cover" /><div><b>{{ activeChat.peer_nickname }}</b><strong>{{ activeChat.item.item_name }} · ¥{{ Number(activeChat.item.price).toFixed(2) }}</strong><small>商品编号 #{{ activeChat.item.id }} <template v-for="(value, key) in activeChat.item.attributes" :key="String(key)"> · {{ activeChat.item.attribute_labels[String(key)] || key }}：{{ value === true ? '是' : value === false ? '否' : value }}</template></small></div></header><div class="chat-messages"><el-empty v-if="chatLines.length === 0" description="发送第一条消息，开始沟通" :image-size="65" /><article v-for="line in chatLines" :key="line.id" class="chat-line" :class="{ mine: line.is_mine }"><el-avatar :size="30" :src="line.sender_avatar_url">{{ line.sender_nickname.slice(0, 1) }}</el-avatar><div><p v-if="line.content">{{ line.content }}</p><el-image v-if="line.image_url" class="chat-image" :src="line.image_url" :preview-src-list="[line.image_url]" preview-teleported fit="cover" /><small>{{ formatCommentTime(line.created_at) }}</small></div></article></div><div class="chat-compose"><el-upload accept="image/jpeg,image/png,image/webp" :show-file-list="false" :auto-upload="false" @change="selectChatImage"><el-button :type="chatImageFile ? 'primary' : 'default'" plain>图片{{ chatImageFile ? '已选择' : '' }}</el-button></el-upload><el-input v-model="chatText" type="textarea" :rows="2" maxlength="1000" show-word-limit placeholder="输入消息…" @keyup.ctrl.enter="sendChatMessage" /><el-button type="primary" :loading="chatSending" @click="sendChatMessage">发送</el-button></div></template><el-empty v-else description="从左侧选择会话，或在商品详情中联系卖家" /></section></section>
  </main>

  <main v-else class="reservation-page">
    <header class="page-header"><div><p class="eyebrow">NOTIFICATIONS</p><h1>消息通知</h1><p>预约、交易状态变化会在这里提醒你。</p></div><el-button v-if="unreadCount()" plain @click="markNotificationsRead">全部标为已读</el-button></header>
    <section v-loading="notificationsLoading" class="notification-list"><el-empty v-if="!notificationsLoading && notifications.length === 0" description="暂无消息" /><article v-for="notification in notifications" :key="notification.id" class="notification-card" :class="{ unread: !notification.is_read }" @click="markNotificationRead(notification)"><span class="notification-dot"></span><div><h3>{{ notification.title }}</h3><p>{{ notification.content }}</p><small>{{ formatCommentTime(notification.created_at) }}</small></div></article></section>
  </main>
    </el-main>

    <el-dialog v-model="dialogVisible" class="publish-dialog" width="min(680px, calc(100vw - 32px))" destroy-on-close @closed="resetForm">
      <template #header><div class="dialog-title"><div><p>发布闲置</p><h2>发布商品</h2></div><span>{{ template ? '2 / 2' : '1 / 2' }}</span></div></template>
      <div class="dialog-intro"><span class="intro-icon">✦</span><span>确认物品名称后，系统会复用已有标签模板；没有模板时将生成新的可选标签。</span></div>
      <el-form label-position="top" class="publish-form">
        <el-form-item label="物品名称" required>
          <div class="name-row">
            <el-input v-model="form.itemName" placeholder="例如：充电宝" @keyup.enter="confirmItemName" />
            <el-button type="primary" :loading="resolving" @click="confirmItemName">确认物品</el-button>
          </div>
        </el-form-item>
        <template v-if="template">
          <el-alert :title="template.reused ? `正在使用“${template.display_name}”的已有标签模板` : '已生成新的标签模板'" type="success" :closable="false" show-icon />
          <div class="detail-heading"><span>2</span><div><h3>补充商品信息</h3><p>价格必填，标签、图片和描述均可选。</p></div></div>
          <el-form-item label="价格（元）" required><el-input-number v-model="form.price" :min="0.01" :precision="2" :controls="false" /></el-form-item>
          <el-form-item label="商品图片">
            <el-upload v-model:file-list="imageFiles" list-type="picture-card" accept="image/jpeg,image/png,image/webp" :auto-upload="false" :limit="3">
              <span class="upload-add">＋</span>
              <template #tip><div class="upload-tip">最多 3 张，第一张作为封面。支持 JPG、PNG、WebP，单张不超过 5MB；提交时上传到 MinIO。</div></template>
            </el-upload>
          </el-form-item>
          <el-form-item v-for="field in template.labels" :key="field.key" :label="field.label">
            <el-input v-if="field.type === 'string'" v-model="form.attributes[field.key]" :placeholder="field.hint || `填写${field.label}`" />
            <el-input-number v-else-if="field.type === 'number'" v-model="form.attributes[field.key]" :min="0" :controls="false" />
            <el-select v-else-if="field.type === 'enum'" v-model="form.attributes[field.key]" clearable :placeholder="`选择${field.label}`"><el-option v-for="option in field.options" :key="option" :label="option" :value="option" /></el-select>
            <el-select v-else :model-value="booleanValue(field.key)" clearable placeholder="未填写" @update:model-value="setBooleanValue(field.key, $event)"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select>
            <small v-if="field.hint" class="hint">{{ field.hint }}</small>
          </el-form-item>
          <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="4" placeholder="可填写使用情况、瑕疵、交易地点等补充信息" /></el-form-item>
        </template>
      </el-form>
      <template v-if="template" #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="publishing" @click="publish">提交发布</el-button></template>
    </el-dialog>

    <el-dialog v-model="editItemVisible" title="编辑已下架商品" width="min(620px, calc(100vw - 32px))" destroy-on-close>
      <p class="reservation-tip">为避免已被买家看到的信息突然变化，只有已下架的商品可以编辑。</p>
      <el-form label-position="top">
        <el-form-item label="价格（元）" required><el-input-number v-model="editItemForm.price" :min="0.01" :precision="2" :controls="false" /></el-form-item>
        <el-form-item label="商品图片"><el-upload v-model:file-list="editImageFiles" list-type="picture-card" accept="image/jpeg,image/png,image/webp" :auto-upload="false" :limit="3"><span class="upload-add">＋</span><template #tip><div class="upload-tip">最多 3 张，第一张是封面。</div></template></el-upload><div v-if="editImageFiles.length" class="cover-sort"><el-button v-for="(file, index) in editImageFiles" :key="file.uid" size="small" :type="index === 0 ? 'primary' : 'default'" plain @click="makeCover(index)">{{ index === 0 ? '当前封面' : `图片 ${index + 1}：设为封面` }}</el-button></div></el-form-item>
        <el-divider content-position="left">商品标签</el-divider>
        <el-form-item v-for="field in editingItem?.label_definitions || []" :key="field.key" :label="field.label">
          <el-input v-if="field.type === 'string'" v-model="editItemForm.attributes[field.key]" :placeholder="field.hint || `填写${field.label}`" />
          <el-input-number v-else-if="field.type === 'number'" v-model="editItemForm.attributes[field.key]" :min="0" :controls="false" />
          <el-select v-else-if="field.type === 'enum'" v-model="editItemForm.attributes[field.key]" clearable :placeholder="`选择${field.label}`"><el-option v-for="option in field.options" :key="option" :label="option" :value="option" /></el-select>
          <el-select v-else :model-value="editBooleanValue(field.key)" clearable placeholder="未填写" @update:model-value="setEditBooleanValue(field.key, $event)"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select>
          <small v-if="field.hint" class="hint">{{ field.hint }}</small>
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="editItemForm.description" type="textarea" :rows="5" maxlength="2000" show-word-limit placeholder="填写商品补充说明" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editItemVisible = false">取消</el-button><el-button type="primary" :loading="itemActionLoading" @click="saveItemEdit">保存修改</el-button></template>
    </el-dialog>

    <el-dialog v-model="detailVisible" class="detail-dialog" width="min(860px, calc(100vw - 28px))" destroy-on-close>
      <template #header><div class="dialog-title"><div><p>ITEM DETAIL</p><h2>商品详情</h2></div></div></template>
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="selectedItem">
          <div class="detail-main">
            <div class="detail-gallery">
              <el-carousel v-if="selectedItem.images.length" height="310px" indicator-position="outside"><el-carousel-item v-for="image in selectedItem.images" :key="image.object_key"><el-image :src="image.url" :preview-src-list="selectedItem.images.map(itemImage => itemImage.url)" fit="contain" preview-teleported /></el-carousel-item></el-carousel>
              <div v-else class="detail-no-image">暂无商品图片</div>
            </div>
            <section class="detail-info"><div class="item-heading"><h2>{{ selectedItem.item_name }}</h2><span :class="`status-${selectedItem.status}`">{{ itemStatusText(selectedItem.status) }}</span></div><strong>¥{{ Number(selectedItem.price).toFixed(2) }}</strong><p class="detail-description">{{ selectedItem.description || '卖家暂未填写商品描述。' }}</p><div v-if="selectedItem.seller_id !== currentUser.id" class="seller-summary"><el-avatar :size="34" :src="selectedItem.seller_avatar_url">{{ selectedItem.seller_nickname?.slice(0, 1) }}</el-avatar><span>卖家：{{ selectedItem.seller_nickname || '校园用户' }}</span><small>已成交 {{ selectedItem.seller_completed_count }} 件</small></div><el-descriptions v-if="Object.keys(selectedItem.attributes).length" :column="1" border size="small"><el-descriptions-item v-for="(value, key) in selectedItem.attributes" :key="String(key)" :label="selectedItem.attribute_labels[String(key)] || String(key)">{{ value === true ? '是' : value === false ? '否' : value }}</el-descriptions-item></el-descriptions><div v-if="selectedItem.seller_id !== currentUser.id" class="detail-buttons"><el-button class="reservation-button" :disabled="selectedItem.status !== 'on_sale'" type="primary" size="large" @click="openReservation">发起预约</el-button><el-button size="large" plain @click="openChat(selectedItem.seller_id, selectedItem)">联系卖家</el-button><el-button size="large" plain @click="toggleFavorite">{{ isFavorite(selectedItem.id) ? '取消收藏' : '收藏商品' }}</el-button></div><el-tag v-else class="own-item-tag" type="info" effect="plain">这是你发布的商品</el-tag></section>
          </div>
          <section class="comment-section"><div class="comment-title"><h3>评论</h3><span>{{ comments.length }} 条</span></div><el-input v-model="commentText" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="写下你的评论或想了解的问题…" /><div class="comment-action"><el-button type="primary" :loading="commentSubmitting" @click="submitComment">发表评论</el-button></div><el-empty v-if="comments.length === 0" description="还没有评论，来说点什么吧" :image-size="72" /><div v-else class="comment-list"><article v-for="comment in comments" :key="comment.id" class="comment"><el-avatar :size="34" :src="comment.author_avatar_url">{{ comment.author_nickname.slice(0, 1) }}</el-avatar><div><div class="comment-meta"><strong>{{ comment.author_nickname }}</strong><el-tag v-if="comment.is_seller" size="small" type="success" effect="light">卖家</el-tag><span>{{ formatCommentTime(comment.created_at) }}</span><el-button v-if="comment.is_author" link type="danger" size="small" @click="deleteComment(comment)">删除</el-button></div><p>{{ comment.content }}</p></div></article></div></section>
        </template>
      </div>
    </el-dialog>

    <el-dialog v-model="reservationVisible" class="reservation-dialog" title="发起线下交接预约" width="min(480px, calc(100vw - 32px))">
      <p class="reservation-tip">提交后需要卖家确认；平台不处理付款，双方线下验货并自行付款。</p>
      <el-form label-position="top"><el-form-item label="约定价格（元）" required><el-input-number v-model="reservationForm.agreedPrice" :min="0.01" :precision="2" :controls="false" /></el-form-item><el-form-item label="交接时间" required><el-date-picker v-model="reservationForm.appointmentTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择时间" /></el-form-item><el-form-item label="交接地点" required><el-input v-model="reservationForm.location" placeholder="例如：图书馆一楼大厅" /></el-form-item></el-form>
      <template #footer><el-button @click="reservationVisible = false">取消</el-button><el-button type="primary" :loading="reservationSubmitting" @click="submitReservation">提交预约</el-button></template>
    </el-dialog>

    <el-dialog v-model="failureDialogVisible" title="标记交易失败" width="min(480px, calc(100vw - 32px))" destroy-on-close>
      <p class="reservation-tip">请如实说明未完成交易的原因。提交后，预约单会标为“交易失败”，商品会恢复为在售中。</p>
      <el-form label-position="top"><el-form-item label="失败原因" required><el-select v-model="failureForm.reason" allow-create filterable default-first-option placeholder="选择或填写原因"><el-option label="物品与描述不符" value="物品与描述不符" /><el-option label="物品存在未说明的瑕疵" value="物品存在未说明的瑕疵" /><el-option label="双方未能按约定时间地点交接" value="双方未能按约定时间地点交接" /><el-option label="卖家无法提供商品" value="卖家无法提供商品" /><el-option label="其他原因" value="其他原因" /></el-select></el-form-item></el-form>
      <template #footer><el-button @click="failureDialogVisible = false">取消</el-button><el-button type="danger" :loading="failureSubmitting" @click="submitTransactionFailure">确认交易失败</el-button></template>
    </el-dialog>

    <el-dialog v-model="reservationEditVisible" title="修改交接信息" width="min(480px, calc(100vw - 32px))" destroy-on-close><p class="reservation-tip">修改时间或地点后，预约会重新变为待确认状态。</p><el-form label-position="top"><el-form-item label="交接时间" required><el-date-picker v-model="reservationEditForm.appointmentTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择时间" /></el-form-item><el-form-item label="交接地点" required><el-input v-model="reservationEditForm.location" placeholder="例如：图书馆一楼大厅" /></el-form-item></el-form><template #footer><el-button @click="reservationEditVisible = false">取消</el-button><el-button type="primary" :loading="reservationEditSubmitting" @click="saveReservationEdit">提交修改</el-button></template></el-dialog>

    <el-drawer v-model="profileDrawer" title="个人信息" size="min(420px, 100vw)">
      <div class="profile-panel">
        <div class="avatar-picker"><el-upload accept="image/jpeg,image/png,image/webp" :show-file-list="false" :auto-upload="false" @change="uploadAvatar"><el-button class="avatar-button" text :loading="avatarUploading"><el-avatar :size="104" :src="currentUser.avatar_url">{{ currentUser.nickname.slice(0, 1).toUpperCase() }}</el-avatar></el-button></el-upload><span>点击更换头像</span></div>
        <p class="upload-tip">支持 JPG、PNG、WebP，单张不超过 5MB。</p>
        <el-form label-position="top" class="profile-form"><el-form-item label="昵称"><el-input v-model="profileForm.nickname" maxlength="40" show-word-limit /></el-form-item><el-form-item label="手机号（预约联系方式）"><el-input v-model="profileForm.phone" inputmode="numeric" maxlength="11" placeholder="请输入 11 位手机号" /></el-form-item><el-button type="primary" :loading="profileSaving" @click="saveProfile">保存信息</el-button></el-form>
      </div>
    </el-drawer>
  </el-container>
</template>
