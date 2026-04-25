<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

const searchClient = ref('')
const selectedClient = ref(null)
const selectedBranch = ref('觀塘店')
const selectedTier = ref('無折扣')
const showDropdown = ref(false)

const tierMapping = {
  '無折扣': 'price_standard',
  '銅級(88折)': 'price_bronze',
  '銀級(75折)': 'price_silver',
  '金級(65折)': 'price_gold',
  '直接58折': 'price_58',
  '直接半折': 'price_50',
  '領班(半折)': 'price_50' // 💡 讓收銀系統知道領班對應的是半價
}

const searchProduct = ref('')
const selectedCategory = ref('全部')
const categories = ['全部', '內在營養', '外在保養']
const cart = ref([])
const showCheckoutModal = ref(false)

// 💡 新增：購物車價格隨 selectedTier 動態重算
const cartWithPrices = computed(() => {
  const priceCol = tierMapping[selectedTier.value]
  return cart.value.map(item => {
    const finalPrice = Number(item[priceCol]) || Number(item.retail_price) || 0
    return { ...item, active_price: finalPrice }
  })
})

const payees = computed(() => store.settings?.payees || ['kwan', 'Cat'])

const clientOptions = computed(() => {
  const q = searchClient.value.toLowerCase()
  if (!q) return []
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q) || c.phone?.includes(q))).slice(0, 5)
})

function selectClient(c) {
  selectedClient.value = c
  searchClient.value = c.name
  showDropdown.value = false
  if(c.vip_tier && tierMapping[c.vip_tier]) selectedTier.value = c.vip_tier
  else if (c.vip_tier === '銀級') selectedTier.value = '銀級(75折)'
  else selectedTier.value = '無折扣'
}

// 💡 核心優化：自訂排序邏輯 (Shake -> 佳能 -> 蘆薈汁 -> 茶)
const sortedProducts = computed(() => {
  return [...store.products].sort((a, b) => {
    const getW = (p) => {
      const n = (p.name || '').toLowerCase()
      if (n.includes('shake') || n.includes('蛋白素')) return 1
      if (n.includes('佳能')) return 2
      if (n.includes('蘆薈汁')) return 3
      if (n.includes('茶')) return 4
      return 999 // 其他產品排後面
    }
    return getW(a) - getW(b) || (a.name || '').localeCompare(b.name || '')
  })
})

// 💡 核心優化：支援英文搜尋、精確匹配「內/外」分類
const displayProducts = computed(() => {
  let list = sortedProducts.value.map(p => {
    const branchKey = selectedBranch.value.replace('店', '')
    const stockKey = `${p.name}_${branchKey}`
    const currentQty = store.stock[stockKey] || 0
    
    const currentPriceCol = tierMapping[selectedTier.value]
    const finalPrice = Number(p[currentPriceCol]) || Number(p.retail_price) || 0
    
    return { ...p, current_stock: currentQty, active_price: finalPrice }
  })
  
  // 解決：精確比對 Supabase 裡面的 "內" 或 "外"
  if (selectedCategory.value === '內在營養') {
    list = list.filter(p => p.category && p.category.includes('內'))
  } else if (selectedCategory.value === '外在保養') {
    list = list.filter(p => p.category && p.category.includes('外'))
  }

  // 解決：同時支援中英文與 ID 搜尋
  if (searchProduct.value) {
    const q = searchProduct.value.toLowerCase()
    list = list.filter(p => 
      (p.name?.toLowerCase().includes(q)) || 
      (p.name_en?.toLowerCase().includes(q)) ||
      (p.id?.toLowerCase().includes(q))
    )
  }
  
  return list
})

const addToCart = (product) => {
  const existing = cart.value.find(item => item.id === product.id)
  if (existing) existing.qty++ 
  else cart.value.push({ ...product, qty: 1 })
}
// ✅ 修改後
const decreaseQty = (item) => {
  const found = cart.value.find(i => i.id === item.id)
  if (!found) return
  if (found.qty > 1) found.qty--
  else cart.value = cart.value.filter(i => i.id !== item.id)
}

