<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase, isReadOnlyPreview } from '../supabase'
import { downloadOwnedClientsBackup } from '../clientsBackup'
import { MONITOR_BRANCHES, monitorBranchCode, normalizeMonitorRows, reconcileMonitorClients, safeMissingClientPayload, historicalJoinDateCorrection, historicalClassDate, cleanName, cleanPhone, canSaveMonitorReview } from '../monitorReconcile'

const emit = defineEmits(['select-client'])
const store = useMainStore()
const open = ref(false)
const branch = ref('全部三店')
const pin = ref('')
const busy = ref(false)
const error = ref('')
const reports = ref([])
const category = ref('review')
const adding = ref('')
const correcting = ref('')
const message = ref('')
const attendanceBusy = ref(false)
const attendanceMessage = ref('')
const reviewing = ref(null)
const targetSearch = ref('')
const targetId = ref('')
const confirmedIdentity = ref(false)
const confirmedSource = ref(false)
const updateChoices = ref({ name: false, phone: false, expiry_date: false, join_date: false })
const savingReview = ref(false)
const targetCandidates = computed(() => {
  const q = String(targetSearch.value || '').trim().toLowerCase()
  if (!q) return []
  return store.clients.filter(c => String(c.name || '').toLowerCase().includes(q) || String(c.phone || '').includes(q)).slice(0, 12)
})
const selectedTarget = computed(() => store.clients.find(c => String(c.id) === String(targetId.value)) || null)

const rows = computed(() => reconcileMonitorClients(normalizeMonitorRows(reports.value), store.clients))
const counts = computed(() => ({
  matched: rows.value.filter(row => row.kind === 'matched').length,
  missing: rows.value.filter(row => row.kind === 'missing').length,
  review: rows.value.filter(row => row.kind === 'review').length
}))
const shown = computed(() => rows.value.filter(row => row.kind === category.value))
const correctionCount = computed(() => new Set(rows.value.filter(row => historicalJoinDateCorrection(row)).map(row => row.client.id)).size)
const staleReports = computed(() => reports.value.filter(report => {
  const updated = Date.parse(report.profileUpdatedAt || '')
  return !Number.isFinite(updated) || Date.now() - updated > 6 * 60 * 60 * 1000
}))
const isStaleBranch = row => staleReports.value.some(report => report.branch === row.branch)
const reviewReady = row => canSaveMonitorReview({
  isPreview: isReadOnlyPreview,
  hasTarget: Boolean(selectedTarget.value),
  confirmedIdentity: confirmedIdentity.value,
  staleSource: isStaleBranch(row),
  confirmedSource: confirmedSource.value,
  saving: savingReview.value
})
const reportTimes = computed(() => reports.value.map(report => `${report.branch}：${displayTime(report.profileUpdatedAt)}`).join(' · '))
const attendanceLatest = computed(() => reports.value.map(report => report.attendanceUpdatedAt).filter(Boolean).sort().at(-1) || '')
const attendanceStale = computed(() => {
  const updated = Date.parse(attendanceLatest.value)
  return !Number.isFinite(updated) || Date.now() - updated > 6 * 60 * 60 * 1000
})

async function fetchBranchReport(item, token, pinValue) {
  const response = await fetch('/.netlify/functions/monitor-customers', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ branch: monitorBranchCode(item), pin: pinValue }),
    cache: 'no-store'
  })
  const report = await response.json()
  if (!response.ok) throw new Error(report.error || '讀取失敗')
  return { ...report, branch: item }
}

