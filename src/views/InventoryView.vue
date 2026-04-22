<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()
const searchProduct = ref('')
const selectedBranch = ref('觀塘')

// 核心：合併兩個表的資料顯示 (Bug 修復)
const displayInventory = computed(() => {
  const stockList = store.stock || [] // 這裡加上 || [] 防止空白
  return store.products.map(p => {
    // 根據產品名稱從 stock 表抓數量
    const sItem = store.stock.find(s => s.prod_name === p.name)
    return { ...p, current_qty: sItem ? sItem.quantity : 0, stock_id: sItem?.id }
  }).filter(p => p.name.toLowerCase().includes(searchProduct.value.toLowerCase()))
})

// 入貨功能
async function handleRestock(item) {
  const amount = prompt(`請輸入「${item.name}」的入貨數量：`, "10")
  if (!amount || isNaN(amount)) return
  
  const newQty = item.current_qty + parseInt(amount)
  const { error } = await supabase.from('stock').update({ quantity: newQty }).eq('prod_name', item.name)
  
  if (error) alert('入貨失敗')
  else { alert('✅ 入貨成功'); store.syncAll() }
}

// 盤點功能
async function handleStocktake(item) {
  const newQty = prompt(`[盤點] 請輸入「${item.name}」的正確庫存數量：`, item.current_qty)
  if (newQty === null || isNaN(newQty)) return
  
  const { error } = await supabase.from('stock').update({ quantity: parseInt(newQty) }).eq('prod_name', item.name)
  
  if (error) alert('盤點失敗')
  else { alert('✅ 盤點已完成'); store.syncAll() }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">庫存管理</h2>

    <div class="card cost-card">
      <div class="cost-label">當前分店存貨總成本值</div>
      <div class="cost-val">$ {{ store.products.reduce((sum, p) => sum + (p.cost || 0), 0) }}</div>
    </div>

    <div class="branch-tabs">
      <button :class="{active: selectedBranch==='觀塘'}" @click="selectedBranch='觀塘'">📍 觀塘總庫</button>
      <button :class="{active: selectedBranch==='中環'}" @click="selectedBranch='中環'">📍 中環分庫</button>
    </div>

    <input class="inp" v-model="searchProduct" placeholder="🔍 即時搜尋產品庫...">

    <div class="inventory-list">
      <div v-for="item in displayInventory" :key="item.id" class="inv-item">
        <div style="flex:1;">
          <div class="inv-name">{{ item.name }}</div>
          <div class="inv-sub">單個成本: ${{ item.cost || 0 }}</div>
        </div>
        <div class="inv-qty">{{ item.current_qty }}</div>
        <div class="inv-actions">
          <button class="act-btn" @click="handleRestock(item)">入貨</button>
          <button class="act-btn" @click="handleStocktake(item)">盤點</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cost-card { padding: 30px; text-align: center; background: white; border-radius: 20px; border: 1px solid #eee; margin-bottom: 20px; }
.cost-label { color: #64748b; font-weight: 700; font-size: 14px; }
.cost-val { font-size: 32px; font-weight: 900; color: #4f46e2; margin-top: 10px; }

.branch-tabs { display: flex; gap: 10px; margin-bottom: 20px; }
.branch-tabs button { flex: 1; padding: 15px; border-radius: 12px; border: 1px solid #eee; background: #fff; font-weight: 800; cursor: pointer; }
.branch-tabs button.active { background: #6366f1; color: #fff; border-color: #6366f1; }

.inv-item { background: white; padding: 20px; border-radius: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid #f1f5f9; }
.inv-name { font-weight: 800; font-size: 16px; }
.inv-sub { font-size: 11px; color: #94a3b8; font-weight: 700; margin-top: 4px; }
.inv-qty { font-size: 28px; font-weight: 900; color: #ef4444; width: 60px; text-align: center; }
.inv-actions { display: flex; flex-direction: column; gap: 5px; }
.act-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 12px; font-weight: 800; cursor: pointer; }
</style>