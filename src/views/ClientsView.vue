<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase, isReadOnlyPreview } from '../supabase'
import { DEFAULT_MOVEMENT_PACKAGES, loadMovementPackages, calculateMovementPackage } from '../movementPackages'
import { sampleClassDate, sampleClasses } from '../demoClassSchedule'
import { sameCourse, findAvailableCourse } from '../classSchedule'
import MonitorReconcile from '../components/MonitorReconcile.vue'

const store = useMainStore()

const showAddModal = ref(false)
const showEditModal = ref(false)
const clientSearch = ref('') 
const filterBranch = ref('')
const filterStatus = ref('')
function consumeNavigation() {
  if (store.pendingClientTask) {
    const task = store.pendingClientTask
    store.pendingClientTask = null
    const client = store.clients.find(row => String(row.id) === String(task.id))
    if (client) {
      selectedClientForAction.value = client
      if (task.action === 'trial' || task.action === 'renewal') openQuickFlow(task.action)
      else openActionModal(client)
    }
  }
  if (store.pendingQuickEntry?.kind === 'client') {
    store.pendingQuickEntry = null
    openAddModal()
  }
  if (store.pendingSearch?.kind === 'client') {
    clientSearch.value = store.pendingSearch.query || ''
    filterStatus.value = ''
    store.pendingSearch = null
  }
}
onMounted(consumeNavigation)
watch(() => store.pendingQuickEntry, consumeNavigation)
watch(() => store.pendingSearch, consumeNavigation)
watch(() => store.pendingClientTask, consumeNavigation)
const filterMyGiftExpiring = ref(false) 
const sortBy = ref('default') 
const consumeMyGift = ref(false)
const autoChargeTrial = ref(false) // 🚀 新增：控制是否自動收取試堂費
const activeTab = ref('basic') // 🚀 新增：用來控制目前顯示哪一個分頁 ('basic', 'source', 'advanced')
const editingTrialResult = ref('')
const editingOriginalTrialResult = ref('')
const TRIAL_RESULT_MARK = '[TRIAL_RESULT]'
const NORMAL_TRIAL_PROFIT = 44.6
const MYGIFT_TRIAL_PROFIT = -53.4

function getTrialResultValue(client) {
  const matches = [...String(client?.remark || '').matchAll(/\[TRIAL_RESULT\]\|([^|\n]+)\|([^|\n]+)/g)]
  return matches.length ? matches[matches.length - 1][2] : ''
}

function replaceTrialResultMarker(remark, outcome) {
  const clean = String(remark || '').replace(/\n?\[TRIAL_RESULT\]\|[^\n]*/g, '').trim()
  if (!outcome) return clean
  const line = TRIAL_RESULT_MARK + '|' + new Date().toISOString() + '|' + outcome
  return [clean, line].filter(Boolean).join('\n')
}

async function syncTrialProfitForClient(client, outcome) {
  if (!['no_open_normal', 'no_open_mygift'].includes(outcome)) return
  const { data: { session } } = await supabase.auth.getSession()
  const ownerEmail = session?.user?.email
  if (!ownerEmail) throw new Error('登入已失效，未能記錄試堂帳目。')

  const profit = outcome === 'no_open_mygift' ? MYGIFT_TRIAL_PROFIT : NORMAL_TRIAL_PROFIT
  const tag = '[TRIAL_PROFIT:' + String(client?.id || 'unknown') + ':' + String(client?.trial_date || '').slice(0,16) + ']'
  const note = tag + ' ' + (outcome === 'no_open_mygift' ? 'MyGift 試堂未開卡' : '普通試堂未開卡')
  const existing = store.transactions.find(t => String(t?.note || '').includes(tag))

  if (existing) {
    const { error } = await supabase.from('transactions').update({ profit, note, client_name: client?.name || '', branch: client?.branch || '' }).eq('id', existing.id)
    if (error) throw error
    Object.assign(existing, { profit, note, client_name: client?.name || '', branch: client?.branch || '' })
    return
  }

  const row = {
    owner_email: ownerEmail,
    type: 'income',
    category: '試堂調整',
    amount: 0,
    profit,
    note,
    client_id: client?.id || null,
    client_name: client?.name || '',
    branch: client?.branch || '',
    created_at: client?.trial_date || new Date().toISOString()
  }
  const { data, error } = await supabase.from('transactions').insert(row).select().single()
  if (error) throw error
  if (data) store.transactions.unshift(data)
}

const getLocalHKDate = () => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Hong_Kong', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  }).format(new Date());
}
const todayStr = getLocalHKDate()
const branches = ['觀塘', '中環', '佐敦']
const savedBranch = () => {
  try { return branches.includes(localStorage.getItem('bz_last_branch')) ? localStorage.getItem('bz_last_branch') : '觀塘' } catch { return '觀塘' }
}
const showMoreNewClient = ref(false)
const trialTimes = ['10:00', '14:00', '18:00']
const scheduleDate = ref(todayStr)
const scheduleOpened = ref(false)
const scheduleLoading = ref(false)
const scheduleRows = ref([])
const scheduleError = ref('')
const scheduleSample = ref(false)
const scheduleFromCache = ref(false)
const scheduleCachedAt = ref(0)
const selectedCourse = ref(null)
const checkingCourse = ref(false)
let scheduleRequest = 0
let scheduleFetchInFlight = null
const maxScheduleDate = (() => { const d = new Date(); d.setDate(d.getDate() + 13); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) })()