async function autoRefreshAttendance(token, pinValue, branchNames, previousUpdate) {
  const storageKey = 'bz-monitor-attendance-refresh-started-v1'
  const lastStarted = Number(sessionStorage.getItem(storageKey) || 0)
  if (Date.now() - lastStarted < 2 * 60 * 60 * 1000) {
    attendanceMessage.value = '最近兩小時已啟動上堂同步；來源仍顯示舊時間，請稍後再讀取。'
    return
  }
  attendanceBusy.value = true
  attendanceMessage.value = '正在自動更新最近 7 日上堂及到訪；現有客戶資料可先查看。'
  try {
    const response = await fetch('/.netlify/functions/monitor-attendance', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ pin: pinValue }),
      cache: 'no-store'
    })
    const started = await response.json()
    if (!response.ok || !started.started) throw new Error(started.error || '無法啟動上堂同步')
    sessionStorage.setItem(storageKey, String(Date.now()))
    for (let attempt = 0; attempt < 9; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10000))
      const first = await fetchBranchReport(branchNames[0], token, pinValue)
      const updated = Date.parse(first.attendanceUpdatedAt || '')
      if (Number.isFinite(updated) && updated > previousUpdate) {
        const refreshed = [first]
        for (const item of branchNames.slice(1)) refreshed.push(await fetchBranchReport(item, token, pinValue))
        reports.value = refreshed
        reviewing.value = null
        store.monitorProfiles = normalizeMonitorRows(refreshed)
        attendanceMessage.value = `最近 7 日上堂資料已更新：${displayTime(first.attendanceUpdatedAt)}。`
        return
      }
    }
    attendanceMessage.value = '背景同步已啟動，但來源報表仍顯示舊時間（快取最多約 30 分鐘）；稍後按「讀取及對照」核對。'
  } catch (cause) {
    sessionStorage.removeItem(storageKey)
    attendanceMessage.value = `自動上堂同步未完成：${cause.message || '請稍後再試'}。`
  } finally {
    attendanceBusy.value = false
  }
}

async function readMonitor() {
  if (busy.value || attendanceBusy.value) return
  error.value = ''
  message.value = ''
  attendanceMessage.value = ''
  if (!/^\d{6}$/.test(pin.value)) { error.value = '請輸入監察網站嘅 6 位管理 PIN。'; return }
  const pinValue = pin.value
  busy.value = true
  reports.value = []
  reviewing.value = null
  store.monitorProfiles = []
  const branches = branch.value === '全部三店' ? MONITOR_BRANCHES : [branch.value]
  const failures = []
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('請先登入 BZ，再讀取監察客戶。')
    for (const item of branches) {
      try {
        reports.value.push(await fetchBranchReport(item, session.access_token, pinValue))
      } catch (cause) {
        failures.push(`${item}：${cause.message || '讀取失敗'}`)
        if (/PIN 不正確/.test(String(cause.message))) break
      }
    }
    if (failures.length) error.value = failures.join('；')
    if (reports.value.length) {
      store.monitorProfiles = normalizeMonitorRows(reports.value)
      category.value = counts.value.review ? 'review' : counts.value.missing ? 'missing' : 'matched'
      message.value = '已讀取監察資料；所有比對都只喺畫面進行，點數唔會寫入 BZ 帳目。'
      if (attendanceStale.value) {
        const previousUpdate = Date.parse(attendanceLatest.value || '') || 0
        void autoRefreshAttendance(session.access_token, pinValue, reports.value.map(report => report.branch), previousUpdate)
      }
    }
  } catch (cause) {
    error.value = cause.message || '讀取失敗'
  } finally {
    busy.value = false
    pin.value = ''
  }
}

