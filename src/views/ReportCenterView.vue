<script setup>
import { computed, ref } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { calculateReport, calculateTrialFunnel, reportPeriod } from '../reportMath'
import { supabase, isReadOnlyPreview } from '../supabase'
import { downloadOwnedTransactionsBackup } from '../transactionsBackup'
import { candidatePaidTrials, planTrialCorrection, trialCorrectionRecord, sameTrialSource } from '../trialCorrection'

const store = useMainStore()
const periodType = ref('month')
const branch = ref('全部分店')
const customStart = ref('')
const customEnd = ref('')
const selectedCategory = ref('')
const showReviewOnly = ref(false)
const showAllRows = ref(false)
const refreshing = ref(false)
const correctionReview = ref(null)
const correctionConfirmed = ref(false)
const correctionBusy = ref(false)
const correctionError = ref('')
const correctionMessage = ref('')
const correctionCandidates = computed(() => correctionReview.value ?
  candidatePaidTrials(correctionReview.value, store.transactions) : [])
const correctionPlan = computed(() => {
  if (!correctionReview.value || correctionCandidates.value.length !== 1) return null
  try { return planTrialCorrection(correctionReview.value, correctionCandidates.value[0], store.transactions) }
  catch { return null }
})
const period = computed(() => reportPeriod(periodType.value, new Date(), customStart.value, customEnd.value))
const validPeriod = computed(() => periodType.value !== 'custom' ||
  Boolean(customStart.value && customEnd.value && customStart.value <= customEnd.value))
const report = computed(() => validPeriod.value ? calculateReport(store.transactions, period.value, branch.value) : null)
const funnel = computed(() => validPeriod.value ? calculateTrialFunnel(store.clients, period.value, branch.value) : null)
const complete = computed(() => !store.hasMoreTxn && !store.isFetchingMore && !store.transactionsLoadError && !store.clientsLoadError && !store.isSyncing)
const rowsToShow = computed(() => {
  const all = (report.value?.rows || []).filter(row => !selectedCategory.value ||
    `${row.kind}:${row.category || '未分類'}` === selectedCategory.value)
    .filter(row => !showReviewOnly.value || row.profitNeedsReview || row.dateNeedsReview)
  return showAllRows.value ? all : all.slice(0, 12)
})
const totalRows = computed(() => (report.value?.rows || []).filter(row => !selectedCategory.value ||
  `${row.kind}:${row.category || '未分類'}` === selectedCategory.value)
  .filter(row => !showReviewOnly.value || row.profitNeedsReview || row.dateNeedsReview).length)
const activeClients = computed(() => store.clients.filter(c => c.status === 'active' &&
  (branch.value === '全部分店' || c.branch === branch.value)).length)
const formatMoney = value => value === null || value === undefined ? '—' :
  new Intl.NumberFormat('zh-HK', { style: 'currency', currency: 'HKD', maximumFractionDigits: 2 }).format(value)
const categoryLabel = kind => kind === 'income' ? '收入' : kind === 'expense' ? '支出' : '其他'
const trialTime = value => {
  const raw = String(value || '')
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return raw || '未填'
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour12: false })
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await store.syncAll()
    await store.loadAllTransactions()
  } finally { refreshing.value = false }
}

function openCorrection(row) {
  correctionReview.value = correctionReview.value?.id === row.id ? null : row
  correctionConfirmed.value = false
  correctionError.value = ''
  correctionMessage.value = ''
}

