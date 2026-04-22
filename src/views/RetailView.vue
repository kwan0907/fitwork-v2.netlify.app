<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

// --- 狀態定義 ---
const searchClient = ref('')
const selectedClient = ref(null)
const selectedBranch = ref('觀塘')
const discountRate = ref(1) 
const searchProduct = ref('')
const selectedCategory = ref('全部')
const categories = ['全部', '內在營養', '外在保養']
const cart = ref([])

// --- 修正：搜尋客戶邏輯 ---
const clientOptions = computed(() => {
  if (!searchClient.value || selectedClient.value) return []
  const q = searchClient.value.toLowerCase()
  return store.clients.filter(c => 
    (c.name && c.name.toLowerCase().includes(q)) || 
    (c.phone && c.phone.includes(q))
  ).slice(0, 5)
})

function selectClient(c) {
  selectedClient.value = c
  searchClient.value = c.name
  const tiers = { '銅級': 0.88, '銀級': 0.75, '金級': 0.65, '直接58': 0.58, '直接半折': 0.5 }
  discountRate.value = (c.vip_tier && tiers[c.vip_tier]) ? tiers[c.vip_tier] : 1
}

// --- 核心：聯接產品與庫存 ---
const displayProducts = computed(() => {
  let list = store.products.map(p => {
    // 從 store.stock (假設你有同步此表) 找到對應的數量
    const sItem = store.stock ? store.stock.find(s => s.prod_name === p.name) : null
    return { ...p, current_stock: sItem ? sItem.quantity : 0 }
  })
  
  if (selectedCategory.value !== '全部') list = list.filter(p => p.category === selectedCategory.value)
  if (searchProduct.value) {
    const q = searchProduct.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(q))
  }
  return list
})

const addToCart = (product) => {
  const existing = cart.value.find(item => item.id === product.id)
  if (existing) { existing.qty++ } 
  else { cart.value.push({ ...product, qty: 1 }) }
}

const cartTotal = computed(() => cart.value.reduce((sum, item) => sum + (item.price * item.qty * discountRate.value), 0))

// --- 核心：結帳並更新 stock 表 ---
async function handleCheckout() {
  if (cart.value.length === 0) return alert('請先加入商品！')
  
  const finalTotal = Math.round(cartTotal.value)
  const itemsStr = cart.value.map(i => `${i.name}x${i.qty}`).join(', ')

  // 1. 寫入交易
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', category: '零售收入', amount: finalTotal,
    branch: selectedBranch.value,
    note: `${selectedClient.value?.name || searchClient.value || '散客'} (${itemsStr})`
  }])

  if (txnError) return alert('結帳失敗')

  // 2. 💡 關鍵：更新 stock 表 (根據 prod_name)
  for (const item of cart.value) {
    const currentQty = item.current_stock || 0
    const { error: stError } = await supabase
      .from('stock')
      .update({ quantity: currentQty - item.qty, updated_at: new Date() })
      .eq('prod_name', item.name) // 根據你的截圖，使用名稱對齊
    
    if (stError) console.error(`庫存扣除失敗: ${item.name}`)
  }

  alert(`✅ 結帳成功！總額: $${finalTotal}`)
  cart.value = []
  selectedClient.value = null
  searchClient.value = ''
  await store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">零售 SOP</h2>

    <div class="card glass-card">
      <div class="form-item">
        <label>客戶搜尋 (點選以套用折扣)</label>
        <div class="search-rel">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋姓名..." @focus="selectedClient = null">
          <div v-if="clientOptions.length > 0" class="drop-menu">
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              {{ c.name }} <span class="tier-tag">{{ c.vip_tier || '普通' }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item"><label>分店</label>
          <select v-model="selectedBranch" class="modern-select">
            <option value="觀塘">觀塘</option><option value="中環">中環</option>
          </select>
        </div>
        <div class="form-item"><label>目前折扣率</label>
          <div class="rate-display">{{ (discountRate * 100).toFixed(0) }}%</div>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <input class="modern-inp" v-model="searchProduct" placeholder="🔍 搜尋商品...">
      <div class="tabs">
        <div v-for="cat in categories" :key="cat" class="tab" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</div>
      </div>
    </div>

    <div v-for="p in displayProducts" :key="p.id" class="p-card">
      <div class="p-info">
        <div class="p-title">{{ p.name }}</div>
        <div class="p-qty">剩餘庫存: <span :class="{warn: p.current_stock < 5}">{{ p.current_stock }}</span></div>
      </div>
      <div class="p-price-box">
        <div v-if="discountRate < 1" class="old-p">${{ p.price }}</div>
        <div class="new-p">${{ Math.round(p.price * discountRate) }}</div>
      </div>
      <button class="add-circle" @click="addToCart(p)">+</button>
    </div>

    <div v-if="cart.length > 0" class="float-cart">
      <div class="cart-left">
        <span class="total-label">總計 ({{ cart.reduce((s, i)=>s+i.qty, 0) }}件)</span>
        <span class="total-val">$ {{ Math.round(cartTotal).toLocaleString() }}</span>
      </div>
      <button class="checkout-btn" @click="handleCheckout">確認結帳</button>
    </div>
  </div>
</template>

<style scoped>
.glass-card { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
.modern-inp, .modern-select { width: 100%; border: 2px solid #f1f5f9; padding: 12px; border-radius: 12px; font-weight: 700; outline: none; }
.search-rel { position: relative; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #eee; border-radius: 12px; z-index: 100; box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
.drop-item { padding: 12px; border-bottom: 1px solid #f8fafc; cursor: pointer; font-weight: 700; }
.tier-tag { font-size: 10px; background: #eef2ff; color: #6366f1; padding: 2px 6px; border-radius: 5px; }

.p-card { background: white; padding: 15px; border-radius: 18px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; border: 1px solid #f1f5f9; }
.p-title { font-weight: 800; font-size: 16px; }
.p-qty { font-size: 11px; color: #64748b; font-weight: 700; }
.warn { color: #ef4444; }
.p-price-box { text-align: right; flex: 1; }
.old-p { font-size: 11px; text-decoration: line-through; color: #94a3b8; }
.new-p { font-size: 18px; font-weight: 900; color: #6366f1; }
.add-circle { width: 40px; height: 40px; border-radius: 50%; border: none; background: #f1f5f9; font-size: 24px; font-weight: 700; color: #6366f1; cursor: pointer; }

.float-cart { position: fixed; bottom: 90px; left: 5%; width: 90%; background: #6366f1; border-radius: 20px; padding: 15px 20px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 15px 30px rgba(99,102,241,0.3); }
.total-label { display: block; font-size: 12px; opacity: 0.8; color: white; }
.total-val { font-size: 24px; font-weight: 900; color: white; }
.checkout-btn { background: white; color: #6366f1; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 900; font-size: 16px; cursor: pointer; }
</style>