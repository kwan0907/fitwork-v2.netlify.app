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
  const displayTxnCount = ref(50) // 控制流水帳顯示數量

  // 💡 [補回缺失的狀態] 
  const stock = ref({}) // 庫存對應表：{ "產品名稱_分店": 數量 }
  const stockExpiry = ref({}) // 庫存更新時間
  const promotions = ref([]) // 宣傳活動
  
  // 💡 核心修復：徹底刪除「股東」，預設為空，完全由你輸入的名字決定
  const settings = ref(JSON.parse(localStorage.getItem('fitwork_settings')) || { payees: [] }) 

  // 💡 儲存這台裝置的所有使用者 (支援多人)
  const deviceUsers = ref(JSON.parse(localStorage.getItem('fitwork_deviceUsers')) || [])
  const currentUser = ref(localStorage.getItem('fitwork_currentUser') || '') 

  // --- 同步資料邏輯 (Actions) ---
  async function syncAll() {
    console.log('🚀 開始從 Supabase 同步資料...')
    
    try {
      // 💡 [更新] 同時抓取五張表的資料 (補上 stock 與 promotions)
      const [c, p, t, s, pr] = await Promise.all([
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name'),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(3000),
        supabase.from('stock').select('*'),
        supabase.from('promotions').select('*').order('created_at', { ascending: false })
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

      // 4. 💡 處理庫存資料 (完全 1:1 還原舊版的 Mapping 邏輯，解決庫存空白問題)
      if (s.error) console.error('❌ 庫存抓取失敗:', s.error)
      else {
        const m = {}
        const e = {}
        const stockData = s.data || []
        stockData.forEach(i => {
          // 這裡對齊了舊版的邏輯，確保 InventoryView 和 RetailView 抓得到數字
          const key = `${i.prod_name}_${i.branch || '觀塘'}` 
          m[key] = i.quantity
          if (i.updated_at) e[key] = i.updated_at
        })
        stock.value = m
        stockExpiry.value = e
        console.log('📦 庫存映射(Mapping)成功，共:', Object.keys(m).length, '個庫存項目')
      }

      // 5. 💡 處理宣傳活動資料
      if (pr.error) console.error('❌ 宣傳活動抓取失敗:', pr.error)
      else promotions.value = pr.data || []

      console.log('✅ 資料庫全部同步完成', { 
        客戶: clients.value.length, 
        產品: products.value.length, 
        交易: transactions.value.length,
        庫存項目: Object.keys(stock.value).length
      })

    } catch (err) {
      console.error('💥 同步過程中發生未知錯誤:', err)
    }
  }

  // 💡 [新增] 儲存多個裝置使用者並完美拆分名字
  function setDeviceUsers(namesStr) {
    // 支援中文逗號與英文逗號分割，並自動去除前後空白
    const names = namesStr.split(/[,，]/).map(n => n.trim()).filter(n => n)
    if (names.length === 0) return

    deviceUsers.value = names
    currentUser.value = names[0] // 預設先選第一個人
    
    localStorage.setItem('fitwork_deviceUsers', JSON.stringify(names))
    localStorage.setItem('fitwork_currentUser', currentUser.value) 
    
    // 強制將系統的收款名單(按鈕)更新為這幾個人，徹底清除股東！
    settings.value.payees = names
    localStorage.setItem('fitwork_settings', JSON.stringify(settings.value))
  }

  // 💡 [新增] 一鍵切換當前使用者 (在 App 導覽列使用)
  function switchUser() {
    if (deviceUsers.value.length <= 1) return
    const currentIndex = deviceUsers.value.indexOf(currentUser.value)
    const nextIndex = (currentIndex + 1) % deviceUsers.value.length
    currentUser.value = deviceUsers.value[nextIndex]
    localStorage.setItem('fitwork_currentUser', currentUser.value)
  }

  // 將變數與函式曝露給組件使用
  return { 
    view, session, clients, transactions, products, stock, stockExpiry, 
    promotions, settings, displayTxnCount, syncAll,
    deviceUsers, currentUser, setDeviceUsers, switchUser // 💡 匯出新功能
  }
})