import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../supabase'

export const useMainStore = defineStore('main', () => {
  // --- 狀態定義 (State) ---
  const view = ref('dashboard')
  const session = ref(null)
  const clients = ref([])
  const transactions = ref([])
  const products = ref([])
  const displayTxnCount = ref(50) 

  const stock = ref({}) 
  const stockExpiry = ref({}) 
  const promotions = ref([]) 

  const isFetchingMore = ref(false) 
const hasMoreTxn = ref(true)
  
  const settings = ref(JSON.parse(localStorage.getItem('fitwork_settings')) || { payees: [] }) 
  const deviceUsers = ref(JSON.parse(localStorage.getItem('fitwork_deviceUsers')) || [])
  const currentUser = ref(localStorage.getItem('fitwork_currentUser') || '') 

 // 🚀 新增：用來暫存「再來一套」的複刻訂單資料，作為頁面間的溝通橋樑
  const pendingRepeatOrder = ref(null)
  const quickActionClient = ref(null) // 🚀 新增：用來暫存快捷鍵選中的客戶

  // 🚀 新增：控制分批載入與舊資料狀態
  const isFetchingMore = ref(false) 
  const hasMoreTxn = ref(true) 

  // --- 同步資料邏輯 (Actions) ---
  async function syncAll() {
    console.log('🚀 開始從 Supabase 同步資料...')
    
    try {
      // 💡 1. 取得當前登入者的 Email
      const { data: { session } } = await supabase.auth.getSession()
      const userEmail = session?.user?.email

      if (!userEmail) {
        console.error('❌ 尚未登入，停止同步')
        return
      }

      // 💡 2. 【核心修復：前端隱私雙重鎖】
      // 這裡的 promotions 已經補上 .eq('owner_email', userEmail) 了！
      const [c, p, t, s, pr] = await Promise.all([
        supabase.from('clients').select('*').eq('owner_email', userEmail).order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name'),
        supabase.from('transactions').select('*').eq('owner_email', userEmail).order('created_at', { ascending: false }).limit(500),
        supabase.from('stock').select('*').eq('owner_email', userEmail),
        supabase.from('promotions').select('*').eq('owner_email', userEmail).order('created_at', { ascending: false }) 
      ])
      if (t.error) console.error('❌ 交易抓取失敗:', t.error)
else {
  transactions.value = t.data || []
  // 🚀 新增：如果抓回來的資料剛好是 500 筆，代表可能還有舊資料；如果少於 500 筆，代表已經到底了
  hasMoreTxn.value = (t.data?.length === 500) 
}

      // 1. 處理客戶資料
      if (c.error) console.error('❌ 客戶抓取失敗:', c.error)
      else clients.value = c.data || []

      // 2. 處理產品資料
      if (p.error) console.error('❌ 產品抓取失敗:', p.error)
      else {
        products.value = p.data || []
        console.log('📦 產品同步成功，共:', p.data?.length, '筆')
      }

   // 3. 處理交易資料
      if (t.error) console.error('❌ 交易抓取失敗:', t.error)
      else {
        transactions.value = t.data || []
        // 🚀 如果剛好抓到 500 筆，代表可能還有舊帳未顯示
        hasMoreTxn.value = (t.data?.length === 500)
      }

      // 4. 處理庫存資料
      if (s.error) console.error('❌ 庫存抓取失敗:', s.error)
      else {
        const m = {}
        const e = {}
        const stockData = s.data || []
        stockData.forEach(i => {
          const key = `${i.prod_name}_${i.branch || '觀塘'}` 
          m[key] = i.quantity
          if (i.updated_at) e[key] = i.updated_at
        })
        stock.value = m
        stockExpiry.value = e
        console.log('📦 庫存映射(Mapping)成功，共:', Object.keys(m).length, '個庫存項目')
      }

      // 5. 處理宣傳活動資料
      if (pr.error) console.error('❌ 宣傳活動抓取失敗:', pr.error)
      else promotions.value = pr.data || []

      console.log('✅ 資料庫全部同步完成', { 
        當前帳號: userEmail,
        客戶: clients.value.length, 
        產品: products.value.length, 
        交易: transactions.value.length,
        庫存項目: Object.keys(stock.value).length
      })

    } catch (err) {
      console.error('💥 同步過程中發生未知錯誤:', err)
    }
  }

  function setDeviceUsers(namesStr) {
    const names = namesStr.split(/[,，]/).map(n => n.trim()).filter(n => n)
    if (names.length === 0) return

    deviceUsers.value = names
    currentUser.value = names[0] 
    
    localStorage.setItem('fitwork_deviceUsers', JSON.stringify(names))
    localStorage.setItem('fitwork_currentUser', currentUser.value) 
    
    settings.value.payees = names
    localStorage.setItem('fitwork_settings', JSON.stringify(settings.value))
  }

  function switchUser() {
    if (deviceUsers.value.length <= 1) return
    const currentIndex = deviceUsers.value.indexOf(currentUser.value)
    const nextIndex = (currentIndex + 1) % deviceUsers.value.length
    currentUser.value = deviceUsers.value[nextIndex]
    localStorage.setItem('fitwork_currentUser', currentUser.value)
  }

  // 🚀 新增 1：載入更舊交易紀錄 (給記帳頁面無限載入用)
  async function loadMoreTransactions() {
    if (isFetchingMore.value || !hasMoreTxn.value) return
    isFetchingMore.value = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.email) return
      const currentLen = transactions.value.length
      const { data, error } = await supabase.from('transactions')
        .select('*').eq('owner_email', session.user.email)
        .order('created_at', { ascending: false })
        .range(currentLen, currentLen + 499)

      if (error) throw error
      if (data) {
        transactions.value = [...transactions.value, ...data]
        if (data.length < 500) hasMoreTxn.value = false
      }
    } catch (err) { console.error('載入舊資料失敗:', err) }
    finally { isFetchingMore.value = false }
  }

  // 🚀 新增 2：智能按需抓取 (給 Dashboard 自訂區間查舊帳用)
  async function fetchTransactionsByDateRange(startDate, endDate) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.email) return
      const { data, error } = await supabase.from('transactions')
        .select('*').eq('owner_email', session.user.email)
        .gte('created_at', startDate + 'T00:00:00')
        .lte('created_at', endDate + 'T23:59:59')

      if (error) throw error
      if (data && data.length > 0) {
        // 使用 Map 合併新舊資料並去重複
        const newMap = new Map()
        transactions.value.forEach(t => newMap.set(t.id, t))
        data.forEach(t => newMap.set(t.id, t))
        transactions.value = Array.from(newMap.values()).sort((a, b) => 
          String(b.created_at).localeCompare(String(a.created_at))
        )
      }
    } catch (err) { console.error('抓取區間資料失敗:', err) }
  }

  return {
    view, session, clients, transactions, products, stock, stockExpiry, 
    promotions, settings, displayTxnCount, syncAll,
    deviceUsers, currentUser, setDeviceUsers, switchUser,
    pendingRepeatOrder, quickActionClient,
    // 🚀 將剛剛寫好的新狀態與功能導出給畫面使用
    isFetchingMore, hasMoreTxn, loadMoreTransactions, fetchTransactionsByDateRange
  }
})
// 🚀 新增：載入更舊交易紀錄的專屬功能
async function loadMoreTransactions() {
  if (isFetchingMore.value || !hasMoreTxn.value) return
  isFetchingMore.value = true
  
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const userEmail = session?.user?.email
    if (!userEmail) return

    const currentLen = transactions.value.length
    
    // 使用 .range(from, to) 接續抓取舊資料 (例如抓取第 500 ~ 999 筆)
    const { data, error } = await supabase.from('transactions')
      .select('*')
      .eq('owner_email', userEmail)
      .order('created_at', { ascending: false })
      .range(currentLen, currentLen + 499)

    if (error) {
      console.error('❌ 載入舊資料失敗:', error)
      alert('載入舊資料失敗')
    } else if (data) {
      // 把新抓到的舊資料「接」在原本的資料後面
      transactions.value = [...transactions.value, ...data]
      
      // 如果這次抓不到 500 筆，代表保險箱已經空了，舊資料全部拿完了
      if (data.length < 500) {
        hasMoreTxn.value = false
      }
    }
  } catch (err) {
    console.error('載入更多資料時發生錯誤:', err)
  } finally {
    isFetchingMore.value = false
  }
}

// ... 最後記得在 return 裡面把這些新東西導出：
return { 
  view, session, clients, transactions, products, stock, stockExpiry, 
  promotions, settings, displayTxnCount, syncAll,
  deviceUsers, currentUser, setDeviceUsers, switchUser,
  pendingRepeatOrder, quickActionClient,
  // 👇 導出給畫面使用
  isFetchingMore, hasMoreTxn, loadMoreTransactions 
}