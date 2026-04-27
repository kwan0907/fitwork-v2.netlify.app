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

// 🛡️ 絕對安全寫入邏輯
async function updateStock(itemName, newQty) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: '請重新登入！無法獲取使用者資訊。' }

  const { data, error: selectError } = await supabase.from('stock')
    .select('quantity')
    .eq('prod_name', itemName)
    .eq('branch', selectedBranch.value)
    .eq('user_id', user.id) 
    .maybeSingle()
  
  if (selectError) return { success: false, message: selectError.message }

  if (data) {
    const { error: updateError } = await supabase.from('stock')
      .update({ quantity: newQty, own_email: user.email })
      .eq('prod_name', itemName)
      .eq('branch', selectedBranch.value)
      .eq('user_id', user.id)
      
    if (updateError) return { success: false, message: updateError.message }
  } else {
    const { error: insertError } = await supabase.from('stock')
      .insert({ 
        prod_name: itemName, 
        branch: selectedBranch.value, 
        quantity: newQty,
        user_id: user.id,      
        own_email: user.email    
      })
      
    if (insertError) return { success: false, message: insertError.message }
  }
  
  return { success: true }
}

// ==========================================
// 🚀 全新 UI/UX：共用高質感彈窗邏輯
// ==========================================
const actionModal = ref({
  show: false,
  type: '', // 'restock', 'stocktake', 'selfUse'
  item: null,
  title: '',
  desc: '',
  inputValue: '',
  themeClass: ''
})

function openModal(type, item) {
  actionModal.value.type = type
  actionModal.value.item = item
  actionModal.value.inputValue = '' // 確保每次打開都是空的，沒有預設數字

  if (type === 'restock') {
    actionModal.value.title = '📥 入貨 / 扣除庫存'
    actionModal.value.desc = `(輸入正數為增加，輸入負數如 -5 為減少)`
    actionModal.value.themeClass = 'theme-blue'
  } else if (type === 'stocktake') {
    actionModal.value.title = '📋 庫存盤點覆蓋'
    actionModal.value.desc = `請輸入現場真實盤點的「總數量」`
    actionModal.value.themeClass = 'theme-gray'
  } else if (type === 'selfUse') {
    actionModal.value.title = '☕️ 內部提取自用'
    actionModal.value.desc = `請輸入本次要提取自用的數量`
    actionModal.value.themeClass = 'theme-orange'
  }
  actionModal.value.show = true
}

async function confirmAction() {
  const item = actionModal.value.item
  const valStr = actionModal.value.inputValue
  const type = actionModal.value.type

  if (!valStr || isNaN(valStr)) {
    return alert('⚠️ 請輸入有效的數字')
  }

  const inputNum = parseInt(valStr)

  // 1. 入貨邏輯
  if (type === 'restock') {
    const newQty = item.current_qty + inputNum
    const result = await updateStock(item.name, newQty)
    if (!result.success) alert('❌ 更新失敗: ' + result.message)
    else { alert(`✅ 已成功${inputNum >= 0 ? '入貨' : '扣除'}數量`); store.syncAll() }
  } 
  
  // 2. 盤點邏輯
  else if (type === 'stocktake') {
    if (inputNum < 0) return alert('⚠️ 盤點總數不可為負數！')
    const result = await updateStock(item.name, inputNum)
    if (!result.success) alert('❌ 盤點失敗: ' + result.message)
    else { alert('✅ 盤點數量已強制覆蓋更新'); store.syncAll() }
  } 
  
  // 3. 自用邏輯
  else if (type === 'selfUse') {
    if (inputNum <= 0) return alert('⚠️ 自用數量必須大於 0！')
    if (item.current_qty < inputNum) return alert('❌ 操作失敗：目前庫存數量不足以提取！')
    
    const newQty = item.current_qty - inputNum
    const stockResult = await updateStock(item.name, newQty)
    if (!stockResult.success) return alert('庫存扣除失敗: ' + stockResult.message)

    const itemCost = Number(item.cost) || Number(item.price_50) || 0
    const totalExpense = itemCost * inputNum
    const { data: { user } } = await supabase.auth.getUser()

    const { error: txnError } = await supabase.from('transactions').insert({
      type: 'expense', category: '自用消耗', amount: totalExpense, staff: '內部自用', 
      branch: selectedBranch.value, note: `提取自用: ${item.name} x${inputNum}`, own_email: user?.email
    })

    if (txnError) return alert('流水帳紀錄失敗: ' + txnError.message)
    alert('✅ 已成功扣除庫存並記錄為內部自用！'); store.syncAll() 
  }

  actionModal.value.show = false
}
</script>