function cachedScheduleKey(branch, date) { return `bz_schedule_v1:${branch}:${date}` }
function readCachedSchedule(branch, date) {
  try {
    const cached = JSON.parse(localStorage.getItem(cachedScheduleKey(branch, date)) || 'null')
    if (cached?.at > Date.now() - 24 * 60 * 60 * 1000 && cached.at <= Date.now() &&
      Array.isArray(cached.classes) && cached.classes.length <= 100) return cached
  } catch { /* Ignore unavailable or invalid browser storage. */ }
  return null
}
function rememberSchedule(branch, date, classes) {
  try { localStorage.setItem(cachedScheduleKey(branch, date), JSON.stringify({ at: Date.now(), classes })) } catch { /* Browser storage can be disabled. */ }
}
function cachedScheduleTime(at) {
  return new Intl.DateTimeFormat('zh-HK', { timeZone: 'Asia/Hong_Kong', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at)
}

async function loadClasses() {
  const requestId = ++scheduleRequest
  const branch = newClient.value.branch
  const date = scheduleDate.value
  scheduleOpened.value = true
  scheduleRows.value = []
  scheduleError.value = ''
  scheduleSample.value = false
  scheduleFromCache.value = false
  scheduleCachedAt.value = 0
  if (isReadOnlyPreview && new URLSearchParams(window.location.search).has('demo')) {
    scheduleSample.value = true
    scheduleRows.value = date === sampleClassDate
      ? (sampleClasses[branch] || []).map(course => ({ ...course, date, branch })) : []
    return
  }
  const cached = readCachedSchedule(branch, date)
  if (cached) {
    scheduleRows.value = cached.classes
    scheduleFromCache.value = true
    scheduleCachedAt.value = cached.at
  }
  scheduleLoading.value = true
  const flight = { branch, date, promise: fetchClasses(branch, date, Boolean(cached)) }
  scheduleFetchInFlight = flight
  try {
    const rows = await flight.promise
    if (requestId === scheduleRequest) {
      scheduleRows.value = rows
      scheduleFromCache.value = false
      scheduleCachedAt.value = 0
      rememberSchedule(branch, date, rows)
      if (selectedCourse.value && selectedCourse.value.branch === branch && selectedCourse.value.date === date &&
        !findAvailableCourse(rows, selectedCourse.value)) {
        clearSelectedCourse()
        scheduleError.value = '已揀課堂有變或額滿，請重新揀最新時段。'
      }
    }
  } catch (error) {
    if (requestId === scheduleRequest) scheduleError.value = error.message || '暫時讀唔到課表，可手動輸入時間。'
  } finally {
    if (requestId === scheduleRequest) scheduleLoading.value = false
    if (scheduleFetchInFlight === flight) scheduleFetchInFlight = null
  }
}

async function fetchClasses(branch, date, fresh = false) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('請先登入帳戶。')
  const params = new URLSearchParams({ branch, date })
  if (fresh) params.set('fresh', '1')
  const response = await fetch(`/api/classes?${params}`, {
    headers: { authorization: `Bearer ${session.access_token}` }, cache: 'no-store'
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '暫時讀唔到課表。')
  return payload.classes || []
}

async function selectClass(course) {
  if (course.full) return
  checkingCourse.value = true
  scheduleError.value = ''
  try {
    if (!(isReadOnlyPreview && new URLSearchParams(window.location.search).has('demo'))) {
      const flight = scheduleFetchInFlight
      const rows = await (flight?.branch === course.branch && flight?.date === course.date
        ? flight.promise : fetchClasses(course.branch, course.date, true))
      scheduleRows.value = rows
      scheduleFromCache.value = false
      scheduleCachedAt.value = 0
      rememberSchedule(course.branch, course.date, rows)
      if (!findAvailableCourse(rows, course)) throw new Error('呢堂嘅時間、教練或名額有變，請重新揀最新課堂。')
    }
  } catch (error) {
    scheduleError.value = error.message || '無法核對最新課堂，請再試。'
    return
  } finally {
    checkingCourse.value = false
  }
  if (scheduleDate.value !== course.date || newClient.value.branch !== course.branch) {
    scheduleError.value = '分店或日期已改，請重新揀最新課堂。'
    return
  }
  newClient.value.trial_date = `${course.date}T${course.start}`
  selectedCourse.value = { ...course }
  const note = `試堂課程：${course.title}（${course.start}-${course.end}，教練 ${course.coach || '未列明'}）`
  newClient.value.remark = [String(newClient.value.remark || '').replace(/\n?試堂課程：[^\n]*/g, '').trim(), note].filter(Boolean).join('\n')
}

function clearSelectedCourse(clearTime = true) {
  if (!selectedCourse.value) return
  const oldTime = `${selectedCourse.value.date}T${selectedCourse.value.start}`
  selectedCourse.value = null
  newClient.value.remark = String(newClient.value.remark || '').replace(/\n?試堂課程：[^\n]*/g, '').trim()
  if (clearTime && newClient.value.trial_date === oldTime) newClient.value.trial_date = ''
}

function chooseTrialDay(offset) {
  clearSelectedCourse(false)
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const time = newClient.value.trial_date?.slice(11, 16) || '10:00'
  newClient.value.trial_date = `${day}T${time}`
  scheduleDate.value = day
}
function chooseTrialTime(time) {
  clearSelectedCourse(false)
  newClient.value.trial_date = `${newClient.value.trial_date?.slice(0, 10) || todayStr}T${time}`
}

const defaultNewClient = { 
  name: '', phone: '', branch: '觀塘', source: '廣告', status: 'prospect', 
  is_vip: false, is_marathon: false, join_date: todayStr, 
  package_count: 0, expiry_date: '', handled_by: '', payment_received: 0,
  referred_by_id: null, vip_tier: '銅級(88折)', 
  trial_date: '', remark: '' 
}

const newClient = ref({ ...defaultNewClient })
watch([() => newClient.value.branch, scheduleDate], () => {
  clearSelectedCourse()
  if (showAddModal.value && scheduleOpened.value) loadClasses()
})
watch(() => newClient.value.trial_date, value => {
  if (selectedCourse.value && value !== `${selectedCourse.value.date}T${selectedCourse.value.start}`) clearSelectedCourse(false)
})
// 🚀 新增：智能配對快捷輸入
const smartInput = ref('')

function handleSmartPaste() {
  const text = smartInput.value.trim()
  if (!text) return

  // 1️⃣ 找電話號碼 (🚀 放寬：只要是 4 到 15 個數字的組合，都當作電話)
  const phoneMatch = text.match(/(?:\d\s*){4,15}/)
  if (phoneMatch) {
    // 把抓到的數字去掉空格，塞進電話欄位
    newClient.value.phone = phoneMatch[0].replace(/\s+/g, '') 
  }

  // 2️⃣ 找日期
  const dateMatch = text.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}/)
  if (dateMatch) {
    const d = new Date(dateMatch[0].replace(/\//g, '-'))
    if (!isNaN(d)) {
      newClient.value.join_date = d.toISOString().split('T')[0]
      newClient.value.trial_date = d.toISOString().split('T')[0] + 'T10:00' 
    }
  }

  // 3️⃣ 找姓名
  if (!newClient.value.name) { 
    let remainingText = text
    if (phoneMatch) remainingText = remainingText.replace(phoneMatch[0], '')
    if (dateMatch) remainingText = remainingText.replace(dateMatch[0], '')
    
    // 🗑️ 垃圾字眼過濾器
    const ignoreWords = ['約', '號', '試堂', '預約', '去', '想', '的', '了', '星期', '分店', '觀塘', '中環', '佐敦']
    
    const words = remainingText.split(/[\s,，、\n]+/).filter(w => {
      const cleanW = w.trim()
      if (cleanW.length === 0) return false
      return !ignoreWords.some(ignore => cleanW.includes(ignore))
    })

    if (words.length > 0) {
      // 🚀 終極防護：把殘留的數字從名字裡踢掉
      newClient.value.name = words[0].replace(/[0-9]/g, '').trim()
    }
  }

  smartInput.value = ''
}
const editingClient = ref({})

const allClientsOptions = computed(() => {
    return store.clients.map(c => ({ id: c.id, name: c.name, phone: c.phone }))
})
// 🟢 朋友介紹搜尋框專用變數
const referrerSearch = ref('')
const filteredReferrerOptions = computed(() => {
  const rawQ = referrerSearch.value.toLowerCase()
  if (!rawQ) return allClientsOptions.value
  const q = rawQ.replace(/\s+/g, '') // 🚀 搜尋字串去除所有空格
  return allClientsOptions.value.filter(c => {
    const nameMatch = c.name && c.name.toLowerCase().includes(q);
    const phoneStr = c.phone ? String(c.phone).replace(/\s+/g, '') : ''; // 🚀 資料庫號碼去除空格
    return nameMatch || phoneStr.includes(q);
  })
})

const getClientPackageStats = (clientName) => {
  if (!clientName) return { pkg10: 0, pkg35: 0, other: 0 }
  let pkg10 = 0, pkg35 = 0, other = 0
  const nameLower = clientName.trim().toLowerCase();
  
  store.transactions.forEach(t => {
    const tClientName = (t.client_name || '').trim().toLowerCase();
    const tNote = (t.note || '').trim().toLowerCase();
    const isMatch = (tClientName === nameLower) || tNote.includes(nameLower);
    
    if (isMatch && t.type === 'income') {
      const noteStr = t.note || ''
      if (t.amount === 850 || noteStr.includes('10點') || noteStr.includes('pkg_10')) {
        pkg10++
      } else if (t.amount === 2550 || t.amount === 2800 || noteStr.includes('35點') || noteStr.includes('pkg_35')) {
        pkg35++
      } else if (t.category === '運動' || t.category === '運動套票' || noteStr.includes('體驗卡') || noteStr.includes('堂')) {
        other++
      }
    }
  })
  return { pkg10, pkg35, other }
}

const parseLocal = (dateStr) => {
  if (!dateStr) return new Date(NaN);
  let str = String(dateStr).split('.')[0].replace(' ', 'T');
  str = str.replace(/Z$/i, '').replace(/[+-]\d{2}:\d{2}$/, '');
  return new Date(str); 
}

const formatTrialDate = (dateStr) => {
  if (!dateStr || dateStr === '無紀錄') return ''
  const str = String(dateStr).slice(0, 16) 
  if (str.length < 16) return dateStr
  const [d, t] = str.split('T')
  const [y, m, day] = d.split('-')
  return `${parseInt(m)}月${parseInt(day)}日 ${t}`
}

const toLocalDatetimeString = (dateStr) => {
  if (!dateStr) return ''
  return String(dateStr).slice(0, 16)
}

const getMyGiftStats = (client) => {
  if (!client || !client.name) return { available: 0, closestExpiry: null };
  
  let earnedTickets = [];
  let consumedCount = 0;
  
  store.transactions.forEach(t => {
    const isMatch = t.client_name === client.name || (t.note && t.note.includes(client.name));
    if (!isMatch) return;

    if (t.category === 'MyGift消耗') {
      consumedCount++;
    } 
    else if ((t.category === '運動套票' || t.category === '運動') && t.type === 'income') {
      let earn = 0;
      if (t.amount === 850 || (t.note && t.note.includes('10點'))) earn = 2;
      if (t.amount === 2550 || t.amount === 2800 || (t.note && t.note.includes('35點'))) earn = 5;
      
      if (earn > 0) {
        const expDate = parseLocal(t.created_at);
        if (!isNaN(expDate)) {
          expDate.setMonth(expDate.getMonth() + 3);
          for(let i=0; i<earn; i++) {
            earnedTickets.push(expDate);
          }
        }
      }
    }
  });
  
  earnedTickets.sort((a, b) => a - b);
  if (consumedCount > 0) earnedTickets.splice(0, consumedCount);
  
  const todayYMD = getLocalHKDate();
  const [ty, tm, td] = todayYMD.split('-').map(Number);
  const todayObj = new Date(ty, tm - 1, td);
  
  const validTickets = earnedTickets.filter(exp => {
    const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
    return expDay >= todayObj;
  });
  
  if (validTickets.length === 0) return { available: 0, closestExpiry: null };
  
  const closest = validTickets[0];
  const cYMD = `${closest.getFullYear()}-${String(closest.getMonth()+1).padStart(2,'0')}-${String(closest.getDate()).padStart(2,'0')}`;
  return { available: validTickets.length, closestExpiry: cYMD };
}

// 🟢 新增：智能尋找該客戶最早購買套票/運動的日期 (忽略大小寫與空格)
const getEarliestTxnDate = (clientName) => {
  if (!clientName) return null;
  let earliest = null;
  const nameLower = clientName.trim().toLowerCase();
  
  store.transactions.forEach(t => {
    const tClientName = (t.client_name || '').trim().toLowerCase();
    const tNote = (t.note || '').trim().toLowerCase();
    const isMatch = (tClientName === nameLower) || tNote.includes(nameLower);
    
    if (isMatch && t.type === 'income' && (t.category === '運動套票' || t.category === '運動' || t.category === '試堂')) {
      const d = String(t.created_at).slice(0, 10);
      if (!earliest || d < earliest) earliest = d;
    }
  });
  return earliest;
}

// 🟢 替換原本的 filteredClients
const filteredClients = computed(() => {
  // 1️⃣ 智能修復：遍歷所有客戶，校正加入日期與狀態
  let list = store.clients.map(c => {
    let fixedClient = { ...c }
    
    // 🚀 終極防彈裝甲：無論是空值、大寫、還是多咗空格，全部強制轉做標準小寫！
    fixedClient.status = String(fixedClient.status || 'active').trim().toLowerCase()

    let earliest = getEarliestTxnDate(c.name)
    
    if (earliest) {
        if (!fixedClient.join_date || fixedClient.join_date > earliest) {
            fixedClient.join_date = earliest
        }

        const nameLower = c.name.trim().toLowerCase();
        const hasRealPackage = store.transactions.some(t => {
            const tClientName = (t.client_name || '').trim().toLowerCase();
            const tNote = (t.note || '').trim().toLowerCase();
            const isMatch = (tClientName === nameLower) || tNote.includes(nameLower);
            return isMatch && t.type === 'income' && (t.category === '運動套票' || t.category === '運動');
        });

        if (hasRealPackage && (fixedClient.status === 'prospect' || fixedClient.status === 'absent')) {
            fixedClient.status = 'active'
        }
    }
    return fixedClient
  })
  

  // 2️⃣ 接下來走原本的搜尋與過濾邏輯
  const rawQ = clientSearch.value.toLowerCase()
  const q = rawQ.replace(/\s+/g, '') // 🚀 搜尋字串去除空格
  if (q) {
    list = list.filter(c => {
      const nameMatch = c?.name && c?.name.toLowerCase().replace(/\s+/g, '').includes(q);
      const phoneStr = c?.phone ? String(c?.phone).replace(/\s+/g, '') : ''; // 🚀 資料庫號碼去除空格
      const staffMatch = String(c?.handled_by || '').toLowerCase().replace(/\s+/g, '').includes(q)
      return nameMatch || phoneStr.includes(q) || staffMatch;
    })
  }
  
  if (filterBranch.value) {
    list = list.filter(c => c?.branch === filterBranch.value)
  }
  
  if (filterStatus.value === 'active') {
    list = list.filter(c => c?.status === 'active')
  } else if (filterStatus.value === 'prospect') {
    list = list.filter(c => c?.status === 'prospect')
  } else if (filterStatus.value === 'absent') {
    list = list.filter(c => c?.status === 'absent')
  }

  if (filterMyGiftExpiring.value) {
    const todayYMD = getLocalHKDate();
    const [ty, tm, td] = todayYMD.split('-').map(Number);
    const todayObj = new Date(ty, tm - 1, td);

    list = list.filter(c => {
      if(!c) return false;
      const stats = getMyGiftStats(c);
      if (stats.available === 0 || !stats.closestExpiry) return false;
      const [ey, em, ed] = stats.closestExpiry.split('-').map(Number);
      const expObj = new Date(ey, em - 1, ed);
      const diffDays = (expObj - todayObj) / 86400000;
      return diffDays >= 0 && diffDays <= 30;
    });
  }

  if (sortBy.value === 'name') {
    list.sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'zh-HK'))
  } else if (sortBy.value === 'phone') {
    list.sort((a, b) => (a?.phone || '').localeCompare(b?.phone || ''))
  } else if (sortBy.value === 'expiry_asc') {
    list.sort((a, b) => String(a?.expiry_date || '9999-99-99').localeCompare(String(b?.expiry_date || '9999-99-99')))
  } else if (sortBy.value === 'expiry_desc') {
    list.sort((a, b) => String(b?.expiry_date || '0000-00-00').localeCompare(String(a?.expiry_date || '0000-00-00')))
  }

  return list
})

