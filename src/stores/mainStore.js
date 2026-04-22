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
  const settings = ref({ payees: ['kwan', 'Cat', '股東'] }) // 系統設定 (收款人名單)

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

  // 將變數與函式曝露給組件使用 (確保所有補上的變數都有 return 出去)
  return { 
    view, 
    session, 
    clients, 
    transactions, 
    products, 
    stock, 
    stockExpiry, 
    promotions, 
    settings, 
    displayTxnCount, 
    syncAll 
  }
})