async function addMissing(row) {
  if (isReadOnlyPreview) return
  if (staleReports.value.some(report => report.branch === row.branch)) {
    error.value = '呢間分店嘅課卡資料已超過 6 小時，請先喺監察網站更新再讀取。'
    return
  }
  const historicalDate = historicalClassDate(row.firstClassAt)
  if (!confirm(`補全 ${row.name}（${row.phone}）到 BZ？\n${historicalDate ? `加入日期會用最早上堂 ${historicalDate}。` : '未有最早上堂日期，加入日期會留空。'}\n只會新增一份客戶檔案；原有客戶、交易、點數及帳目不會改動。`)) return
  adding.value = row.key
  error.value = ''
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('登入已失效，請重新登入。')
    const payload = safeMissingClientPayload(row, user)
    if (!payload) throw new Error('呢筆來源資料唔夠完整，請先人工核對。')
    await downloadOwnedClientsBackup(user)
    const { data: current, error: readError } = await supabase.from('clients').select('id,name,phone,branch')
      .eq('owner_email', user.email)
    if (readError) throw readError
    const checked = reconcileMonitorClients([row], current || [])[0]
    if (checked.kind !== 'missing') throw new Error('BZ 已有可能相同嘅客戶，請重新讀取後核對。')
    const { data: created, error: insertError } = await supabase.from('clients').insert([payload]).select().single()
    if (insertError) throw insertError
    store.clients.unshift(created)
    message.value = `已補全 ${created.name}。${created.join_date ? `加入日期採用最早上堂 ${created.join_date}` : '加入日期未知，保持留空'}，冇將佢當作今日新客。`
  } catch (cause) {
    error.value = cause.message || '補全失敗'
  } finally {
    adding.value = ''
  }
}

function openReview(row) {
  reviewing.value = row
  targetId.value = row.client?.id || ''
  targetSearch.value = row.client?.name || ''
  confirmedIdentity.value = false
  confirmedSource.value = false
  updateChoices.value = {
    name: false,
    phone: false,
    expiry_date: Boolean(row.validUntil && row.client && row.validUntil !== row.client.expiry_date),
    join_date: Boolean(row.client && historicalJoinDateCorrection(row))
  }
}

async function saveReviewedFields(row) {
  if (isReadOnlyPreview || savingReview.value) return
  const target = selectedTarget.value
  if (!target || !confirmedIdentity.value) { error.value = '請先揀定 BZ 客戶，並確認係同一人。'; return }
  if (isStaleBranch(row) && !confirmedSource.value) { error.value = '來源資料超過 6 小時；請先喺原網站核對今次要更新嘅資料，再勾選確認。'; return }
  const source = { name: row.name, phone: row.phone, expiry_date: row.validUntil,
    join_date: historicalClassDate(row.firstClassAt) }
  const patch = {}
  for (const field of Object.keys(updateChoices.value)) {
    if (updateChoices.value[field] && source[field] && source[field] !== target[field]) patch[field] = source[field]
  }
  if (patch.join_date && target.join_date && patch.join_date >= target.join_date) delete patch.join_date
  if (!Object.keys(patch).length) { error.value = '請勾選至少一個有差異嘅欄位。'; return }
  const lines = Object.entries(patch).map(([key, value]) => `${{ name: '姓名', phone: '電話', expiry_date: '到期日', join_date: '加入日期' }[key]}：${target[key] || '未填'} → ${value}`)
  if (!confirm(`已核對 ${row.name} 同 ${target.name} 係同一人？\n${isStaleBranch(row) ? '來源資料超過 6 小時；你已在原網站確認以下數值仍然正確。\n' : ''}${lines.join('\n')}\n只更新以上欄位；帳目、交易同點數不變。`)) return
  savingReview.value = true
  error.value = ''
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user?.email) throw new Error('登入已失效，請重新登入。')
    await downloadOwnedClientsBackup(user)
    const { data: latest, error: readError } = await supabase.from('clients')
      .select('id,name,phone,expiry_date,join_date,owner_email').eq('id', target.id).eq('owner_email', user.email).single()
    if (readError || !latest) throw new Error('搵唔到呢位客戶嘅最新檔案。')
    for (const field of Object.keys(patch)) {
      if (String(latest[field] || '') !== String(target[field] || '')) throw new Error('呢位客戶嘅資料已變，請重新讀取後再更新。')
    }
    if (patch.join_date && latest.join_date && patch.join_date >= latest.join_date) delete patch.join_date
    if (!Object.keys(patch).length) throw new Error('最新資料已經相同或更早，毋須更新。')
    let query = supabase.from('clients').update(patch, { count: 'exact' }).eq('id', latest.id).eq('owner_email', user.email)
    for (const field of Object.keys(patch)) query = latest[field] == null ? query.is(field, null) : query.eq(field, latest[field])
    const { count, error: updateError } = await query
    if (updateError) throw updateError
    if (count !== 1) throw new Error('資料更新期間有變，冇覆蓋新版本；請重新讀取。')
    const { data: saved, error: verifyError } = await supabase.from('clients')
      .select('id,name,phone,expiry_date,join_date').eq('id', latest.id).eq('owner_email', user.email).single()
    if (verifyError || !saved || Object.entries(patch).some(([key, value]) => saved[key] !== value)) {
      throw new Error('更新已送出，但未能核實結果；請重新讀取客戶檔案。')
    }
    Object.assign(target, patch)
    message.value = `已核對並更新 ${target.name}：${Object.keys(patch).length} 個欄位。原有帳目同交易保持不變。`
    reviewing.value = null
  } catch (cause) {
    error.value = cause.message || '更新失敗'
  } finally { savingReview.value = false }
}