const showActionModal = ref(false)
const selectedClientForAction = ref(null)
const quickFlow = ref('')
const quickClient = ref(null)
const quickOutcome = ref('')
const quickPackage = ref('pkg_10')
const quickDate = ref('')
const quickStaff = ref('')
const quickSaving = ref(false)
const quickError = ref('')
const quickSaveLocked = ref(false)
const quickPackageRows = ref([])
const quickApplyTrialDiscount = ref(false)
const quickPackages = computed(() => Object.fromEntries(quickPackageRows.value
  .filter(pkg => ['pkg_10', 'pkg_35'].includes(pkg.package_key) && pkg.is_active)
  .map(pkg => {
    const calc = calculateMovementPackage(pkg, {
      isNewCustomer: quickFlow.value === 'trial' && quickOutcome.value.startsWith('opened_') && quickApplyTrialDiscount.value
    })
    return [pkg.package_key, {
      label: pkg.label, amount: calc.amount, cost: calc.cost, profit: calc.profit,
      category: pkg.category, expiryYears: pkg.expiry_years, incrementCount: pkg.increment_pkg_count
    }]
  })))
const quickNeedsPackage = computed(() => quickFlow.value === 'renewal' || quickOutcome.value.startsWith('opened_'))
const quickTotals = computed(() => {
  return quickPackages.value[quickPackage.value] || { label: '未有可用套票', amount: 0, cost: 0, profit: 0 }
})

async function openQuickFlow(kind) {
  quickClient.value = selectedClientForAction.value
  quickFlow.value = kind
  quickOutcome.value = kind === 'trial' ? getTrialResultValue(quickClient.value) : ''
  quickPackage.value = quickOutcome.value === 'opened_big' ? 'pkg_35' : 'pkg_10'
  quickDate.value = getLocalHKDate()
  quickStaff.value = store.currentUser || store.settings?.payees?.[0] || '系統'
  quickApplyTrialDiscount.value = kind === 'trial' && store.transactions.some(t =>
    String(t.client_id) === String(quickClient.value?.id) && t.category === '試堂' && Number(t.amount) === 98)
  quickError.value = ''
  quickSaveLocked.value = false
  showActionModal.value = false
  try {
    const rows = isReadOnlyPreview && new URLSearchParams(window.location.search).has('demo')
      ? DEFAULT_MOVEMENT_PACKAGES : await loadMovementPackages({ ensureDefaults: false })
    quickPackageRows.value = rows.length ? rows : DEFAULT_MOVEMENT_PACKAGES
  } catch (error) {
    quickPackageRows.value = []
    quickError.value = '未能讀取最新套票設定：' + error.message
  }
}

function chooseQuickOutcome(outcome) {
  quickOutcome.value = outcome
  if (outcome === 'opened_small') quickPackage.value = 'pkg_10'
  if (outcome === 'opened_big') quickPackage.value = 'pkg_35'
}

function addYear(dateText) {
  const [year, month, day] = dateText.split('-').map(Number)
  const d = new Date(year + 1, month - 1, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function saveQuickFlow() {
  if (quickSaving.value || quickSaveLocked.value || !quickClient.value) return
  if (isReadOnlyPreview) { quickError.value = '預覽版只供查看，儲存操作要喺正式版進行。'; return }
  if (quickFlow.value === 'trial' && !quickOutcome.value) { quickError.value = '請先揀試堂結果。'; return }
  if (quickNeedsPackage.value && !quickStaff.value.trim()) { quickError.value = '請填寫處理人。'; return }
  if (quickNeedsPackage.value && !quickPackages.value[quickPackage.value]) { quickError.value = '呢款套票未啟用或未能讀取，請先到設定核對。'; return }
  if (quickNeedsPackage.value && !/^\d{4}-\d{2}-\d{2}$/.test(quickDate.value)) { quickError.value = '請揀有效日期。'; return }
  quickSaving.value = true
  quickError.value = ''
  const client = quickClient.value
  const opened = quickFlow.value === 'trial' && quickOutcome.value.startsWith('opened_')
  let transactionSaved = false
  let clientSaved = false
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user?.email) throw new Error('登入已失效，請重新登入。')
    if (quickNeedsPackage.value) {
      const pkg = quickPackages.value[quickPackage.value]
      const now = new Date()
      const stamp = `${quickDate.value}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}+08:00`
      const row = {
        type: 'income', category: pkg.category, amount: pkg.amount, cost: pkg.cost,
        profit: pkg.profit, branch: client.branch || '觀塘',
        client_id: client.id, client_name: client.name,
        staff: quickStaff.value.trim(), handled_by: quickStaff.value.trim(),
        created_at: stamp, own_email: user.email,
        note: `售出 ${pkg.label}${opened ? '（試堂開卡）' : '（續卡）'}${opened && quickApplyTrialDiscount.value ? '（扣已付試堂$98）' : ''}`
      }
      const { error: txnError } = await supabase.from('transactions').insert(row)
      if (txnError) throw txnError
      transactionSaved = true
    }

    const patch = {}
    if (quickFlow.value === 'trial') {
      patch.remark = replaceTrialResultMarker(client.remark, quickOutcome.value)
      patch.status = quickOutcome.value === 'no_show' ? 'absent' :
        quickOutcome.value.startsWith('opened_') ? 'active' : 'prospect'
    }
    if (quickNeedsPackage.value) {
      patch.status = 'active'
      if (quickTotals.value.incrementCount) patch.pkg_count = (Number(client.pkg_count) || 0) + 1
      patch.join_date = !client.join_date || quickDate.value < client.join_date ? quickDate.value : client.join_date
      const base = client.expiry_date && client.expiry_date > quickDate.value ? client.expiry_date : quickDate.value
      if (quickTotals.value.expiryYears) patch.expiry_date = addYear(base)
    }
    const { error: clientError } = await supabase.from('clients').update(patch).eq('id', client.id)
    if (clientError) throw clientError
    clientSaved = true

    if (quickFlow.value === 'trial' && ['no_open_normal', 'no_open_mygift'].includes(quickOutcome.value)) {
      await syncTrialProfitForClient({ ...client, ...patch }, quickOutcome.value)
    }
    if (quickFlow.value === 'trial' && quickOutcome.value === 'no_show') {
      const trialTxn = store.transactions.find(t => t.client_name === client.name && t.category === '試堂' && t.amount === 98 && Number(t.cost) > 0)
      if (trialTxn) {
        const { error: trialError } = await supabase.from('transactions').update({ cost: 0, profit: 98 }).eq('id', trialTxn.id)
        if (trialError) throw trialError
      }
    }
    await store.syncAll()
    quickFlow.value = ''
    alert(opened ? '試堂結果同開卡收入已記錄。' : transactionSaved ? '續卡收入同客戶有效期已更新。' : '試堂結果已記錄。')
  } catch (error) {
    quickError.value = transactionSaved && !clientSaved
      ? `收入已寫入，但客戶資料未能同步：${error.message}。請勿再次按儲存，以免重複入帳；可到「修改客戶資料」修正。`
      : clientSaved ? `客戶結果已儲存，但相關帳目更新未完成：${error.message}。請勿再按儲存，避免重複記錄。`
        : `未能儲存：${error.message}`
    if (transactionSaved || clientSaved) await store.syncAll()
    if (transactionSaved || clientSaved) quickSaveLocked.value = true
  } finally {
    quickSaving.value = false
  }
}

function openActionModal(client) {
  selectedClientForAction.value = client
  showActionModal.value = true
}

function handleActionEdit() {
  showActionModal.value = false
  openEditModal(selectedClientForAction.value)
}

function handleActionMovement() {
  showActionModal.value = false
  store.quickActionClient = selectedClientForAction.value.name
  store.view = 'movement' 
}

function handleActionRetail() {
  showActionModal.value = false
  store.quickActionClient = selectedClientForAction.value.name
  store.view = 'retail' 
}

