<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

// --- 狀態定義 ---
const searchClient = ref('')
const selectedClient = ref(null)
const selectedBranch = ref('觀塘店')
const selectedTier = ref('無折扣') // 預設

// 資料庫對應的價格欄位
const tierMapping = {
  '無折扣': 'price_standard',
  '銅級(88折)': 'price_bronze',
  '銀級(75折)': 'price_silver',
  '金級(65折)': 'price_gold',
  '直接58折': 'price_58',
  '直接半折': 'price_50'
}

const searchProduct = ref('')
const selectedCategory = ref('全部')
const categories = ['全部', '內在營養', '外在保養']
const cart = ref([])
const showCheckoutModal = ref(false)

// 動態收款人 (從設定讀取，若無則預設 Kwan, Cat)
const payees = computed(() => store.settings?.payees || ['kwan', 'Cat'])

// --- 搜尋客戶與自動帶入等級 ---
const clientOptions = computed(() => {
  if (!searchClient.value || selectedClient.value) return []
  const q = searchClient.value.toLowerCase()
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q) || c.phone?.includes(q))).slice(0, 5)
})

function selectClient(c) {
  selectedClient.value = c
  searchClient.value = c.name
  // 自動匹配對應字眼
  if(c.vip_tier && tierMapping[c.vip_tier]) {
    selectedTier.value = c.vip_tier
  } else if (c.vip_tier === '銀級') {
    selectedTier.value = '銀級(75折)'
  } else {
    selectedTier.value = '無折扣'
  }
}

// --- 💡 核心修復：正確讀取字典格式的庫存，解決畫面空白 Bug ---
const displayProducts = computed(() => {
  let list = store.products.map(p => {
    // 轉換分店名稱以匹配 store.stock 的 Key (例如: "觀塘店" -> "觀塘")
    const branchKey = selectedBranch.value.replace('店', '')
    const stockKey = `${p.name}_${branchKey}`
    
    // 精準抓取數量，若無則為 0，絕對不會崩潰
    const currentQty = store.stock[stockKey] || 0
    
    // 根據選擇的等級，抓取 Supabase 對應的價格欄位 (若空白則回退到 retail_price)
    const currentPriceCol = tierMapping[selectedTier.value]
    const finalPrice = p[currentPriceCol] || p.retail_price || 0
    
    return { 
      ...p, 
      current_stock: currentQty,
      active_price: finalPrice
    }
  })
  
  if (selectedCategory.value !== '全部') list = list.filter(p => p.category === selectedCategory.value)
  if (searchProduct.value) list = list.filter(p => p.name.toLowerCase().includes(searchProduct.value.toLowerCase()))
  return list
})

// --- 購物車操作 ---
const addToCart = (product) => {
  const existing = cart.value.find(item => item.id === product.id)
  if (existing) existing.qty++ 
  else cart.value.push({ ...product, qty: 1 })
}
const decreaseQty = (item) => {
  if (item.qty > 1) item.qty--
  else cart.value = cart.value.filter(i => i.id !== item.id)
}

const totalItems = computed(() => cart.value.reduce((s, i) => s + i.qty, 0))
const totalRevenue = computed(() => cart.value.reduce((sum, item) => sum + (item.active_price * item.qty), 0))
// 預估成本：若資料庫無 cost 欄位，暫以標準價 50% 估算
const totalCost = computed(() => cart.value.reduce((sum, item) => sum + ((item.cost || (item.price_standard * 0.5)) * item.qty), 0))
const netProfit = computed(() => totalRevenue.value - totalCost.value)

