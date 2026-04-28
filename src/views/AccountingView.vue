<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BaseModal from '../components/BaseModal.vue'

const store = useMainStore()

// ==========================================
// 🛡️ 終極防護：斬斷時區法 (與 Dashboard / Clients 統一)
// ==========================================

const parseLocal = (dateStr) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  
  let cleanStr = String(dateStr).slice(0, 19);
  cleanStr = cleanStr.replace(/-/g, '/').replace('T', ' ');
  return new Date(cleanStr); 
}

// 取得本地的 YYYY-MM-DD (用於表單預設值)
const getLocalYMD = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const showExpModal = ref(false)
const editingTxn = ref(null)
const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat', '股東'])
const incCategories = ['公司票', '其他收入']
const expCategories = ['廣告費用', '觀塘租金', '中環租金', '馬拉松費用', '產品採購', '支付30%', '其他支出']

const expForm = ref({
  type: 'expense',
  amount: '',
  note: '',
  client_name: '', 
  staff: staffList.value[0],
  category: '廣告費用',
  ad_inquiries: 0,
  ad_phones: 0,
  date: getLocalYMD() // 🛡️ 確保一打開表單就是無時差的本地日期
})

const activeClientsOptions = computed(() => {
  return store.clients.map(c => c.name).sort((a,b) => a.localeCompare(b, 'zh-HK'))
})

const getDisplayData = (t) => {
  let client = t.client_name || null
  let text = t.note || '無備註'
  
  const m = text.match(/^【(.*?)】\s*(.*)$/)
  if (m) {
    if (!client) client = m[1]
    text = m[2] || '無其他備註'
  } 
  else if (client && text.startsWith(client + ' (')) {
    text = text.replace(client + ' ', '')
  }
  
  return { client, text }
}

const groupedTxns = computed(() => {
  const g = {}
  store.transactions.forEach(t => {
    // 🛡️ 讀取時，使用 parseLocal 斬斷時區，並手動組成 DD/MM/YYYY
    const dObj = parseLocal(t.created_at)
    const dd = String(dObj.getDate()).padStart(2, '0')
    const mm = String(dObj.getMonth() + 1).padStart(2, '0')
    const yyyy = dObj.getFullYear()
    const d = `${dd}/${mm}/${yyyy}`
    
    if (!g[d]) g[d] = []
    g[d].push(t)
  })
  return Object.entries(g).map(([date, items]) => ({ date, items })).sort((a,b)=>{
    // 解析 DD/MM/YYYY 排序
    const [d1, m1, y1] = a.date.split('/')
    const [d2, m2, y2] = b.date.split('/')
    return new Date(`${y2}-${m2}-${d2}`) - new Date(`${y1}-${m1}-${d1}`)
  })
})

// 🚀 功能：複刻訂單 (再來一套)
function handleRepeatOrder(t) {
  const { client, text } = getDisplayData(t)
  let items = []
  
  // 智能解析格式：(蛋白素(士多啤梨)x2, 蘆薈汁(芒果)x1)
  const match = t.note.match(/\((.*?)\)$/)
  if (match) {
    const parts = match[1].split(', ')
    parts.forEach(p => {
      const lastX = p.lastIndexOf('x')
      if (lastX !== -1) {
        items.push({
          name: p.substring(0, lastX).trim(),
          qty: parseInt(p.substring(lastX + 1))
        })
      }
    })
  }

  // 將資料存入 Store，通知零售頁面
  store.pendingRepeatOrder = {
    clientName: client,
    branch: t.branch,
    items: items
  }

  // 透過 store.view 跳轉到零售頁面
  store.view = 'retail'
}

function openExpForm() {
  editingTxn.value = null
  expForm.value = {
    type: 'expense', amount: '', note: '', client_name: '', staff: staffList.value[0],
    category: '廣告費用', ad_inquiries: 0, ad_phones: 0, 
    date: getLocalYMD() // 🛡️ 重置時依然獲取本地日期
  }
  showExpModal.value = true
}

function openEditTransaction(t) {
  editingTxn.value = t.id

  let extractedClient = t.client_name || ''
  let extractedNote = t.note || ''
  
  const match = extractedNote.match(/^【(.*?)】\s*(.*)$/)
  if (match) {
    if (!extractedClient) extractedClient = match[1]
    extractedNote = match[2]
  } else if (extractedClient && extractedNote.startsWith(extractedClient + ' (')) {
    extractedNote = extractedNote.replace(extractedClient + ' ', '')
  }

  expForm.value = {
    type: t.type, amount: t.amount, 
    note: extractedNote, 
    client_name: extractedClient, 
    staff: t.staff || t.handled_by || '',
    category: t.category, ad_inquiries: t.ad_inquiries || 0, ad_phones: t.ad_phones || 0,
    date: getLocalYMD(parseLocal(t.created_at)) // 🛡️ 讀取舊紀錄時，斬斷時區再提取 YYYY-MM-DD
  }
  showExpModal.value = true
}

