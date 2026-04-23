<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()
const searchProduct = ref('')
const selectedBranch = ref('觀塘')

// 🌟 分類狀態
const selectedCategory = ref('全部')
const categories = ['全部', '內在營養', '外在保養']

// 🌟 自訂排序 (Shake/蛋白素 -> 佳能 -> 蘆薈汁 -> 茶)
const sortedProducts = computed(() => {
  return [...store.products].sort((a, b) => {
    const getW = (p) => {
      const n = (p.name || '').toLowerCase()
      if (n.includes('shake') || n.includes('蛋白素')) return 1
      if (n.includes('佳能')) return 2
      if (n.includes('蘆薈汁')) return 3
      if (n.includes('茶')) return 4
      return 999 
    }
    return getW(a) - getW(b) || (a.name || '').localeCompare(b.name || '')
  })
})

// 💡 整合排序、分類(內/外)、中英文搜尋、以及庫存映射
const displayInventory = computed(() => {
  let list = sortedProducts.value.map(p => {
    const stockKey = `${p.name}_${selectedBranch.value}`
    const currentQty = store.stock[stockKey] || 0
    return { ...p, current_qty: currentQty }
  })

  if (selectedCategory.value === '內在營養') {
    list = list.filter(p => p.category && p.category.includes('內'))
  } else if (selectedCategory.value === '外在保養') {
    list = list.filter(p => p.category && p.category.includes('外'))
  }

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

// 動態計算正確的「當前分店存貨總成本」
const currentTotalCost = computed(() => {
  return displayInventory.value.reduce((sum, item) => {
    const itemCost = Number(item.cost) || Number(item.price_50) || 0
    return sum + (item.current_qty * itemCost)
  }, 0)
})

// 自用紀錄讀取與計算
const selfUseRecords = computed(() => store.transactions.filter(t => t.category === '自用消耗'))
const selfUseTotalCost = computed(() => selfUseRecords.value.reduce((sum, t) => sum + Number(t.amount), 0))

// 🛡️ 絕對安全寫入邏輯：徹底移除對 `id` 的依賴！
async function updateStock(itemName, newQty) {
  const { data, error: selectError } = await supabase.from('stock')
    .select('quantity')
    .eq('prod_name', itemName)
    .eq('branch', selectedBranch.value)
    .maybeSingle()
  
  if (selectError) {
    console.error('Error selecting stock:', selectError)
    return { success: false, message: selectError.message }
  }

  if (data) {
    const { error: updateError } = await supabase.from('stock')
      .update({ quantity: newQty })
      .eq('prod_name', itemName)
      .eq('branch', selectedBranch.value)
      
    if (updateError) return { success: false, message: updateError.message }
  } else {
    const { error: insertError } = await supabase.from('stock')
      .insert({ prod_name: itemName, branch: selectedBranch.value, quantity: newQty })
      
    if (insertError) return { success: false, message: insertError.message }
  }
  
  return { success: true }
}

// 💡 支援正負加減，且【沒有預設數字】
async function handleRestock(item) {
  // 提示文字改為入貨，但依舊提醒可以輸入負數
  const amountStr = prompt(`[入貨 / 扣除]\n請輸入「${item.name}」要變動的數量：\n(輸入正數為增加，輸入負數如 -5 為減少)`, "")
  if (!amountStr || isNaN(amountStr)) return
  
  const amount = parseInt(amountStr)
  const newQty = item.current_qty + amount
  
  const result = await updateStock(item.name, newQty)
  if (!result.success) alert('❌ 更新失敗: ' + result.message)
  else { alert(`✅ 已成功${amount >= 0 ? '入貨' : '扣除'}數量`); store.syncAll() }
}

// 💡 盤點覆蓋，【沒有預設數字】
async function handleStocktake(item) {
  const newQty = prompt(`[盤點覆蓋]\n請輸入「${item.name}」現場的真實庫存總數：`, "")
  if (newQty === null || newQty === '' || isNaN(newQty)) return
  
  const result = await updateStock(item.name, parseInt(newQty))
  if (!result.success) alert('❌ 盤點失敗: ' + result.message)
  else { alert('✅ 盤點數量已更新'); store.syncAll() }
}

// 💡 內部自用，【沒有預設數字】
async function handleSelfUse(item) {
  const qtyStr = prompt(`[內部自用]\n請輸入「${item.name}」提取自用的數量：`, "")
  if (!qtyStr || isNaN(qtyStr)) return
  
  const extractQty = parseInt(qtyStr)
  if (item.current_qty < extractQty) return alert('❌ 操作失敗：目前庫存數量不足以提取！')
  
  const newQty = item.current_qty - extractQty
  const stockResult = await updateStock(item.name, newQty)

  if (!stockResult.success) return alert('庫存扣除失敗: ' + stockResult.message)

  const itemCost = Number(item.cost) || Number(item.price_50) || 0
  const totalExpense = itemCost * extractQty

  const { error: txnError } = await supabase.from('transactions').insert({
    type: 'expense', category: '自用消耗', amount: totalExpense, staff: '內部自用', 
    branch: selectedBranch.value, note: `提取自用: ${item.name} x${extractQty}` 
  })

  if (txnError) return alert('流水帳紀錄失敗: ' + txnError.message)
  alert('✅ 已成功扣除庫存並記錄為內部自用！'); store.syncAll() 
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

    <div class="filter-bar" style="margin-bottom:15px;">
      <input class="inp search-box" v-model="searchProduct" placeholder="🔍 支援中/英文或代號搜尋...">
      <div class="tags-row" style="margin-top:10px;">
        <button v-for="cat in categories" :key="cat" class="cat-btn" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button>
      </div>
    </div>

    <div class="inventory-list">
      <div v-for="item in displayInventory" :key="item.id" class="inv-item">
        <div style="flex:1;">
          <div class="inv-name">{{ item.name }}</div>
          <div class="inv-sub">單個成本: ${{ Number(item.cost) || Number(item.price_50) || 0 }}</div>
        </div>
        <div class="inv-qty" :class="{warn: item.current_qty <= 5}">{{ item.current_qty }}</div>
        <div class="inv-actions">
          <button class="act-btn" @click="handleRestock(item)">入貨</button>
          <button class="act-btn" @click="handleStocktake(item)">盤點</button>
          <button class="act-btn btn-self" @click="handleSelfUse(item)">自用</button>
        </div>
      </div>
    </div>

    <div class="self-use-box">
      <div class="su-head">
        <span>📦 內部自用消耗紀錄</span> 
        <span class="su-total">總計: $ {{ selfUseTotalCost.toLocaleString() }}</span>
      </div>
      <div v-if="selfUseRecords.length === 0" style="text-align:center; color:#fdba74; font-size:12px; margin-top:10px;">
        目前沒有自用紀錄
      </div>
      <div v-for="t in selfUseRecords.slice(0, 10)" :key="t.id" class="su-item">
        <div>
          <div class="su-note">{{ t.note }}</div>
          <div class="su-date">{{ new Date(t.created_at).toLocaleDateString('zh-HK') }} · {{ t.branch }}</div>
        </div>
        <div class="su-amt">$ {{ t.amount }}</div>
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

/* 防手機放大 */
.search-box { width: 100%; border: 2px solid #e2e8f0; padding: 14px; border-radius: 14px; font-weight: 700; color: #1e293b; outline: none; background: white; font-size: 16px; appearance: none; }
.search-box:focus { border-color: #4f46e2; }

.tags-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.cat-btn { padding: 8px 16px; border-radius: 99px; background: #e2e8f0; border: none; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; cursor: pointer; }
.cat-btn.active { background: #4f46e2; color: white; box-shadow: 0 2px 8px rgba(79,70,229,0.3); }

.inv-item { background: white; padding: 20px; border-radius: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; }
.inv-name { font-weight: 800; font-size: 16px; color: #1e293b; }
.inv-sub { font-size: 11px; color: #94a3b8; font-weight: 700; margin-top: 4px; }
.inv-qty { font-size: 28px; font-weight: 900; color: #10b981; width: 60px; text-align: center; }
.inv-qty.warn { color: #ef4444; } 
.inv-actions { display: flex; flex-direction: column; gap: 6px; }
.act-btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc; font-size: 12px; font-weight: 800; color: #475569; cursor: pointer; transition: 0.2s; }
.act-btn:active { transform: scale(0.95); background: #e2e8f0; }

.btn-self { background: #fff7ed; color: #d97706; border-color: #ffedd5; }
.btn-self:active { background: #ffedd5; }

.self-use-box { margin-top: 25px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 20px; padding: 20px; }
.su-head { display: flex; justify-content: space-between; align-items: center; font-weight: 900; color: #d97706; margin-bottom: 15px; font-size: 15px; }
.su-total { background: #ea580c; color: white; padding: 4px 10px; border-radius: 8px; font-size: 12px; }
.su-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed #fed7aa; }
.su-item:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.su-note { font-weight: 800; font-size: 13px; color: #9a3412; }
.su-date { font-size: 11px; color: #fdba74; font-weight: 700; margin-top: 4px; }
.su-amt { font-weight: 900; color: #ea580c; font-size: 16px; }
</style>