async function saveTrialCorrection(row) {
  if (isReadOnlyPreview || correctionBusy.value || !complete.value || !correctionConfirmed.value) return
  const paid = correctionCandidates.value[0]
  const plan = correctionPlan.value
  if (!paid || !plan) { correctionError.value = '配對資料已變，請重新讀取同核對。'; return }
  if (!confirm(`已核對 ${row.client_name || '呢位客戶'} 嘅兩筆紀錄屬同一次試堂？\n收費試堂：${trialTime(paid.created_at)}，利潤 HK$${plan.paidProfit.toFixed(2)}\n原調整：${trialTime(row.created_at)}，利潤 HK$${plan.adjustmentProfit.toFixed(2)}\n會先下載全份交易備份，再新增 HK$${plan.correction.toFixed(2)} 更正；原有兩筆交易不改。`)) return
  correctionBusy.value = true
  correctionError.value = ''
  let entry = null
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user?.id || !user?.email) throw new Error('登入已失效，請重新登入。')
    const freshRows = await downloadOwnedTransactionsBackup(user)
    const freshAdjustment = freshRows.find(item => item.id === row.id)
    const freshPaid = freshRows.find(item => item.id === paid.id)
    if (!sameTrialSource(row, freshAdjustment) || !sameTrialSource(paid, freshPaid)) {
      throw new Error('原有交易喺核對期間已變；冇寫入更正，請重新讀取。')
    }
    const freshPlan = planTrialCorrection(freshAdjustment, freshPaid, freshRows)
    entry = await trialCorrectionRecord(freshAdjustment, freshPaid, freshPlan, user)
    const { data: already, error: existingError } = await supabase.from('transactions')
      .select('id').eq('id', entry.id).eq('owner_email', user.email).maybeSingle()
    if (existingError) throw existingError
    if (already) throw new Error('呢次試堂已有更正紀錄，毋須重複入帳。')
    const { data: created, error: insertError } = await supabase.from('transactions').insert(entry).select().single()
    if (insertError) throw insertError
    const { data: verified, error: verifyError } = await supabase.from('transactions')
      .select('*').eq('id', entry.id).eq('owner_email', user.email).single()
    if (verifyError || !verified || Number(verified.profit) !== entry.profit || verified.note !== entry.note) {
      throw new Error('更正已送出，但未能核實；請重新讀取帳目，勿重複操作。')
    }
    if (!store.transactions.some(item => item.id === entry.id)) store.transactions.unshift(verified || created)
    correctionReview.value = null
    correctionMessage.value = `已新增 HK$${freshPlan.correction.toFixed(2)} 試堂利潤更正；原有交易保留，備份已下載。`
  } catch (cause) {
    if (entry) {
      const { data: confirmed } = await supabase.from('transactions').select('*').eq('id', entry.id).maybeSingle()
      if (confirmed && confirmed.note === entry.note && Number(confirmed.profit) === entry.profit) {
        if (!store.transactions.some(item => item.id === entry.id)) store.transactions.unshift(confirmed)
        correctionReview.value = null
        correctionMessage.value = '已核實更正紀錄成功保存；原有交易保留。'
        return
      }
    }
    correctionError.value = cause?.message || '更正未完成，請重新讀取帳目。'
  } finally { correctionBusy.value = false }
}

