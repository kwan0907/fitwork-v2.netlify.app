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
  
  const settings = ref(JSON.parse(localStorage.getItem('fitwork_settings')) || { payees: [] }) 
  const deviceUsers = ref(JSON.parse(localStorage.getItem('fitwork_deviceUsers')) || [])
  const currentUser = ref(localStorage.getItem('fitwork_currentUser') || '') 

  // 🚀 新增：用來暫存「再來一套」的複刻訂單資料，作為頁面間的溝通橋樑
  const pendingRepeatOrder = ref(null)
  const quickActionClient = ref(null) // 🚀 新增：用來暫存快捷鍵選中的客戶

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
        supabase.from('transactions').select('*').eq('owner_email', userEmail).order('created_at', { ascending: false }).limit(3000),
        supabase.from('stock').select('*').eq('owner_email', userEmail),
        supabase.from('promotions').select('*').eq('owner_email', userEmail).order('created_at', { ascending: false }) 
      ])

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
      else transactions.value = t.data || []

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

  return { 
    view, session, clients, transactions, products, stock, stockExpiry, 
    promotions, settings, displayTxnCount, syncAll,
    deviceUsers, currentUser, setDeviceUsers, switchUser,
    pendingRepeatOrder // 🚀 將變數導出供 AccountingView 與 RetailView 使用
  }
})