<template>
  <div class="page" style="padding-bottom: 120px;">
    <h2 class="page-title">📦 庫存管理</h2>

    <div class="cost-card">
      <div class="cost-icon">💰</div>
      <div>
        <div class="cost-label">當前分店存貨總成本</div>
        <div class="cost-val">$ {{ currentTotalCost.toLocaleString() }}</div>
      </div>
    </div>

    <div class="branch-tabs">
      <button :class="{active: selectedBranch==='觀塘'}" @click="selectedBranch='觀塘'">📍 觀塘總庫</button>
      <button :class="{active: selectedBranch==='中環'}" @click="selectedBranch='中環'">📍 中環分庫</button>
      <button :class="{active: selectedBranch==='佐敦'}" @click="selectedBranch='佐敦'">📍 佐敦分庫</button>
    </div>

    <div class="filter-bar" style="margin-bottom:20px;">
      <div style="position: relative;">
        <span style="position: absolute; left: 15px; top: 14px; font-size: 16px;">🔍</span>
        <input class="search-box" v-model="searchProduct" placeholder="搜尋中/英文或代號...">
      </div>
      <div class="tags-row" style="margin-top:12px;">
        <button v-for="cat in categories" :key="cat" class="cat-btn" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button>
      </div>
    </div>

    <div class="inventory-list">
      <div v-for="item in displayInventory" :key="item.id" class="inv-item">
        
        <div class="inv-info-area">
          <div class="inv-name">{{ item.name }}</div>
          <div class="inv-sub">單個成本: <span style="font-weight:900; color:#64748b;">${{ Number(item.cost) || Number(item.price_50) || 0 }}</span></div>
        </div>
        
        <div class="inv-qty-area">
          <div class="inv-qty" :class="{warn: item.current_qty <= 5}">{{ item.current_qty }}</div>
          <div class="inv-qty-lbl">現有件數</div>
        </div>

        <div class="inv-actions">
          <button class="act-btn btn-blue" @click="openModal('restock', item)">📥 入貨</button>
          <button class="act-btn btn-gray" @click="openModal('stocktake', item)">📋 盤點</button>
          <button class="act-btn btn-orange" @click="openModal('selfUse', item)">☕️ 自用</button>
        </div>
      </div>
    </div>

    <div class="self-use-box">
      <div class="su-head">
        <span>📦 內部自用消耗紀錄</span> 
        <span class="su-total">總計: $ {{ selfUseTotalCost.toLocaleString() }}</span>
      </div>
      <div v-if="selfUseRecords.length === 0" style="text-align:center; color:#fdba74; font-size:12px; margin-top:15px;">
        目前沒有自用紀錄
      </div>
      <div v-for="t in selfUseRecords.slice(0, 10)" :key="t.id" class="su-item">
        <div>
          <div class="su-note">{{ t.note }}</div>
          <div class="su-date">{{ new Date(t.created_at).toLocaleDateString('zh-HK') }} · {{ t.branch }}</div>
        </div>
        <div class="su-amt">-$ {{ t.amount }}</div>
      </div>
    </div>

    <div v-if="actionModal.show" class="modal-overlay" @click.self="actionModal.show = false">
      <div class="action-modal" :class="actionModal.themeClass">
        <div class="am-header">
          {{ actionModal.title }}
          <button class="am-close" @click="actionModal.show = false">✕</button>
        </div>
        
        <div class="am-target-name">{{ actionModal.item?.name }}</div>
        <div class="am-current-qty">目前庫存: <span>{{ actionModal.item?.current_qty }}</span></div>
        
        <div class="am-desc">{{ actionModal.desc }}</div>
        
        <input 
          type="number" 
          v-model="actionModal.inputValue" 
          class="am-input" 
          placeholder="請輸入數字..." 
          autofocus
        >
        
        <button class="am-confirm-btn" @click="confirmAction">確認送出</button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; margin-bottom: 20px; }

