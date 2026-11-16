<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase, isReadOnlyPreview } from '../supabase'
import { MONITOR_BRANCHES, monitorBranchCode, normalizeMonitorRows, reconcileMonitorClients, safeMissingClientPayload } from '../monitorReconcile'

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
const message = ref('')

const rows = computed(() => reconcileMonitorClients(normalizeMonitorRows(reports.value), store.clients))
const counts = computed(() => ({
  matched: rows.value.filter(row => row.kind === 'matched').length,
  missing: rows.value.filter(row => row.kind === 'missing').length,
  review: rows.value.filter(row => row.kind === 'review').length
}))
const shown = computed(() => rows.value.filter(row => row.kind === category.value))
const latest = computed(() => reports.value.map(report => report.profileUpdatedAt).filter(Boolean).sort().at(-1) || '')

async function downloadClientSnapshot(user) {
  const clients = []
  let total = null
  for (let start = 0; start < 100000; start += 500) {
    const { data, count, error: readError } = await supabase.from('clients').select('*', { count: 'exact' })
      .eq('owner_email', user.email).order('id').range(start, start + 499)
    if (readError) throw readError
    if (total === null) total = count
    clients.push(...(data || []))
    if ((data || []).length < 500) break
  }
  if (total !== clients.length) throw new Error('備份期間客戶數目有變，請重新嘗試。')
  const data = { format: 'bz-clients-before-monitor-backfill-v1', exported_at: new Date().toISOString(), owner_email: user.email, count: clients.length, clients }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `BZ客戶補全前備份-${new Date().toISOString().slice(0,10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

async function readMonitor() {
  error.value = ''
  message.value = ''
  if (!/^\d{6}$/.test(pin.value)) { error.value = '請輸入監察網站嘅 6 位管理 PIN。'; return }
  busy.value = true
  reports.value = []
  store.monitorProfiles = []
  const branches = branch.value === '全部三店' ? MONITOR_BRANCHES : [branch.value]
  const failures = []
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('請先登入 BZ，再讀取監察客戶。')
    for (const item of branches) {
      try {
        const response = await fetch('/.netlify/functions/monitor-customers', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ branch: monitorBranchCode(item), pin: pin.value }),
          cache: 'no-store'
        })
        const report = await response.json()
        if (!response.ok) throw new Error(report.error || '讀取失敗')
        reports.value.push({ ...report, branch: item })
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
  if (!confirm(`補全 ${row.name}（${row.phone}）到 BZ？\n只會新增一份客戶檔案；原有客戶、交易、點數及帳目不會改動。`)) return
  adding.value = row.key
  error.value = ''
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('登入已失效，請重新登入。')
    const payload = safeMissingClientPayload(row, user)
    if (!payload) throw new Error('呢筆來源資料唔夠完整，請先人工核對。')
    await downloadClientSnapshot(user)
    const { data: current, error: readError } = await supabase.from('clients').select('id,name,phone,branch')
      .eq('owner_email', user.email)
    if (readError) throw readError
    const checked = reconcileMonitorClients([row], current || [])[0]
    if (checked.kind !== 'missing') throw new Error('BZ 已有可能相同嘅客戶，請重新讀取後核對。')
    const { data: created, error: insertError } = await supabase.from('clients').insert([payload]).select().single()
    if (insertError) throw insertError
    store.clients.unshift(created)
    message.value = `已補全 ${created.name}。原始加入日期未知，冇將佢當作今日新客。`
  } catch (cause) {
    error.value = cause.message || '補全失敗'
  } finally {
    adding.value = ''
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
      <span><b>課程監察對照</b><small>查卡友點數 · 發現漏咗嘅客戶 · 避免舊客當新客</small></span>
      <span aria-hidden="true">{{ open ? '收起 ↑' : '開啟 →' }}</span>
    </button>
    <div v-if="open" class="monitor-body">
      <p class="explain">直接只讀取課程空位監察嘅客戶報表。PIN 只用於今次查詢，唔會儲存；資料先配對，唔會自動合併。</p>
      <div class="inputs">
        <label>分店<select v-model="branch"><option>全部三店</option><option v-for="item in MONITOR_BRANCHES" :key="item">{{ item }}</option></select></label>
        <label>監察網站管理 PIN<input v-model="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="6 位數 PIN"></label>
        <button type="button" class="read-btn" :disabled="busy" @click="readMonitor">{{ busy ? '讀取中…' : '讀取及對照' }}</button>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="message" class="message" role="status">{{ message }}</p>
      <template v-if="reports.length">
        <p class="source-note">來源：課程空位監察 · 點數最後更新 {{ displayTime(latest) }}。只涵蓋監察已匯入嘅 Cat &amp; Kwan 卡友；未列出唔代表對方唔係會員。跨卡點數可能經來源合併，請以原網站核對。</p>
        <div class="categories">
          <button type="button" :class="{selected:category==='review'}" @click="category='review'">待核對 {{ counts.review }}</button>
          <button type="button" :class="{selected:category==='missing'}" @click="category='missing'">BZ 疑似遺漏 {{ counts.missing }}</button>
          <button type="button" :class="{selected:category==='matched'}" @click="category='matched'">已配對 {{ counts.matched }}</button>
        </div>
        <p v-if="!shown.length" class="empty">呢一類暫時冇紀錄。</p>
        <div v-for="row in shown" :key="row.key" class="match-row">
          <div class="match-head"><strong>{{ row.name }}</strong><span>{{ row.branch }} · {{ row.memberId || '未有會員 ID' }}</span></div>
          <div class="match-data"><span>電話 {{ row.phone || '未提供' }}</span><span>剩餘點數 <b>{{ row.remainingPoints ?? '未提供' }}</b></span><span>到期 {{ row.validUntil || '未提供' }}</span></div>
          <small>{{ row.reason }}<template v-if="row.firstClassAt"> · 最早上堂 {{ row.firstClassAt }}</template></small>
          <div v-if="row.kind==='matched'" class="row-actions"><button type="button" @click="emit('select-client',row.client)">查看 BZ 客戶</button></div>
          <div v-if="row.kind==='missing'" class="row-actions"><button type="button" :disabled="isReadOnlyPreview || Boolean(adding)" @click="addMissing(row)">{{ isReadOnlyPreview ? '預覽版只供核對' : adding===row.key ? '補全中…' : '備份後補全此客戶' }}</button></div>
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
.categories{display:flex;gap:7px;overflow-x:auto;padding-bottom:6px}.categories button{white-space:nowrap;border:1px solid #e6d6c8;border-radius:100px;background:#fff;padding:8px 12px;color:#74594a;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.categories .selected{background:#775c47;color:#fff;border-color:#775c47}
.match-row{background:#fff;border:1px solid #ebddd0;border-radius:14px;padding:12px 14px;margin-top:9px}.match-head,.match-data{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.match-head strong{font-size:14px}.match-head span,.match-row small{font-size:12px;color:#8b7869}.match-data{justify-content:flex-start;margin:8px 0;font-size:12px;gap:8px 15px}.match-data b{color:#a95732}.match-row small{line-height:1.5}.row-actions{margin-top:10px}.row-actions button{min-height:34px;padding:7px 11px;font-size:12px}.empty{color:#8b7869;font-size:13px}
@media(max-width:700px){.inputs{grid-template-columns:1fr 1fr}.read-btn{grid-column:1/-1}.monitor-body{padding:15px}.monitor-toggle{padding:16px}.monitor-toggle small{max-width:240px}}
</style>