async function correctJoinDate(row) {
  if (isReadOnlyPreview) return
  const proposed = historicalJoinDateCorrection(row)
  if (!proposed || correcting.value) return
  if (!confirm(`將 ${row.name} 嘅 BZ 加入日期由 ${row.client.join_date || '未填'} 修正為最早上堂 ${proposed}？\n會先下載客戶備份；只修改呢位客戶嘅加入日期。`)) return
  correcting.value = row.key
  error.value = ''
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user?.email) throw new Error('登入已失效，請重新登入。')
    await downloadOwnedClientsBackup(user)
    const { data: current, error: readError } = await supabase.from('clients')
      .select('id,name,phone,join_date,owner_email').eq('id', row.client.id).eq('owner_email', user.email).single()
    if (readError || !current) throw new Error('搵唔到呢位客戶嘅最新檔案。')
    if (cleanName(current.name) !== cleanName(row.name) || cleanPhone(current.phone) !== row.phone) {
      throw new Error('客戶姓名或電話已改變，請重新讀取監察資料再核對。')
    }
    const latest = historicalJoinDateCorrection({ ...row, client: current })
    if (!latest) {
      message.value = 'BZ 加入日期已經係相同或更早，毋須修改。'
      return
    }
    let update = supabase.from('clients').update({ join_date: latest }, { count: 'exact' })
      .eq('id', current.id).eq('owner_email', user.email)
    update = current.join_date ? update.eq('join_date', current.join_date) : update.is('join_date', null)
    const { count, error: updateError } = await update
    if (updateError) throw updateError
    if (count !== 1) throw new Error('資料喺修正期間有變，冇覆蓋新版本；請重新讀取。')
    const { data: saved, error: verifyError } = await supabase.from('clients')
      .select('id,join_date').eq('id', current.id).eq('owner_email', user.email).single()
    if (verifyError || saved?.join_date !== latest) throw new Error('日期已送出，但未能核實結果；請重新讀取客戶檔案。')
    const local = store.clients.find(client => client.id === current.id)
    if (local) local.join_date = latest
    message.value = `已修正 ${row.name} 嘅加入日期為 ${latest}。交易、點數同其他客戶欄位冇改動。`
  } catch (cause) {
    error.value = cause.message || '修正日期失敗'
  } finally {
    correcting.value = ''
  }
}

function displayTime(value) {
  if (!value) return '未提供'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong' })
}
</script>

