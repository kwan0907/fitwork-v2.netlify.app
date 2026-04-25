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

// 💡 新增 client_name 欄位來暫存選擇的客戶
const expForm = ref({
  type: 'expense',
  amount: '',
  note: '',
  client_name: '', // 💡 關聯客戶
  staff: staffList.value[0],
  category: '廣告費用',
  ad_inquiries: 0,
  ad_phones: 0,
  date: new Date().toISOString().split('T')[0]
})

// 💡 抓取系統內所有客戶名單供下拉選擇
const activeClientsOptions = computed(() => {
  return store.clients.map(c => c.name).sort((a,b) => a.localeCompare(b, 'zh-HK'))
})

// 💡 智能解析大腦：把資料庫裡的字串拆解成「客戶」與「純備註」
const formatNoteStr = (noteStr) => {
  if (!noteStr) return { client: null, text: '無備註' }
  const m = noteStr.match(/^【(.*?)】\s*(.*)$/)
  if (m) return { client: m[1], text: m[2] || '無其他備註' }
  return { client: null, text: noteStr }
}

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
    type: 'expense', amount: '', note: '', client_name: '', staff: staffList.value[0],
    category: '廣告費用', ad_inquiries: 0, ad_phones: 0, date: new Date().toISOString().split('T')[0]
  }
  showExpModal.value = true
}

function openEditTransaction(t) {
  editingTxn.value = t.id
  const d = new Date(t.created_at)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())

  // 💡 編輯時，自動把 【客戶名】 從字串中拔出來，放回下拉選單
  let extractedClient = ''
  let extractedNote = t.note || ''
  const match = extractedNote.match(/^【(.*?)】\s*(.*)$/)
  if (match) {
    extractedClient = match[1]
    extractedNote = match[2]
  }

  expForm.value = {
    type: t.type, amount: t.amount, 
    note: extractedNote, 
    client_name: extractedClient, // 💡 自動還原客戶選單
    staff: t.staff || t.handled_by || '',
    category: t.category, ad_inquiries: t.ad_inquiries || 0, ad_phones: t.ad_phones || 0,
    date: d.toISOString().split('T')[0]
  }
  showExpModal.value = true
}

