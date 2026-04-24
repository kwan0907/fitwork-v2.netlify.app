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
  
  // 💡 徹底刪除預設的「股東」，預設為空，完全由你決定！
  const settings = ref(JSON.parse(localStorage.getItem('fitwork_settings')) || { payees: [] }) 

  const deviceUsers = ref(JSON.parse(localStorage.getItem('fitwork_deviceUsers')) || [])
  const currentUser = ref(localStorage.getItem('fitwork_currentUser') || '') 

  // --- 同步資料邏輯 (Actions) ---
  async function syncAll() {
    console.log('🚀 開始從 Supabase 同步資料...')
    
    try {
      const [c, p, t, s, pr] = await Promise.all([
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('name'),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(3000),
        supabase.from('stock').select('*'),
        supabase.from('promotions').select('*').order('created_at', { ascending: false })
      ])

      if (c.error) console.error('❌ 客戶抓取失敗:', c.error)
      else clients.value = c.data || []

      if (p.error) console.error('❌ 產品抓取失敗:', p.error)
      else {
        products.value = p.data || []
        console.log('📦 產品同步成功，共:', p.data?.length, '筆')
      }

      if (t.error) console.error('❌ 交易抓取失敗:', t.error)
      else transactions.value = t.data || []

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
      }

      if (pr.error) console.error('❌ 宣傳活動抓取失敗:', pr.error)
      else promotions.value = pr.data || []

      console.log('✅ 資料庫全部同步完成')
    } catch (err) {
      console.error('💥 同步過程中發生未知錯誤:', err)
    }
  }

  // 💡 [更新] 儲存多個裝置使用者
  function setDeviceUsers(namesStr) {
    const names = namesStr.split(/[,，]/).map(n => n.trim()).filter(n => n)
    if (names.length === 0) return

    deviceUsers.value = names
    currentUser.value = names[0] 
    
    localStorage.setItem('fitwork_deviceUsers', JSON.stringify(names))
    localStorage.setItem('fitwork_currentUser', currentUser.value) 
    
    // 💡 強制覆蓋舊設定：將系統的下拉選單名單，直接變成你輸入的這幾個名字！
    settings.value.payees = names
    localStorage.setItem('fitwork_settings', JSON.stringify(settings.value))
  }

  // 💡 一鍵切換當前使用者
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
    deviceUsers, currentUser, setDeviceUsers, switchUser 
  }
})