<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

const searchProduct = ref('')
const selectedCategory = ref('全部')
const selectedBranch = ref('觀塘')
const categories = ['全部', '內在營養', '外在保養']

const showAddStockModal = ref(false)
const showConsumeModal = ref(false)
const showStocktakeModal = ref(false)
const selectedProduct = ref(null)
const addQty = ref(1)
const consumeQty = ref(1)
const stocktakeQty = ref(0)
const consumeStaff = ref('')
const consumePayee = ref('')
const stocktakeNote = ref('')

const payees = computed(() => store.settings?.payees || ['kwan', 'Cat'])

const filteredProducts = computed(() => {
  let list = [...store.products]
  if (selectedCategory.value !== '全部') list = list.filter(p => p.category && p.category.includes(selectedCategory.value.replace('全部', '')))
  if (searchProduct.value) {
    const q = searchProduct.value.toLowerCase()
    list = list.filter(p => (p.name?.toLowerCase().includes(q)) || (p.name_en?.toLowerCase().includes(q)) || (p.id?.toLowerCase().includes(q)))
  }
  return list.sort((a,b) => (a.name||'').localeCompare(b.name||''))
})

const totalStockCost = computed(() => {
  return filteredProducts.value.reduce((sum, p) => {
    const qty = store.stock[`${p.name}_${selectedBranch.value}`] || 0
    const cost = Number(p.price_50) || 0
    return sum + (qty * cost)
  }, 0)
})

function openAddStock(p) { selectedProduct.value = p; addQty.value = 1; showAddStockModal.value = true }
function openConsume(p) { selectedProduct.value = p; consumeQty.value = 1; consumeStaff.value = payees.value[0]; consumePayee.value = payees.value[0]; showConsumeModal.value = true }
function openStocktake(p) { selectedProduct.value = p; stocktakeQty.value = store.stock[`${p.name}_${selectedBranch.value}`] || 0; stocktakeNote.value = ''; showStocktakeModal.value = true }

async function getUserEmail() {
  const { data: authData } = await supabase.auth.getSession()
  return authData?.session?.user?.email
}

async function handleAddStock() {
  if (addQty.value <= 0) return alert('數量必須大於 0')
  const userEmail = await getUserEmail()
  if (!userEmail) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const currentQty = store.stock[`${selectedProduct.value.name}_${selectedBranch.value}`] || 0
  const newQty = currentQty + addQty.value
  
  const { error } = await supabase.from('stock').upsert(
    { prod_name: selectedProduct.value.name, branch: selectedBranch.value, quantity: newQty, own_email: userEmail },
    { onConflict: 'prod_name,branch,own_email' }
  )
  
  if (error) alert('進貨失敗: ' + error.message)
  else { showAddStockModal.value = false; await store.syncAll(); alert('✅ 進貨成功') }
}

async function handleConsume() {
  if (consumeQty.value <= 0) return alert('數量必須大於 0')
  const userEmail = await getUserEmail()
  if (!userEmail) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const currentQty = store.stock[`${selectedProduct.value.name}_${selectedBranch.value}`] || 0
  if (currentQty < consumeQty.value) return alert('⚠️ 庫存不足，無法消耗！')

  const costPerItem = Number(selectedProduct.value.price_50) || 0
  const totalCost = costPerItem * consumeQty.value

  const { error: stockError } = await supabase.from('stock').upsert(
    { prod_name: selectedProduct.value.name, branch: selectedBranch.value, quantity: currentQty - consumeQty.value, own_email: userEmail },
    { onConflict: 'prod_name,branch,own_email' }
  )

  if (stockError) return alert('消耗扣庫存失敗: ' + stockError.message)

  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'expense', category: '自用消耗', amount: totalCost, profit: -totalCost, branch: selectedBranch.value,
    staff: consumeStaff.value, handled_by: consumePayee.value, own_email: userEmail,
    note: `自用消耗: ${selectedProduct.value.name} x${consumeQty.value}`, created_at: d.toISOString()
  }])

  if (txnError) alert('寫入帳目失敗: ' + txnError.message)
  else { showConsumeModal.value = false; await store.syncAll(); alert('✅ 消耗紀錄成功') }
}

async function handleStocktake() {
  if (stocktakeQty.value < 0) return alert('數量不能為負數')
  const userEmail = await getUserEmail()
  if (!userEmail) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const currentQty = store.stock[`${selectedProduct.value.name}_${selectedBranch.value}`] || 0
  const diff = stocktakeQty.value - currentQty
  if (diff === 0) return alert('數量無變化')

  const { error: stockError } = await supabase.from('stock').upsert(
    { prod_name: selectedProduct.value.name, branch: selectedBranch.value, quantity: stocktakeQty.value, own_email: userEmail },
    { onConflict: 'prod_name,branch,own_email' }
  )

  if (stockError) return alert('盤點更新失敗: ' + stockError.message)

  if (diff < 0) {
    const costPerItem = Number(selectedProduct.value.price_50) || 0
    const totalCost = costPerItem * Math.abs(diff)
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    await supabase.from('transactions').insert([{
      type: 'expense', category: '其他支出', amount: totalCost, profit: -totalCost, branch: selectedBranch.value, own_email: userEmail,
      note: `盤點虧損: ${selectedProduct.value.name} 缺少 ${Math.abs(diff)}件 (${stocktakeNote.value || '無備註'})`, created_at: d.toISOString()
    }])
  }

  showStocktakeModal.value = false; await store.syncAll(); alert('✅ 盤點更新成功')
}
</script>

