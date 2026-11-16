<script setup>
import { computed, ref } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase, isReadOnlyPreview } from '../supabase'
import { downloadAccountBackup } from '../accountBackup'
import { classifyHistoryImport, historyImportPayload, normalizeHistoryDate, parseHistoryImport } from '../historyImport'

const store = useMainStore()
const demo = isReadOnlyPreview && new URLSearchParams(window.location.search).has('demo')
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const mode = ref('batch')
const singleDate = ref(localStorage.getItem('bz_backfill_date') || '')
const singleTime = ref('12:00')
const singleType = ref('income')
const branch = ref(localStorage.getItem('bz_last_branch') || '觀塘')
const staff = ref(store.currentUser || '')
const sourceText = ref('')
const review = ref(null)
const busy = ref(false)
const message = ref('')
const backupMessage = ref('')
const selectedRows = computed(() => review.value?.rows.filter(row => row.selected && row.duplicate !== 'exact') || [])
const exactCount = computed(() => review.value?.rows.filter(row => row.duplicate === 'exact').length || 0)
const possibleCount = computed(() => review.value?.rows.filter(row => row.duplicate === 'possible').length || 0)

function singleEntry() {
  if (!normalizeHistoryDate(singleDate.value) || singleDate.value > today) {
    message.value = '請先揀一個有效嘅舊日期。'
    return
  }
  localStorage.setItem('bz_backfill_date', singleDate.value)
  if (['觀塘', '中環', '佐敦'].includes(branch.value)) localStorage.setItem('bz_last_branch', branch.value)
  store.pendingQuickEntry = { kind: 'transaction', type: singleType.value, date: singleDate.value, time: singleTime.value, branch: branch.value }
  store.view = 'accounting'
}

function openPurchaseImport() {
  store.pendingOpenPurchaseImport = true
  store.view = 'clients'
}

function openClientEntry() {
  store.pendingQuickEntry = { kind: 'client' }
  store.view = 'clients'
}

function downloadTemplate() {
  const csv = '\uFEFF日期,時間,收支,分類,金額,成本,客戶,分店,經手人,備註\n2024-06-03,14:30,收入,運動套票,880,399,示例客戶,觀塘,Kwan,售出10點套票\n2024-06-04,,支出,廣告費用,500,,,中環,Cat,IG廣告\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'BZ舊紀錄回補範本.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

async function fileChanged(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 2_000_000) { message.value = '檔案太大，請按年份或月份分開匯入。'; return }
  sourceText.value = await file.text()
  review.value = null
  message.value = '檔案已讀取，按「檢查資料」先睇清楚。'
}

async function fetchExisting(rows, user) {
  if (demo) return store.transactions
  const first = rows.reduce((min, row) => row.date < min ? row.date : min, rows[0].date)
  const last = rows.reduce((max, row) => row.date > max ? row.date : max, rows[0].date)
  const found = []
  for (let start = 0; start < 20000; start += 500) {
    const { data, error } = await supabase.from('transactions')
      .select('id,created_at,type,category,amount,client_name,branch')
      .eq('owner_email', user.email)
      .gte('created_at', `${first}T00:00:00+08:00`)
      .lte('created_at', `${last}T23:59:59.999+08:00`)
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(start, start + 499)
    if (error) throw error
    found.push(...(data || []))
    if ((data || []).length < 500) return found
  }
  throw new Error('舊紀錄太多，請按月份分開檢查，避免漏咗重複資料。')
}

async function analyze() {
  busy.value = true
  message.value = ''
  review.value = null
  try {
    const parsed = parseHistoryImport(sourceText.value, { branch: branch.value, staff: staff.value, today })
    if (!parsed.rows.length) { review.value = { rows: [], errors: parsed.errors }; message.value = '冇可回補嘅資料，請按行號修正。'; return }
    const user = demo ? { id: 'local-demo', email: 'demo@example.com' } : (await supabase.auth.getUser()).data?.user
    if (!user?.email) throw new Error('登入已失效，請重新登入。')
    const existing = await fetchExisting(parsed.rows, user)
    review.value = { rows: classifyHistoryImport(parsed.rows, existing), errors: parsed.errors }
    message.value = '已比對現有紀錄。紅色重複項目會自動排除；黃色同日同額項目請先核對。'
  } catch (error) {
    message.value = `檢查失敗：${error.message}`
  } finally { busy.value = false }
}