function openAddModal() {
    newClient.value = { ...defaultNewClient, branch: savedBranch(), join_date: getLocalHKDate(), handled_by: store.currentUser || 'kwan' }
    consumeMyGift.value = false 
    autoChargeTrial.value = false // 預設不勾選
    referrerSearch.value = ''
    activeTab.value = 'basic' // 🚀 新增：每次打開都預設回到「基本資料」分頁
    showMoreNewClient.value = false
    smartInput.value = ''
    scheduleDate.value = getLocalHKDate()
    scheduleOpened.value = false
    scheduleRows.value = []
    scheduleError.value = ''
    scheduleFromCache.value = false
    scheduleCachedAt.value = 0
    selectedCourse.value = null
    showAddModal.value = true
}

async function handleAddClient() {
  if (!newClient.value.name) return alert('請填寫姓名')
  if (isReadOnlyPreview) return alert('預覽版只供查看，新增客戶要喺正式版操作。')
  if (selectedCourse.value) {
    checkingCourse.value = true
    try {
      const rows = await fetchClasses(selectedCourse.value.branch, selectedCourse.value.date, true)
      if (!findAvailableCourse(rows, selectedCourse.value)) {
        scheduleRows.value = rows
        clearSelectedCourse()
        scheduleError.value = '課堂剛剛改咗或已額滿，請重新揀；客戶資料未有儲存。'
        return
      }
    } catch (error) {
      scheduleError.value = `未能核對最新課堂，客戶資料未有儲存：${error.message}`
      return
    } finally {
      checkingCourse.value = false
    }
  }
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')
  
  const dataToInsert = { 
    ...newClient.value, 
    own_email: user.email,
    user_id: user.id 
  }
  
  if (dataToInsert.source !== '朋友介紹' && dataToInsert.source !== '廣告+朋友介紹') {
      dataToInsert.referred_by_id = null
  }
  
  if (!dataToInsert.expiry_date) dataToInsert.expiry_date = null
  if (!dataToInsert.join_date) dataToInsert.join_date = null
  
  dataToInsert.trial_date = dataToInsert.trial_date ? dataToInsert.trial_date.slice(0, 16) : null

  const { error } = await supabase.from('clients').insert([dataToInsert])
  if (error) return alert('新增失敗: ' + error.message)
  try { localStorage.setItem('bz_last_branch', dataToInsert.branch) } catch { /* optional preference */ }
  
  const now = new Date();
  const hkYMD = getLocalHKDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  if (consumeMyGift.value && dataToInsert.referred_by_id) {
    const referrer = store.clients.find(c => c.id === dataToInsert.referred_by_id);
    if (referrer) {
     const dummyTxn = {
        type: 'expense', amount: 52, cost: 52, profit: -52,
        note: `推薦新客: ${dataToInsert.name}`,
        client_name: referrer.name,
        category: 'MyGift消耗',
        handled_by: store.currentUser || '系統自動',
        own_email: user.email,
        created_at: `${hkYMD}T${hh}:${mm}:${ss}+08:00` // 👈 加上香港時區尾巴
      };
      await supabase.from('transactions').insert(dummyTxn);
    }
  } 
  
  // 🚀 自動收取試堂費邏輯
  if (autoChargeTrial.value) {
    const trialIncomeTxn = {
      type: 'income', 
      amount: 98, 
      cost: 52, 
      profit: 46, // $98 - $52 = $46
      note: `預約試堂收費: ${dataToInsert.name}`,
      client_name: dataToInsert.name,
      category: '試堂',
      handled_by: dataToInsert.handled_by || store.currentUser || '系統',
      own_email: user.email,
      created_at: `${hkYMD}T${hh}:${mm}:${ss}+08:00`
    };
    await supabase.from('transactions').insert(trialIncomeTxn);
  }

  await store.syncAll(); // 🚀 補丁 1：強制等待資料庫最新數據下載完成
  showAddModal.value = false; 
  
  // 🚀 補丁 2：延遲 0.1 秒彈出，讓 Vue 有時間把新客戶畫到畫面上！
  setTimeout(() => {
    if (autoChargeTrial.value) {
       alert('✅ 新增成功！\n💰 已自動寫入 $98 試堂費紀錄。') 
    } else {
       alert('✅ 新增成功') 
    }
  }, 100);
}

async function handleUpdateClient() {
  if (!editingClient.value.name) return alert('請填寫姓名')
  
  const dataToUpdate = { ...editingClient.value }
  
  if (dataToUpdate.source !== '朋友介紹' && dataToUpdate.source !== '廣告+朋友介紹') {
      dataToUpdate.referred_by_id = null
  }
  
  if (!dataToUpdate.expiry_date) dataToUpdate.expiry_date = null
  if (!dataToUpdate.join_date) dataToUpdate.join_date = null

  dataToUpdate.trial_date = dataToUpdate.trial_date ? dataToUpdate.trial_date.slice(0, 16) : null

  const trialResultChanged = editingTrialResult.value !== editingOriginalTrialResult.value
  if (trialResultChanged) {
    dataToUpdate.remark = replaceTrialResultMarker(dataToUpdate.remark, editingTrialResult.value)
    if (editingTrialResult.value === 'no_show') dataToUpdate.status = 'absent'
    else if (editingTrialResult.value === 'no_open_normal' || editingTrialResult.value === 'no_open_mygift') dataToUpdate.status = 'prospect'
    else if (editingTrialResult.value === 'opened_small' || editingTrialResult.value === 'opened_big') dataToUpdate.status = 'active'
  }

  // 🚀 智能引擎：偵測如果將客戶改為「缺席」，自動將其 98 蚊試堂費的成本改為 0
  if (dataToUpdate.status === 'absent') {
    const targetTxn = store.transactions.find(t => 
      t.client_name === dataToUpdate.name && 
      t.category === '試堂' && 
      t.amount === 98
    )

    if (targetTxn && targetTxn.cost > 0) {
      await supabase.from('transactions').update({
        cost: 0,
        profit: 98 // 利潤全收
      }).eq('id', targetTxn.id)
      console.log('✅ 已自動將缺席客人的試堂成本改為 0')
    }
  }

  const { error } = await supabase.from('clients').update(dataToUpdate).eq('id', dataToUpdate.id)
  
  if (error) alert('更新失敗: ' + error.message)
  else {
    if (trialResultChanged) {
      await syncTrialProfitForClient(dataToUpdate, editingTrialResult.value)
    }
    await store.syncAll(); // 🚀 等待同步
    showEditModal.value = false; 
    setTimeout(() => {
      alert(dataToUpdate.status === 'absent' ? '✅ 修改已儲存\n(已自動將試堂費成本設為 0)' : '✅ 修改已儲存') 
    }, 100);
  }
}

async function handleDeleteClient() {
  if(!confirm(`⚠️ 徹底刪除「${editingClient.value.name}」？此操作不可還原！`)) return
  const { error } = await supabase.from('clients').delete().eq('id', editingClient.value.id)
  if (error) alert('刪除失敗')
  else { 
    await store.syncAll(); // 🚀 等待同步
    showEditModal.value = false; 
    setTimeout(() => alert('已刪除'), 100);
  }
}

function openEditModal(client) {
  editingClient.value = { ...client }
  
  // 🚀 彈窗防護：打開時自動校正狀態
  editingClient.value.status = String(editingClient.value.status || 'active').trim().toLowerCase()

  if (editingClient.value.trial_date) {
    editingClient.value.trial_date = toLocalDatetimeString(editingClient.value.trial_date)
  }
  referrerSearch.value = ''
  editingTrialResult.value = getTrialResultValue(editingClient.value)
  editingOriginalTrialResult.value = editingTrialResult.value
  activeTab.value = 'basic'
  showEditModal.value = true
}

const getClientGen = (id) => {
  let g = 1; let c = store.clients.find(x => x.id === id); let count = 0
  while (c && c.referred_by_id && count < 15) { g++; c = store.clients.find(x => x.id === c.referred_by_id); count++ }
  return g
}

const getExpiryClass = (dateStr) => {
  if (!dateStr) return ''
  const targetStr = String(dateStr).slice(0, 10)
  const todayYMD = getLocalHKDate()
  if (targetStr < todayYMD) return 'tag-red'
  
  const [ty, tm, td] = targetStr.split('-').map(Number)
  const [ny, nm, nd] = todayYMD.split('-').map(Number)
  const tDate = new Date(ty, tm-1, td)
  const today = new Date(ny, nm-1, nd)
  const diffDays = (tDate - today) / 86400000
  
  return diffDays < 14 ? 'tag-orange' : 'tag-green'
}