// --- 結帳處理 (由誰收款) ---
async function finalizeCheckout(payeeName) {
  if (!selectedClient.value) return alert('請在上方先選擇紀錄對象！')

  const itemsStr = cart.value.map(i => `${i.name}x${i.qty}`).join(', ')
  const branchKey = selectedBranch.value.replace('店','')

  // 1. 寫入交易紀錄
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', 
    category: '零售收入', 
    amount: totalRevenue.value, 
    profit: netProfit.value,
    branch: branchKey, 
    client_id: selectedClient.value.id,
    handled_by: payeeName,
    note: `${selectedClient.value.name} (${itemsStr})`
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  // 2. 💡 扣除庫存 (同步 stock 表)
  for (const item of cart.value) {
    const currentQty = item.current_stock || 0
    await supabase.from('stock').upsert(
      { prod_name: item.name, branch: branchKey, quantity: currentQty - item.qty }, 
      { onConflict: 'prod_name,branch' }
    )
  }

  alert(`✅ 結帳成功！\n由 ${payeeName} 收取實收現金 $${totalRevenue.value}`)
  cart.value = []; selectedClient.value = null; searchClient.value = ''; showCheckoutModal.value = false;
  await store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">零售商品收銀</h2>

    <div class="glass-card">
      <div class="form-item">
        <label>1. 搜尋紀錄對象 <span style="color:#ef4444">*</span></label>
        <div style="position:relative;">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="selectedClient = null">
          <div v-if="clientOptions.length > 0" class="drop-menu">
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              {{ c.name }} <span class="tier-tag">{{ c.vip_tier || '普通' }}</span>
            </div>
          </div>
        </div>
        <div v-if="selectedClient" class="selected-badge">✔ 已選擇: {{ selectedClient.name }}</div>
      </div>
      
      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item"><label>2. 庫存分店</label>
          <select v-model="selectedBranch" class="modern-select">
            <option value="觀塘店">觀塘店</option>
            <option value="中環店">中環店</option>
            <option value="佐敦店">佐敦店</option>
          </select>
        </div>
        <div class="form-item"><label>3. 客戶折扣</label>
          <select v-model="selectedTier" class="modern-select">
            <option v-for="(col, key) in tierMapping" :key="key" :value="key">{{ key }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <span class="s-icon">🔍</span>
        <input v-model="searchProduct" placeholder="即時搜尋商品..." class="s-inp">
      </div>
      <div class="tags-row" style="margin-top:15px;">
        <button v-for="cat in categories" :key="cat" class="cat-btn" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button>
      </div>
    </div>

    <div v-for="p in displayProducts" :key="p.id" class="p-card">
      <div class="p-info">
        <div class="p-title">{{ p.name }}</div>
        <div class="p-qty">庫存剩餘: <span style="font-weight:900;">{{ p.current_stock }}</span> 件</div>
      </div>
      <div class="p-price-box">
        <div class="new-p">$ {{ p.active_price }}</div>
      </div>
      <button class="add-circle" @click="addToCart(p)">+</button>
    </div>

    <div v-if="cart.length > 0" class="float-bar" @click="showCheckoutModal = true">
      <div class="badge-num">{{ totalItems }}</div>
      <div style="flex:1; margin-left:15px; font-weight:800; color:white;">件商品</div>
      <div class="float-total">$ {{ totalRevenue }}</div>
      <div class="float-btn">結帳 ➔</div>
    </div>

    <div v-if="showCheckoutModal" class="modal-overlay" @click.self="showCheckoutModal = false">
      <div class="checkout-modal">
        <div class="m-header">🛒 結帳明細與總結 <button class="close-x" @click="showCheckoutModal=false">✕</button></div>
        
        <div class="cart-items">
          <div v-for="item in cart" :key="item.id" class="c-item">
            <div style="flex:1;">
              <div class="c-name">{{ item.name }}</div>
              <div class="c-sub">單價 ${{ item.active_price }}</div>
            </div>
            <div class="c-price">$ {{ item.active_price * item.qty }}</div>
            <div class="qty-control">
              <button @click="decreaseQty(item)">-</button>
              <span>{{ item.qty }}</span>
              <button @click="addToCart(item)">+</button>
            </div>
          </div>
        </div>

        <div class="summary-box">
          <div class="s-row"><span style="color:#1e293b; font-weight:800;">總營業額</span> <span style="font-weight:900;">$ {{ totalRevenue }}</span></div>
          <div class="s-row"><span style="color:#ef4444; font-weight:800;">總產品成本 (預估)</span> <span style="color:#ef4444; font-weight:900;">- $ {{ Math.round(totalCost) }}</span></div>
          <div class="divider-dash"></div>
          <div class="s-row" style="margin-top:10px;">
            <span style="color:#4f46e2; font-weight:900; font-size:16px;">🚀 實收淨利潤</span> 
            <span style="color:#4f46e2; font-weight:900; font-size:24px;">$ {{ Math.round(netProfit) }}</span>
          </div>
        </div>

        <div class="payee-buttons">
          <button v-for="(payee, index) in payees" :key="payee" 
                  class="payee-btn" :class="'style-' + (index % 2)" 
                  @click="finalizeCheckout(payee)">
            💰 {{ payee }} 結帳
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f4f7f6; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 22px; margin-bottom: 20px; color: #1e293b; }
.glass-card { background: white; padding: 20px; border-radius: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #1e293b; }
.modern-inp, .modern-select { width: 100%; border: 1px solid #cbd5e1; padding: 12px; border-radius: 10px; font-weight: 700; color: #1e293b; outline: none; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 12px; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; }
.drop-item { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #333; }
.selected-badge { background: #eef2ff; color: #4f46e2; padding: 8px 12px; border-radius: 8px; margin-top: 10px; font-weight: 800; font-size: 13px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.search-box { background: white; display: flex; align-items: center; padding: 10px 15px; border-radius: 99px; border: 1px solid #e2e8f0; }
.s-inp { border: none; outline: none; flex: 1; margin-left: 10px; font-weight: 700; }
.tags-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.cat-btn { padding: 8px 16px; border-radius: 99px; background: #e2e8f0; border: none; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; }
.cat-btn.active { background: #4f46e2; color: white; }

.p-card { background: white; padding: 16px; border-radius: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; border: 1px solid #e2e8f0; }
.p-info { flex: 1; }
.p-title { font-weight: 800; font-size: 15px; color: #1e293b; }
.p-qty { font-size: 11px; font-weight: 700; color: #64748b; margin-top: 4px; }
.p-price-box { text-align: right; margin-right: 10px; }
.new-p { font-size: 18px; font-weight: 900; color: #4f46e2; }
.add-circle { width: 36px; height: 36px; border-radius: 50%; border: none; background: #eef2ff; font-weight: 900; color: #4f46e2; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center;}

.float-bar { position: fixed; bottom: 80px; left: 5%; width: 90%; background: #4f46e2; border-radius: 99px; padding: 12px 20px; display: flex; align-items: center; box-shadow: 0 10px 25px rgba(79,70,229,0.4); z-index: 90; cursor: pointer; }
.badge-num { background: white; color: #4f46e2; width: 28px; height: 28px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 900; font-size: 14px; }
.float-total { font-size: 20px; font-weight: 900; color: white; margin-right: 15px; }
.float-btn { font-size: 14px; font-weight: 800; color: white; opacity: 0.9; }

.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.checkout-modal { background: white; width: 100%; max-width: 600px; border-radius: 24px 24px 0 0; padding: 25px; box-shadow: 0 -10px 40px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.m-header { font-weight: 900; font-size: 18px; margin-bottom: 20px; display: flex; justify-content: space-between; }
.close-x { background: transparent; border: none; font-size: 18px; cursor: pointer; }

.cart-items { max-height: 250px; overflow-y: auto; margin-bottom: 20px; }
.c-item { display: flex; align-items: center; margin-bottom: 15px; }
.c-name { font-weight: 800; font-size: 14px; color: #1e293b; }
.c-sub { font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 700; }
.c-price { font-weight: 900; color: #4f46e2; margin-right: 15px; }
.qty-control { display: flex; align-items: center; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
.qty-control button { border: none; background: transparent; padding: 5px 12px; font-weight: 900; cursor: pointer; color: #4f46e2; }
.qty-control span { font-weight: 900; font-size: 14px; width: 20px; text-align: center; }

.summary-box { background: #f8fafc; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
.s-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
.divider-dash { border-bottom: 1px dashed #cbd5e1; margin: 10px 0; }

.payee-buttons { display: flex; gap: 12px; }
.payee-btn { flex: 1; padding: 18px; border-radius: 16px; border: none; font-weight: 900; color: white; font-size: 16px; cursor: pointer; }
.style-0 { background: #3b82f6; } /* 藍色 Kwan */
.style-1 { background: #ec4899; } /* 粉色 Cat */
</style>