function exportCsv() {
  if (!complete.value || !validPeriod.value || !report.value) return
  const quote = value => {
    const raw = String(value ?? '')
    const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
  const cells = rows => rows.map(row => row.map(quote).join(',')).join('\r\n')
  const summary = [
    ['BZ 記錄器｜數據中心', `${period.value.start || '最早'} 至 ${period.value.end || '最新'}`, branch.value],
    ['計算口徑', '香港日期；收入按交易 amount；毛利按交易 profit（缺漏時才用 amount − cost）；淨利 = 毛利 − 營運支出'],
    ['營業額', report.value.income], ['交易毛利', report.value.recordedGross],
    ['營運支出', report.value.operatingExpense], ['帳面淨利', report.value.net],
    ['現金支出總額', report.value.cashExpense], ['庫存採購及已計提舖頭款', report.value.excludedExpense],
    ['收入筆數', report.value.incomeCount], ['支出筆數', report.value.expenseCount],
    ['缺少利潤資料', report.value.missingProfit], ['未填成本欄位', report.value.missingCost],
    ['利潤資料待核對', report.value.profitReview], ['試堂收費與調整可能重複', report.value.trialOverlapReview], ['日期待核對', report.value.dateReview],
    [], ['日期（香港）', '類型', '分類', '分店', '客戶', '金額', '交易利潤', '核對狀態', '備註']
  ]
  const details = report.value.rows.map(t => [t.day, categoryLabel(t.kind), t.category || '未分類',
    t.branch || '', t.client_name || '', t.amount, t.profit,
    [t.trialOverlap ? '試堂利潤可能重複' : t.profitNeedsReview ? '利潤' : '', t.dateNeedsReview ? '日期' : ''].filter(Boolean).join('、'), t.note || ''])
  const csv = '\ufeff' + cells([...summary, ...details])
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `BZ-數據中心-${period.value.start || 'all'}-${period.value.end || 'all'}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <main class="bz-report">
    <header class="report-hero">
      <div class="hero-leaf" aria-hidden="true">✦</div>
      <p class="eyebrow">BZ RECORDS · DATA CENTER</p>
      <h1>數據中心</h1>
      <p>每個數字都有來源，帳目未齊會清楚標示。</p>
      <div class="report-filters">
        <label>期間<select v-model="periodType" @change="selectedCategory=''; showAllRows=false">
          <option value="today">今日</option><option value="week">最近 7 日</option>
          <option value="month">本月</option><option value="last_month">上月</option>
          <option value="all">全部紀錄</option><option value="custom">自訂日期</option>
        </select></label>
        <label>分店<select v-model="branch" @change="selectedCategory=''; showAllRows=false">
          <option>全部分店</option><option>佐敦</option><option>觀塘</option><option>中環</option>
        </select></label>
      </div>
      <div v-if="periodType === 'custom'" class="custom-dates">
        <label>由<input v-model="customStart" type="date"></label>
        <label>至<input v-model="customEnd" type="date"></label>
      </div>
      <div class="hero-actions">
        <span>{{ period.start || '最早' }} — {{ period.end === period.start ? '今日' : period.end || '最新' }} · {{ branch }}</span>
        <div><button type="button" :disabled="refreshing" @click="refresh">{{ refreshing ? '讀取中…' : '重新讀取' }}</button>
          <button type="button" :disabled="!complete || !validPeriod" @click="exportCsv">匯出明細</button></div>
      </div>
    </header>

    <div v-if="!validPeriod" class="report-alert">請選擇有效嘅開始同結束日期。</div>
    <template v-else>
      <section class="hero-metric" aria-labelledby="net-heading">
        <div><p class="eyebrow">{{ period.label }} · {{ branch }}</p><h2 id="net-heading">{{ report.profitReview || report.missingCost || report.missingProfit || report.dateReview || !complete ? '帳面淨利（暫算）' : '帳面淨利' }}</h2>
          <p>按已保存交易計算；不將庫存採購或已計入銷售成本嘅舖頭付款重複扣減。</p></div>
        <strong>{{ formatMoney(report.net) }}</strong>
        <small v-if="!complete">資料未齊 · 暫列</small>
        <small v-else-if="report.net === null">{{ report.missingProfit }} 筆利潤待補</small>
        <small v-else-if="report.profitReview || report.dateReview">按現有帳目暫算 · {{ report.profitReview + report.dateReview }} 筆待核對</small>
      </section>

      <div v-if="!complete" class="report-alert" role="status">
        <strong>{{ store.transactionsLoadError || store.clientsLoadError ? '資料讀取失敗' : '正在載入完整紀錄' }}</strong>
        <span>現時顯示 {{ store.transactions.length }} 筆交易；{{ store.transactionsLoadError || store.clientsLoadError || '未完成前，以下數字只供參考，匯出暫停。' }}</span>
      </div>
      <div v-if="report.missingProfit || report.missingCost || report.profitReview || report.dateReview" class="report-alert amber" role="status">
        <strong>有資料需要核對</strong>
        <span v-if="report.missingProfit">{{ report.missingProfit }} 筆收入冇利潤亦冇成本，淨利暫不顯示。</span>
        <span v-if="report.missingCost">{{ report.missingCost }} 筆收入未填成本欄位；已記錄嘅利潤照計，但請核對。</span>
        <span v-if="report.profitReview">{{ report.profitReview }} 筆收入需要核對；以下淨利只係按已存帳目暫算，未完成對帳。</span>
        <span v-if="report.trialOverlapReview">其中 {{ report.trialOverlapReview }} 筆未開卡調整連同較早嘅收費試堂利潤，未能對上整次試堂總利潤。普通試堂目標 HK$44.60；請先核對，系統不會暗中改舊帳。</span>
        <span v-if="report.dateReview">{{ report.dateReview }} 筆交易日期異常，請核對原始紀錄。</span>
      </div>

      <section class="metric-grid" aria-label="財務摘要">
        <article><span>01 · 營業額</span><strong>{{ formatMoney(report.income) }}</strong><small>{{ report.incomeCount }} 筆收入交易</small></article>
        <article><span>02 · 交易毛利</span><strong>{{ formatMoney(report.recordedGross) }}</strong><small>交易 profit；缺值才用 amount − cost</small></article>
        <article><span>03 · 營運支出</span><strong>{{ formatMoney(report.operatingExpense) }}</strong><small>{{ report.expenseCount }} 筆支出中需計入利潤嘅部分</small></article>
      </section>

      <section class="report-card equation" aria-label="計算方法">
        <div><span>計算方法</span><b>交易毛利 − 營運支出 = 帳面淨利</b></div>
        <p>{{ formatMoney(report.recordedGross) }} − {{ formatMoney(report.operatingExpense) }} = {{ formatMoney(report.net) }}</p>
        <small>另外有 {{ formatMoney(report.excludedExpense) }} 現金支出屬「產品採購／支付30%」，已列入現金流水，避免同銷售交易內嘅成本重複扣利潤。現金支出總額：{{ formatMoney(report.cashExpense) }}。</small>
      </section>

      <section class="report-columns">
        <article class="report-card">
          <div class="section-heading"><div><p class="eyebrow">WHERE THE MONEY CAME FROM</p><h2>收入來源</h2></div><span>{{ report.incomeCount }} 筆</span></div>
          <div v-for="item in report.categories.filter(x => x.kind === 'income').sort((a,b)=>b.amount-a.amount)" :key="item.category" class="category-row">
            <button type="button" @click="selectedCategory='income:'+item.category; showAllRows=false">{{ item.category }}<small>{{ item.count }} 筆 · 睇明細</small></button><b>{{ formatMoney(item.amount) }}</b>
          </div><p v-if="!report.incomeCount" class="empty-note">呢個期間未有收入紀錄。</p>
        </article>
        <article class="report-card">
          <div class="section-heading"><div><p class="eyebrow">WHERE THE MONEY WENT</p><h2>支出分布</h2></div><span>{{ report.expenseCount }} 筆</span></div>
          <div v-for="item in report.categories.filter(x => x.kind === 'expense').sort((a,b)=>b.amount-a.amount)" :key="item.category" class="category-row">
            <button type="button" @click="selectedCategory='expense:'+item.category; showAllRows=false">{{ item.category }}<small>{{ item.count }} 筆 · {{ ['產品採購','支付30%'].includes(item.category) ? '現金流水，淨利不重扣' : '計入營運支出' }}</small></button><b>{{ formatMoney(item.amount) }}</b>
          </div><p v-if="!report.expenseCount" class="empty-note">呢個期間未有支出紀錄。</p>
        </article>
      </section>

      <section class="report-card">
        <div class="section-heading"><div><p class="eyebrow">CUSTOMERS · VERIFIED ONLY</p><h2>客戶與試堂</h2></div><span>目前正式客戶 {{ activeClients }}</span></div>
        <p class="section-note">試堂結果只按客戶檔案明確記錄計算；未填結果唔會當作已出席。</p>
        <div class="funnel-grid">
          <div><span>已預約</span><strong>{{ funnel.booked }}</strong></div>
          <div><span>已出席</span><strong>{{ funnel.attended }}</strong></div>
          <div><span>成功開卡</span><strong>{{ funnel.opened }}</strong></div>
          <div><span>開卡率</span><strong>{{ funnel.conversion === null ? '—' : funnel.conversion + '%' }}</strong></div>
        </div>
        <p class="section-note">{{ funnel.pending }} 位待填／待核對結果 · {{ funnel.noShow }} 位已記錄未出席。開卡率 = 成功開卡 ÷ 已確認出席；舊客首筆交易唔會自動當新客。</p>
        <div class="sales-strip"><span>套票交易：新開 <b>{{ report.packages.new }}</b></span><span>續卡 <b>{{ report.packages.renewal }}</b></span><span>未標明 <b>{{ report.packages.unknown }}</b></span></div>
      </section>

      <section class="report-card ledger">
        <div class="section-heading"><div><p class="eyebrow">AUDIT TRAIL</p><h2>交易明細</h2></div><span>{{ totalRows }} 筆</span></div>
        <button type="button" class="review-filter" :aria-pressed="showReviewOnly" @click="showReviewOnly = !showReviewOnly; showAllRows = false">{{ showReviewOnly ? '顯示全部紀錄' : '只睇待核對紀錄' }}</button>
        <div v-if="selectedCategory" class="active-filter">已篩選 {{ selectedCategory.split(':').slice(1).join(':') }} <button type="button" @click="selectedCategory=''; showAllRows=false">清除篩選 ×</button></div>
        <p v-if="correctionError" class="report-alert" role="alert">{{ correctionError }}</p>
        <p v-if="correctionMessage" class="report-alert amber" role="status">{{ correctionMessage }}</p>
        <div v-for="row in rowsToShow" :key="row.id" class="ledger-entry">
          <div class="ledger-row">
            <div><b>{{ row.category || '未分類' }} <small v-if="row.profitNeedsReview || row.dateNeedsReview">⚠️ {{ row.trialOverlap ? '試堂利潤可能重複' : '待核對' }}</small></b><span>{{ row.day }} · {{ row.branch || '未填分店' }} · {{ row.client_name || '未記名' }}</span><button v-if="row.trialOverlap && complete" class="correction-open" type="button" @click="openCorrection(row)">{{ correctionReview?.id === row.id ? '收起核對' : '核對試堂利潤' }}</button></div>
            <div class="ledger-amount" :class="row.kind"><b>{{ row.kind === 'expense' ? '−' : '+' }}{{ formatMoney(row.amount) }}</b><small v-if="row.kind === 'income'">交易利潤 {{ formatMoney(row.profit) }}</small><small v-else-if="row.excluded">淨利不重扣</small></div>
          </div>
          <div v-if="correctionReview?.id === row.id" class="correction-panel">
            <strong>核對同一次試堂</strong>
            <p>只有你確認兩筆屬同一次試堂，先會新增更正紀錄；原有交易保留。</p>
            <p v-if="correctionCandidates.length !== 1">找到 {{ correctionCandidates.length }} 筆可能相關收費紀錄，未能唯一配對；請先人手核對帳目。</p>
            <template v-else-if="correctionPlan">
              <p>收費：{{ trialTime(correctionCandidates[0].created_at) }} · {{ correctionCandidates[0].branch || '分店未填' }} · 收入 {{ formatMoney(correctionCandidates[0].amount) }} · 利潤 {{ formatMoney(correctionPlan.paidProfit) }}</p>
              <p>原調整：{{ trialTime(row.created_at) }} · 利潤 {{ formatMoney(correctionPlan.adjustmentProfit) }}。目前合計 {{ formatMoney(correctionPlan.currentTotal) }}；目標 {{ formatMoney(correctionPlan.target) }}；需補 {{ formatMoney(correctionPlan.correction) }}。</p>
              <p v-if="!correctionCandidates[0].branch">原收費冇分店，更正會跟原收費列作「未填分店」；請同時核對原收費分店。</p>
              <label><input v-model="correctionConfirmed" type="checkbox">我已核對，兩筆紀錄屬同一次試堂</label>
              <button type="button" :disabled="isReadOnlyPreview || !correctionConfirmed || correctionBusy" @click="saveTrialCorrection(row)">{{ isReadOnlyPreview ? '預覽版只供核對' : correctionBusy ? '備份及核實中…' : '下載備份並新增更正' }}</button>
            </template>
            <p v-else>現有資料未能安全計算更正，請先核對收費、成本同原調整。</p>
          </div>
        </div>
        <p v-if="!totalRows" class="empty-note">{{ showReviewOnly ? '呢個期間冇待核對紀錄。' : '呢個期間未有交易紀錄。' }}</p>
        <button v-if="!showAllRows && totalRows > 12" class="show-more" type="button" @click="showAllRows=true">顯示其餘 {{ totalRows - 12 }} 筆</button>
      </section>
      <p class="report-foot">數字取自你帳戶內已載入交易，按香港日期同選定分店統計。報表唔會更改任何帳目或客戶資料。</p>
    </template>
  </main>
</template>

<style scoped>
.bz-report{max-width:1060px;margin:auto;padding:20px 20px 150px;color:#3d332b;font-family:inherit}.eyebrow{margin:0 0 7px;color:#9c6c50;font-size:11px;font-weight:900;letter-spacing:.15em}.report-hero{position:relative;overflow:hidden;background:linear-gradient(130deg,#b76f4d,#cb926d);color:#fff;border-radius:29px;padding:28px 30px;box-shadow:0 18px 38px #a46b4433}.report-hero .eyebrow{color:#ffe7d1}.report-hero h1{font-size:clamp(29px,5vw,42px);line-height:1.1;margin:0 0 9px}.report-hero p:not(.eyebrow){margin:0 0 23px;opacity:.94}.hero-leaf{position:absolute;right:-22px;top:-58px;font-size:180px;color:#fff2;pointer-events:none}.report-filters,.custom-dates{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:11px}.report-filters label,.custom-dates label{font-size:12px;font-weight:800;color:#ffebdc}.report-filters select,.custom-dates input{display:block;width:100%;margin-top:6px;padding:12px 14px;border:1px solid #ead5c5;border-radius:13px;background:#fffbf7;color:#514338;font-size:15px;font-weight:800;min-width:0}.custom-dates{margin-top:11px}.hero-actions{position:relative;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:15px;font-size:12px;font-weight:700}.hero-actions>div{display:flex;gap:8px}.hero-actions button{border:1px solid #ffffff8c;border-radius:11px;background:#ffffff25;color:#fff;padding:8px 11px;font-weight:800;white-space:nowrap}.hero-actions button:disabled{opacity:.55}.report-alert{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px;padding:13px 16px;border-radius:15px;background:#f9e4d9;color:#8d4a2e;font-size:13px}.report-alert.amber{background:#faf1d9;color:#775821}.hero-metric{display:flex;gap:16px;justify-content:space-between;align-items:center;margin:20px 0 12px;border-radius:25px;padding:25px 28px;background:#777e58;color:#fff;box-shadow:0 13px 28px #747c4630}.hero-metric .eyebrow{color:#e9edce}.hero-metric h2{margin:0 0 7px;font-size:20px}.hero-metric p:not(.eyebrow){max-width:480px;margin:0;color:#f6f6e7;font-size:12px;line-height:1.5}.hero-metric strong{font-size:clamp(29px,5vw,43px);white-space:nowrap}.hero-metric small{font-weight:800}.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 13px}.metric-grid article,.report-card{background:#fffcf8;border:1px solid #eadfd3;border-radius:22px;box-shadow:0 8px 24px #9b6e4812}.metric-grid article{padding:19px}.metric-grid span{display:block;color:#8d765f;font-size:12px;font-weight:900}.metric-grid strong{display:block;margin:10px 0 5px;font-size:clamp(20px,3vw,29px);color:#a85d3e;overflow-wrap:anywhere}.metric-grid small{display:block;color:#8d8277;font-size:11px;line-height:1.4}.report-card{padding:22px;margin-bottom:14px}.equation{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;background:#f4eadf}.equation div span{display:block;font-size:11px;color:#9b6d4a;font-weight:900;margin-bottom:4px}.equation div b{font-size:15px}.equation p{font-weight:900;color:#a65e3e;margin:0}.equation small{width:100%;color:#776b60;line-height:1.5}.report-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:15px}.section-heading h2{margin:0;font-size:20px}.section-heading>span{color:#8d7768;font-size:12px;font-weight:800;white-space:nowrap}.category-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #f0e7de;padding:12px 0}.category-row button{border:0;background:none;padding:0;text-align:left;color:#45392f;font-weight:900;min-width:0}.category-row small{display:block;margin-top:3px;color:#9a8d81;font-weight:600}.category-row b{color:#9d6146;white-space:nowrap}.section-note,.empty-note{color:#84786c;font-size:12px;line-height:1.5}.funnel-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:15px 0}.funnel-grid div{padding:13px;border:1px solid #e8ddca;border-radius:16px;background:#f8f4e9;text-align:center}.funnel-grid span{display:block;color:#7b765d;font-size:11px;font-weight:900}.funnel-grid strong{display:block;margin-top:4px;color:#666e47;font-size:26px}.sales-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.sales-strip span{padding:8px 11px;border-radius:999px;background:#f4ede5;color:#725440;font-size:12px}.sales-strip b{font-size:15px}.ledger-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #f0e7de;padding:13px 0}.ledger-row>div:first-child{min-width:0}.ledger-row b{display:block;font-size:13px}.ledger-row span,.ledger-amount small{display:block;color:#95867a;font-size:11px;margin-top:3px}.ledger-amount{text-align:right;white-space:nowrap}.ledger-amount.income b{color:#6e7c4f}.ledger-amount.expense b{color:#b36c4d}.active-filter{display:flex;align-items:center;justify-content:space-between;border-radius:11px;background:#f5eadf;padding:8px 11px;color:#86563a;font-size:12px}.active-filter button,.show-more{border:0;background:none;color:#ad6745;font-weight:900}.show-more{display:block;margin:10px auto 0;padding:9px}.report-foot{color:#9a8d81;font-size:11px;text-align:center;line-height:1.5}
.review-filter{margin:-3px 0 11px;padding:8px 11px;border:1px solid #dfcdbb;border-radius:11px;background:#fbf2e8;color:#986247;font-size:12px;font-weight:900}
@media(max-width:600px){.bz-report{padding:13px 13px 115px}.report-hero{padding:18px;border-radius:24px}.report-hero h1{margin-bottom:4px}.report-hero p:not(.eyebrow){margin-bottom:14px}.report-filters select,.custom-dates input{padding:9px 12px}.hero-actions{align-items:flex-start;flex-direction:column;margin-top:10px}.hero-actions>span{display:none}.hero-actions>div{width:100%}.hero-actions button{flex:1}.hero-metric{display:block;margin-top:15px;padding:12px 17px}.hero-metric h2{margin-bottom:3px}.hero-metric p:not(.eyebrow){display:none}.hero-metric strong{display:block;margin-top:3px}.metric-grid{grid-template-columns:1fr 1fr;gap:8px}.metric-grid article{padding:13px}.metric-grid article:first-child{grid-column:1/-1}.metric-grid strong{margin:7px 0;font-size:23px}.report-columns{grid-template-columns:1fr;gap:0}.report-card{padding:17px}.funnel-grid{grid-template-columns:1fr 1fr;gap:8px}.ledger-row span{white-space:normal}.ledger-amount{max-width:45%;white-space:normal}}
@media(max-width:340px){.report-filters select,.custom-dates input{font-size:13px;padding:10px 7px}.metric-grid strong{font-size:20px}.section-heading h2{font-size:18px}}
.ledger-entry{border-top:1px solid #f0e7de}.ledger-entry .ledger-row{border-top:0}.correction-open{display:block;margin-top:7px;border:0;background:none;padding:0;color:#ae6745;font-size:12px;font-weight:800;text-decoration:underline}.correction-panel{display:grid;gap:9px;margin:0 0 14px;padding:14px;border:1px solid #e7d5c5;border-radius:14px;background:#fff9f2;font-size:12px;line-height:1.5}.correction-panel p{margin:0}.correction-panel label{display:flex;gap:7px;align-items:flex-start;font-weight:800}.correction-panel input{accent-color:#b86e4a}.correction-panel>button{justify-self:start;border:0;border-radius:10px;background:#b86e4a;color:#fff;padding:10px 14px;font:inherit;font-weight:800}.correction-panel>button:disabled{opacity:.55}
</style>