// --- 儲存至資料庫 ---
async function saveTransaction() {
  if (!expForm.value.amount) return alert('請輸入金額！')
  
  // 💡 儲存時，自動把客戶名字加上【】保護殼，並與備註合併
  let finalNote = expForm.value.note || ''
  if (expForm.value.client_name) {
    finalNote = `【${expForm.value.client_name}】 ${finalNote}`.trim()
  }

  const amt = Number(expForm.value.amount)
  const data = { 
    ...expForm.value, 
    amount: amt, 
    note: finalNote, // 💡 寫入合成後的完美備註
    profit: expForm.value.type === 'income' ? amt : -amt,
    handled_by: expForm.value.staff 
  }
  
  // 清理不需要傳給資料庫的暫存欄位
  delete data.client_name 
  delete data.date 

  if (data.category !== '廣告費用') { data.ad_inquiries = 0; data.ad_phones = 0 }
  
  const txnDate = new Date(expForm.value.date)
  const now = new Date()
  txnDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds())
  const createdAt = txnDate.toISOString()

  // 將 created_at 包含進去，確保「修改日期」能成功寫入資料庫
  const updatePayload = { ...data, created_at: createdAt }

  let error
  if (editingTxn.value) {
    const res = await supabase.from('transactions').update(updatePayload).eq('id', editingTxn.value)
    error = res.error
  } else {
    const res = await supabase.from('transactions').insert(updatePayload)
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
            
            <div class="t-note-box">
              <div class="tag-row" v-if="formatNoteStr(t.note).client">
                <span class="icon-lbl">👤 關聯客戶:</span> 
                <span class="t-client">{{ formatNoteStr(t.note).client }}</span>
              </div>
              <div class="tag-row"><span class="icon-lbl">📝 備註事項:</span> {{ formatNoteStr(t.note).text }}</div>
              <div class="tag-row"><span class="icon-lbl">💼 經手(收款):</span> <span class="t-staff">{{ t.staff || t.handled_by || '未記錄' }}</span></div>
            </div>

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
          <button class="t-btn" :class="{activeI: expForm.type==='income'}" @click="expForm.type='income';expForm.category='運動套票'">💰 收入</button>
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
          <option v-if="expForm.type==='income' && !incCategories.includes('運動套票')" value="運動套票">運動套票</option>
          <option v-if="expForm.type==='income' && !incCategories.includes('試堂')" value="試堂">試堂</option>
          <option v-if="expForm.type==='income' && !incCategories.includes('運動')" value="運動">運動</option>
        </select>
      </div>

      <div class="form-item" style="margin-top:15px;" v-if="expForm.type === 'income'">
        <label>👤 關聯客戶 (誰買的？)</label>
        <select class="modern-select" v-model="expForm.client_name">
          <option value="">-- 無關聯 / 非系統內客戶 --</option>
          <option v-for="name in activeClientsOptions" :key="name" :value="name">{{ name }}</option>
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
        <label>📝 補充備註細節</label>
        <input class="modern-inp" v-model="expForm.note" placeholder="例如：10點套票 / 送搖搖杯">
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
.card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.date-header { font-size: 13px; font-weight: 900; color: #64748b; margin: 15px 0 8px; }

.txn-item { display: flex; align-items: center; padding: 16px 0; border-bottom: 1px dashed #e2e8f0; }
.txn-item:last-child { border-bottom: none; }
.t-cat { font-weight: 900; font-size: 16px; color: #1e293b; margin-bottom: 8px;}

/* 💡 新版客戶與收款人排版 */
.t-note-box { background: #f8fafc; padding: 10px 12px; border-radius: 10px; border: 1px solid #e2e8f0; display: inline-block;}
.tag-row { font-size: 13px; color: #475569; font-weight: 600; margin-bottom: 6px; line-height: 1.4;}
.tag-row:last-child { margin-bottom: 0; }
.icon-lbl { color: #94a3b8; font-weight: 800; font-size: 12px; margin-right: 4px;}
.t-staff { font-weight: 900; color: #4f46e2; }
.t-client { font-weight: 900; color: #ec4899; background: #fdf2f8; padding: 2px 8px; border-radius: 6px; }

.t-ad { font-size: 11px; color: #d97706; margin-top: 8px; font-weight: 800; background: #fff7ed; display: inline-block; padding: 4px 8px; border-radius: 6px; }
.t-amt { font-weight: 900; font-size: 20px; }
.t-amt.g { color: #10b981; }
.t-amt.r { color: #ef4444; }

.icon-btn { background: #f1f5f9; border: none; font-size: 16px; padding: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.icon-btn:active { transform: scale(0.9); }

/* 表單樣式 */
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #475569; }
.modern-inp, .modern-select { width: 100%; border: 2px solid #e2e8f0; padding: 12px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; background: #f8fafc; appearance: none;}
.modern-inp:focus, .modern-select:focus { border-color: #4f46e2; background: white;}
.amt-inp { font-size: 26px; font-weight: 900; color: #4f46e2; text-align: center;}

.t-btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 800; border: none; background: #f1f5f9; color: #64748b; cursor: pointer; transition: 0.2s; }
.t-btn.activeI { background: #10b981; color: white; box-shadow: 0 4px 10px rgba(16,185,129,0.2);}
.t-btn.activeE { background: #ef4444; color: white; box-shadow: 0 4px 10px rgba(239,68,68,0.2);}

.ad-box { background: #fff7ed; border: 1px solid #fed7aa; padding: 15px; border-radius: 12px; margin-top: 15px; }
.ad-title { font-weight: 900; color: #d97706; margin-bottom: 10px; font-size: 13px; }
.btn-primary { background: #4f46e2; color: white; border: none; transition: 0.2s;}
.btn-primary:active { transform: scale(0.96); }
</style>