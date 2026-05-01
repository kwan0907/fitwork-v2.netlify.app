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
    // 🌿 兼容繁體「內」與簡體「内」
    list = list.filter(p => p.category && (p.category.includes('內') || p.category.includes('内')))
  } else if (selectedCategory.value === '外在保養') {
    // 🧴 確保無論繁簡都能正確抓取 (雖然「外」字一樣，但加強比對策安全)
    list = list.filter(p => p.category && (p.category.includes('外') || p.category.includes('保养')))
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

const currentTotalCost = computed(() => {
  return displayInventory.value.reduce((sum, item) => {
    const itemCost = Number(item.cost) || Number(item.price_50) || 0
    return sum + (item.current_qty * itemCost)
  }, 0)
})

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
// 🚀 全新功能：批量採購購物車 (Bulk Purchase)
// ==========================================
const purchaseCart = ref([])
const showPurchaseModal = ref(false)
const purchaseDate = ref(new Date().toISOString().split('T')[0])
const payees = computed(() => store.settings?.payees || ['kwan', 'Cat'])

const purchaseCartWithCosts = computed(() => {
  return purchaseCart.value.map(item => {
    const cost = Number(item.cost) || Number(item.price_50) || 0
    return { ...item, unit_cost: cost }
  })
})

const purchaseTotalItems = computed(() => purchaseCart.value.reduce((s, i) => s + i.qty, 0))
const purchaseTotalCost = computed(() => purchaseCartWithCosts.value.reduce((s, i) => s + (i.unit_cost * i.qty), 0))

function addToPurchaseCart(item) {
  const existing = purchaseCart.value.find(i => i.id === item.id)
  if (existing) existing.qty++
  else purchaseCart.value.push({ ...item, qty: 1 })
}

function decreasePurchaseQty(item) {
  const existing = purchaseCart.value.find(i => i.id === item.id)
  if (!existing) return
  if (existing.qty > 1) existing.qty--
  else purchaseCart.value = purchaseCart.value.filter(i => i.id !== item.id)
  if (purchaseCart.value.length === 0) showPurchaseModal.value = false
}

function openPurchaseCheckout() {
  purchaseDate.value = new Date().toISOString().split('T')[0]
  showPurchaseModal.value = true
}

async function finalizePurchase(payeeName) {
  if (purchaseCart.value.length === 0) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const itemsStr = purchaseCart.value.map(i => `${i.name}x${i.qty}`).join(', ')
  const totalCost = purchaseTotalCost.value

  const [yyyy, mm, dd] = purchaseDate.value.split('-')
  const now = new Date()
  const txnDate = new Date(yyyy, mm - 1, dd, now.getHours(), now.getMinutes(), now.getSeconds())
  
  // 1. 寫入流水帳 (產生產品採購支出)
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'expense',
    category: '產品採購',
    amount: totalCost,
    profit: -totalCost,
    branch: selectedBranch.value,
    handled_by: payeeName,
    staff: payeeName,
    created_at: txnDate.toISOString(),
    own_email: user.email,
    note: `批量採購 (${itemsStr})`
  }])

  if (txnError) return alert('採購紀錄寫入失敗: ' + txnError.message)

  // 2. 批量增加私人庫存
  let stockUpdateFailed = false;
  for (const item of purchaseCart.value) {
    const { data: stockData, error: selectError } = await supabase.from('stock')
      .select('quantity')
      .eq('prod_name', item.name)
      .eq('branch', selectedBranch.value)
      .eq('user_id', user.id)
      .maybeSingle()

    if (selectError) { stockUpdateFailed = true; continue; }

    const currentDbQty = stockData ? stockData.quantity : 0;
    const newQty = currentDbQty + item.qty; // 入貨是增加

    if (stockData) {
      const { error: updateError } = await supabase.from('stock')
        .update({ quantity: newQty, own_email: user.email })
        .eq('prod_name', item.name)
        .eq('branch', selectedBranch.value)
        .eq('user_id', user.id)
      if (updateError) stockUpdateFailed = true;
    } else {
      const { error: insertError } = await supabase.from('stock')
        .insert({ 
          prod_name: item.name, branch: selectedBranch.value, quantity: newQty,
          user_id: user.id, own_email: user.email  
        })
      if (insertError) stockUpdateFailed = true;
    }
  }

  if (stockUpdateFailed) alert('⚠️ 採購成功，但部分庫存更新失敗！請手動至「庫存管理」檢查。')
  else alert(`✅ 批量採購成功！\n已自動增加庫存並記錄採購支出 $${totalCost}`)

  purchaseCart.value = []; showPurchaseModal.value = false; await store.syncAll()
}