async function saveSelected() {
  if (busy.value || !selectedRows.value.length) return
  if (isReadOnlyPreview) { message.value = '預覽版只供查看；正式版先可以儲存。'; return }
  busy.value = true
  message.value = '正在重新核對，防止同一筆紀錄重複匯入…'
  let inserted = 0
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user?.id || !user?.email) throw new Error('登入已失效，請重新登入。')
    const before = selectedRows.value
    const fresh = classifyHistoryImport(review.value.rows, await fetchExisting(review.value.rows, user))
    const newlyFlagged = fresh.some(row => before.some(old => old.id === row.id && old.duplicate === 'none' && row.duplicate !== 'none'))
    if (newlyFlagged) {
      review.value.rows = fresh.map(row => row.duplicate === 'none' ? row : { ...row, selected: false })
      message.value = '檢查期間有紀錄新增咗；已更新重複提示，請重新核對選擇。'
      return
    }
    const selected = fresh.filter(row => row.selected && row.duplicate !== 'exact')
    if (!selected.length) {
      review.value.rows = fresh.map(row => row.duplicate === 'none' ? row : { ...row, selected: false })
      message.value = '呢啲紀錄已存在，請重新檢查後再揀。'
      return
    }
    const possible = selected.filter(row => row.duplicate === 'possible').length
    if (!confirm(`準備新增 ${selected.length} 筆舊收支紀錄${possible ? `，當中 ${possible} 筆同日同額需要你再核對` : ''}。\n\n只會新增交易，不會修改客戶或庫存。確認繼續？`)) {
      message.value = '已取消匯入，資料未有改動。'
      return
    }
    for (let i = 0; i < selected.length; i += 50) {
      const chunk = selected.slice(i, i + 50).map(row => historyImportPayload(row, user, store.clients))
      const { data, error } = await supabase.from('transactions').insert(chunk).select('id')
      if (error) throw error
      if ((data || []).length !== chunk.length) throw new Error('寫入筆數未能核實，請先重新檢查，唔好即刻再匯入。')
      inserted += data.length
    }
    await store.syncAll()
    await store.loadAllTransactions()
    review.value = null
    message.value = `完成新增 ${inserted} 筆舊紀錄。原有交易、客戶同庫存都冇被覆蓋。`
  } catch (error) {
    if (inserted) await store.syncAll()
    message.value = `已新增 ${inserted} 筆後停止：${error.message}。重新按「檢查資料」可核對已寫入嘅項目，請勿直接再按儲存。`
  } finally { busy.value = false }
}

async function backup() {
  if (demo) { backupMessage.value = '示範版冇正式資料需要備份。'; return }
  busy.value = true
  backupMessage.value = '正在整理你嘅現有資料…'
  try {
    const counts = await downloadAccountBackup()
    backupMessage.value = `已下載備份：交易 ${counts.transactions || 0} 筆、客戶 ${counts.clients || 0} 位。`
  } catch (error) { backupMessage.value = `備份未完成：${error.message}` }
  finally { busy.value = false }
}
</script>

