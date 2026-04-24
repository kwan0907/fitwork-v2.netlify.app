<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BaseModal from '../components/BaseModal.vue'

const store = useMainStore()

const showExpModal = ref(false)
const editingTxn = ref(null)
const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat', '股東'])
const incCategories = ['公司票', '其他收入']
const expCategories = ['廣告費用', '觀塘租金', '中環租金', '馬拉松費用', '產品採購', '支付30%', '其他支出']
const expForm = ref({
  type: 'expense',
  amount: '',
  note: '',
  staff: staffList.value[0],
  category: '廣告費用',
  ad_inquiries: 0,
  ad_phones: 0,
  date: new Date().toISOString().split('T')[0]
})

// 按日期分組流水帳
const groupedTxns = computed(() => {
  const g = {}
  store.transactions.forEach(t => {
    const d = new Date(t.created_at).toLocaleDateString('zh-HK')
    if (!g[d]) g[d] = []
    g[d].push(t)
  })
  return Object.entries(g).map(([date, items]) => ({ date, items })).sort((a,b)=>new Date(b.date)-new Date(a.date))
})

// --- 新增/編輯視窗 ---
function openExpForm() {
  editingTxn.value = null
  expForm.value = {
    type: 'expense', amount: '', note: '', staff: staffList.value[0],
    category: '廣告費用', ad_inquiries: 0, ad_phones: 0, date: new Date().toISOString().split('T')[0]
  }
  showExpModal.value = true
}

function openEditTransaction(t) {
  editingTxn.value = t.id
  const d = new Date(t.created_at)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  expForm.value = {
    type: t.type, amount: t.amount, note: t.note || '', staff: t.staff || t.handled_by || '',
    category: t.category, ad_inquiries: t.ad_inquiries || 0, ad_phones: t.ad_phones || 0,
    date: d.toISOString().split('T')[0]
  }
  showExpModal.value = true
}

// --- 儲存至資料庫 ---
async function saveTransaction() {
  if (!expForm.value.amount) return alert('請輸入金額！')
  
  const amt = Number(expForm.value.amount)
  const data = { 
    ...expForm.value, 
    amount: amt, 
    profit: expForm.value.type === 'income' ? amt : -amt,
    handled_by: expForm.value.staff // 同步 V2 欄位
  }
  
  if (data.category !== '廣告費用') { data.ad_inquiries = 0; data.ad_phones = 0 }
  
  const txnDate = new Date(expForm.value.date)
  const now = new Date()
  txnDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds())
  const createdAt = txnDate.toISOString()
  delete data.date // 移除暫存日期

  let error
  if (editingTxn.value) {
    const res = await supabase.from('transactions').update(data).eq('id', editingTxn.value)
    error = res.error
  } else {
    const res = await supabase.from('transactions').insert({ ...data, created_at: createdAt })
    error = res.error
  }

  if (error) alert('儲存失敗: ' + error.message)
  else {
    showExpModal.value = false
    await store.syncAll()
    alert('✅ 紀錄已儲存')
  }
}

// --- 刪除紀錄 ---
async function handleDeleteTransaction(id) {
  if (confirm('⚠️ 確定要永久刪除這筆收支紀錄嗎？\n此動作無法復原！')) {
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) alert('刪除失敗: ' + error.message)
    else {
      await store.syncAll()
      alert('已成功刪除')
    }
  }
}
</script>

