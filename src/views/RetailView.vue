<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

const searchClient = ref('')
const selectedClient = ref(null)
const selectedBranch = ref('觀塘')
const discountRate = ref(1) 
// 新增：收錢人
const handledBy = ref('') 

const searchProduct = ref('')
const selectedCategory = ref('全部')
const categories = ['全部', '內在營養', '外在保養']
const cart = ref([])

const clientOptions = computed(() => {
  if (!searchClient.value || selectedClient.value) return []
  const q = searchClient.value.toLowerCase()
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q)) || (c.phone?.includes(q))).slice(0, 5)
})

function selectClient(c) {
  selectedClient.value = c; searchClient.value = c.name
  const tiers = { '銅級': 0.88, '銀級': 0.75, '金級': 0.65, '直接58': 0.58, '直接半折': 0.5 }
  discountRate.value = (c.vip_tier && tiers[c.vip_tier]) ? tiers[c.vip_tier] : 1
}
function clearClient() { selectedClient.value = null; searchClient.value = ''; discountRate.value = 1 }

// 庫存防呆：確保 store.stock 存在
const displayProducts = computed(() => {
  const stockList = store.stock || []
  let list = store.products.map(p => {
    const sItem = stockList.find(s => s.prod_name === p.name)
    return { ...p, current_stock: sItem ? sItem.quantity : 0 }
  })
  if (selectedCategory.value !== '全部') list = list.filter(p => p.category === selectedCategory.value)
  if (searchProduct.value) list = list.filter(p => p.name.toLowerCase().includes(searchProduct.value.toLowerCase()))
  return list
})

const addToCart = (product) => {
  const existing = cart.value.find(item => item.id === product.id)
  if (existing) existing.qty++ 
  else cart.value.push({ ...product, qty: 1 })
}

const clearCart = () => { cart.value = [] }
const cartTotal = computed(() => cart.value.reduce((sum, item) => sum + (item.price * item.qty * discountRate.value), 0))

async function handleCheckout() {
  if (cart.value.length === 0) return alert('請先加入商品！')
  if (!handledBy.value) return alert('請填寫負責收錢人！') // 強制填寫
  
  let totalCost = 0
  cart.value.forEach(item => { totalCost += (item.cost || 0) * item.qty })
  const finalTotal = Math.round(cartTotal.value)
  const itemsStr = cart.value.map(i => `${i.name}x${i.qty}`).join(', ')

  // 寫入交易 (加入 handled_by)
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', category: '零售收入', amount: finalTotal, profit: finalTotal - totalCost,
    branch: selectedBranch.value, client_id: selectedClient.value?.id || null,
    handled_by: handledBy.value, // ✅ 紀錄誰收錢
    note: `${searchClient.value || '散客'} (${itemsStr})`
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  // 更新 stock 表
  for (const item of cart.value) {
    const currentQty = item.current_stock || 0
    await supabase.from('stock').update({ quantity: currentQty - item.qty }).eq('prod_name', item.name)
  }

  alert(`✅ 結帳成功！\n由 ${handledBy.value} 收取 $${finalTotal}`)
  cart.value = []; clearClient(); handledBy.value = ''; await store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">零售收銀 SOP</h2>

    <div class="glass-card">
      <div class="form-item">
        <label>1. 負責收錢人 <span style="color:#ef4444">*</span></label>
        <input class="modern-inp" v-model="handledBy" placeholder="例如：阿賢 / Queenie">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>2. 搜尋客戶以套用折扣</label>
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
        <div class="form-item"><label>分店</label><select v-model="selectedBranch" class="modern-select"><option value="觀塘">觀塘</option><option value="中環">中環</option></select></div>
        <div class="form-item"><label>折扣率</label>
          <select v-model="discountRate" class="modern-select">
            <option :value="1">無折扣</option><option :value="0.88">銅級(88折)</option>
            <option :value="0.75">銀級(75折)</option><option :value="0.65">金級(65折)</option>
            <option :value="0.58">58折</option><option :value="0.5">半折</option>
          </select>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <input class="modern-inp" v-model="searchProduct" placeholder="🔍 搜尋商品..." style="margin-bottom:10px;">
      <div class="tags-row">
        <button v-for="cat in categories" :key="cat" class="cat-btn" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button>
      </div>
    </div>

    <div v-for="p in displayProducts" :key="p.id" class="p-card">
      <div class="p-info">
        <div class="p-title">{{ p.name }}</div>
        <div class="p-qty">庫存: <span :style="{color: p.current_stock < 5 ? '#ef4444' : '#64748b'}">{{ p.current_stock }}</span></div>
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
      <button class="btn-clear" @click="clearCart">清空</button>
      <button class="checkout-btn" @click="handleCheckout">確認結帳</button>
    </div>
  </div>
</template>

<style scoped>
/* 樣式大幅優化，融合現代感 */
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; margin-bottom: 20px; color: #1e293b; }
.glass-card { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); margin-bottom: 20px; border: 1px solid #eee; }
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #475569; }
.modern-inp, .modern-select { width: 100%; border: 2px solid #f1f5f9; padding: 12px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; background: #f8fafc; }
.modern-inp:focus { border-color: #6366f1; background: white; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.search-rel { position: relative; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 12px; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; }
.drop-item { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #333; }
.tier-tag { font-size: 10px; background: #eef2ff; color: #6366f1; padding: 2px 6px; border-radius: 4px; float: right; }

.filter-bar { margin-bottom: 20px; }
.tags-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.cat-btn { padding: 8px 16px; border-radius: 99px; border: 1px solid #e2e8f0; background: white; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; }
.cat-btn.active { background: #6366f1; color: white; border-color: #6366f1; }

.p-card { background: white; padding: 16px; border-radius: 18px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; border: 1px solid #f1f5f9; }
.p-info { flex: 1; }
.p-title { font-weight: 800; font-size: 16px; color: #1e293b; }
.p-qty { font-size: 12px; font-weight: 700; margin-top: 4px; }
.p-price-box { text-align: right; }
.old-p { font-size: 11px; text-decoration: line-through; color: #94a3b8; }
.new-p { font-size: 18px; font-weight: 900; color: #6366f1; }
.add-circle { width: 40px; height: 40px; border-radius: 50%; border: none; background: #eef2ff; font-size: 24px; font-weight: 700; color: #6366f1; cursor: pointer; }

.float-cart { position: fixed; bottom: 85px; left: 5%; width: 90%; background: #1e293b; border-radius: 20px; padding: 15px 20px; display: flex; align-items: center; gap: 12px; box-shadow: 0 15px 30px rgba(0,0,0,0.2); z-index: 90; }
.total-label { display: block; font-size: 12px; color: #94a3b8; font-weight: 700; }
.total-val { font-size: 22px; font-weight: 900; color: white; }
.btn-clear { background: rgba(255,255,255,0.1); border: none; color: white; padding: 10px 14px; border-radius: 10px; font-weight: 800; }
.checkout-btn { background: #6366f1; color: white; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 900; font-size: 16px; flex: 1; text-align: center; }
</style>