<template>
  <main class="bz-history">
    <header class="bz-history-head"><span>慢慢補，唔使一次做晒</span><h1>回補舊紀錄</h1><p>一筆筆補，或者由 Excel 貼成批。每筆都會保留原本日期；成批資料會先檢查重複。</p></header>
    <div class="bz-history-modes" role="tablist" aria-label="回補方式">
      <button type="button" role="tab" :aria-selected="mode==='single'" :class="{active:mode==='single'}" @click="mode='single'">✍️ 補一筆</button>
      <button type="button" role="tab" :aria-selected="mode==='batch'" :class="{active:mode==='batch'}" @click="mode='batch'">📋 貼 Excel／CSV</button>
    </div>

    <section v-if="mode==='single'" class="bz-history-card">
      <h2>1. 揀返當日日期</h2><p>輸入過去嘅日子，再去熟悉嘅收支表填金額。下次會記住呢個日期。</p>
      <label>舊紀錄日期<input v-model="singleDate" type="date" :max="today"></label>
      <label>當時時間（唔記得就用 12:00）<input v-model="singleTime" type="time"></label>
      <div class="bz-history-choice" role="group" aria-label="收支類型"><button type="button" :class="{active:singleType==='income'}" @click="singleType='income'">＋ 收入</button><button type="button" :class="{active:singleType==='expense'}" @click="singleType='expense'">− 支出</button></div>
      <label>分店<select v-model="branch" @change="review=null"><option>觀塘</option><option>中環</option><option>佐敦</option></select></label>
      <button class="bz-history-primary" type="button" @click="singleEntry">下一步：填金額 <span aria-hidden="true">→</span></button>
    </section>

    <section v-else class="bz-history-card">
      <h2>1. 貼上或揀檔案</h2><p>收支紀錄由 Excel／Google Sheets 複製連標題嘅整個範圍貼上；亦可讀取 CSV。唔使逐筆重新入。</p>
      <div class="bz-history-file-actions"><button type="button" @click="downloadTemplate">下載簡單範本</button><label>揀 CSV／TSV 檔<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" @change="fileChanged"></label></div>
      <label>貼上表格<textarea v-model="sourceText" placeholder="日期　收支　金額　分類　客戶　分店…" @input="review=null"></textarea></label>
      <div class="bz-history-defaults"><label>冇填分店時用<select v-model="branch" @change="review=null"><option>觀塘</option><option>中環</option><option>佐敦</option></select></label><label>冇填經手人時用<input v-model="staff" placeholder="可留空" @input="review=null"></label></div>
      <button class="bz-history-primary" type="button" :disabled="busy || !sourceText.trim()" @click="analyze">{{ busy ? '檢查中…' : '2. 檢查資料及重複項目' }}</button>
      <div v-if="review" class="bz-history-review">
        <h2>3. 睇清楚先儲存</h2>
        <p class="bz-history-summary">讀到 {{ review.rows.length }} 筆 · 可新增 {{ selectedRows.length }} 筆 · 重複 {{ exactCount }} 筆 · 要核對 {{ possibleCount }} 筆</p>
        <div v-if="review.errors.length" class="bz-history-errors" role="alert"><strong>{{ review.errors.length }} 行未能讀取，唔會匯入：</strong><span v-for="error in review.errors.slice(0, 10)" :key="error.line">第 {{ error.line }} 行：{{ error.reason }}</span><small v-if="review.errors.length>10">仲有 {{ review.errors.length-10 }} 行；請分批修正。</small></div>
        <div class="bz-history-rows"><label v-for="row in review.rows" :key="row.id" class="bz-history-row" :class="row.duplicate">
          <input v-model="row.selected" type="checkbox" :disabled="row.duplicate==='exact'">
          <span><strong>{{ row.date }} · {{ row.type==='income'?'收入':'支出' }} HK$ {{ row.amount }}</strong><small>{{ row.category }} · {{ row.client_name || '無客戶' }} · {{ row.branch }}</small><em>{{ row.duplicate==='exact'?'已有相同紀錄，已排除':row.duplicate==='possible'?'同日同額，請核對後先勾選':'可新增' }}</em></span>
        </label></div>
        <button class="bz-history-primary" type="button" :disabled="busy || isReadOnlyPreview || !selectedRows.length || review.errors.length>0" @click="saveSelected">{{ isReadOnlyPreview ? '預覽版只供查看，正式版先可儲存' : `確認新增 ${selectedRows.length} 筆` }}</button>
        <p v-if="review.errors.length" class="bz-history-hint">請先修正錯誤行，再按「檢查資料」；系統唔會靜靜漏掉嗰啲紀錄。</p>
      </div>
    </section>

    <p v-if="message" class="bz-history-message" role="status">{{ message }}</p>
    <section class="bz-history-next"><h2>舊客戶同套票點補？</h2><p>單個舊客戶可直接新增；有兩年套票清單，可用專用匯入器配對客戶同有效期。</p><div class="bz-history-next-actions"><button type="button" @click="openClientEntry">新增舊客戶 →</button><button type="button" @click="openPurchaseImport">匯入套票清單 →</button></div></section>
    <section class="bz-history-backup"><div><h2>想先留底？</h2><p>可下載現有帳戶資料備份，再慢慢回補。</p></div><button type="button" :disabled="busy" @click="backup">下載備份</button><small v-if="backupMessage" role="status">{{ backupMessage }}</small></section>
  </main>
</template>