async function saveTransaction() {
  if (!expForm.value.amount) return alert('請輸入金額！')
  
  const { data: authData } = await supabase.auth.getSession()
  const userEmail = authData?.session?.user?.email
  if (!userEmail) return alert('⚠️ 無法取得帳號資訊，請重新登入！')
  
  let finalNote = expForm.value.note || ''
  if (expForm.value.client_name && !finalNote.startsWith(`【${expForm.value.client_name}】`)) {
    finalNote = `【${expForm.value.client_name}】 ${finalNote}`.trim()
  }

  const amt = Number(expForm.value.amount)
  
  const data = { 
    ...expForm.value, 
    amount: amt, 
    note: finalNote, 
    client_name: expForm.value.client_name || null, 
    own_email: userEmail, 
    profit: expForm.value.type === 'income' ? amt : -amt,
    handled_by: expForm.value.staff 
  }
  
  delete data.date 

  if (data.category !== '廣告費用') { data.ad_inquiries = 0; data.ad_phones = 0 }
  
  // 🛡️ 寫入資料庫：終極防呆！偽裝成 UTC！
  // 取得當下的本地時分秒
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  
  // 組合：你選的日期 + 現在的時分秒 + "Z" (騙過 Supabase，讓它直接存下這組數字)
  const finalISOString = `${expForm.value.date}T${hh}:${mm}:${ss}Z`

  const updatePayload = { ...data, created_at: finalISOString }

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

// 🚀 終極強化：刪除流水帳並「自動智能退回庫存」 (支援零售退貨 與 採購退貨)
async function handleDeleteTransaction(t) {
  if (!confirm('⚠️ 確定要永久刪除這筆紀錄嗎？\n(若包含零售/自用/採購紀錄，系統將自動同步校正庫存)')) return

  // 1. 取得使用者資訊 (補庫存需要 user_id)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('⚠️ 無法取得帳號資訊，請重新登入！')

  // 2. 智能解析備註，尋找需要處理的產品
  let itemsToRefund = []
  let isProcurement = false // 標記是否為採購退貨
  
  if (t.category === '零售收入' && t.note) {
    // 💡 解析零售格式：王小明 (蛋白素(士多啤梨)x2, 蘆薈汁(芒果)x1) -> 刪除要補回庫存 (+)
    const match = t.note.match(/\((.*?)\)$/)
    if (match) {
      const itemsStr = match[1]
      const parts = itemsStr.split(', ')
      parts.forEach(p => {
        const lastXIndex = p.lastIndexOf('x')
        if (lastXIndex !== -1) {
          const pName = p.substring(0, lastXIndex).trim()
          const pQty = parseInt(p.substring(lastXIndex + 1))
          if (pName && !isNaN(pQty)) itemsToRefund.push({ name: pName, qty: pQty })
        }
      })
    }
  } else if (t.category === '自用消耗' && t.note) {
    // 💡 解析自用格式：提取自用: 蛋白素(士多啤梨) x2 -> 刪除要補回庫存 (+)
    const match = t.note.match(/提取自用:\s*(.*?)\s*x(\d+)$/)
    if (match) {
      itemsToRefund.push({ name: match[1].trim(), qty: parseInt(match[2]) })
    }
  } else if (t.category === '產品採購' && t.note) {
    // 💡 解析採購格式：批量採購 (蛋白素(士多啤梨)x10, 茶x5) -> 刪除要扣除庫存 (-)
    isProcurement = true
    const match = t.note.match(/\((.*?)\)$/)
    if (match) {
      const itemsStr = match[1]
      const parts = itemsStr.split(', ')
      parts.forEach(p => {
        const lastXIndex = p.lastIndexOf('x')
        if (lastXIndex !== -1) {
          const pName = p.substring(0, lastXIndex).trim()
          const pQty = parseInt(p.substring(lastXIndex + 1))
          if (pName && !isNaN(pQty)) itemsToRefund.push({ name: pName, qty: pQty })
        }
      })
    }
  }

  // 3. 刪除資料庫中的該筆交易紀錄
  const { error } = await supabase.from('transactions').delete().eq('id', t.id)
  if (error) return alert('刪除失敗: ' + error.message)

  // 4. 自動退回 / 扣減庫存程序
  if (itemsToRefund.length > 0) {
    let stockUpdateFailed = false
    
    for (const item of itemsToRefund) {
      // 查詢現在真實的庫存
      const { data: stockData } = await supabase.from('stock')
        .select('quantity')
        .eq('prod_name', item.name)
        .eq('branch', t.branch || '觀塘')
        .eq('user_id', user.id)
        .maybeSingle()

      const currentQty = stockData ? stockData.quantity : 0
      
      // 🚀 核心邏輯判斷：如果是採購退貨就減掉，如果是零售退貨就加回來
      const newQty = isProcurement 
                     ? currentQty - item.qty 
                     : currentQty + item.qty 

      if (stockData) {
        const { error: updateErr } = await supabase.from('stock')
          .update({ quantity: newQty })
          .eq('prod_name', item.name)
          .eq('branch', t.branch || '觀塘')
          .eq('user_id', user.id)
        if (updateErr) stockUpdateFailed = true
      } else {
        // 如果原本沒資料，就建立並寫入退回數量
        const { error: insertErr } = await supabase.from('stock')
          .insert({
            prod_name: item.name,
            branch: t.branch || '觀塘',
            quantity: newQty,
            user_id: user.id,
            own_email: user.email
          })
        if (insertErr) stockUpdateFailed = true
      }
    }

    if (stockUpdateFailed) {
      alert('⚠️ 流水帳已刪除，但部分庫存校正失敗！請手動至「庫存管理」確認。')
    } else {
      if (isProcurement) {
        alert('✅ 採購紀錄已刪除，剛剛進的貨已經從庫存中自動扣除了！')
      } else {
        alert('✅ 紀錄已成功刪除，扣除的庫存已自動補回！')
      }
    }
  } else {
    // 如果不是零售或自用或採購，就一般刪除
    alert('✅ 紀錄已成功刪除')
  }

  // 5. 重新同步最新數據到畫面
  await store.syncAll()
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
            
            <div class="t-header-row">
              <div class="t-cat">{{ t.category }}</div>
              <div v-if="getDisplayData(t).client" class="t-client-highlight">
                👤 客戶：{{ getDisplayData(t).client }}
              </div>
              <button v-if="t.category === '零售收入'" class="repeat-btn" @click="handleRepeatOrder(t)">🔁 再來一套</button>
            </div>
            
            <div class="t-desc-box">
              <div class="t-desc">
                <span class="icon-lbl">📝 項目/備註:</span> 
                <span class="t-desc-val">{{ getDisplayData(t).text }}</span>
              </div>
              <div class="t-desc" style="margin-top: 6px;">
                <span class="icon-lbl">💼 經手(收款):</span> 
                <span class="t-staff">{{ t.staff || t.handled_by || '未記錄' }}</span>
              </div>
            </div>

            <div v-if="t.category==='廣告費用' && (t.ad_inquiries>0 || t.ad_phones>0)" class="t-ad">
              廣告回報: {{ t.ad_inquiries }} 查詢 / {{ t.ad_phones }} 電話
            </div>
          </div>
          
          <div style="text-align:right;display:flex;align-items:center;gap:10px; margin-left: 10px;">
            <div class="t-amt" :class="t.type==='income'?'g':'r'">
              {{ t.type==='income'?'+':'-' }}${{ t.amount }}
            </div>
            <div style="display:flex; flex-direction:column; gap:5px;">
              <button class="icon-btn" @click="openEditTransaction(t)">✏️</button>
              <button class="icon-btn" style="color:#ef4444;" @click="handleDeleteTransaction(t)">🗑️</button>
            </div>
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
          <option v-if="expForm.type==='income' && !incCategories.includes('零售收入')" value="零售收入">零售收入</option>
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
        <label>📝 補充購買項目 / 備註</label>
        <input class="modern-inp" v-model="expForm.note" placeholder="例如：售出 35點套票 / 送搖搖杯">
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
.txn-item { display: flex; align-items: center; padding: 18px 0; border-bottom: 1px dashed #e2e8f0; }
.txn-item:last-child { border-bottom: none; }
.t-header-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.t-cat { font-weight: 900; font-size: 13px; color: #475569; background: #f1f5f9; padding: 4px 10px; border-radius: 8px; border: 1px solid #e2e8f0;}
.t-client-highlight { font-weight: 900; font-size: 14px; color: #ec4899; background: #fdf2f8; padding: 4px 10px; border-radius: 8px; border: 1px solid #fbcfe8; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(236,72,153,0.1);}

/* 🚀 新增按鈕樣式 */
.repeat-btn { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 900; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center;}
.repeat-btn:active { transform: scale(0.95); background: #c7d2fe; }

.t-desc-box { background: white; border-left: 3px solid #cbd5e1; padding-left: 12px; margin-bottom: 6px; }
.t-desc { font-size: 13px; color: #64748b; font-weight: 600; display: flex; align-items: flex-start; gap: 6px; line-height: 1.4; }
.icon-lbl { font-size: 12px; font-weight: 800; color: #94a3b8; white-space: nowrap; margin-top: 1px;}
.t-desc-val { color: #1e293b; font-weight: 900; font-size: 15px; } 
.t-staff { font-weight: 900; color: #4f46e2; font-size: 14px; } 
.t-ad { font-size: 11px; color: #d97706; margin-top: 8px; font-weight: 800; background: #fff7ed; display: inline-block; padding: 4px 8px; border-radius: 6px; }
.t-amt { font-weight: 900; font-size: 22px; }
.t-amt.g { color: #10b981; }
.t-amt.r { color: #ef4444; }
.icon-btn { background: #f1f5f9; border: none; font-size: 14px; padding: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
.icon-btn:active { transform: scale(0.9); }
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