function downloadCSVTemplate() {
    // 🚀 加入 \uFEFF 這是關鍵，它告訴 Excel 這是一個 UTF-8 的中文檔案，不會亂碼
    const BOM = "\uFEFF"; 
    const header = "姓名(必填),電話,分店(觀塘/中環/佐敦),狀態(active/prospect/absent),加入日期(YYYY-MM-DD),來源(廣告/傳單/朋友介紹等),到期日(YYYY-MM-DD),備註\n";
    const sample1 = "王大明,98765432,觀塘,active,2026-01-01,廣告,,範例客戶\n";
    
    const csvContent = BOM + header + sample1;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "fitwork_clients_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function triggerFileInput() {
    document.getElementById('csvFileInput').click()
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const { data: authData } = await supabase.auth.getSession();
  const currentUserEmail = authData?.session?.user?.email;

  if (!currentUserEmail) {
    alert('❌ 系統偵測不到登入狀態，請確認網路連線或重新登入。');
    e.target.value = ''; 
    return;
  }

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target.result;
      const lines = content.split(/\r?\n/);
      
      const rows = lines.slice(1).filter(line => line.trim() !== '');
      
      let insertedCount = 0;
      let updatedCount = 0;
      const processedPhones = new Set(); // 🚀 護城河 1：防止同一個 CSV 檔案裡面有重複電話

      // 💡 溫馨提示，等同事知道系統會做防重檢查
      const isConfirmed = confirm(`準備匯入 ${rows.length} 筆資料。\n系統會自動檢查「電話號碼」：\n🔄 若已存在 ➡️ 更新資料\n✨ 若未存在 ➡️ 新增客戶\n\n是否繼續？`);
      if (!isConfirmed) { e.target.value = ''; return; }

      for (const line of rows) {
        const row = line.split(',');
        
        if (!row[0]) continue; 

        // 取得電話號碼並清理前後空白
        const phoneNum = String(row[1] || '').trim();

        // 🚀 如果檔案內已經處理過這個電話，直接跳過，慳返時間！
        if (phoneNum && processedPhones.has(phoneNum)) {
            continue;
        }
        if (phoneNum) processedPhones.add(phoneNum);

        // 🚀 護城河 2：檢查現有系統中是否已經有這個電話
        // 如果無電話號碼，就當作新客 (因為無法比對)
        const existingClient = phoneNum 
            ? store.clients.find(c => c.phone === phoneNum) 
            : null;

        // 準備好要寫入的資料包
       const payload = {
          name: String(row[0] || '').trim(),
          phone: phoneNum,
          branch: (row[2] || '觀塘').trim(),
          status: String(row[3] || 'active').trim().toLowerCase(),
          join_date: row[4] ? row[4].trim() : null,
          source: (row[5] || '其他').trim(),
          expiry_date: row[6] ? row[6].trim() : null,
          remark: (row[7] || '').trim(),
          own_email: currentUserEmail, // 🚀 修正：正確的欄位名稱
          user_id: authData?.session?.user?.id // 🚀 修正：加入 user_id 確保符合安全規則
        };
        if (existingClient) {
            // 🔄 撞電話：執行 Update (更新舊客資料)
            const { error } = await supabase.from('clients').update(payload).eq('id', existingClient.id);
            if (!error) updatedCount++;
        } else {
            // ✨ 唔撞電話：執行 Insert (新增客底)
            const { error } = await supabase.from('clients').insert([payload]);
            if (!error) insertedCount++;
        }
      }
      
      // 🚀 補上 await 等待畫面刷新，並顯示清晰的結果報告
      await store.syncAll(); 
      setTimeout(() => {
        alert(`✅ 匯入完畢！\n\n✨ 成功新增：${insertedCount} 位新客\n🔄 成功更新：${updatedCount} 位舊客\n\n資料已歸屬至 (${currentUserEmail})。`);
      }, 100);
      
    } catch (err) {
      console.error('匯入出錯:', err);
      alert('❌ 檔案讀取失敗，請確保使用正確的 CSV 格式。');
    } finally {
      e.target.value = ''; 
    }
  };
  
  reader.readAsText(file);
}
</script>

