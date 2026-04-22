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

  // --- 同步資料邏輯 (Actions) ---
  async function syncAll() {
    console.log('🚀 開始從 Supabase 同步資料...')
    
    try {
      // 同時抓取三張表的資料
      const [c, p, t] = await Promise.all([
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name'),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(3000)
      ])

      // 1. 處理客戶資料
      if (c.error) console.error('❌ 客戶抓取失敗:', c.error)
      else clients.value = c.data || []

      // 2. 處理產品資料 (👈 這是你之前漏掉的關鍵！)
      if (p.error) console.error('❌ 產品抓取失敗:', p.error)
      else {
        products.value = p.data || []
        console.log('📦 產品同步成功，共:', p.data?.length, '筆')
      }

      // 3. 處理交易資料
      if (t.error) console.error('❌ 交易抓取失敗:', t.error)
      else transactions.value = t.data || []

      console.log('✅ 資料同步完成', { 
        客戶: clients.value.length, 
        產品: products.value.length, 
        交易: transactions.value.length 
      })

    } catch (err) {
      console.error('💥 同步過程中發生未知錯誤:', err)
    }
  }

  // 將變數與函式曝露給組件使用
  return { 
    view, 
    session, 
    clients, 
    transactions, 
    products, 
    displayTxnCount, 
    syncAll 
  }
})