<template>
  <div class="page" style="padding-bottom: 120px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h2 class="page-title" style="margin:0;">📦 庫存管理中心</h2>
    </div>

    <div class="glass-card" style="margin-bottom: 20px;">
      <div class="grid-2">
        <div class="form-item"><label>分店倉庫</label><select v-model="selectedBranch" class="modern-select highlight-sel"><option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option></select></div>
        <div class="form-item"><label>產品搜尋</label><input v-model="searchProduct" class="modern-inp" placeholder="名稱 / 代號..."></div>
      </div>
      <div class="tags-row" style="margin-top:15px;"><button v-for="cat in categories" :key="cat" class="cat-btn" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button></div>
    </div>

    <div class="summary-card">
      <div class="s-label">{{ selectedBranch }}倉庫總成本 (預估)</div>
      <div class="s-val">$ {{ totalStockCost.toLocaleString() }}</div>
    </div>

    <div class="list-container">
      <div v-for="p in filteredProducts" :key="p.id" class="p-card">
        <div class="p-main">
          <div class="p-name">{{ p.name }} <span class="p-id">#{{ p.id }}</span></div>
          <div class="p-meta">成本: ${{ p.price_50 || 0 }} · 售價: ${{ p.retail_price || 0 }}</div>
        </div>
        <div class="p-stock-box">
          <div class="s-num" :class="{'text-red': (store.stock[`${p.name}_${selectedBranch}`] || 0) < 5}">{{ store.stock[`${p.name}_${selectedBranch}`] || 0 }}</div>
          <div class="s-lbl">現有件數</div>
        </div>
        <div class="p-actions">
          <button class="a-btn b-blue" @click="openAddStock(p)">📥 進貨</button>
          <button class="a-btn b-orange" @click="openConsume(p)">☕️ 自用</button>
          <button class="a-btn b-gray" @click="openStocktake(p)">📋 盤點</button>
        </div>
      </div>
    </div>

    <div v-if="showAddStockModal" class="modal-overlay" @click.self="showAddStockModal = false">
      <div class="center-modal">
        <div class="m-header">📥 登記進貨 <button class="close-x" @click="showAddStockModal=false">✕</button></div>
        <div class="m-title">{{ selectedProduct?.name }}</div>
        <div class="m-sub">目前 {{ selectedBranch }} 庫存: <span style="font-weight:900;">{{ store.stock[`${selectedProduct?.name}_${selectedBranch}`] || 0 }}</span></div>
        <div class="form-item" style="margin-top:20px;"><label>➕ 新增進貨數量</label><input type="number" v-model="addQty" class="modern-inp center-text"></div>
        <button class="btn-confirm" style="margin-top:25px;" @click="handleAddStock">確認進貨</button>
      </div>
    </div>

    <div v-if="showConsumeModal" class="modal-overlay" @click.self="showConsumeModal = false">
      <div class="center-modal">
        <div class="m-header">☕️ 員工自用消耗 <button class="close-x" @click="showConsumeModal=false">✕</button></div>
        <div class="m-title">{{ selectedProduct?.name }}</div>
        <div class="m-sub">成本單價: ${{ selectedProduct?.price_50 || 0 }}</div>
        <div class="form-item" style="margin-top:20px;"><label>消耗數量</label><input type="number" v-model="consumeQty" class="modern-inp center-text"></div>
        <div class="grid-2" style="margin-top:15px;">
          <div class="form-item"><label>使用者</label><select v-model="consumeStaff" class="modern-select"><option v-for="s in payees" :key="s" :value="s">{{ s }}</option></select></div>
          <div class="form-item"><label>掛帳付款人</label><select v-model="consumePayee" class="modern-select"><option v-for="s in payees" :key="s" :value="s">{{ s }}</option></select></div>
        </div>
        <button class="btn-confirm btn-orange" style="margin-top:25px;" @click="handleConsume">確認消耗並扣帳</button>
      </div>
    </div>

    <div v-if="showStocktakeModal" class="modal-overlay" @click.self="showStocktakeModal = false">
      <div class="center-modal">
        <div class="m-header">📋 庫存盤點校正 <button class="close-x" @click="showStocktakeModal=false">✕</button></div>
        <div class="m-title">{{ selectedProduct?.name }}</div>
        <div class="m-sub text-red">⚠️ 若盤點減少，將自動產生盤虧支出紀錄！</div>
        <div class="grid-2" style="margin-top:20px;">
          <div class="form-item"><label>系統紀錄</label><input type="number" disabled :value="store.stock[`${selectedProduct?.name}_${selectedBranch}`] || 0" class="modern-inp center-text disabled-inp"></div>
          <div class="form-item"><label>實際點算數量</label><input type="number" v-model="stocktakeQty" class="modern-inp center-text highlight-inp"></div>
        </div>
        <div class="form-item" style="margin-top:15px;"><label>盤差原因 / 備註</label><input v-model="stocktakeNote" class="modern-inp" placeholder="例如：過期丟棄、破損..."></div>
        <button class="btn-confirm btn-gray" style="margin-top:25px;" @click="handleStocktake">強制覆寫庫存</button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; }
