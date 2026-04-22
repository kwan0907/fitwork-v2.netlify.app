<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()
const searchProduct = ref('')
const selectedBranch = ref('觀塘')

// 💡 核心修復：正確讀取 store.stock 物件，解決畫面空白 Bug
const displayInventory = computed(() => {
  // 先過濾出符合搜尋字詞的產品
  return store.products
    .filter(p => p.name.toLowerCase().includes(searchProduct.value.toLowerCase()))
    .map(p => {
      // 透過大腦 (mainStore) 的 mapping 來精確抓取該分店的數量
      const stockKey = `${p.name}_${selectedBranch.value}`
      const currentQty = store.stock[stockKey] || 0
      
      return { 
        ...p, 
        current_qty: currentQty 
      }
    })
})

// 💡 核心修復：動態計算正確的「當前分店存貨總成本」 (數量 × 成本)
const currentTotalCost = computed(() => {
  return displayInventory.value.reduce((sum, item) => {
    // 假設資料庫的成本欄位是 cost 或 price_50
    const itemCost = item.cost || item.price_50 || 0
    return sum + (item.current_qty * itemCost)
  }, 0)
})

// 入貨功能
async function handleRestock(item) {
  const amount = prompt(`請輸入「${item.name}」在 ${selectedBranch.value} 的入貨數量：`, "10")
  if (!amount || isNaN(amount)) return
  
  const newQty = item.current_qty + parseInt(amount)
  
  // 更新資料庫 (加入 branch 條件，確保不會改錯分店)
  const { error } = await supabase.from('stock')
    .update({ quantity: newQty })
    .match({ prod_name: item.name, branch: selectedBranch.value })
  
  if (error) {
    // 如果因為該分店還沒有這項產品而 update 失敗，則改用 insert
    await supabase.from('stock').insert({
      prod_name: item.name, 
      branch: selectedBranch.value, 
      quantity: newQty
    })
  }
  
  alert('✅ 入貨成功')
  store.syncAll() 
}

// 盤點功能
async function handleStocktake(item) {
  const newQty = prompt(`[盤點] 請輸入「${item.name}」在 ${selectedBranch.value} 的正確庫存數量：`, item.current_qty)
  if (newQty === null || isNaN(newQty)) return
  
  const { error } = await supabase.from('stock')
    .update({ quantity: parseInt(newQty) })
    .match({ prod_name: item.name, branch: selectedBranch.value })

  if (error) {
    await supabase.from('stock').insert({
      prod_name: item.name, 
      branch: selectedBranch.value, 
      quantity: parseInt(newQty)
    })
  }
  
  alert('✅ 盤點已完成')
  store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 120px;">
    <h2 class="page-title">庫存管理</h2>

    <div class="card cost-card">
      <div class="cost-label">當前分店存貨總成本值</div>
      <div class="cost-val">$ {{ currentTotalCost.toLocaleString() }}</div>
    </div>

    <div class="branch-tabs">
      <button :class="{active: selectedBranch==='觀塘'}" @click="selectedBranch='觀塘'">📍 觀塘總庫</button>
      <button :class="{active: selectedBranch==='中環'}" @click="selectedBranch='中環'">📍 中環分庫</button>
      <button :class="{active: selectedBranch==='佐敦'}" @click="selectedBranch='佐敦'">📍 佐敦分庫</button>
    </div>

    <input class="inp search-box" v-model="searchProduct" placeholder="🔍 即時搜尋產品庫...">

    <div class="inventory-list">
      <div v-for="item in displayInventory" :key="item.id" class="inv-item">
        <div style="flex:1;">
          <div class="inv-name">{{ item.name }}</div>
          <div class="inv-sub">單個成本: ${{ item.cost || item.price_50 || 0 }}</div>
        </div>
        <div class="inv-qty" :class="{warn: item.current_qty <= 5}">{{ item.current_qty }}</div>
        <div class="inv-actions">
          <button class="act-btn" @click="handleRestock(item)">入貨</button>
          <button class="act-btn" @click="handleStocktake(item)">盤點</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; margin-bottom: 20px; }

.cost-card { padding: 30px; text-align: center; background: white; border-radius: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
.cost-label { color: #64748b; font-weight: 700; font-size: 14px; }
.cost-val { font-size: 32px; font-weight: 900; color: #4f46e2; margin-top: 10px; }

.branch-tabs { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 5px; }
.branch-tabs button { flex: 1; padding: 12px 15px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; font-weight: 800; color: #64748b; cursor: pointer; white-space: nowrap; }
.branch-tabs button.active { background: #4f46e2; color: #fff; border-color: #4f46e2; box-shadow: 0 4px 10px rgba(79,70,229,0.2); }

.search-box { width: 100%; border: 2px solid #e2e8f0; padding: 14px; border-radius: 14px; font-weight: 700; color: #1e293b; outline: none; margin-bottom: 20px; background: white; }
.search-box:focus { border-color: #4f46e2; }

.inv-item { background: white; padding: 20px; border-radius: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; }
.inv-name { font-weight: 800; font-size: 16px; color: #1e293b; }
.inv-sub { font-size: 11px; color: #94a3b8; font-weight: 700; margin-top: 4px; }
.inv-qty { font-size: 28px; font-weight: 900; color: #10b981; width: 60px; text-align: center; }
.inv-qty.warn { color: #ef4444; } /* 庫存警示色 */
.inv-actions { display: flex; flex-direction: column; gap: 6px; }
.act-btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 12px; font-weight: 800; color: #475569; cursor: pointer; transition: 0.2s; }
.act-btn:active { transform: scale(0.95); background: #e2e8f0; }
</style>