<template>
  <section class="monitor-card">
    <button class="monitor-toggle" type="button" :aria-expanded="open" @click="open = !open">
      <span><b>課程監察對照</b><small>核對來源客戶 · 發現遺漏 · 避免舊客當新客</small></span>
      <span aria-hidden="true">{{ open ? '收起 ↑' : '開啟 →' }}</span>
    </button>
    <div v-if="open" class="monitor-body">
      <p class="explain">讀取課程空位監察嘅客戶報表；如果上堂資料超過 6 小時，會自動啟動最近 7 日更新。PIN 只用於今次查詢同更新，唔會儲存；BZ 客戶先配對，唔會自動合併。</p>
      <div class="inputs">
        <label>分店<select v-model="branch"><option>全部三店</option><option v-for="item in MONITOR_BRANCHES" :key="item">{{ item }}</option></select></label>
        <label>監察網站管理 PIN<input v-model="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6 位數 PIN"></label>
        <button type="button" class="read-btn" :disabled="busy || attendanceBusy" @click="readMonitor">{{ busy ? '讀取中…' : attendanceBusy ? '上堂同步中…' : '讀取及對照' }}</button>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="message" class="message" role="status">{{ message }}</p>
      <p v-if="attendanceMessage" class="message" role="status">{{ attendanceMessage }}</p>
      <template v-if="reports.length">
        <p class="source-note">來源：課程空位監察 · 課卡 {{ reportTimes }} · 上堂 {{ displayTime(attendanceLatest) }}。只涵蓋監察已匯入嘅 Cat &amp; Kwan 卡友；未列出唔代表對方唔係會員。跨卡點數可能經來源合併，請以原網站核對。</p>
        <p v-if="staleReports.length" class="freshness-note" role="status">{{ staleReports.map(report => report.branch).join('、') }} 嘅資料超過 6 小時或未有更新時間，點數及到期日可能已變。可先打開人手配對；寫入前要喺 <a href="https://class-seat-monitor.yimwingkwan0907.workers.dev/app" target="_blank" rel="noopener noreferrer">課程監察網站</a> 核對該會員今次要更新嘅數值。新增遺漏客戶仍須先更新來源，再按「讀取及對照」。</p>
        <div class="categories">
          <button type="button" :class="{selected:category==='review'}" @click="category='review'">待核對 {{ counts.review }}</button>
          <button type="button" :class="{selected:category==='missing'}" @click="category='missing'">BZ 疑似遺漏 {{ counts.missing }}</button>
          <button type="button" :class="{selected:category==='matched'}" @click="category='matched'">已配對 {{ counts.matched }}</button>
        </div>
        <p v-if="correctionCount" class="date-note">有 {{ correctionCount }} 位已配對客戶，最早上堂日期早過 BZ 加入日期或 BZ 未填日期。可逐位核對及備份後修正；原本更早嘅日期會保留。</p>
        <p v-if="!shown.length" class="empty">呢一類暫時冇紀錄。</p>
        <div v-for="row in shown" :key="row.key" class="match-row">
          <div class="match-head"><strong>{{ row.name }}</strong><span>{{ row.branch }} · {{ row.memberId || '未有會員 ID' }}</span></div>
          <div class="match-data"><span>電話 {{ row.phone || '未提供' }}</span><span>剩餘點數 <b>{{ row.remainingPoints ?? '未提供' }}</b></span><span>到期 {{ row.validUntil || '未提供' }}</span></div>
          <small>{{ row.reason }}<template v-if="row.firstClassAt"> · 最早上堂 {{ row.firstClassAt }}</template></small>
          <div v-if="row.kind==='matched'" class="row-actions"><button type="button" @click="emit('select-client',row.client)">查看 BZ 客戶</button><button type="button" @click="openReview(row)">核對來源並更新</button></div>
          <div v-if="row.kind==='review'" class="row-actions"><button type="button" @click="openReview(row)">人手配對／更新 BZ</button></div>
          <div v-if="row.kind==='missing'" class="row-actions"><button type="button" :disabled="isReadOnlyPreview || Boolean(adding) || staleReports.some(report => report.branch === row.branch)" @click="addMissing(row)">{{ isReadOnlyPreview ? '預覽版只供核對' : staleReports.some(report => report.branch === row.branch) ? '先更新來源資料' : adding===row.key ? '補全中…' : '備份後補全此客戶' }}</button></div>
          <div v-if="reviewing?.key===row.key" class="review-panel">
            <strong>核對同一位客戶，再揀要更新嘅欄位</strong>
            <p>來源點數 {{ row.remainingPoints ?? '未提供' }} 只供核對；BZ 客戶檔案唔設點數欄，亦唔會將點數寫入金額或帳目。</p>
            <p v-if="isReadOnlyPreview" class="review-warning">呢個係只讀預覽版，可以核對配對方法；要儲存，請開啟 <a href="https://dynamic-gumption-005003.netlify.app/" target="_blank" rel="noopener noreferrer">BZ 正式版</a> 登入後重新讀取。</p>
            <p v-if="isStaleBranch(row)" class="review-warning">{{ row.branch }} 嘅來源更新時間：{{ displayTime(row.profileUpdatedAt) }}。請喺原網站核對此會員最新資料；舊報表唔代表資料仍然正確。</p>
            <label>搜尋現有 BZ 客戶<input v-model="targetSearch" type="search" placeholder="姓名或電話" @input="targetId=''; confirmedIdentity=false"></label>
            <div v-if="targetCandidates.length" class="target-list">
              <button v-for="candidate in targetCandidates" :key="candidate.id" type="button" :class="{chosen:targetId===candidate.id}" @click="targetId=candidate.id; confirmedIdentity=false">{{ candidate.name }} · {{ candidate.phone || '未填電話' }} · {{ candidate.branch || '未填分店' }}</button>
            </div>
            <p v-if="selectedTarget">已選：{{ selectedTarget.name }} · {{ selectedTarget.phone || '未填電話' }}</p>
            <div v-if="selectedTarget" class="field-choices">
              <label><input v-model="updateChoices.name" type="checkbox" :disabled="!row.name || row.name===selectedTarget.name">姓名：{{ selectedTarget.name || '未填' }} → {{ row.name || '未提供' }}</label>
              <label><input v-model="updateChoices.phone" type="checkbox" :disabled="!row.phone || cleanPhone(selectedTarget.phone)===row.phone">電話：{{ selectedTarget.phone || '未填' }} → {{ row.phone || '未提供' }}</label>
              <label><input v-model="updateChoices.expiry_date" type="checkbox" :disabled="!row.validUntil || row.validUntil===selectedTarget.expiry_date">到期日：{{ selectedTarget.expiry_date || '未填' }} → {{ row.validUntil || '未提供' }}</label>
              <label><input v-model="updateChoices.join_date" type="checkbox" :disabled="!historicalClassDate(row.firstClassAt) || Boolean(selectedTarget.join_date && historicalClassDate(row.firstClassAt)>=selectedTarget.join_date)">加入日期：{{ selectedTarget.join_date || '未填' }} → {{ historicalClassDate(row.firstClassAt) || '未提供' }}</label>
              <label class="identity-check"><input v-model="confirmedIdentity" type="checkbox">我已核對來源同 BZ 係同一人</label>
              <label v-if="isStaleBranch(row)" class="identity-check"><input v-model="confirmedSource" type="checkbox">我已喺原網站核對今次勾選嘅來源數值，確認仍然正確</label>
            </div>
            <div class="row-actions"><button type="button" :disabled="!reviewReady(row)" @click="saveReviewedFields(row)">{{ isReadOnlyPreview ? '預覽版不能儲存' : savingReview ? '核對儲存中…' : '下載備份並更新所選欄位' }}</button><button type="button" class="cancel-review" @click="reviewing=null">取消</button></div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.monitor-card{background:#fffaf4;border:1px solid #e9d7c7;border-radius:22px;box-shadow:0 8px 26px #77543e12;margin:0 0 18px;overflow:hidden;color:#3d3029}
.monitor-toggle{width:100%;border:0;background:transparent;padding:17px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;color:#5f493b;cursor:pointer;font:inherit}
.monitor-toggle b{display:block;font-size:16px}.monitor-toggle small{display:block;color:#8d786b;margin-top:4px;line-height:1.4}
.monitor-toggle>span:last-child{color:#b56c47;white-space:nowrap;font-weight:700}
.monitor-body{border-top:1px solid #eddfd2;padding:18px 20px 22px}.explain,.source-note{font-size:13px;line-height:1.6;color:#77685e;margin:0 0 14px}
.inputs{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}.inputs label{display:grid;gap:6px;font-size:12px;font-weight:700}.inputs select,.inputs input{border:1px solid #e4d2c2;border-radius:11px;background:#fff;padding:11px;font:inherit;min-width:0;height:43px}.read-btn,.row-actions button{border:0;border-radius:11px;background:#b86e4a;color:#fff;font:inherit;font-weight:700;padding:11px 15px;min-height:43px;cursor:pointer}.read-btn:disabled,.row-actions button:disabled{opacity:.55;cursor:not-allowed}
.error,.message{font-size:13px;padding:10px 12px;border-radius:10px;margin:13px 0 0}.error{background:#fff0ea;color:#a04429}.message{background:#eef3e6;color:#51663d}.source-note{margin:18px 0 10px}
.freshness-note{font-size:13px;line-height:1.6;padding:11px 13px;border-radius:11px;margin:0 0 12px;background:#fff0e7;color:#904b32}.freshness-note a{color:inherit;font-weight:700;text-decoration:underline}
.categories{display:flex;gap:7px;overflow-x:auto;padding-bottom:6px}.categories button{white-space:nowrap;border:1px solid #e6d6c8;border-radius:100px;background:#fff;padding:8px 12px;color:#74594a;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.categories .selected{background:#775c47;color:#fff;border-color:#775c47}
.match-row{background:#fff;border:1px solid #ebddd0;border-radius:14px;padding:12px 14px;margin-top:9px}.match-head,.match-data{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.match-head strong{font-size:14px}.match-head span,.match-row small{font-size:12px;color:#8b7869}.match-data{justify-content:flex-start;margin:8px 0;font-size:12px;gap:8px 15px}.match-data b{color:#a95732}.match-row small{line-height:1.5}.row-actions{margin-top:10px}.row-actions button{min-height:34px;padding:7px 11px;font-size:12px}.empty{color:#8b7869;font-size:13px}
.date-note{font-size:13px;line-height:1.6;padding:11px 13px;border-radius:11px;margin:10px 0;background:#eef3e6;color:#51663d}.row-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.date-change{font-size:12px;color:#705747;font-weight:700}
.review-panel{margin-top:12px;padding:14px;border:1px solid #e6d2c1;border-radius:14px;background:#fffaf5;display:grid;gap:10px}.review-panel>strong{font-size:14px}.review-panel p{margin:0;font-size:12px;color:#705d4f}.review-panel>label{display:grid;gap:5px;font-size:12px;font-weight:700}.review-panel input[type=search]{width:100%;min-height:42px;border:1px solid #dcc9b8;border-radius:10px;padding:8px 11px;font:inherit}.target-list{display:grid;gap:5px;max-height:160px;overflow:auto}.target-list button{border:1px solid #e4d6c9;border-radius:9px;background:#fff;color:#4b392f;text-align:left;padding:8px;font:inherit;font-size:12px}.target-list button.chosen{border-color:#b86e4a;background:#faeee6}.field-choices{display:grid;gap:9px}.field-choices label{font-size:12px;line-height:1.5;display:flex;gap:7px;align-items:flex-start}.field-choices input{margin-top:2px;accent-color:#b86e4a}.identity-check{font-weight:700}.row-actions .cancel-review{background:#eee3d9;color:#6b5548}
.review-panel .review-warning{padding:9px 11px;border-radius:10px;background:#fff0e7;color:#904b32;line-height:1.5}.review-warning a{color:inherit;font-weight:700;text-decoration:underline}
@media(max-width:700px){.inputs{grid-template-columns:1fr 1fr}.read-btn{grid-column:1/-1}.monitor-body{padding:15px}.monitor-toggle{padding:16px}.monitor-toggle small{max-width:240px}}
</style>