// ==========================================
// 共用高質感彈窗邏輯 (保留給單件微調、盤點、自用)
// ==========================================
const actionModal = ref({ show: false, type: '', item: null, title: '', desc: '', inputValue: '', themeClass: '' })

function openModal(type, item) {
  actionModal.value.type = type; actionModal.value.item = item; actionModal.value.inputValue = ''
  if (type === 'restock') { actionModal.value.title = '📥 單件微調'; actionModal.value.desc = `(正數為增加，負數如 -5 為減少)`; actionModal.value.themeClass = 'theme-blue' } 
  else if (type === 'stocktake') { actionModal.value.title = '📋 庫存盤點覆蓋'; actionModal.value.desc = `請輸入現場真實盤點的總數量`; actionModal.value.themeClass = 'theme-gray' } 
  else if (type === 'selfUse') { actionModal.value.title = '☕️ 內部提取自用'; actionModal.value.desc = `請輸入提取自用的數量`; actionModal.value.themeClass = 'theme-orange' }
  actionModal.value.show = true
}

async function confirmAction() {
  const item = actionModal.value.item; const valStr = actionModal.value.inputValue; const type = actionModal.value.type
  if (!valStr || isNaN(valStr)) return alert('⚠️ 請輸入有效的數字')
  const inputNum = parseInt(valStr)

  if (type === 'restock') {
    const newQty = item.current_qty + inputNum
    const result = await updateStock(item.name, newQty)
    if (!result.success) alert('❌ 更新失敗: ' + result.message)
    else { alert(`✅ 已成功${inputNum >= 0 ? '入貨' : '扣除'}數量`); store.syncAll() }
  } 
  else if (type === 'stocktake') {
    if (inputNum < 0) return alert('⚠️ 盤點總數不可為負數！')
    const result = await updateStock(item.name, inputNum)
    if (!result.success) alert('❌ 盤點失敗: ' + result.message)
    else { alert('✅ 盤點數量已強制覆蓋更新'); store.syncAll() }
  } 
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
  <div class="page" style="padding-bottom: 180px;">
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
        
        <div class="inv-top-row">
          <div class="inv-info-area">
            <div class="inv-name">{{ item.name }}</div>
            <div class="inv-sub">單個成本: <span style="font-weight:900; color:#64748b;">${{ Number(item.cost) || Number(item.price_50) || 0 }}</span></div>
          </div>
          <div class="inv-qty-area">
            <div class="inv-qty" :class="{warn: item.current_qty <= 5}">{{ item.current_qty }}</div>
            <div class="inv-qty-lbl">現有件數</div>
          </div>
        </div>

        <div class="inv-actions">
          <button class="act-btn btn-purple" @click="addToPurchaseCart(item)">🛒 買貨</button>
          <button class="act-btn btn-blue" @click="openModal('restock', item)">📥 單件</button>
          <button class="act-btn btn-gray" @click="openModal('stocktake', item)">📋 盤點</button>
          <button class="act-btn btn-orange" @click="openModal('selfUse', item)">☕️ 自用</button>
        </div>
      </div>
    </div>

    <div v-if="purchaseCart.length > 0" class="float-bar" @click="openPurchaseCheckout">
      <div class="badge-num">{{ purchaseTotalItems }}</div>
      <div style="flex:1; margin-left:15px; font-weight:800; color:white;">件待購產品</div>
      <div class="float-total">支出 $ {{ purchaseTotalCost }}</div>
      <div class="float-btn">確認入庫 ➔</div>
    </div>

    <div v-if="showPurchaseModal" class="modal-overlay" @click.self="showPurchaseModal = false">
      <div class="checkout-modal">
        <div class="m-header">🛒 批量採購清單 <button class="close-x" @click="showPurchaseModal=false">✕</button></div>

        <div class="summary-box" style="margin-bottom: 20px; border-color: #10b981; background: #ecfdf5;">
          <div class="s-row" style="color: #059669;">
            <span>📅 入貨日期</span>
            <input type="date" v-model="purchaseDate" class="modern-select" style="width: 150px; padding: 5px 10px; background: white; border: 2px solid #10b981;">
          </div>
        </div>

        <div class="cart-header-row">
          <span class="cart-header-title">📦 待入庫商品（{{ purchaseTotalItems }} 件）</span>
          <button class="clear-all-btn" @click="purchaseCart = []">🗑️ 清空</button>
        </div>

        <div class="cart-items">
          <div v-for="item in purchaseCartWithCosts" :key="item.id" class="c-item">
            <button class="c-delete" @click="purchaseCart = purchaseCart.filter(i => i.id !== item.id)">✕</button>
            <div style="flex:1;"><div class="c-name">{{ item.name }}</div><div class="c-sub">成本 ${{ item.unit_cost }}</div></div>
            <div class="c-price" style="color:#10b981;">$ {{ item.unit_cost * item.qty }}</div>
            <div class="qty-control">
              <button @click="decreasePurchaseQty(item)">−</button>
              <span>{{ item.qty }}</span>
              <button @click="addToPurchaseCart(item)">＋</button>
            </div>
          </div>
        </div>

        <div class="summary-box">
          <div class="s-row"><span style="color:#1e293b;">總採購支出</span> <span style="color:#ef4444; font-weight:900; font-size:20px;">$ {{ purchaseTotalCost }}</span></div>
        </div>

        <div class="confirm-section">
          <p class="confirm-label">💳 選擇付款人完成入庫</p>
          <div class="payee-buttons">
            <button v-for="(payee, index) in payees" :key="payee" class="payee-btn" :class="'style-' + (index % 2)" @click="finalizePurchase(payee)">
              💸 {{ payee }} 付款
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="self-use-box">
      <div class="su-head">
        <span>📦 內部自用消耗紀錄</span> 
        <span class="su-total">總計: $ {{ selfUseTotalCost.toLocaleString() }}</span>
      </div>
      <div v-if="selfUseRecords.length === 0" style="text-align:center; color:#fdba74; font-size:12px; margin-top:15px;">目前沒有自用紀錄</div>
      <div v-for="t in selfUseRecords.slice(0, 10)" :key="t.id" class="su-item">
        <div>
          <div class="su-note">{{ t.note }}</div>
          <div class="su-date">{{ new Date(t.created_at).toLocaleDateString('zh-HK') }} · {{ t.branch }}</div>
        </div>
        <div class="su-amt">-$ {{ t.amount }}</div>
      </div>
    </div>

    <div v-if="actionModal.show" class="modal-overlay" style="z-index: 1000;" @click.self="actionModal.show = false">
      <div class="action-modal" :class="actionModal.themeClass">
        <div class="am-header">{{ actionModal.title }} <button class="am-close" @click="actionModal.show = false">✕</button></div>
        <div class="am-target-name">{{ actionModal.item?.name }}</div>
        <div class="am-current-qty">目前庫存: <span>{{ actionModal.item?.current_qty }}</span></div>
        <div class="am-desc">{{ actionModal.desc }}</div>
        <input type="number" v-model="actionModal.inputValue" class="am-input" placeholder="請輸入數字..." autofocus>
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

/* 🌟 庫存列表卡片 */
.inv-item { background: white; padding: 18px; border-radius: 24px; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 4px 15px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px;}
.inv-top-row { display: flex; justify-content: space-between; align-items: center; gap: 15px; }
.inv-info-area { display: flex; flex-direction: column; flex: 1; }
.inv-name { font-weight: 900; font-size: 16px; color: #1e293b; line-height: 1.3;}
.inv-sub { font-size: 12px; color: #94a3b8; font-weight: 700; margin-top: 6px; }
.inv-qty-area { display: flex; flex-direction: column; align-items: flex-end; min-width: 60px; }
.inv-qty { font-size: 32px; font-weight: 900; color: #10b981; line-height: 1;}
.inv-qty.warn { color: #ef4444; } 
.inv-qty-lbl { font-size: 10px; font-weight: 800; color: #cbd5e1; margin-top: 4px; text-transform: uppercase;}

/* 四宮格按鈕 */
.inv-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding-top: 15px; border-top: 1px dashed #f1f5f9;}
.act-btn { padding: 8px 5px; border-radius: 12px; border: none; font-size: 12px; font-weight: 900; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 2px;}
.act-btn:active { transform: scale(0.95); }
.btn-purple { background: #f3e8ff; color: #7e22ce; }
.btn-blue { background: #eef2ff; color: #4f46e2; }
.btn-gray { background: #f1f5f9; color: #475569; }
.btn-orange { background: #fff7ed; color: #d97706; }

/* 🚀 採購購物車 Float Bar & Modal */
.float-bar { position: fixed; bottom: 85px; left: 5%; width: 90%; background: #1e293b; border-radius: 99px; padding: 14px 20px; display: flex; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 90; cursor: pointer; }
.badge-num { background: #10b981; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 900; font-size: 16px; }
.float-total { font-size: 20px; font-weight: 900; color: white; margin-right: 15px; flex: 1; margin-left: 10px;}
.float-btn { font-size: 14px; font-weight: 800; color: #cbd5e1; }

.cart-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.cart-header-title { font-weight: 900; font-size: 15px; color: #1e293b; }
.clear-all-btn { background: #fee2e2; color: #ef4444; border: none; border-radius: 8px; padding: 6px 12px; font-weight: 800; font-size: 13px; cursor: pointer; }

.cart-items { max-height: 250px; overflow-y: auto; margin-bottom: 20px; padding-right: 10px; }
.c-item { display: flex; align-items: center; margin-bottom: 15px; background: #f8fafc; padding: 12px; border-radius: 16px; border: 1px solid #e2e8f0; }
.c-name { font-weight: 800; font-size: 15px; color: #1e293b; }
.c-sub { font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 700; }
.c-price { font-weight: 900; font-size: 16px; margin-right: 10px; }
.qty-control { display: flex; align-items: center; background: white; border-radius: 10px; border: 1px solid #cbd5e1; }
.qty-control button { border: none; background: transparent; padding: 8px 12px; font-weight: 900; cursor: pointer; color: #1e293b; font-size: 16px; }
.qty-control span { font-weight: 900; font-size: 15px; width: 24px; text-align: center; color: #10b981; }

.c-delete { background: #fee2e2; color: #ef4444; border: none; border-radius: 8px; width: 28px; height: 28px; margin-right: 10px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center;}

.summary-box { background: #f8fafc; border-radius: 20px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.s-row { display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #1e293b;}

.confirm-section { display: flex; flex-direction: column; gap: 12px; }
.confirm-label { text-align: center; font-weight: 800; font-size: 14px; color: #64748b; margin: 0; padding: 0; }
.payee-buttons { display: flex; gap: 10px; }
.payee-btn { flex: 1; padding: 15px; border-radius: 16px; border: none; font-weight: 900; color: white; font-size: 15px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
.payee-btn:active { transform: scale(0.96); }
.style-0 { background: linear-gradient(135deg, #10b981, #059669); } 
.style-1 { background: linear-gradient(135deg, #3b82f6, #2563eb); } 

.modern-select { border: 1px solid #cbd5e1; outline: none; font-weight: 700; color: #1e293b;}

/* 內部自用區塊 */
.self-use-box { margin-top: 30px; background: #fff7ed; border: 2px solid #ffedd5; border-radius: 24px; padding: 25px; }
.su-head { display: flex; justify-content: space-between; align-items: center; font-weight: 900; color: #c2410c; margin-bottom: 20px; font-size: 16px; }
.su-total { background: #ea580c; color: white; padding: 6px 12px; border-radius: 10px; font-size: 13px; }
.su-item { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px dashed #fed7aa; }
.su-item:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.su-note { font-weight: 800; font-size: 14px; color: #9a3412; }
.su-date { font-size: 12px; color: #fb923c; font-weight: 700; margin-top: 6px; }
.su-amt { font-weight: 900; color: #ea580c; font-size: 18px; }

/* 🌟 單件操作 Modal */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15,23,42,0.6); backdrop-filter: blur(5px); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 20px;}
.checkout-modal { background: white; width: 100%; max-width: 600px; border-radius: 28px; padding: 25px; max-height: 85vh; overflow-y: auto; align-self: flex-end;}
.action-modal { background: white; width: 100%; max-width: 360px; border-radius: 28px; padding: 30px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: modalPop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes modalPop { 0% { transform: scale(0.95) translateY(10px); opacity: 0; } 100% { transform: scale(1) translateY(0); opacity: 1; } }

.am-header { font-weight: 900; font-size: 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; color: #1e293b;}
.close-x, .am-close { background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; font-size: 14px; font-weight: 900; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;}
.am-target-name { font-size: 22px; font-weight: 900; text-align: center; margin-bottom: 5px; color: #0f172a;}
.am-current-qty { text-align: center; font-size: 14px; font-weight: 700; color: #64748b; margin-bottom: 20px; }
.am-current-qty span { color: #10b981; font-weight: 900; font-size: 16px;}
.am-desc { font-size: 13px; font-weight: 800; text-align: center; margin-bottom: 15px; padding: 0 10px;}
.am-input { width: 100%; text-align: center; font-size: 36px; font-weight: 900; padding: 15px; border-radius: 20px; border: 2px solid #e2e8f0; background: #f8fafc; color: #1e293b; outline: none; margin-bottom: 25px; transition: 0.2s;}
.am-input:focus { background: white; }
.am-confirm-btn { width: 100%; padding: 18px; border-radius: 18px; border: none; font-size: 16px; font-weight: 900; color: white; cursor: pointer; transition: 0.2s;}
.am-confirm-btn:active { transform: scale(0.96); }

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