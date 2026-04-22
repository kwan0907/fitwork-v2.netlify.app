<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

// --- 收銀台狀態 ---
const searchClient = ref('')
const selectedBranch = ref('觀塘')
const discountRate = ref(1) // 1 = 不打折, 0.75 = 75折, 0.65 = 65折

// --- 產品篩選狀態 ---
const searchProduct = ref('')
const selectedCategory = ref('全部')
const categories = ['全部', '內在營養', '外在保養']

// 購物車
const cart = ref([])

// --- 邏輯：篩選產品 ---
const filteredProducts = computed(() => {
  let list = store.products
  if (selectedCategory.value !== '全部') {
    list = list.filter(p => p.category === selectedCategory.value)
  }
  if (searchProduct.value) {
    const q = searchProduct.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(q))
  }
  return list
})

// --- 邏輯：購物車操作 ---
const addToCart = (product) => {
  const existing = cart.value.find(item => item.id === product.id)
  if (existing) {
    existing.qty++
  } else {
    cart.value.push({ ...product, qty: 1 })
  }
}

const clearCart = () => { cart.value = [] }

// 計算打折後的總價
const cartTotal = computed(() => {
  return cart.value.reduce((sum, item) => sum + (item.price * item.qty * discountRate.value), 0)
})

// --- 邏輯：結帳並寫入資料庫 ---
async function handleCheckout() {
  if (cart.value.length === 0) return alert('請先加入商品！')
  
  let totalCost = 0
  cart.value.forEach(item => { totalCost += (item.cost || 0) * item.qty })
  const finalTotal = Math.round(cartTotal.value)
  const profit = finalTotal - totalCost
  const itemsStr = cart.value.map(i => `${i.name}x${i.qty}`).join(', ')

  // 1. 寫入交易紀錄
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income',
    category: '零售收入',
    amount: finalTotal,
    profit: profit,
    branch: selectedBranch.value,
    note: `${searchClient.value || '散客'} (${itemsStr})`,
    created_at: new Date().toISOString()
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  // 2. 💡 核心：更新庫存 (遍歷購物車，逐一扣除)
  for (const item of cart.value) {
    const newStock = (item.stock || 0) - item.qty
    await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', item.id)
  }

  alert(`✅ 結帳成功！已自動扣除庫存。`)
  cart.value = []
  searchClient.value = ''
  store.syncAll() // 刷新大腦，讓數字立刻變動
}

</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">零售商品收銀</h2>

    <div class="card" style="padding:20px; margin-bottom:20px;">
      <div class="form-item">
        <label>1. 搜尋紀錄對象 <span style="color:var(--r)">*</span></label>
        <input class="inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話...">
      </div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px;">
        <div class="form-item">
          <label>2. 庫存分店</label>
          <select v-model="selectedBranch" class="inp">
            <option value="觀塘">觀塘店</option>
            <option value="中環">中環店</option>
            <option value="佐敦">佐敦店</option>
          </select>
        </div>
        <div class="form-item">
          <label>3. 客戶折扣</label>
          <select v-model="discountRate" class="inp">
            <option :value="1">無折扣 (原價)</option>
            <option :value="0.75">銀級 (75折)</option>
            <option :value="0.65">金級 (65折)</option>
            <option :value="0.58">白金級 (58折)</option>
          </select>
        </div>
      </div>
    </div>

    <input class="inp" v-model="searchProduct" placeholder="🔍 即時搜尋商品..." style="margin-bottom:15px;">
    
    <div class="filter-tags" style="margin-bottom:20px;">
      <button v-for="cat in categories" :key="cat" 
              class="tag" :class="{active: selectedCategory === cat}"
              @click="selectedCategory = cat">
        {{ cat }}
      </button>
    </div>

    <div v-for="p in filteredProducts" :key="p.id" class="product-item">
      <div style="flex:1; min-width:0;">
        <div class="p-name">{{ p.name }}</div>
        <div class="p-stock">庫存剩餘: {{ p.stock ?? 0 }} 件</div>
      </div> <div class="p-price">
        <span v-if="discountRate < 1" style="font-size:12px; color:var(--t3); text-decoration:line-through; margin-right:5px;">
          ${{ p.price }}
        </span>
        ${{ Math.round(p.price * discountRate) }}
      </div>
      <button class="add-btn" @click="addToCart(p)">+</button>
    </div>

    <div v-if="cart.length > 0" class="cart-bar">
      <div style="flex:1;">
        <div style="font-size:12px; opacity:0.9; margin-bottom:2px;">已選 {{ cart.reduce((s, i)=>s+i.qty, 0) }} 件商品</div>
        <div style="font-size:22px; font-weight:900;">$ {{ Math.round(cartTotal).toLocaleString() }}</div>
      </div>
      <button class="btn-clear" @click="clearCart">清空</button>
      <button class="btn-checkout" @click="handleCheckout">確認結帳</button>
    </div>

  </div>
</template>

<style scoped>
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: var(--t2); }
.filter-tags { display: flex; gap: 8px; overflow-x: auto; }
.tag { padding: 8px 16px; border-radius: 99px; font-size: 14px; font-weight: 800; background: #fff; border: 1px solid var(--border); color: var(--t2); }
.tag.active { background: var(--p); color: #fff; border-color: var(--p); }

.product-item { background: #fff; padding: 16px; border-radius: 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border); }
.p-name { font-weight: 800; font-size: 16px; color: var(--t); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-stock { font-size: 11px; color: var(--t3); font-weight: 700; margin-top: 4px; }
.p-price { font-size: 18px; font-weight: 900; color: var(--p); flex-shrink: 0; text-align: right; }
.add-btn { width: 36px; height: 36px; border-radius: 50%; background: #f3f4f6; border: none; font-size: 20px; font-weight: 800; color: var(--t2); cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
.add-btn:active { background: #e5e5ea; transform: scale(0.95); }

/* 懸浮購物車 */
.cart-bar { position: fixed; bottom: 85px; left: 5%; width: 90%; max-width: 720px; background: var(--p); color: #fff; padding: 15px 20px; border-radius: 20px; display: flex; align-items: center; gap: 10px; box-shadow: 0 10px 25px rgba(79,70,229,0.3); z-index: 90; }
.btn-clear { background: rgba(255,255,255,0.2); border: none; color: #fff; padding: 12px 16px; border-radius: 12px; font-weight: 800; cursor: pointer; }
.btn-checkout { background: #fff; color: var(--p); border: none; padding: 12px 20px; border-radius: 12px; font-weight: 900; font-size: 16px; cursor: pointer; }
</style>