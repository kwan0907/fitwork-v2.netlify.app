<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'

const store = useMainStore()
const searchProduct = ref('')
const selectedCategory = ref('全部分類')
const selectedBranch = ref('觀塘總庫')
const categories = ['全部分類', '內在營養', '外在保養']

// 篩選邏輯
const filteredProducts = computed(() => {
  let list = store.products
  if (selectedCategory.value !== '全部分類') list = list.filter(p => p.category === selectedCategory.value)
  if (searchProduct.value) list = list.filter(p => p.name.toLowerCase().includes(searchProduct.value.toLowerCase()))
  return list
})

// 計算當前分店庫存總成本
const totalInventoryCost = computed(() => {
  return filteredProducts.value.reduce((sum, p) => sum + ((p.cost || 0) * (p.stock || 0)), 0)
})
</script>

<template>
  <div class="page">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
      <h2 class="page-title" style="margin:0;">庫存管理</h2>
      <button style="color:var(--p); font-weight:800; border:none; background:transparent; font-size:14px;">✏️ 編輯排序</button>
    </div>

    <div class="card inventory-banner">
      <div class="lbl">當前分店庫存總成本值</div>
      <div class="val">$ {{ totalInventoryCost.toLocaleString() }}</div>
    </div>

    <div style="display:flex; gap:10px; margin-bottom:15px;">
      <button class="branch-btn" :class="{active: selectedBranch==='觀塘總庫'}" @click="selectedBranch='觀塘總庫'">📍 觀塘總庫</button>
      <button class="branch-btn" :class="{active: selectedBranch==='中環總庫'}" @click="selectedBranch='中環總庫'">📍 中環總庫</button>
    </div>

    <input class="inp" v-model="searchProduct" placeholder="🔍 即時搜尋產品庫..." style="margin-bottom:15px;">
    <div class="filter-tags" style="margin-bottom:20px;">
      <button v-for="cat in categories" :key="cat" class="tag" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button>
    </div>

    <div v-for="p in filteredProducts" :key="p.id" class="stock-item">
      <div style="flex:1;">
        <div class="p-name">{{ p.name }}</div>
        <div class="p-cost">單價成本: ${{ p.cost }}</div>
      </div>
      <div class="stock-num" :class="{ empty: (p.stock || 0) === 0 }">{{ p.stock || 0 }}</div>
      <div class="action-btns">
        <button class="btn-action">入貨</button>
        <button class="btn-action">盤點</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inventory-banner { padding: 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.inventory-banner .lbl { font-weight: 800; font-size: 15px; color: var(--t2); }
.inventory-banner .val { font-weight: 900; font-size: 22px; color: var(--p); }

.branch-btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 800; border: 1px solid var(--border); background: #fff; color: var(--t2); cursor: pointer; }
.branch-btn.active { background: var(--p); color: #fff; border-color: var(--p); }

.filter-tags { display: flex; gap: 8px; overflow-x: auto; }
.tag { padding: 8px 16px; border-radius: 99px; font-size: 13px; font-weight: 800; background: #fff; border: 1px solid var(--border); color: var(--t2); }
.tag.active { background: var(--p); color: #fff; border-color: var(--p); }

.stock-item { background: #fff; padding: 15px; border-radius: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid var(--border); }
.p-name { font-weight: 800; font-size: 15px; color: var(--t); margin-bottom: 4px; }
.p-cost { font-size: 11px; color: var(--t3); font-weight: 700; }

.stock-num { font-size: 28px; font-weight: 900; color: #16a34a; width: 50px; text-align: center; }
.stock-num.empty { color: #dc2626; }

.action-btns { display: flex; flex-direction: column; gap: 5px; }
.btn-action { background: #f9fafb; border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px; font-size: 11px; font-weight: 800; color: var(--t2); cursor: pointer; }
</style>