<template>
  <div class="page" style="padding-bottom: 150px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h2 class="page-title" style="margin:0;">收支流水帳</h2>
      <button class="btn-primary" style="padding:10px 16px; border-radius:12px; font-weight:800;" @click="openExpForm">+ 新增收支</button>
    </div>

    <div v-for="group in groupedTxns" :key="group.date">
      <div class="date-header">📅 {{ group.date }}</div>
      <div class="card" style="padding:0 15px;">
        <div v-for="t in group.items" :key="t.id" class="txn-item">
          <div style="flex:1;">
            <div class="t-cat">{{ t.category }}</div>
            <div class="t-note">{{ t.note || '無備註' }} · <span class="t-staff">{{ t.staff || t.handled_by }}</span></div>
            <div v-if="t.category==='廣告費用' && (t.ad_inquiries>0 || t.ad_phones>0)" class="t-ad">
              廣告回報: {{ t.ad_inquiries }} 查詢 / {{ t.ad_phones }} 電話
            </div>
          </div>
          <div style="text-align:right;display:flex;align-items:center;gap:10px;">
            <div class="t-amt" :class="t.type==='income'?'g':'r'">
              {{ t.type==='income'?'+':'-' }}${{ t.amount }}
            </div>
            <button class="icon-btn" @click="openEditTransaction(t)">✏️</button>
            <button class="icon-btn" style="color:#ef4444;" @click="handleDeleteTransaction(t.id)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <BaseModal :show="showExpModal" :title="editingTxn ? '✏️ 修改記錄' : '➕ 新增記錄'" @close="showExpModal = false">
      <div class="form-item">
        <label>類型</label>
        <div style="display:flex;gap:12px;">
          <button class="t-btn" :class="{activeI: expForm.type==='income'}" @click="expForm.type='income';expForm.category='公司票'">💰 收入</button>
          <button class="t-btn" :class="{activeE: expForm.type==='expense'}" @click="expForm.type='expense';expForm.category='廣告費用'">💸 支出</button>
        </div>
      </div>
      
      <div class="form-item" style="margin-top:15px;">
        <label>日期</label>
        <input class="modern-inp" type="date" v-model="expForm.date">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>選擇分類</label>
        <select class="modern-select" v-model="expForm.category">
          <option v-for="cat in (expForm.type==='income' ? incCategories : expCategories)" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>

      <div v-if="expForm.category==='廣告費用'" class="ad-box">
        <div class="ad-title">📈 記錄廣告成效 (選填)</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div><label>產生查詢數</label><input class="modern-inp" type="number" v-model="expForm.ad_inquiries"></div>
          <div><label>獲得電話數</label><input class="modern-inp" type="number" v-model="expForm.ad_phones"></div>
        </div>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>金額 (HK$)</label>
        <input class="modern-inp amt-inp" type="number" v-model="expForm.amount">
      </div>
      <div class="form-item" style="margin-top:15px;">
        <label>備註</label>
        <input class="modern-inp" v-model="expForm.note">
      </div>
      <div class="form-item" style="margin-top:15px;">
        <label>經手人 (收款/付款人)</label>
        <select class="modern-select" v-model="expForm.staff">
          <option v-for="staff in staffList" :key="staff" :value="staff">{{ staff }}</option>
        </select>
      </div>
      
      <button class="btn-primary" style="margin-top:30px; width:100%; padding:16px; font-size:16px;" @click="saveTransaction">✅ 儲存</button>
    </BaseModal>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; }
.card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
.date-header { font-size: 13px; font-weight: 900; color: #64748b; margin: 15px 0 8px; }

.txn-item { display: flex; align-items: center; padding: 16px 0; border-bottom: 1px solid #f1f5f9; }
.txn-item:last-child { border-bottom: none; }
.t-cat { font-weight: 800; font-size: 15px; color: #1e293b; }
.t-note { font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600;}
.t-staff { font-weight: 800; color: #4f46e2; }
.t-ad { font-size: 11px; color: #d97706; margin-top: 4px; font-weight: 700; background: #fff7ed; display: inline-block; padding: 2px 8px; border-radius: 6px; }
.t-amt { font-weight: 900; font-size: 18px; }
.t-amt.g { color: #10b981; }
.t-amt.r { color: #ef4444; }

.icon-btn { background: #f1f5f9; border: none; font-size: 16px; padding: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.icon-btn:active { transform: scale(0.9); }

/* 表單樣式 */
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #475569; }
.modern-inp, .modern-select { width: 100%; border: 2px solid #e2e8f0; padding: 12px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; background: #f8fafc;}
.modern-inp:focus { border-color: #4f46e2; background: white;}
.amt-inp { font-size: 24px; font-weight: 900; color: #4f46e2; }

.t-btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 800; border: none; background: #f1f5f9; color: #64748b; cursor: pointer; }
.t-btn.activeI { background: #10b981; color: white; }
.t-btn.activeE { background: #ef4444; color: white; }

.ad-box { background: #fff7ed; border: 1px solid #fed7aa; padding: 15px; border-radius: 12px; margin-top: 15px; }
.ad-title { font-weight: 900; color: #d97706; margin-bottom: 10px; font-size: 13px; }
.btn-primary { background: #4f46e2; color: white; border: none; }
</style>