<style scoped>
.bz-history { max-width:730px; margin:0 auto; padding:23px 15px 65px; color:var(--t); }
.bz-history-head span { color:var(--p); font-size:11px; font-weight:800; letter-spacing:.08em; }.bz-history-head h1 { margin:5px 0; font-size:29px; font-family:Georgia,"Noto Serif TC",serif; }.bz-history-head p { margin:0; color:var(--t2); font-size:13px; line-height:1.6; }
.bz-history-modes { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:22px 0 13px; }.bz-history-modes button { min-height:49px; border:1px solid var(--border); border-radius:14px; background:#fffaf5; color:var(--t2); font-size:14px; font-weight:800; }.bz-history-modes button.active { border-color:var(--p); background:var(--p); color:#fff; }
.bz-history-card,.bz-history-next,.bz-history-backup { border:1px solid var(--border); border-radius:20px; background:#fffaf5; box-shadow:var(--bz-shadow); padding:19px; }.bz-history-card h2,.bz-history-next h2,.bz-history-backup h2 { margin:0 0 6px; font-size:18px; }.bz-history-card p,.bz-history-next p,.bz-history-backup p { margin:0 0 15px; color:var(--t2); font-size:12px; line-height:1.6; }
.bz-history-card label { display:flex; flex-direction:column; gap:6px; margin:13px 0; color:var(--t2); font-size:12px; font-weight:800; }.bz-history-card input:not([type=file]):not([type=checkbox]),.bz-history-card select,.bz-history-card textarea { width:100%; min-height:46px; border:1px solid #dbcabd; border-radius:12px; background:#fff; color:var(--t); padding:10px 12px; font-size:16px; box-sizing:border-box; }.bz-history-card textarea { min-height:125px; resize:vertical; line-height:1.5; }
.bz-history-choice { display:grid; grid-template-columns:1fr 1fr; gap:9px; }.bz-history-choice button { min-height:46px; border:1px solid var(--border); border-radius:12px; background:#fff; color:var(--t2); font-weight:800; }.bz-history-choice button.active { border-color:var(--p); background:var(--ps); color:var(--pd); }
.bz-history-primary { width:100%; min-height:48px; border:0; border-radius:13px; background:var(--p); color:white; font-size:15px; font-weight:800; }.bz-history-primary:disabled { opacity:.55; }.bz-history-primary span { margin-left:5px; }
.bz-history-file-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }.bz-history-file-actions button,.bz-history-file-actions label { min-height:43px; display:grid; place-items:center; margin:0; border:1px solid #d6baa7; border-radius:11px; background:#f8ece2; color:var(--pd); font-size:12px; font-weight:800; text-align:center; }.bz-history-file-actions input { display:none; }.bz-history-defaults { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.bz-history-review { margin-top:22px; padding-top:18px; border-top:1px solid var(--border); }.bz-history-summary { padding:10px 12px; border-radius:11px; background:#f5eee7; font-weight:700; }.bz-history-errors { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; padding:12px; border-radius:11px; background:#fff0e9; color:#a54731; font-size:12px; }.bz-history-rows { max-height:360px; overflow:auto; margin:12px 0; border:1px solid var(--border); border-radius:12px; }.bz-history-card .bz-history-row { display:flex; flex-direction:row; align-items:flex-start; gap:10px; margin:0; padding:11px; border-bottom:1px solid var(--border); }.bz-history-row:last-child { border:0; }.bz-history-row input { width:18px; height:18px; flex:none; accent-color:var(--p); }.bz-history-row > span { display:flex; flex-direction:column; gap:3px; min-width:0; }.bz-history-row strong { color:var(--t); font-size:13px; }.bz-history-row small { color:var(--t3); font-size:11px; }.bz-history-row em { color:var(--g); font-size:11px; font-style:normal; }.bz-history-row.exact { background:#fff1ed; }.bz-history-row.exact em { color:#a54731; }.bz-history-row.possible { background:#fff9e8; }.bz-history-row.possible em { color:#9a692c; }.bz-history-hint { margin:9px 0 0!important; }
.bz-history-message { margin:12px 0; padding:12px; border:1px solid #e5c6ae; border-radius:12px; background:#fff4ea; color:var(--pd); font-size:12px; line-height:1.5; }.bz-history-next,.bz-history-backup { margin-top:13px; }.bz-history-next-actions { display:flex; gap:8px; flex-wrap:wrap; }.bz-history-next button,.bz-history-backup button { min-height:40px; padding:0 14px; border:1px solid #d6baa7; border-radius:11px; background:#f8ece2; color:var(--pd); font-size:12px; font-weight:800; }.bz-history-next p,.bz-history-backup p { margin-bottom:9px; }.bz-history-backup { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }.bz-history-backup small { width:100%; color:var(--g); font-size:11px; }
@media(max-width:430px) { .bz-history { padding:17px 13px 65px; }.bz-history-card,.bz-history-next,.bz-history-backup { padding:15px; }.bz-history-head h1 { font-size:26px; }.bz-history-file-actions { grid-template-columns:1fr; } }
</style>