<template>
  <div class="page">
    <div class="header-section">
      <div><h2 class="page-title">客戶</h2><p class="subtitle">{{ filteredClients.length }} 位符合條件</p></div>
      <button class="btn-primary bz-client-add" type="button" @click="openAddModal">＋ 新客戶</button>
    </div>
    <MonitorReconcile @select-client="openActionModal" />
    
    <div class="card search-box">
      <!-- 1. 搜尋列 (減少了上下 padding) -->
      <input class="inp-clean" v-model="clientSearch" placeholder="🔍 即時搜尋姓名、電話、負責人...">

      <!-- 2. 客戶狀態過濾 (移除分店，減輕滑動負擔) -->
      <div class="filter-row">
        <button class="f-btn" :class="{active: filterStatus===''}" @click="filterStatus=''">全部</button>
        <button class="f-btn" :class="{active: filterStatus==='active'}" @click="filterStatus='active'">⭐️ 正式會員</button>
        <button class="f-btn" :class="{active: filterStatus==='prospect'}" @click="filterStatus='prospect'">👀 試堂/預約</button>
        <button class="f-btn" :class="{active: filterStatus==='absent'}" @click="filterStatus='absent'">⚠️ 缺席/需補堂</button>
        <div class="v-line"></div>
        <button class="f-btn mygift-btn" :class="{active: filterMyGiftExpiring}" @click="filterMyGiftExpiring = !filterMyGiftExpiring">🎁 MyGift 快過期</button>
      </div>

      <!-- 3. 分店過濾列 (獨立一行，放在原本排序的位置) -->
      <div class="branch-row">
        <span class="sort-label">📍 分店：</span>
        <button v-for="b in ['觀塘','中環','佐敦']" :key="b" class="f-btn" :class="{active: filterBranch===b}" @click="filterBranch = filterBranch===b ? '' : b">{{ b }}</button>
      </div>

      <!-- 4. 底部滾動列 (排序 + 下載 + 匯入) -->
      <div class="bottom-scroll-row">
        <div style="display:flex; align-items:center; gap: 6px;">
          <span class="sort-label">排序：</span>
          <select v-model="sortBy" class="sort-select">
            <option value="default">🕒 預設 (最新加入)</option>
            <option value="name">🔤 姓名 (A-Z)</option>
            <option value="phone">📞 號碼</option>
            <option value="expiry_asc">⏳ 到期(近到遠)</option>
            <option value="expiry_desc">📅 到期(遠到近)</option>
          </select>
        </div>
        <div class="v-line" style="margin: 0 4px;"></div>
        <button class="btn-outline" @click="downloadCSVTemplate">📥 下載匯入格式</button>
        <button class="btn-outline" style="border-color:#4f46e2; color:#4f46e2; font-weight:900;" @click="triggerFileInput">📤 批量匯入客戶</button>
        <input type="file" id="csvFileInput" accept=".csv" style="display: none;" @change="handleImport">
      </div>
    </div>

    <div class="list-container">
      <p v-if="!filteredClients.length" class="bz-empty">冇符合條件嘅客戶，試吓清除搜尋或更改篩選。</p>
      <div v-for="c in filteredClients" :key="c.id" class="client-card" @click="openActionModal(c)">
        <div class="c-avatar">{{ (c.name || '?').charAt(0) }}</div>
        <div class="c-main">
          <div class="c-name-row">
            <span class="c-name">{{ c.name }}</span>
            <span v-if="c.is_vip" class="badge-vip">{{ c.vip_tier || 'VIP' }}</span>
            <span v-if="c.is_marathon" class="badge-run">RUN</span>
          </div>
          <div class="c-meta">
            {{ c.phone || '無電話' }} · {{ c.branch }}
            
            <a v-if="c.phone" :href="'https://wa.me/852' + c.phone" target="_blank" class="wts-btn" @click.stop>💬 Wts</a>

            <span v-if="c.status === 'prospect' && c.trial_date" class="trial-time-tag">
              ⏰ {{ formatTrialDate(c.trial_date) }}
            </span>
            
            <span v-if="c.status === 'absent'" class="trial-time-tag" style="background: #fee2e2; color: #ef4444;">
              ⚠️ 缺席需補堂
            </span>
          </div>

          <div class="c-meta" v-if="c.remark" style="color: #4f46e2; font-weight: 700; margin-top: 6px; background: #eef2ff; padding: 6px 10px; border-radius: 8px;">
            📝 {{ c.remark }}
          </div>

          <div class="c-packages" v-if="c.status !== 'prospect' && c.status !== 'absent'">
            🎟️ 買卡: 
            <span class="pkg-tag t-10" v-if="getClientPackageStats(c.name).pkg10 > 0">10點 <b style="font-size:12px;">x{{ getClientPackageStats(c.name).pkg10 }}</b></span>
            <span class="pkg-tag t-35" v-if="getClientPackageStats(c.name).pkg35 > 0">35點 <b style="font-size:12px;">x{{ getClientPackageStats(c.name).pkg35 }}</b></span>
            
            <span class="pkg-tag" style="background: #0ea5e9;" v-if="getClientPackageStats(c.name).other > 0">其他套票 <b style="font-size:12px;">x{{ getClientPackageStats(c.name).other }}</b></span>
            
            <span class="pkg-zero" v-if="getClientPackageStats(c.name).pkg10 === 0 && getClientPackageStats(c.name).pkg35 === 0 && getClientPackageStats(c.name).other === 0">尚未買卡</span>
            
            <span class="pkg-tag mygift-tag" v-if="getMyGiftStats(c).available > 0">
              🎁 MyGift: {{ getMyGiftStats(c).available }}張 
              <b class="expiry-text">(至 {{ getMyGiftStats(c).closestExpiry }})</b>
            </span>
          </div>
          
        </div>
        <div class="c-side">
          <div class="c-gen" v-if="c.status !== 'prospect' && c.status !== 'absent'">Gen {{ getClientGen(c.id) }}</div>
          <div :class="['c-expiry', getExpiryClass(c.expiry_date)]">
            {{ c.status === 'prospect' ? '預約中' : (c.status === 'absent' ? '缺席' : (c.expiry_date || '無效期')) }}
          </div>
        </div>
      </div>
    </div>

    <button class="main-fab" @click="openAddModal">+</button>

    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="center-modal scrollable-modal" style="padding-bottom: 0;">
        <div class="m-header">🔧 客戶詳細設定 <button class="close-x" @click="showEditModal=false">✕</button></div>
        
       <div class="tab-nav">
          <button class="tab-btn" :class="{active: activeTab === 'basic'}" @click="activeTab = 'basic'">👤 基本</button>
          <button class="tab-btn" :class="{active: activeTab === 'source'}" @click="activeTab = 'source'">📅 來源/預約</button>
          <button class="tab-btn" :class="{active: activeTab === 'advanced'}" @click="activeTab = 'advanced'">💎 進階設定</button>
        </div>

        <div class="toggle-group sticky-toggle">
          <button class="t-btn" :class="{active: editingClient.status === 'active'}" @click="editingClient.status = 'active'">正式會員</button>
          <button class="t-btn" :class="{active: editingClient.status === 'prospect'}" @click="editingClient.status = 'prospect'">試堂預約</button>
          <button class="t-btn" :class="{active: editingClient.status === 'absent'}" @click="editingClient.status = 'absent'" style="color: #ef4444;">缺席補堂</button>
        </div>

        <div class="tab-content-area">
          <div v-show="activeTab === 'basic'" class="tab-pane">
            <div class="f-item"><label>姓名</label><input v-model="editingClient.name" class="modern-inp"></div>
           <div class="f-item"><label>電話</label><input v-model="editingClient.phone" type="tel" inputmode="tel" class="modern-inp" placeholder="請輸入電話"></div>
            <div class="f-item">
              <label>分店</label>
              <select v-model="editingClient.branch" class="modern-select">
                <option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
              </select>
            </div>
          </div>

          <div v-show="activeTab === 'source'" class="tab-pane">
            <div class="f-item">
                <label>來源</label>
                <select v-model="editingClient.source" class="modern-select">
                    <option value="廣告">廣告</option><option value="廣告+朋友介紹">廣告 + 朋友介紹</option>
                    <option value="傳單">傳單</option><option value="IG">IG</option>
                    <option value="朋友介紹">朋友介紹</option><option value="朋友">朋友</option>
                </select>
            </div>
            
            <div class="f-item" v-if="editingClient.source === '朋友介紹' || editingClient.source === '廣告+朋友介紹'" style="margin-top: 12px;">
                <label>介紹人</label>
                <input v-model="referrerSearch" class="modern-inp" placeholder="🔍 快速搜尋姓名或電話..." style="margin-bottom: 8px; font-size: 14px; padding: 10px;">
                <select v-model="editingClient.referred_by_id" class="modern-select">
                    <option :value="null">請選擇介紹人...</option>
                    <option v-for="c in filteredReferrerOptions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.phone }})</option>
                </select>
            </div>

            <div class="f-item" v-if="editingClient.status === 'prospect' || editingClient.status === 'absent'" style="margin-top: 12px; animation: popIn 0.3s ease-out;">
              <label>⏰ {{ editingClient.status === 'absent' ? '下次補堂日期與時間' : '預約試堂日期與時間' }}</label>
              <input type="datetime-local" v-model="editingClient.trial_date" class="modern-date" style="margin-bottom: 10px;">
              <label>📍 預約試堂地點</label>
              <select v-model="editingClient.branch" class="modern-select">
                <option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
              </select>
            </div>
            
            <div class="f-item" v-if="editingClient.trial_date" style="margin-top: 12px; background:#f8fafc; border:1px solid #e2e8f0; padding:12px; border-radius:14px;">
              <label>📝 試堂結果</label>
              <select v-model="editingTrialResult" class="modern-select">
                <option value="">未填結果／保留舊資料判斷</option>
                <option value="opened_small">✅ 已出席・開小卡（常規A）</option>
                <option value="opened_big">✅ 已出席・開大卡（常規B）</option>
                <option value="no_open_normal">👀 已出席・廣告/普通試堂未開卡（+$44.6）</option>
                <option value="no_open_mygift">🎁 已出席・MyGift 未開卡（-$53.4）</option>
                <option value="no_show">🚫 沒有出席</option>
              </select>
              <div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.45;">
                新結果會優先供漏斗統計使用；舊客戶未填結果時仍保留原本購買紀錄／狀態判斷。
              </div>
            </div>

            <div class="grid-2" style="margin-top: 12px;">
              <div class="f-item"><label>加入日期</label><input type="date" v-model="editingClient.join_date" class="modern-date"></div>
              <div class="f-item"><label>套票到期日</label><input type="date" v-model="editingClient.expiry_date" class="modern-date" placeholder="若無可留空"></div>
            </div>
          </div>

          <div v-show="activeTab === 'advanced'" class="tab-pane">
            <div class="f-item">
              <label>💬 客戶備註</label>
              <textarea v-model="editingClient.remark" class="modern-inp" style="height: 100px;" placeholder="輸入備註事項 (例如：缺席原因、客戶要求)..."></textarea>
            </div>

            <label style="font-size: 12px; font-weight: 800; color: #475569; margin: 15px 0 6px; display:block;">🏆 項目設定</label>
            <div class="row-flex">
              <div class="toggle-card" :class="{active: editingClient.is_marathon}" @click="editingClient.is_marathon = !editingClient.is_marathon">🏃 馬拉松</div>
              <div class="toggle-card" :class="{active: editingClient.is_vip}" @click="editingClient.is_vip = !editingClient.is_vip">💎 VIP 折扣</div>
            </div>

            <div class="f-item" v-if="editingClient.is_vip" style="margin-top: 15px; animation: popIn 0.3s ease-out;">
              <label>🎖️ 請選擇 VIP 等級</label>
              <select v-model="editingClient.vip_tier" class="modern-select">
                <option value="銅級(88折)">🥉 銅級 (88折)</option><option value="銀級(75折)">🥈 銀級 (75折)</option>
                <option value="金級(65折)">🥇 金級 (65折)</option><option value="直接58折">💎 直接58折</option><option value="領班(半折)">👑 領班 (半折)</option>
              </select>
            </div>
          </div>
        </div>

        <div class="sticky-action-row">
          <button class="btn-del" @click="handleDeleteClient">🗑️ 刪除</button>
          <button class="btn-confirm" @click="handleUpdateClient">確認修改</button>
        </div>

      </div>
    </div>
   <div v-if="showAddModal" class="modal-overlay bz-client-overlay" @click.self="showAddModal = false">
      <div class="center-modal bz-client-form">
        <div class="m-header"><span>新增客戶<small>先記低，其他資料可以稍後補</small></span><button class="close-x" type="button" aria-label="關閉" @click="showAddModal=false">✕</button></div>
        <div class="bz-client-form-body">
          <div class="bz-client-status" role="group" aria-label="客戶類型">
            <button type="button" :class="{active:newClient.status==='prospect'}" @click="newClient.status='prospect'">準備試堂</button>
            <button type="button" :class="{active:newClient.status==='active'}" @click="newClient.status='active'">已是會員</button>
          </div>
          <div class="f-item"><label for="new-client-name">姓名 <b>必填</b></label><input id="new-client-name" v-model.trim="newClient.name" class="modern-inp" autocomplete="name" placeholder="點稱呼佢？"></div>
          <div class="f-item"><label for="new-client-phone">電話 <span>方便之後搵返</span></label><input id="new-client-phone" v-model.trim="newClient.phone" type="tel" inputmode="tel" autocomplete="tel" class="modern-inp" placeholder="例如 9876 5432"></div>
          <div class="f-item"><label>分店 <span>預設上次選擇</span></label><div class="bz-branch-choices" role="group" aria-label="分店"><button v-for="branch in branches" :key="branch" type="button" :class="{active:newClient.branch===branch}" @click="newClient.branch=branch">{{ branch }}</button></div></div>
          <div v-if="newClient.status==='prospect'" class="bz-trial-booking">
            <div class="bz-section-head"><strong>試堂時間</strong><span>未約好可以留空，之後再補</span></div>
            <div class="bz-class-picker">
              <div class="bz-class-picker-head"><strong>由課程時間表揀</strong><button type="button" @click="loadClasses">{{ scheduleOpened ? '重新讀取' : '查看課堂' }}</button></div>
              <div v-if="scheduleOpened" class="bz-class-picker-body">
                <label for="class-schedule-date">課堂日期</label><input id="class-schedule-date" v-model="scheduleDate" type="date" class="modern-date" :min="todayStr" :max="maxScheduleDate">
                <p v-if="scheduleSample" class="bz-class-note">呢啲係 {{ sampleClassDate }} 嘅示範課堂；示範模式唔會讀取即時課表。</p>
                <p v-if="scheduleLoading || checkingCourse" class="bz-class-note" role="status">{{ checkingCourse ? '核對最新課堂中…' : scheduleFromCache ? '正更新最新課表…' : '讀取課堂中…' }}</p>
                <p v-if="scheduleError" class="bz-flow-error" role="alert">{{ scheduleError }}</p>
                <p v-if="scheduleFromCache && scheduleRows.length" class="bz-class-note">先顯示上次課表（{{ cachedScheduleTime(scheduleCachedAt) }}）；揀課時會即時核對。</p>
                <p v-if="!scheduleRows.length && !scheduleLoading && !scheduleError" class="bz-class-note">當日暫時冇課堂；可以轉日期或手動輸入。</p>
                <div v-if="scheduleRows.length" class="bz-class-list"><button v-for="(course,index) in scheduleRows" :key="index" type="button" :disabled="course.full || checkingCourse" :class="{active:selectedCourse && sameCourse(selectedCourse, course)}" @click="selectClass(course)"><b>{{ course.start }}–{{ course.end }}</b><span>{{ course.title }}<small>{{ course.coach }} · {{ newClient.branch }}</small></span><em>{{ course.full ? '額滿' : `${course.booked ?? '—'}/${course.capacity ?? '—'}` }}</em></button></div>
                <p class="bz-class-note">{{ scheduleSample ? '示範課堂只供操作體驗，唔代表原站可報名時段。' : '揀課及儲存前會重新核對即時課表；實際報名由你喺課程網站自行處理。' }}</p>
              </div>
            </div>
            <div class="bz-manual-label">或者手動揀時間</div>
            <div class="bz-date-choices"><button type="button" @click="chooseTrialDay(0)">今日</button><button type="button" @click="chooseTrialDay(1)">聽日</button><button type="button" @click="chooseTrialDay(2)">後日</button></div>
            <div class="bz-date-choices bz-time-choices"><button v-for="time in trialTimes" :key="time" type="button" @click="chooseTrialTime(time)">{{ time }}</button></div>
            <input v-model="newClient.trial_date" type="datetime-local" class="modern-date" aria-label="試堂日期及時間">
          </div>
          <details class="bz-client-more" :open="showMoreNewClient" @toggle="showMoreNewClient=$event.target.open"><summary>更多資料及選項</summary>
            <div class="f-item"><label>認識來源</label><select v-model="newClient.source" class="modern-select"><option value="廣告">廣告</option><option value="廣告+朋友介紹">廣告 + 朋友介紹</option><option value="傳單">傳單</option><option value="朋友介紹">朋友介紹</option><option value="IG">IG</option><option value="朋友">朋友</option></select></div>
            <div v-if="newClient.source === '朋友介紹' || newClient.source === '廣告+朋友介紹'" class="f-item"><label>介紹人</label><input v-model="referrerSearch" class="modern-inp" placeholder="搜尋姓名或電話"><select v-model="newClient.referred_by_id" class="modern-select"><option :value="null">揀介紹人</option><option v-for="c in filteredReferrerOptions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.phone }})</option></select></div>
            <label v-if="newClient.referred_by_id" class="bz-check-row"><input v-model="consumeMyGift" type="checkbox">消耗介紹人 1 張 MyGift（尚餘 {{ getMyGiftStats(store.clients.find(c => c.id === newClient.referred_by_id)).available }} 張）</label>
            <label v-if="newClient.status==='prospect'" class="bz-check-row"><input v-model="autoChargeTrial" type="checkbox">同時記錄 $98 試堂收入</label>
            <div class="grid-2"><div class="f-item"><label>加入日期</label><input v-model="newClient.join_date" type="date" class="modern-date"></div><div class="f-item"><label>套票到期日</label><input v-model="newClient.expiry_date" type="date" class="modern-date"></div></div>
            <div class="f-item"><label>備註</label><textarea v-model="newClient.remark" class="modern-inp" rows="3" placeholder="客戶要求、習慣等"></textarea></div>
            <div class="bz-client-extras"><label><input v-model="newClient.is_marathon" type="checkbox">馬拉松</label><label><input v-model="newClient.is_vip" type="checkbox">VIP</label></div>
            <div v-if="newClient.is_vip" class="f-item"><label>VIP 等級</label><select v-model="newClient.vip_tier" class="modern-select"><option value="銅級(88折)">銅級 (88折)</option><option value="銀級(75折)">銀級 (75折)</option><option value="金級(65折)">金級 (65折)</option><option value="直接58折">直接58折</option><option value="領班(半折)">領班(半折)</option></select></div>
            <details class="bz-smart-paste"><summary>由訊息快速貼入資料</summary><div class="bz-smart-row"><input v-model="smartInput" class="modern-inp" placeholder="姓名 電話 日期"><button type="button" @click="handleSmartPaste">配對</button></div></details>
          </details>
        </div>
        <div class="sticky-action-row"><button type="button" class="btn-confirm" :disabled="isReadOnlyPreview || checkingCourse" @click="handleAddClient">{{ isReadOnlyPreview ? '預覽版只供查看' : checkingCourse ? '核對課堂中…' : '儲存客戶' }}</button></div>
      </div>
    </div>

    <div v-if="quickFlow" class="modal-overlay bz-client-overlay" @click.self="quickFlow=''">
      <div class="center-modal bz-quick-flow">
        <div class="m-header"><span>{{ quickFlow === 'trial' ? '記試堂結果' : '一分鐘續卡' }}<small>{{ quickClient?.name }} · {{ quickClient?.branch }}</small></span><button type="button" class="close-x" aria-label="關閉" @click="quickFlow=''">✕</button></div>
        <div class="bz-quick-flow-body">
          <template v-if="quickFlow==='trial'">
            <p class="bz-flow-intro">試完堂揀一個結果；開卡會連收入一齊記。</p>
            <div class="bz-outcome-list" role="group" aria-label="試堂結果">
              <button type="button" :class="{active:quickOutcome==='opened_small'}" @click="chooseQuickOutcome('opened_small')">已開 10 點卡</button>
              <button type="button" :class="{active:quickOutcome==='opened_big'}" @click="chooseQuickOutcome('opened_big')">已開 35 點卡</button>
              <button type="button" :class="{active:quickOutcome==='no_open_normal'}" @click="chooseQuickOutcome('no_open_normal')">有試堂，未開卡</button>
              <button type="button" :class="{active:quickOutcome==='no_open_mygift'}" @click="chooseQuickOutcome('no_open_mygift')">MyGift 試堂，未開卡</button>
              <button type="button" :class="{active:quickOutcome==='no_show'}" @click="chooseQuickOutcome('no_show')">冇出席</button>
            </div>
          </template>
          <p v-else class="bz-flow-intro">揀套票、核對日期同金額，儲存後會自動延長有效期。</p>
          <template v-if="quickNeedsPackage">
            <div v-if="quickFlow==='renewal'" class="bz-package-choices" role="group" aria-label="套票"><button v-for="(pkg,key) in quickPackages" :key="key" type="button" :class="{active:quickPackage===key}" @click="quickPackage=key">{{ pkg.label }}<small>${{ pkg.amount }}</small></button></div>
            <label v-if="quickFlow==='trial'" class="bz-check-row"><input v-model="quickApplyTrialDiscount" type="checkbox">已收 $98 試堂費，今次開卡扣返 $98</label>
            <div class="grid-2"><div class="f-item"><label>收款日期</label><input v-model="quickDate" type="date" class="modern-date"></div><div class="f-item"><label>處理人</label><input v-model="quickStaff" class="modern-inp" placeholder="處理人"></div></div>
            <div class="bz-flow-total"><span>{{ quickTotals.label }} · {{ quickClient?.branch }}</span><strong>${{ quickTotals.amount }}</strong><small>成本 ${{ quickTotals.cost }} · 利潤 ${{ quickTotals.profit }}</small></div>
          </template>
          <p v-if="quickError" class="bz-flow-error" role="alert">{{ quickError }}</p>
          <p v-if="isReadOnlyPreview" class="bz-flow-preview">預覽版可以查看流程；正式版先可以儲存。</p>
        </div>
        <div class="sticky-action-row"><button type="button" class="btn-confirm" :disabled="quickSaving || quickSaveLocked || isReadOnlyPreview" @click="saveQuickFlow">{{ quickSaving ? '儲存中…' : isReadOnlyPreview ? '預覽版只供查看' : quickNeedsPackage ? '確認並記錄收入' : '儲存試堂結果' }}</button></div>
      </div>
    </div>

    <div v-if="showActionModal" class="modal-overlay" @click.self="showActionModal = false">
      <div class="center-modal action-modal" style="max-width: 350px;">
        <div class="m-header">
          ⚡ 快捷操作：{{ selectedClientForAction?.name }}
          <button class="close-x" @click="showActionModal = false">✕</button>
        </div>
        
        <div class="action-menu-list">
          <button v-if="selectedClientForAction?.trial_date" class="action-big-btn" type="button" @click="openQuickFlow('trial')"><span class="emoji-icon">✓</span><div class="text-left"><strong>記試堂結果</strong><small>開卡、未開卡或缺席，直接記低</small></div></button>
          <button class="action-big-btn" type="button" @click="openQuickFlow('renewal')"><span class="emoji-icon">↻</span><div class="text-left"><strong>快捷續卡</strong><small>揀套票後自動記收入同有效期</small></div></button>
          <button class="action-big-btn btn-edit-style" @click="handleActionEdit">
            <span class="emoji-icon">✏️</span>
            <div class="text-left">
              <strong>修改客戶資料</strong>
              <small>檢視或更新檔案、VIP狀態</small>
            </div>
          </button>

          <button class="action-big-btn btn-move-style" @click="handleActionMovement">
            <span class="emoji-icon">🏋️</span>
            <div class="text-left">
              <strong>購買運動 / 扣堂</strong>
              <small>前往運動 SOP 處理</small>
            </div>
          </button>

          <button class="action-big-btn btn-retail-style" @click="handleActionRetail">
            <span class="emoji-icon">🛍️</span>
            <div class="text-left">
              <strong>購買產品</strong>
              <small>前往零售 SOP 處理</small>
            </div>
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
:host { --p: #6366f1; --pd: #4f46e2; --run: linear-gradient(135deg, #4f46e2, #9333ea); }
.page { background: #f8fafc; min-height: 100vh; padding: 20px; padding-bottom: 120px; }
.header-section { margin-bottom: 25px; }
.page-title { font-weight: 900; font-size: 26px; color: #1e293b; margin: 0; }
.subtitle { color: #64748b; font-size: 14px; font-weight: 600; }
.search-box { background: white; padding: 14px 16px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.03); margin-bottom: 15px; }
.inp-clean { width: 100%; border: none; background: #f1f5f9; padding: 10px 16px; border-radius: 12px; font-size: 15px; font-weight: 600; outline: none; }

/* 篩選按鈕列 (縮小了上下間距) */
.filter-row { display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
.filter-row::-webkit-scrollbar { display: none; }
.f-btn { padding: 6px 14px; border-radius: 99px; border: 1px solid #e2e8f0; background: white; font-weight: 800; font-size: 12px; white-space: nowrap; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
.f-btn.active { background: #6366f1; color: white; border-color: #6366f1; }
.mygift-btn { border-color: #8b5cf6; color: #8b5cf6; background: #faf5ff; }
.mygift-btn.active { background: #8b5cf6; color: white; border-color: #8b5cf6; }
.v-line { width: 1px; background: #e2e8f0; margin: 0 5px; flex-shrink: 0;}

/* 🟢 新增：分店專屬列 */
.branch-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; }

/* 🟢 新增：底部滾動操作列 */
.bottom-scroll-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; overflow-x: auto; padding-bottom: 5px; -webkit-overflow-scrolling: touch; }
.bottom-scroll-row::-webkit-scrollbar { display: none; }
.bottom-scroll-row > * { flex-shrink: 0; }

.sort-label { font-size: 12px; font-weight: 900; color: #64748b; white-space: nowrap; }
.sort-select { background: #f8fafc; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: 800; color: #1e293b; outline: none; cursor: pointer; max-width: 140px; text-overflow: ellipsis; }
.sort-select:focus { border-color: #6366f1; }
.btn-outline { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; transition: 0.2s;}
.btn-outline:active { transform: scale(0.95); }

/* 🟢 補回卡片的排版結構 (解決卡片變醜的問題) */
.client-card { background: white; padding: 16px; border-radius: 20px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid #f1f5f9; transition: 0.2s; cursor: pointer;}
.client-card:active { transform: scale(0.97); }

.c-avatar { width: 48px; height: 48px; background: #6366f1; color: white; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; flex-shrink: 0; min-width: 48px; min-height: 48px; }
.c-main { flex: 1; min-width: 0; }
.c-side { text-align: right; flex-shrink: 0; }

.c-name-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.c-name { font-weight: 800; font-size: 17px; color: #1e293b; }
.badge-vip { background: #fef9c3; color: #a16207; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; }
.badge-run { background: linear-gradient(135deg, #4f46e2, #9333ea); color: white; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; }

.c-meta { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.wts-btn { background: #25D366; color: white; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800; text-decoration: none; box-shadow: 0 2px 5px rgba(37,211,102,0.3); display: inline-block; transition: 0.2s; }
.wts-btn:active { transform: scale(0.95); }

.trial-time-tag { background: #fffbeb; color: #d97706; padding: 2px 6px; border-radius: 6px; font-weight: 800; font-size: 11px; }

/* 🟢 修改了這裡：讓標籤可以整齊排列，且強制不換行 */
.c-packages { font-size: 11px; font-weight: 800; color: #94a3b8; margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap;}
.pkg-tag { padding: 2px 8px; border-radius: 6px; font-weight: 900; color: white; white-space: nowrap; display: inline-flex; align-items: center; }

/* 🟢 新增了這裡：MyGift 專用的紫色與日期設定 */
.mygift-tag { background: #8b5cf6; }
.expiry-text { font-size: 10px; margin-left: 4px; opacity: 0.9; font-weight: 700; white-space: nowrap; }

.t-10 { background: #3b82f6; }
.t-35 { background: #ec4899; }
.pkg-zero { background: #f1f5f9; color: #94a3b8; padding: 2px 6px; border-radius: 6px;}
.c-gen { font-weight: 900; color: #6366f1; font-size: 12px; margin-bottom: 4px;}
.c-expiry { font-size: 11px; font-weight: 800; }

/* 🟢 解決 Modal 頂部與底部被遮住的終極完美版 */
.modal-overlay { 
  position: fixed; top: 0; left: 0; width: 100%; height: 100%; /* 使用 height:100% 自動適應手機的真實視窗 */
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); 
  z-index: 99999; 
  display: flex; align-items: flex-start; justify-content: center; 
  
  /* 1️⃣ 核心魔法：頂端推開 110px 避開標題，底端推開 60px 避開手機底線 */
  padding: 110px 15px 60px 15px; 
  box-sizing: border-box; /* 確保 padding 不會把整個畫面撐破 */
}

.edit-modal, .center-modal { 
  background: white; width: 100%; max-width: 480px; 
  border-radius: 24px; 
  padding: 25px 25px 50px 25px; 
  box-shadow: 0 20px 50px rgba(0,0,0,0.3); 
  animation: popIn 0.3s ease-out; position: relative; 
  margin: 0; 
  max-height: 100%; 
  overflow-y: auto; 
  overflow-x: hidden; /* 🚀 鎖死左右滑動 */
  -webkit-overflow-scrolling: touch; 
  overscroll-behavior: contain;
  box-sizing: border-box; /* 🚀 防止 padding 撐破寬度 */
}

@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.m-header { font-weight: 900; font-size: 18px; margin-bottom: 20px; display: flex; justify-content: space-between; color: #1e293b; align-items: center;}
.close-x { background: #f1f5f9; border-radius: 50%; width: 30px; height: 30px; border: none; font-size: 14px; font-weight: 900; color: #475569; cursor: pointer; display: flex; justify-content: center; align-items: center; flex-shrink: 0;}
.section-title { font-size: 12px; font-weight: 900; color: #6366f1; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 1px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modern-inp, .modern-select, .modern-date { width: 100%; background: #f8fafc; border: 2px solid #f1f5f9; padding: 12px 15px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; font-size: 16px; appearance: none; box-sizing: border-box; /* 🚀 防止輸入框撐破 */ }
.modern-inp:focus, .modern-select:focus { border-color: #6366f1; background: white; }
.f-item { margin-bottom: 12px; }
.f-item label { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; }
.toggle-group { display: flex; gap: 8px; background: #f1f5f9; padding: 5px; border-radius: 15px; flex-wrap: wrap;}
.t-btn { flex: 1; border: none; padding: 10px; border-radius: 11px; font-weight: 800; color: #64748b; background: transparent; cursor: pointer; white-space: nowrap;}
.t-btn.active { background: white; color: #6366f1; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.row-flex { display: flex; gap: 10px; flex-wrap: wrap;}
.toggle-card { flex: 1; min-width: 100px; padding: 15px; border-radius: 15px; border: 2px solid #f1f5f9; text-align: center; font-weight: 800; font-size: 14px; cursor: pointer;}
.toggle-card.active { border-color: #6366f1; background: #eef2ff; color: #6366f1; }
.toggle-card.active:first-child { background: linear-gradient(135deg, #4f46e2, #9333ea); color: white; border: none; }
.action-row { display: flex; gap: 10px; margin-top: 30px; flex-wrap: wrap;}
.btn-confirm { flex: 1; background: #6366f1; color: white; border: none; padding: 16px; border-radius: 16px; font-weight: 800; font-size: 16px; box-shadow: 0 10px 20px rgba(99,102,241,0.2); cursor: pointer;}
.btn-del { background: #fff1f2; color: #e11d48; border: none; padding: 16px; border-radius: 16px; font-weight: 800; cursor: pointer;}
.main-fab { position: fixed; bottom: 100px; right: 25px; width: 64px; height: 64px; background: #6366f1; color: white; border-radius: 22px; font-size: 32px; border: none; box-shadow: 0 15px 30px rgba(99,102,241,0.4); z-index: 99; cursor: pointer;}

.action-modal { animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); margin-top: 0; }
.action-menu-list { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.action-big-btn { display: flex; align-items: center; gap: 15px; width: 100%; padding: 18px; border-radius: 20px; border: none; cursor: pointer; transition: 0.2s all; background: #f8fafc; text-align: left; }
.action-big-btn:active { transform: scale(0.96); }
.action-big-btn .emoji-icon { font-size: 28px; background: white; padding: 10px; border-radius: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); flex-shrink: 0;}
.action-big-btn .text-left { display: flex; flex-direction: column; gap: 4px; }
.action-big-btn strong { font-size: 16px; color: #1e293b; font-weight: 800; }
.action-big-btn small { font-size: 12px; color: #64748b; font-weight: 600; line-height: 1.3; }

/* 📱 手機螢幕自動適應 */
@media (max-width: 600px) {
  .grid-2 { grid-template-columns: 1fr; gap: 8px; }
  .center-modal { padding: 20px 15px; } 
  .action-big-btn { padding: 14px; } 
  .page { padding: 15px; padding-bottom: 100px; }
}
/* 🚀 Tabs 分頁專用樣式 */
.tab-nav { display: flex; gap: 8px; margin-bottom: 15px; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch;}
.tab-nav::-webkit-scrollbar { display: none; }
.tab-btn { flex: 1; background: transparent; border: none; font-size: 13px; font-weight: 800; color: #94a3b8; padding: 10px 5px; cursor: pointer; white-space: nowrap; transition: 0.2s; border-radius: 10px; }
.tab-btn.active { background: #eef2ff; color: #4f46e2; box-shadow: 0 4px 10px rgba(79, 70, 226, 0.1); }

.tab-content-area { 
  /* 設定固定高度或最小高度，確保切換頁面時 Modal 大小不會突然劇烈跳動 */
  min-height: 380px; 
  padding-bottom: 20px;
}
.tab-pane { animation: popIn 0.2s ease-out; }

/* 🚀 懸浮在底部的按鈕區 */
.sticky-action-row {
  display: flex; gap: 10px; 
  position: sticky; bottom: 0; left: 0; right: 0;
  background: white; 
  padding: 15px 0 25px 0; /* 底部多留白，避開 iPhone 橫線 */
  border-top: 1px dashed #e2e8f0;
  margin-top: 10px;
  z-index: 10;
}
/* 覆蓋原本 action-row 的 margin，避免排版衝突 */
.sticky-action-row .btn-del, .sticky-action-row .btn-confirm { margin-top: 0; }

/* =========================================
   🚀 專屬 Tabs 分頁與防跑版 Flexbox 終極樣式 
   ========================================= */

/* 1. 終極修復：改用 Flexbox 鎖死上下，解決 iOS 按鈕亂飄的問題 */
.tabbed-modal {
  display: flex;
  flex-direction: column;
  padding-bottom: 0 !important; 
  overflow: hidden !important;  /* 把外層的捲軸關掉 */
  max-height: 85vh; /* 限制最大高度，保證不會超出螢幕 */
}

/* 2. 防止標題、頁籤、以及「狀態切換按鈕」被擠壓變形 */
.tabbed-modal .m-header,
.tabbed-modal .tab-nav,
.tabbed-modal .sticky-toggle {
  flex-shrink: 0; 
}

/* 3. 狀態切換按鈕 (正式/預約/缺席) 的專屬間距 */
.sticky-toggle {
  margin-bottom: 15px; 
}

/* 4. 頂部 Tabs 分頁按鈕樣式 */
.tab-nav { 
  display: flex; gap: 8px; margin-bottom: 15px; 
  border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; 
  overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.tab-nav::-webkit-scrollbar { display: none; }
.tab-btn { 
  flex: 1; background: transparent; border: none; 
  font-size: 13px; font-weight: 800; color: #94a3b8; 
  padding: 10px 5px; cursor: pointer; white-space: nowrap; 
  transition: 0.2s; border-radius: 10px; 
}
.tab-btn.active { 
  background: #eef2ff; color: #4f46e2; 
  box-shadow: 0 4px 10px rgba(79, 70, 226, 0.1); 
}

/* 5. 真正的捲動區域 (只有表單內容會滑動) */
.tab-content-area {
  flex: 1;
  overflow-y: auto; 
  -webkit-overflow-scrolling: touch;
  margin: 0 -25px; /* 抵銷 Modal 的左右 padding，讓捲軸貼齊右邊緣 */
  padding: 0 25px 20px 25px;
}
.tab-pane { animation: popIn 0.2s ease-out; }

/* 6. 底部儲存按鈕區 (死死釘在最下面) */
.sticky-action-row {
  position: static; 
  flex-shrink: 0; /* 防止按鈕區塊被擠壓 */
  background: white;
  padding: 15px 0 25px 0; /* 底部多留白，避開 iPhone 橫線 */
  border-top: 1px solid #f1f5f9;
  margin: 0;
}
/* 覆蓋原本按鈕的 margin */
.sticky-action-row .btn-del, .sticky-action-row .btn-confirm { margin-top: 0; }
</style>