/* 成本卡片微調 */
.cost-card { display: flex; align-items: center; gap: 20px; padding: 25px; background: linear-gradient(135deg, #ffffff, #f8fafc); border-radius: 24px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); }
.cost-icon { font-size: 40px; background: #eef2ff; width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; border-radius: 20px; }
.cost-label { color: #64748b; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;}
.cost-val { font-size: 32px; font-weight: 900; color: #4f46e2; margin-top: 4px; line-height: 1;}

/* 分店標籤 */
.branch-tabs { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 5px; }
.branch-tabs button { flex: 1; padding: 12px; border-radius: 16px; border: 2px solid transparent; background: #e2e8f0; font-weight: 800; color: #64748b; cursor: pointer; white-space: nowrap; transition: 0.2s;}
.branch-tabs button.active { background: #4f46e2; color: #fff; border-color: #c7d2fe; box-shadow: 0 4px 15px rgba(79,70,229,0.25); transform: translateY(-2px);}

/* 搜尋框與分類 */
.search-box { width: 100%; border: 2px solid #e2e8f0; padding: 14px 14px 14px 45px; border-radius: 16px; font-weight: 700; color: #1e293b; outline: none; background: white; font-size: 16px; appearance: none; transition: 0.2s;}
.search-box:focus { border-color: #4f46e2; box-shadow: 0 0 0 4px rgba(79,70,229,0.1);}
.tags-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.cat-btn { padding: 8px 18px; border-radius: 99px; background: white; border: 1px solid #cbd5e1; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; cursor: pointer; transition: 0.2s;}
.cat-btn.active { background: #1e293b; color: white; border-color: #1e293b; }

/* 🌟 庫存列表卡片 - 全新排版 */
.inv-item { background: white; padding: 18px; border-radius: 24px; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px;}
.inv-info-area { display: flex; justify-content: space-between; align-items: flex-start; }
.inv-name { font-weight: 900; font-size: 16px; color: #1e293b; line-height: 1.3;}
.inv-sub { font-size: 12px; color: #94a3b8; font-weight: 700; margin-top: 6px; }
.inv-qty-area { display: flex; flex-direction: column; align-items: flex-end; margin-top: -45px;} /* 讓數量靠右上角 */
.inv-qty { font-size: 32px; font-weight: 900; color: #10b981; line-height: 1;}
.inv-qty.warn { color: #ef4444; } 
.inv-qty-lbl { font-size: 10px; font-weight: 800; color: #cbd5e1; margin-top: 4px; text-transform: uppercase;}

/* 橫向操作按鈕 */
.inv-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 5px; padding-top: 15px; border-top: 1px dashed #f1f5f9;}
.act-btn { padding: 10px; border-radius: 12px; border: none; font-size: 13px; font-weight: 900; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 4px;}
.act-btn:active { transform: scale(0.95); }
.btn-blue { background: #eef2ff; color: #4f46e2; }
.btn-gray { background: #f1f5f9; color: #475569; }
.btn-orange { background: #fff7ed; color: #d97706; }

/* 內部自用區塊 */
.self-use-box { margin-top: 30px; background: #fff7ed; border: 2px solid #ffedd5; border-radius: 24px; padding: 25px; }
.su-head { display: flex; justify-content: space-between; align-items: center; font-weight: 900; color: #c2410c; margin-bottom: 20px; font-size: 16px; }
.su-total { background: #ea580c; color: white; padding: 6px 12px; border-radius: 10px; font-size: 13px; }
.su-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px dashed #fed7aa; }
.su-item:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.su-note { font-weight: 800; font-size: 14px; color: #9a3412; }
.su-date { font-size: 12px; color: #fb923c; font-weight: 700; margin-top: 6px; }
.su-amt { font-weight: 900; color: #ea580c; font-size: 18px; }

/* 🌟 全新高質感彈窗 Modal */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15,23,42,0.6); backdrop-filter: blur(5px); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 20px;}
.action-modal { background: white; width: 100%; max-width: 360px; border-radius: 28px; padding: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: modalPop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes modalPop { 0% { transform: scale(0.95) translateY(10px); opacity: 0; } 100% { transform: scale(1) translateY(0); opacity: 1; } }

.am-header { font-weight: 900; font-size: 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; color: #1e293b;}
.am-close { background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 14px; font-weight: 900; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;}
.am-target-name { font-size: 22px; font-weight: 900; text-align: center; margin-bottom: 5px; color: #0f172a;}
.am-current-qty { text-align: center; font-size: 14px; font-weight: 700; color: #64748b; margin-bottom: 20px; }
.am-current-qty span { color: #10b981; font-weight: 900; font-size: 16px;}
.am-desc { font-size: 13px; font-weight: 800; text-align: center; margin-bottom: 15px; padding: 0 10px;}
.am-input { width: 100%; text-align: center; font-size: 36px; font-weight: 900; padding: 15px; border-radius: 20px; border: 2px solid #e2e8f0; background: #f8fafc; color: #1e293b; outline: none; margin-bottom: 25px; transition: 0.2s;}
.am-input:focus { background: white; }
.am-confirm-btn { width: 100%; padding: 18px; border-radius: 18px; border: none; font-size: 16px; font-weight: 900; color: white; cursor: pointer; transition: 0.2s;}
.am-confirm-btn:active { transform: scale(0.96); }

/* 彈窗主題顏色 */
.theme-blue .am-desc { color: #6366f1; }
.theme-blue .am-input:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99,102,241,0.1); }
.theme-blue .am-confirm-btn { background: #4f46e2; box-shadow: 0 10px 20px rgba(79,70,229,0.25); }

.theme-gray .am-desc { color: #475569; }
.theme-gray .am-input:focus { border-color: #64748b; box-shadow: 0 0 0 4px rgba(100,116,139,0.1); }
.theme-gray .am-confirm-btn { background: #334155; box-shadow: 0 10px 20px rgba(51,65,85,0.25); }

.theme-orange .am-desc { color: #d97706; }
.theme-orange .am-input:focus { border-color: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,0.1); }
.theme-orange .am-confirm-btn { background: #ea580c; box-shadow: 0 10px 20px rgba(234,88,12,0.25); }
</style>