const totalItems = computed(() => cart.value.reduce((s, i) => s + i.qty, 0))
// ✅ 修改後
const totalRevenue = computed(() => cartWithPrices.value.reduce((sum, item) => sum + (item.active_price * item.qty), 0))
// 💡 核心修復：強制購物車成本只使用 price_50 (半折價)，無視其他可能有錯的資料
const totalCost = computed(() => cart.value.reduce((sum, item) => sum + ((Number(item.price_50) || 0) * item.qty), 0))
const netProfit = computed(() => totalRevenue.value - totalCost.value)

async function finalizeCheckout(payeeName) {
  if (!selectedClient.value) return alert('請在上方先選擇紀錄對象！')
  const itemsStr = cart.value.map(i => `${i.name}x${i.qty}`).join(', ')
  const branchKey = selectedBranch.value.replace('店','')

  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', category: '零售收入', amount: totalRevenue.value, profit: netProfit.value,
    branch: branchKey, client_id: selectedClient.value.id, handled_by: payeeName, staff: payeeName,
    note: `${selectedClient.value.name} (${itemsStr})`
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  for (const item of cart.value) {
    const currentQty = item.current_stock || 0
    await supabase.from('stock').upsert({ prod_name: item.name, branch: branchKey, quantity: currentQty - item.qty }, { onConflict: 'prod_name,branch' })
  }

  alert(`✅ 結帳成功！\n由 ${payeeName} 收取實收現金 $${totalRevenue.value}`)
  cart.value = []; selectedClient.value = null; searchClient.value = ''; showCheckoutModal.value = false; store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">零售商品收銀</h2>

    <div class="glass-card top-card">
      <div class="form-item">
        <label>1. 搜尋紀錄對象 <span style="color:#ef4444">*</span></label>
        <div style="position:relative;">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="showDropdown = true" @input="showDropdown = true">
          <div v-if="showDropdown && clientOptions.length > 0" class="drop-menu">
            <div style="padding:8px; text-align:center; font-size:12px; color:#ef4444; border-bottom:1px solid #eee; cursor:pointer;" @click="showDropdown = false">✕ 關閉</div>
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              {{ c.name }} <span class="tier-tag">{{ c.vip_tier || '普通' }}</span>
            </div>
          </div>
        </div>
        <div v-if="selectedClient" class="selected-badge">✔ 已選擇: {{ selectedClient.name }}</div>
      </div>
      
      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item"><label>2. 庫存分店</label>
          <select v-model="selectedBranch" class="modern-select"><option value="觀塘店">觀塘店</option><option value="中環店">中環店</option><option value="佐敦店">佐敦店</option></select>
        </div>
        <div class="form-item"><label>3. 客戶折扣</label>
          <select v-model="selectedTier" class="modern-select highlight-sel">
            <option v-for="(col, key) in tierMapping" :key="key" :value="key">{{ key }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-box"><span class="s-icon">🔍</span><input v-model="searchProduct" placeholder="支援中/英文或代號搜尋..." class="s-inp"></div>
      <div class="tags-row" style="margin-top:15px;"><button v-for="cat in categories" :key="cat" class="cat-btn" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button></div>
    </div>

    <div v-for="p in displayProducts" :key="p.id" class="p-card" @click="addToCart(p)">
      <div class="p-info"><div class="p-title">{{ p.name }}</div><div class="p-qty">庫存剩餘: <span style="font-weight:900;" :style="{color: p.current_stock < 5 ? '#ef4444' : '#10b981'}">{{ p.current_stock }}</span> 件</div></div>
      <div class="p-price-box"><div class="new-p">$ {{ p.active_price }}</div></div>
      <div class="btn-gorgeous">+</div>
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
        
        <!-- ✅ 改後完整版 -->
<div class="cart-header-row">
  <span class="cart-header-title">🛍️ 已選商品（{{ totalItems }} 件）</span>
  <button class="clear-all-btn" @click="cart = []">🗑️ 清空</button>
</div>

<div class="cart-items">
  <div v-for="item in cartWithPrices" :key="item.id" class="c-item">
    <button class="c-delete" @click="cart = cart.filter(i => i.id !== item.id)">✕</button>
    <div style="flex:1;"><div class="c-name">{{ item.name }}</div><div class="c-sub">單價 ${{ item.active_price }}</div></div>
    <div class="c-price">$ {{ item.active_price * item.qty }}</div>
    <div class="qty-control">
      <button @click="decreaseQty(item)">−</button>
      <span>{{ item.qty }}</span>
      <button @click="addToCart(item)">＋</button>
    </div>
  </div>

        </div>

        <div class="summary-box">
          <div class="s-row"><span style="color:#1e293b; font-weight:800;">總營業額</span> <span style="font-weight:900; font-size:18px;">$ {{ totalRevenue }}</span></div>
          <div class="s-row"><span style="color:#ef4444; font-weight:800;">總產品成本 (預估)</span> <span style="color:#ef4444; font-weight:900;">- $ {{ Math.round(totalCost) }}</span></div>
          <div class="divider-dash"></div>
          <div class="s-row" style="margin-top:10px;"><span style="color:#4f46e2; font-weight:900; font-size:16px;">🚀 實收淨利潤</span> <span style="color:#4f46e2; font-weight:900; font-size:26px;">$ {{ Math.round(netProfit) }}</span></div>
        </div>

        <!-- ✅ 改成 -->
<div class="confirm-section">
  <p class="confirm-label">💳 選擇收款人完成結帳</p>
  <div class="payee-buttons">
    <button v-for="(payee, index) in payees" :key="payee" class="payee-btn" :class="'style-' + (index % 2)" @click="finalizeCheckout(payee)">
      ✅ {{ payee }} 收款
    </button>
  </div>
  <button class="btn-back" @click="showCheckoutModal = false">← 返回繼續選購</button>
</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 樣式保留 */
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; margin-bottom: 20px; color: #1e293b; }
.glass-card { background: white; padding: 20px; border-radius: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.top-card { box-shadow: 0 8px 25px rgba(0,0,0,0.03); }
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #1e293b; }
.modern-inp, .modern-select { width: 100%; border: 1px solid #cbd5e1; padding: 12px; border-radius: 10px; font-weight: 700; color: #1e293b; outline: none; background: #f8fafc;}
.modern-inp:focus { border-color: #4f46e2; background: white;}
.highlight-sel { border: 2px solid #4f46e2; color: #4f46e2; font-weight: 900; background: #eef2ff; }

.search-rel { position: relative; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 12px; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; }
.drop-item { padding: 14px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #333; }
.drop-item:hover { background: #f8fafc; }
.tier-tag { font-size: 10px; background: #eef2ff; color: #4f46e2; padding: 2px 6px; border-radius: 4px; float: right; }
.selected-badge { background: #eef2ff; color: #4f46e2; padding: 10px 14px; border-radius: 10px; margin-top: 12px; font-weight: 800; font-size: 14px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.search-box { background: white; display: flex; align-items: center; padding: 12px 15px; border-radius: 99px; border: 1px solid #e2e8f0; }
.s-inp { border: none; outline: none; flex: 1; margin-left: 10px; font-weight: 700; }
.tags-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.cat-btn { padding: 8px 16px; border-radius: 99px; background: #e2e8f0; border: none; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; }
.cat-btn.active { background: #4f46e2; color: white; }

.p-card { background: white; padding: 18px; border-radius: 20px; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
.p-card:active { transform: scale(0.98); border-color: #4f46e2; }
.p-info { flex: 1; }
.p-title { font-weight: 800; font-size: 16px; color: #1e293b; }
.p-qty { font-size: 12px; font-weight: 700; color: #64748b; margin-top: 4px; }
.p-price-box { text-align: right; margin-right: 5px; }
.new-p { font-size: 20px; font-weight: 900; color: #4f46e2; }
.btn-gorgeous { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #4f46e2); color: white; font-weight: 900; font-size: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(79,70,229,0.3); }

.float-bar { position: fixed; bottom: 85px; left: 5%; width: 90%; background: #1e293b; border-radius: 99px; padding: 14px 20px; display: flex; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 90; cursor: pointer; }
.badge-num { background: #4f46e2; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 900; font-size: 16px; }
.float-total { font-size: 22px; font-weight: 900; color: white; margin-right: 15px; }
.float-btn { font-size: 14px; font-weight: 800; color: #cbd5e1; }

.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
/* ✅ 改成 */
.checkout-modal { background: white; width: 100%; max-width: 600px; border-radius: 28px 28px 0 0; padding: 30px; box-shadow: 0 -10px 40px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out; max-height: 88vh; overflow-y: auto; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.m-header { font-weight: 900; font-size: 20px; margin-bottom: 20px; display: flex; justify-content: space-between; }
.close-x { background: #f1f5f9; border-radius: 50%; width: 32px; height: 32px; border: none; font-size: 16px; font-weight: 900; color: #475569; cursor: pointer; }

.cart-items { max-height: 250px; overflow-y: auto; margin-bottom: 20px; padding-right: 10px; }
.c-item { display: flex; align-items: center; margin-bottom: 15px; background: #f8fafc; padding: 12px; border-radius: 16px; border: 1px solid #e2e8f0; }
.c-name { font-weight: 800; font-size: 15px; color: #1e293b; }
.c-sub { font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 700; }
.c-price { font-weight: 900; font-size: 18px; color: #4f46e2; margin-right: 15px; }
.qty-control { display: flex; align-items: center; background: white; border-radius: 10px; border: 1px solid #cbd5e1; }
.qty-control button { border: none; background: transparent; padding: 8px 14px; font-weight: 900; cursor: pointer; color: #1e293b; font-size: 16px; }
.qty-control span { font-weight: 900; font-size: 15px; width: 24px; text-align: center; color: #4f46e2; }

.summary-box { background: #f8fafc; border-radius: 20px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.s-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.divider-dash { border-bottom: 1px dashed #cbd5e1; margin: 15px 0; }

.payee-buttons { display: flex; gap: 12px; }
.payee-btn { flex: 1; padding: 20px; border-radius: 18px; border: none; font-weight: 900; color: white; font-size: 18px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
.payee-btn:active { transform: scale(0.96); }
.style-0 { background: linear-gradient(135deg, #3b82f6, #2563eb); } 
.style-1 { background: linear-gradient(135deg, #ec4899, #db2777); } 
.style-0 { background: linear-gradient(135deg, #3b82f6, #2563eb); } 
.style-1 { background: linear-gradient(135deg, #ec4899, #db2777); } 

/* 購物車 Header */
.cart-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.cart-header-title { font-weight: 900; font-size: 15px; color: #1e293b; }
.clear-all-btn { background: #fee2e2; color: #ef4444; border: none; border-radius: 8px; padding: 6px 12px; font-weight: 800; font-size: 13px; cursor: pointer; }

/* 刪除按鈕 */
.c-delete { background: #f1f5f9; border: none; border-radius: 8px; width: 28px; height: 28px; color: #94a3b8; font-size: 13px; font-weight: 900; cursor: pointer; margin-right: 10px; flex-shrink: 0; }
.c-delete:active { background: #fee2e2; color: #ef4444; }

/* 確認結帳區 */
.confirm-section { display: flex; flex-direction: column; gap: 12px; }
.confirm-label { text-align: center; font-weight: 800; font-size: 14px; color: #64748b; margin: 0; padding: 0; }
.btn-back { width: 100%; padding: 14px; border-radius: 14px; border: 2px solid #e2e8f0; background: white; color: #64748b; font-size: 15px; font-weight: 800; cursor: pointer; }
.btn-back:active { background: #f8fafc; }

</style>