.glass-card { background: white; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #475569; }
.modern-inp, .modern-select { width: 100%; border: 2px solid #e2e8f0; padding: 12px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; background: #f8fafc; appearance: none;}
.modern-inp:focus, .modern-select:focus { border-color: #4f46e2; background: white;}
.highlight-sel { border-color: #4f46e2; color: #4f46e2; font-weight: 900; background: #eef2ff; }
.center-text { text-align: center; font-size: 20px; font-weight: 900;}
.disabled-inp { background: #f1f5f9; color: #94a3b8; border-color: #e2e8f0;}
.highlight-inp { border-color: #f59e0b; color: #d97706; background: #fffbeb;}
.tags-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.cat-btn { padding: 8px 16px; border-radius: 99px; background: #e2e8f0; border: none; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; cursor: pointer;}
.cat-btn.active { background: #4f46e2; color: white; }
.summary-card { background: linear-gradient(135deg, #1e293b, #0f172a); padding: 20px; border-radius: 20px; margin-bottom: 20px; text-align: center; color: white; box-shadow: 0 10px 25px rgba(15,23,42,0.2);}
.s-label { font-size: 13px; font-weight: 800; color: #94a3b8; margin-bottom: 5px;}
.s-val { font-size: 32px; font-weight: 900; }
.p-card { background: white; padding: 18px; border-radius: 20px; margin-bottom: 15px; border: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; gap: 15px; align-items: center; box-shadow: 0 4px 10px rgba(0,0,0,0.02);}
.p-main { flex: 1; min-width: 200px; }
.p-name { font-weight: 900; font-size: 16px; color: #1e293b; display: flex; align-items: center; gap: 8px;}
.p-id { font-size: 11px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 6px;}
.p-meta { font-size: 12px; font-weight: 700; color: #64748b; margin-top: 6px;}
.p-stock-box { text-align: center; background: #f8fafc; padding: 10px 15px; border-radius: 14px; border: 1px solid #e2e8f0;}
.s-num { font-size: 22px; font-weight: 900; color: #10b981; line-height: 1;}
.text-red { color: #ef4444 !important; }
.s-lbl { font-size: 11px; font-weight: 800; color: #94a3b8; margin-top: 4px;}
.p-actions { width: 100%; display: flex; gap: 8px; margin-top: 5px;}
.a-btn { flex: 1; padding: 10px; border-radius: 10px; border: none; font-weight: 800; font-size: 13px; cursor: pointer; transition: 0.2s;}
.a-btn:active { transform: scale(0.95); }
.b-blue { background: #eef2ff; color: #4f46e2; }
.b-orange { background: #fff7ed; color: #d97706; }
.b-gray { background: #f1f5f9; color: #475569; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: center; justify-content: center; }
.center-modal { background: white; width: 90%; max-width: 400px; border-radius: 24px; padding: 25px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); animation: popIn 0.3s ease-out; }
@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.m-header { font-weight: 900; font-size: 18px; margin-bottom: 15px; display: flex; justify-content: space-between; color: #1e293b; }
.close-x { background: #f1f5f9; border-radius: 50%; width: 30px; height: 30px; border: none; font-size: 14px; font-weight: 900; color: #475569; cursor: pointer; display: flex; justify-content: center; align-items: center;}
.m-title { font-size: 20px; font-weight: 900; color: #4f46e2; text-align: center; margin-bottom: 5px;}
.m-sub { font-size: 13px; font-weight: 700; color: #64748b; text-align: center;}
.btn-confirm { width: 100%; padding: 16px; background: #4f46e2; color: white; border: none; border-radius: 14px; font-weight: 900; font-size: 16px; cursor: pointer; transition: 0.2s; box-shadow: 0 10px 20px rgba(79,70,229,0.2);}
.btn-confirm:active { transform: scale(0.96); }
.btn-orange { background: #f59e0b; box-shadow: 0 10px 20px rgba(245,158,11,0.2);}
.btn-gray { background: #64748b; box-shadow: 0 10px 20px rgba(100,116,139,0.2);}
</style>