<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase, isReadOnlyPreview } from '../supabase'
import BaseModal from '../components/BaseModal.vue'
import { hkCalendarDate } from '../homeTasks'
import { incomeAccountingValues } from '../accountingEntry'
import { hongKongCheckoutTimestamp } from '../retailLedger'

const store = useMainStore()

// ==========================================
// 🛡️ 終極防護大絕招：字串絕對隔離法
// ==========================================
const getLocalYMD = () => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Hong_Kong', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  }).format(new Date());
}
const transactionDay = t => hkCalendarDate(t?.created_at) || String(t?.created_at || '').slice(0, 10)

// 🟢 1. 先宣告狀態變數 (非常重要，順序不能錯)
const activeCategory = ref('全部')
const filterMonth = ref(getLocalYMD().substring(0, 7)) 
const searchQuery = ref('') 
const filterBranch = ref('全部分店') // 🟢 新增：分店過濾狀態

// 🟢 2. 加入 filterBranch 到監聽器
watch([filterMonth, activeCategory, searchQuery, filterBranch], () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const pageEl = document.querySelector('.page')
    if (pageEl) pageEl.scrollTo({ top: 0, behavior: 'smooth' })
  }, 50)
// 💡 新手防打架盾牌：只要搜尋欄一打字，就把月份選單自動彈回「所有月份」
watch(searchQuery, (newQuery) => {
  if (newQuery.trim() !== '') {
    filterMonth.value = 'all'
  }
})
// ==========================================
// 🟢 新增：月份過濾邏輯

// ==========================================
// 🟢 新增：一鍵回到最上層功能
const showScrollTop = ref(false)

const handleScroll = () => {
  // 💡 終極抓取：不管你是網頁滾動、還是內部 .page 滾動，通通抓出來！
  const pageEl = document.querySelector('.page')
  const scrollTop = window.scrollY || document.documentElement.scrollTop || (pageEl ? pageEl.scrollTop : 0)
  showScrollTop.value = scrollTop > 300
}

const scrollToTop = () => {
  // 💡 雙管齊下：同時命令 window 和內部容器回到頂部
  window.scrollTo({ top: 0, behavior: 'smooth' })
  const pageEl = document.querySelector('.page')
  if (pageEl) {
    pageEl.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

onMounted(() => { 
  window.addEventListener('scroll', handleScroll, true)
  // 針對內部容器獨立綁定監聽器
  const pageEl = document.querySelector('.page')
  if (pageEl) pageEl.addEventListener('scroll', handleScroll)
})

onUnmounted(() => { 
  window.removeEventListener('scroll', handleScroll, true)
  const pageEl = document.querySelector('.page')
  if (pageEl) pageEl.removeEventListener('scroll', handleScroll)
})


// 自動抓取資料庫內所有出現過的月份 (由新到舊排序)
const availableMonths = computed(() => {
  const months = new Set()
  store.transactions.forEach(t => {
    if (t?.created_at) {
      months.add(transactionDay(t).slice(0, 7))
    }
  })
  return Array.from(months).sort((a, b) => b.localeCompare(a)) 
})

// 把 2026-04 轉換成漂亮的 2026年4月
const formatMonthLabel = (ym) => {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}
const showExpModal = ref(false)
const editingTxn = ref(null)
const backfillSavedCount = ref(0)
const isSavingTransaction = ref(false)
const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat', '股東'])
const incCategories = ['公司票', '其他收入']
const expCategories = ['廣告費用', '觀塘租金', '中環租金', '馬拉松費用', '產品採購', '支付30%', '其他支出']

const expForm = ref({
  type: 'expense', amount: '', note: '', client_name: '', staff: staffList.value[0],
  category: '廣告費用', ad_inquiries: 0, ad_phones: 0,
  branch: '觀塘', // 🟢 新增：預設分店
  date: getLocalYMD()
})

// ... (中間略過防護盾等代碼，找到 openExpForm)

function openExpForm() {
  editingTxn.value = null
  expForm.value = {
    type: 'expense', amount: '', note: '', client_name: '', staff: staffList.value[0],
    category: '廣告費用', ad_inquiries: 0, ad_phones: 0, 
    branch: '觀塘', 
    date: getLocalYMD(), cost: '',
    originalTime: '' // 🚀 補丁 1：新增時清空時間記憶
  }
  showExpModal.value = true
}

// The app shell can open a preselected income or expense in one tap.
function consumeNavigation() {
  const quick = store.pendingQuickEntry
  if (quick?.kind === 'transaction') {
    openExpForm()
    expForm.value.type = quick.type === 'income' ? 'income' : 'expense'
    expForm.value.category = expForm.value.type === 'income' ? '其他收入' : (quick.date ? '其他支出' : '廣告費用')
    if (/^20\d{2}-\d{2}-\d{2}$/.test(quick.date || '')) {
      expForm.value.date = quick.date
      expForm.value.backfill = true
      expForm.value.historyTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(quick.time || '') ? quick.time : '12:00'
      expForm.value.cost = ''
      backfillSavedCount.value = 0
    }
    if (['觀塘', '中環', '佐敦'].includes(quick.branch)) expForm.value.branch = quick.branch
    store.pendingQuickEntry = null
  }
  if (store.pendingSearch?.kind === 'transaction') {
    filterMonth.value = 'all'
    searchQuery.value = store.pendingSearch.query || ''
    store.pendingSearch = null
  }
}
onMounted(consumeNavigation)
watch(() => store.pendingQuickEntry, consumeNavigation)
watch(() => store.pendingSearch, consumeNavigation)

function openEditTransaction(t) {
  editingTxn.value = t?.id

  let extractedClient = t?.client_name || ''
  let extractedNote = t?.note || ''
  
  const match = extractedNote.match(/^【(.*?)】\s*(.*)$/)
  if (match) {
    if (!extractedClient) extractedClient = match[1]
    extractedNote = match[2]
  } else if (extractedClient && extractedNote.startsWith(extractedClient + ' (')) {
    extractedNote = extractedNote.replace(extractedClient + ' ', '')
  }

 // 🚀 補丁 2：精準擷取這筆紀錄原本的「時:分:秒」
  const originalTimePart = String(t?.created_at || '').slice(11, 19) || ''

  expForm.value = {
    type: t?.type, amount: t?.amount, 
    note: extractedNote, 
    client_name: extractedClient, 
    staff: t?.staff || t?.handled_by || '',
    category: t?.category, ad_inquiries: t?.ad_inquiries || 0, ad_phones: t?.ad_phones || 0,
    branch: t?.branch || '觀塘', 
    date: transactionDay(t), cost: t?.cost ?? '',
    originalTime: originalTimePart // 🚀 補丁 2：記住它！
  }
  showExpModal.value = true
}
// 🛡️ 加上防護盾
const activeClientsOptions = computed(() => {
  return store.clients.map(c => c?.name || '').sort((a,b) => a.localeCompare(b, 'zh-HK'))
})

const getTxnDisplayAmount = (t) => t?.category === '試堂調整'
  ? Number(t?.profit || 0)
  : (t?.type === 'expense' ? -1 : 1) * Number(t?.amount || 0)
const getTxnAmountClass = (t) => getTxnDisplayAmount(t) >= 0 ? 'g' : 'r'
const formatTxnAmount = (t) => `${getTxnDisplayAmount(t) >= 0 ? '+' : '-'}HK$ ${Math.abs(getTxnDisplayAmount(t)).toLocaleString('en-HK', { maximumFractionDigits: 2 })}`

const getDisplayData = (t) => {
  let client = t?.client_name || null
  let text = t?.note || '無備註'
  
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



// 自動抓取資料庫內所有出現過的分類，並依照「使用頻率」從多到少排序
const uniqueCategories = computed(() => {
  const counts = {}
  store.transactions.forEach(t => {
    if (t?.category) counts[t.category] = (counts[t.category] || 0) + 1
  })
  const sortedCats = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
  return ['全部', ...sortedCats]
})
// ==========================================

const groupedTxns = computed(() => {
  const g = {}
  
  // 1. 根據選擇的分類過濾
  let filteredList = activeCategory.value === '全部' 
    ? store.transactions 
    : store.transactions.filter(t => t?.category === activeCategory.value)

// 2. 🟢 根據選擇的月份過濾
  if (filterMonth.value !== 'all') {
    filteredList = filteredList.filter(t => transactionDay(t).startsWith(filterMonth.value))
  }

  // 3. 🟢 根據關鍵字搜尋 (客戶名稱、備註、分類)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filteredList = filteredList.filter(t => 
      (t?.client_name || '').toLowerCase().includes(q) ||
      (t?.note || '').toLowerCase().includes(q) ||
      (t?.category || '').toLowerCase().includes(q)
    )
  }

  // 4. 🟢 新增：根據選擇的分店過濾
  if (filterBranch.value !== '全部分店') {
    filteredList = filteredList.filter(t => t?.branch === filterBranch.value)
  }

  filteredList.forEach(t => {
  if (!t?.created_at) return
  
 // 🟢 極限粗暴法：直接斬件，唔經 Date 轉換，所見即所得
  const dateStr = transactionDay(t);
    
    const [yyyy, mm, dd] = dateStr.split('-')
    const displayDate = `${dd}/${mm}/${yyyy}`
    
    if (!g[displayDate]) g[displayDate] = []
    g[displayDate].push(t)
  })
  
  return Object.entries(g).map(([date, items]) => ({ date, items })).sort((a,b)=>{
    const d1 = a?.date || ''
    const d2 = b?.date || ''
    if (!d1 || !d2) return 0;
    const [day1, m1, y1] = d1.split('/')
    const [day2, m2, y2] = d2.split('/')
    const strA = `${y1}-${m1}-${day1}`
    const strB = `${y2}-${m2}-${day2}`
    return strB.localeCompare(strA)
  })
})

// ==========================================
// 🏃 套裝拆解引擎：為了退還庫存與再來一套
// ==========================================
const marathonCombos = [
  {
    name: '慢跑計劃',
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 1 },
      { name: '佳能蛋白質粉', qty: 1 },
      { name: '即溶草本飲品50克-桃味', qty: 1 }
    ]
  },
  {
    name: '快跑計劃',
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 1 },
      { name: '佳能蛋白質粉', qty: 1 },
      { name: '即溶草本飲品50克-桃味', qty: 1 },
      { name: 'BC30 益生菌', qty: 1 },
      { name: '濃縮蘆薈汁', isAloe: true, qty: 1 }
    ]
  },
  {
    name: '運動vip計劃',
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 5 },
      { name: '佳能蛋白質粉', qty: 5 },
      { name: '即溶草本飲品50克-桃味', qty: 1 },
      { name: 'BC30 益生菌', qty: 1 },
      { name: '濃縮蘆薈汁', isAloe: true, qty: 1 },
      { name: '消脂片', qty: 1 },
      { name: '抗脂片', qty: 1 }
    ]
  },
  {
    name: '運動vVip計劃',
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 5 },
      { name: '佳能蛋白質粉', qty: 5 },
      { name: '即溶草本飲品50克-桃味', qty: 1 },
      { name: 'BC30 益生菌', qty: 1 },
      { name: '濃縮蘆薈汁', isAloe: true, qty: 1 },
      { name: '消脂片', qty: 1 },
      { name: '抗脂片', qty: 1 },
      { name: '夜寧新營養飲品', qty: 1 },
      { name: '莓之寶', qty: 1 },
      { name: '營養纖維粉(蘋果味)', qty: 1 },
      { name: '膠原蛋白美肌飲料', qty: 1 },
      { name: '深海魚油', qty: 1 } 
    ]
  }
]

function handleRepeatOrder(t) {
  const { client, text } = getDisplayData(t)
  let items = []
  
  // 1. 抓取備註文字
  let itemString = ''
  const match = t?.note?.match(/\((.*)\)$/)
  if (match) {
    itemString = match[1]
  } else {
    itemString = (t?.note || '').replace(/^【.*?】\s*/, '').replace(/^(售出|採購)\s*/, '')
  }

  // 2. 簡單暴力切開所有產品
  if (itemString) {
    // 遇到任何逗號或加號都直接切開
    const parts = itemString.split(/[,+，、]/) 
    
    parts.forEach(p => {
      p = p.trim()
      if (!p) return

      let parsedName = p
      let parsedQty = 1

      // 找最後一個 x 或 X 來分離數量
      const lastX = p.toLowerCase().lastIndexOf('x')
      if (lastX !== -1) {
         parsedName = p.substring(0, lastX).trim()
         const cleanQty = p.substring(lastX + 1).replace(/\s/g, '')
         parsedQty = parseInt(cleanQty, 10) || 1
      }

      if (parsedName) {
        const existing = items.find(x => x.name === parsedName)
        if (existing) existing.qty += parsedQty
        else items.push({ name: parsedName, qty: parsedQty })
      }
    })
  }

  if (items.length === 0) return alert('⚠️ 無法從備註中辨識產品，請手動結帳。')

  // 🚀 【終極診斷彈窗】這行會證明系統到底抽出了幾件！
  alert(`🔍 系統診斷報告：\n成功從備註中抽出 ${items.length} 件產品！\n\n清單如下：\n` + items.map(i => `👉 ${i.name} (數量: ${i.qty})`).join('\n') + `\n\n💡 如果這裡顯示 5 件，但跳轉後畫面只有 3 件，代表是「購物車畫面」隱藏了產品！`)

  // 3. 送入購物車
  store.pendingRepeatOrder = { clientName: client, branch: t?.branch, items: items }
  store.view = 'retail'
}

async function saveTransaction(continueBackfill = false) {
  if (isSavingTransaction.value) return
  if (!expForm.value.amount) return alert('請輸入金額！')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expForm.value.date || '')) return alert('請先選擇有效日期。')
  if (expForm.value.backfill && (!Number.isFinite(Number(expForm.value.amount)) || Number(expForm.value.amount) <= 0)) return alert('金額請填大過 0 嘅數字。')
  const previousTxn = editingTxn.value ? store.transactions.find(row => row.id === editingTxn.value) : null
  let incomeValues = null
  try {
    if (expForm.value.type === 'income') incomeValues = incomeAccountingValues(expForm.value.amount, expForm.value.cost, previousTxn)
  } catch (error) { return alert(error.message) }
  isSavingTransaction.value = true
  try {
  
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
    amount: incomeValues?.amount ?? amt,
    note: finalNote, 
    client_name: expForm.value.client_name || null, 
    own_email: userEmail, 
    profit: expForm.value.type === 'income' ? incomeValues.profit : -amt,
    ...(expForm.value.type === 'income' ? { cost: incomeValues.cost } : {}),
    handled_by: expForm.value.staff 
  }
  if (expForm.value.type !== 'income') delete data.cost
  
  delete data.date 

  if (data.category !== '廣告費用') { data.ad_inquiries = 0; data.ad_phones = 0 }
  
  const now = new Date()
  const finalString = previousTxn && expForm.value.date === transactionDay(previousTxn)
    ? previousTxn.created_at
    : expForm.value.backfill
      ? `${expForm.value.date}T${expForm.value.historyTime || '12:00'}:00+08:00`
      : hongKongCheckoutTimestamp(expForm.value.date, previousTxn ? new Date(previousTxn.created_at) : now)
  
  // 組合準備上傳的資料，並確保刪掉不需要上傳資料庫的 originalTime 變數
  const updatePayload = { ...data, created_at: finalString }
  if (!editingTxn.value) {
    updatePayload.owner_email = userEmail
    updatePayload.user_id = authData.session.user.id
  }
  delete updatePayload.originalTime
  delete updatePayload.backfill
  delete updatePayload.historyTime

  let error
  let insertedTxn = null
  if (editingTxn.value) {
    const res = await supabase.from('transactions').update(updatePayload).eq('id', editingTxn.value)
    error = res.error
  } else {
    const res = expForm.value.backfill
      ? await supabase.from('transactions').insert(updatePayload).select('*').single()
      : await supabase.from('transactions').insert(updatePayload)
    error = res.error
    insertedTxn = res.data || null
  }

  if (error) alert('儲存失敗: ' + error.message)
  else {
    if (!continueBackfill) showExpModal.value = false
    await store.syncAll()
    if (insertedTxn?.id) {
      store.transactions = [...store.transactions.filter(row => row.id !== insertedTxn.id), insertedTxn]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      filterMonth.value = expForm.value.date.slice(0, 7)
    }
    if (continueBackfill && expForm.value.backfill) {
      backfillSavedCount.value += 1
      expForm.value.amount = ''
      expForm.value.note = ''
      expForm.value.client_name = ''
      expForm.value.cost = ''
    } else alert('✅ 紀錄已儲存')
  }
  } catch (error) {
    alert(`儲存結果未能核實：${error?.message || error}。請先搜尋帳目，避免重複入帳。`)
  } finally { isSavingTransaction.value = false }
}

async function handleDeleteTransaction(t) {
  if (!confirm('⚠️ 確定要永久刪除這筆紀錄嗎？\n(若包含零售/自用/採購/套裝紀錄，系統將自動同步校正庫存)')) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('⚠️ 無法取得帳號資訊，請重新登入！')

  let itemsToRefund = []
  let isProcurement = false 
  
  // 🟢 智能拆解文字與退回庫存計算邏輯
  const parseItemsStr = (str) => {
    const parts = str.split(/,\s*(?![^()]*\))/)
    parts.forEach(p => {
      const lastXIndex = p.lastIndexOf('x')
          if (lastXIndex !== -1) {
            let pNameFull = p.substring(0, lastXIndex).trim()
            // 🛡️ 防呆：將 x 後面的字串「清空所有空白」後再轉數字
            const cleanQtyStr = p.substring(lastXIndex + 1).replace(/\s/g, '')
            const pQty = parseInt(cleanQtyStr, 10)
            
            if (pNameFull && !isNaN(pQty)) {
           // 偵測是否為馬拉松套裝
           const comboMatch = pNameFull.match(/^(.*?)\s*(?:\((.*?)\))?$/)
           const baseName = comboMatch ? comboMatch[1].trim() : pNameFull
           const flavorsPart = comboMatch && comboMatch[2] ? comboMatch[2] : ''
           
           const comboDef = marathonCombos.find(c => c.name === baseName)
           
           if (comboDef) {
              // 找到套裝了！拆解裡面的項目來退庫存
              let sFlavor = ''
              let aFlavor = ''
              if (flavorsPart.includes('Shake:')) {
                  sFlavor = flavorsPart.split('Shake:')[1].split(/,|$/)[0].trim()
              }
              if (flavorsPart.includes('蘆薈:')) {
                  aFlavor = flavorsPart.split('蘆薈:')[1].split(/,|$/)[0].trim()
              }
              
              comboDef.subItems.forEach(sub => {
                  let sName = sub.name;
                  if (sub.isShake && sFlavor) sName = `${sName}-${sFlavor}`
                  if (sub.isAloe && aFlavor) sName = `${sName}-${aFlavor}`
                  
                  const existing = itemsToRefund.find(x => x.name === sName)
                  if(existing) existing.qty += sub.qty * pQty
                  else itemsToRefund.push({ name: sName, qty: sub.qty * pQty })
              })
           } else {
              // 普通產品，直接退還
              const existing = itemsToRefund.find(x => x.name === pNameFull)
              if(existing) existing.qty += pQty
              else itemsToRefund.push({ name: pNameFull, qty: pQty })
           }
        }
      }
    })
  }

  // 分析不同類別的備註內容
  if ((t?.category === '零售收入' || t?.category === '產品採購') && t?.note) {
    if (t.category === '產品採購') isProcurement = true
    
    const match = t.note.match(/\((.*)\)$/)
    if (match) {
       parseItemsStr(match[1])
    } else {
       const str = t.note.replace(/^【.*?】\s*/, '').replace(/^(售出|採購)\s*/, '')
       parseItemsStr(str)
    }
  } else if (t?.category === '自用消耗' && t?.note) {
    const match = t.note.match(/提取自用:\s*(.*?)\s*x(\d+)$/)
    if (match) {
      itemsToRefund.push({ name: match[1].trim(), qty: parseInt(match[2]) })
    }
  }

  // 正式刪除紀錄
  const { error } = await supabase.from('transactions').delete().eq('id', t.id)
  if (error) return alert('刪除失敗: ' + error.message)

// 開始退還(或扣除)庫存 (🛡️ 修正：呼叫後端 RPC 絕對防止併發衝突！)
  if (itemsToRefund.length > 0) {
    let stockUpdateFailed = false
    
    for (const item of itemsToRefund) {
      // 採購紀錄刪除代表「退貨」要扣庫存，其他紀錄刪除代表「退還」要加庫存
      const qtyChange = isProcurement ? -item.qty : item.qty; 
      
      const { error: rpcError } = await supabase.rpc('adjust_stock', {
        p_prod_name: item.name,
        p_branch: t.branch || '觀塘',
        p_qty_change: qtyChange,
        p_user_id: user.id,
        p_email: user.email
      });

      if (rpcError) {
        console.error("庫存還原失敗:", rpcError);
        stockUpdateFailed = true;
      }
    }

    if (stockUpdateFailed) alert('⚠️ 流水帳已刪除，但部分庫存校正失敗！請手動至「庫存管理」確認。')
    else {
      if (isProcurement) alert('✅ 採購紀錄已刪除，剛剛進的貨已經從庫存中自動扣除了！')
      else alert('✅ 紀錄已成功刪除，套裝與產品庫存已全數自動補回！')
    }
  } else {
    alert('✅ 紀錄已成功刪除')
  }

  await store.syncAll()
}
// ==========================================
// 🚀 對齊 Google Sheet 專屬 Export 功能
// ==========================================

function exportRetail() {
  let list = []
  groupedTxns.value.forEach(g => { list.push(...g.items.filter(t => t.category === '零售收入')) })
  if(list.length === 0) return alert('當前條件下沒有零售收入紀錄！')

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  csvContent += "日期,收錢,客戶名稱,產品最多一行選四個,客戶級別\n"

  list.forEach(t => {
    const day = t.created_at ? parseInt(t.created_at.slice(8, 10)) : '' 
    const staff = t.staff || t.handled_by || ''
    const clientName = t.client_name || ''
    
    const clientObj = store.clients.find(c => c.name === clientName)
    const vipTier = clientObj ? (clientObj.vip_tier || '') : ''

    let products = ''
    const match = t.note?.match(/\((.*)\)$/)
    if (match) products = match[1].replace(/,/g, ' / ') 
    else products = t.note?.replace(/【.*?】\s*/, '').replace(/,/g, ' / ') || ''

    csvContent += `"${day}","${staff}","${clientName}","${products}","${vipTier}"\n`
  })

  const link = document.createElement("a")
  link.setAttribute("href", encodeURI(csvContent))
  link.setAttribute("download", `零售產品紀錄_${filterMonth.value}.csv`)
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function exportMovement() {
  let list = []
  groupedTxns.value.forEach(g => { list.push(...g.items.filter(t => t.category === '運動套票' || t.category === '試堂' || t.category === '運動')) })
  if(list.length === 0) return alert('當前條件下沒有運動/套票紀錄！')

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  // 🚀 關鍵更新：加入一個空列來對齊你的 "提醒MyGift" 欄位，確保貼上時完全吻合
  csvContent += "日期,分店,來源,負責聯繫,提醒MyGift,客戶名稱,購買項目\n"

  list.forEach(t => {
    const day = t.created_at ? parseInt(t.created_at.slice(8, 10)) : ''
    const branch = t.branch || '觀塘'
    const staff = t.staff || t.handled_by || ''
    const clientName = t.client_name || ''
    
    const clientObj = store.clients.find(c => c.name === clientName)
    const source = clientObj ? (clientObj.source || '') : ''

    let item = t.note?.replace(/【.*?】\s*/, '').replace(/,/g, ' / ') || ''

    // 🚀 關鍵更新：中間加多咗一個 `""` 代表留空 MyGift 嗰欄
    csvContent += `"${day}","${branch}","${source}","${staff}","","${clientName}","${item}"\n`
  })

  const link = document.createElement("a")
  link.setAttribute("href", encodeURI(csvContent))
  link.setAttribute("download", `運動套票紀錄_${filterMonth.value}.csv`)
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

</script>

<template>
  <div class="page" style="padding-bottom: 150px;">
    
  <!-- 💡 置頂區塊 Wrapper 開始 -->
    <div class="sticky-top-bar">
      <!-- 🟢 1. 加了 flex-wrap: nowrap !important 強迫絕對不准掉到下一行 -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap: nowrap !important; gap: 6px;">
        
        <!-- 🟢 2. 標題稍微縮小到 18px 讓出空間 -->
        <h2 class="page-title" style="margin: 0; white-space: nowrap !important; flex-shrink: 0 !important; font-size: 18px !important;">收支流水帳</h2>
        
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: nowrap !important; min-width: 0;">
          <!-- 🟢 3. 縮短文字成「所有紀錄」，並縮小內距 -->
          <select v-model="filterMonth" class="modern-select" style="padding: 6px 8px; width: auto; font-size: 13px; border-radius: 10px; margin: 0; background: white; border-color: #e2e8f0; flex-shrink: 1; text-overflow: ellipsis; white-space: nowrap;">
           <option value="all">🌍 所有紀錄</option>
            <option v-for="m in availableMonths" :key="m" :value="m">{{ formatMonthLabel(m) }}</option>
          </select>
          
          <!-- 🟢 4. 按鈕鎖死不准換行、不准被擠壓，稍微縮小內距 -->
          <button class="btn-primary" style="padding: 6px 10px; border-radius: 10px; font-weight: 800; font-size: 13px; white-space: nowrap !important; flex-shrink: 0 !important;" @click="openExpForm">+ 新增收支</button>
        </div>
      </div>
      <div v-if="store.hasMoreTxn" style="text-align: center; margin: 5px 0 10px 0;">
        <button @click="store.loadMoreTransactions()" :disabled="store.isFetchingMore" style="background: #eef2ff; color: #4f46e2; border: 1.5px solid #c7d2fe; padding: 6px 16px; border-radius: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; font-size: 12px;">
          {{ store.isFetchingMore ? '🔄 正在拿取中...' : '📜 載入舊紀錄' }}
        </button>
      </div>
      <div v-else style="text-align: center; margin: 5px 0 10px 0; color: #94a3b8; font-weight: 700; font-size: 11px;">
        ✅ 已經到底了，所有歷史交易皆已載入
      </div>

   <div class="filter-row" style="margin-bottom: 5px;">
        <button v-for="cat in uniqueCategories" :key="cat" class="f-btn" :class="{ active: activeCategory === cat }" @click="activeCategory = cat">
          {{ cat }}
        </button>
      </div>
      
      <!-- 🟢 新增：分店篩選按鈕 -->
      <div class="branch-tabs">
        <button :class="{active: filterBranch==='全部分店'}" @click="filterBranch='全部分店'">🌍 全部</button>
        <button :class="{active: filterBranch==='觀塘'}" @click="filterBranch='觀塘'">📍 觀塘</button>
        <button :class="{active: filterBranch==='中環'}" @click="filterBranch='中環'">📍 中環</button>
        <button :class="{active: filterBranch==='佐敦'}" @click="filterBranch='佐敦'">📍 佐敦</button>
      </div>

      <div style="position: relative; margin-bottom: 10px;">
        <span style="position: absolute; left: 12px; top: 10px; font-size: 14px;">🔍</span>
        <input class="modern-inp" v-model="searchQuery" placeholder="搜尋客戶名稱、項目或備註..." style="padding: 10px 10px 10px 35px; border-radius: 12px; font-size: 14px; background: white; border: 1px solid #cbd5e1; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); width: 100%; outline: none; transition: 0.2s;">
      </div>

     <!-- 🟢 空間魔法：下拉式摺疊選單 (收納四個匯出/匯入按鈕) -->
      <details style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 10px;">
        <summary style="padding: 8px 12px; font-size: 12px; font-weight: 800; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: #f8fafc; list-style: none; outline: none;">
          <span>⚙️ 展開工具 (匯出 / 匯入資料)</span>
          <span style="font-size: 10px;">▼</span>
        </summary>
        <div style="padding: 10px; border-top: 1px solid #e2e8f0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: white;">
          <button @click="exportRetail" style="background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; padding: 8px; border-radius: 8px; font-weight: 800; font-size: 11px;">📊 匯出零售</button>
          <button @click="exportMovement" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 8px; border-radius: 8px; font-weight: 800; font-size: 11px;">📊 匯出套票</button>
          <button @click="store.view='history'" style="background: #f9e9df; color: #945033; border: 1px solid #e5cbbb; padding: 8px; border-radius: 8px; font-weight: 800; font-size: 11px;">📤 安全回補／匯入</button>
        </div>
      </details>

    </div>
    <!-- 💡 置頂區塊 Wrapper 結束 -->
    <div v-if="groupedTxns.length === 0" style="text-align: center; color: #94a3b8; font-weight: 800; margin-top: 50px;">
      目前沒有相關紀錄
    </div>

    <div v-for="group in groupedTxns" :key="group.date">
      <div class="date-header">📅 {{ group.date }}</div>
      <div class="card" style="padding:0 15px;">
        <div v-for="t in group.items" :key="t.id" class="txn-item">
          <div style="flex:1; min-width:0;">
            
           <!-- 🟢 精簡版：強制單行、縮減多餘文字省空間 -->
            <div class="t-header-row" style="display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; margin-bottom: 2px; overflow-x: auto; padding-bottom: 2px;">
              <div class="t-cat" style="white-space: nowrap; padding: 2px 6px;">{{ t.category }}</div>
              
              <!-- 💡 拿掉「客戶：」兩個字，只留圖示與名字 -->
              <div v-if="getDisplayData(t).client" class="t-client-highlight" style="white-space: nowrap; padding: 2px 6px; font-size: 11px;">
                👤 {{ getDisplayData(t).client }}
              </div>
              
              <!-- 💡 縮短按鈕字眼，並防止被擠壓 -->
              <button v-if="t.category === '零售收入'" class="repeat-btn" @click="handleRepeatOrder(t)" style="white-space: nowrap; padding: 2px 6px; font-size: 11px; flex-shrink: 0;">🔁 再來</button>
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
          
          <div style="text-align:right;display:flex;align-items:center;gap:10px; margin-left: 10px; flex-shrink: 0;">
            <div class="t-amt" :class="getTxnAmountClass(t)">
              {{ formatTxnAmount(t) }}
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
      <div v-if="expForm.backfill" class="form-item" style="margin-top:15px;">
        <label>當時時間（唔記得就用 12:00）</label>
        <input class="modern-inp" type="time" v-model="expForm.historyTime">
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
      <div v-if="expForm.type==='income'" class="form-item" style="margin-top:15px;">
        <label>成本（唔知請留空；確定冇成本先填 0）</label>
        <input class="modern-inp" type="number" min="0" step="0.01" inputmode="decimal" v-model="expForm.cost">
      </div>

      <!-- 🟢 新增：選擇關聯分店 -->
      <div class="form-item" style="margin-top:15px;">
        <label>📍 關聯分店</label>
        <select class="modern-select" v-model="expForm.branch">
          <option value="觀塘">觀塘總店</option>
          <option value="中環">中環分店</option>
          <option value="佐敦">佐敦分店</option>
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
          <div><label>產生查詢數</label><input class="modern-inp" type="tel" inputmode="numeric" pattern="[0-9]*" v-model="expForm.ad_inquiries"></div>
          <div><label>獲得電話數</label><input class="modern-inp" type="tel" inputmode="numeric" pattern="[0-9]*" v-model="expForm.ad_phones"></div>
        </div>
      </div>

      <div class="form-item" style="margin-top:15px;">
     <label>金額 (HK$)</label>
    <input class="modern-inp amt-inp" type="tel" inputmode="decimal" pattern="[0-9.]*" v-model="expForm.amount">
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
      
<!-- 加上一個外層的 div 來把按鈕頂上來，避免被手機底部控制列擋住 -->
<div style="padding-bottom: 80px;">
  <p v-if="backfillSavedCount && expForm.backfill" role="status" style="margin:16px 0 0;color:#668048;font-weight:700;">已補 {{ backfillSavedCount }} 筆；日期同分店已保留，繼續填下一筆。</p>
  <button class="btn-primary" style="margin-top:30px; width:100%; padding:16px; font-size:16px;" :disabled="isReadOnlyPreview || isSavingTransaction" @click="saveTransaction(false)">{{ isReadOnlyPreview ? '預覽版只供查看' : isSavingTransaction ? '儲存中…' : '✅ 儲存並完成' }}</button>
  <button v-if="expForm.backfill" class="btn-outline" style="margin-top:10px; width:100%; padding:13px; font-size:15px;" :disabled="isReadOnlyPreview || isSavingTransaction" @click="saveTransaction(true)">儲存並補同日下一筆 ＋</button>
</div>    </BaseModal>

    <!-- 💡 浮動回到最上層按鈕 -->
    <button v-if="showScrollTop" class="scroll-top-btn" @click="scrollToTop">⬆️</button>

  </div>
</template>

<style scoped>

/* 🟢 極限壓縮頂部留白樣式 */
.sticky-top-bar {
  position: -webkit-sticky;
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: #f8fafc; 
  margin-top: -10px;  /* 減少外距 */
  margin-left: -10px;
  margin-right: -10px;
  padding-top: 5px;   /* 💡 核心：大幅減少標題上方的空白 */
  padding-left: 10px; /* 減少左右空白 */
  padding-right: 10px;
  padding-bottom: 5px; /* 💡 核心：減少標題下方的空白 */
  box-shadow: 0 4px 10px -3px rgba(248, 250, 252, 0.95);
}

/* 💡 核心：將整個頁面的四周留白從 20px 縮小到 10px */
.page { padding: 10px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; }

/* 🟢 修改這組：分類過濾列 (縮小 20%，減少底部距離) */
.filter-row { display: flex; gap: 6px; margin-bottom: 8px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
.filter-row::-webkit-scrollbar { display: none; }
.f-btn { padding: 6px 12px; border-radius: 99px; border: 1px solid #e2e8f0; background: white; font-weight: 800; font-size: 11px; color: #64748b; white-space: nowrap; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
.f-btn.active { background: #4f46e2; color: white; border-color: #4f46e2; box-shadow: 0 4px 10px rgba(79, 70, 226, 0.2); }

.card { background: white; border-radius: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.date-header { font-size: 13px; font-weight: 900; color: #64748b; margin: 15px 0 8px; }
/* 💡 極限省空間版：縮小上下內距與字體 */
.txn-item { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px dashed #e2e8f0; }
.t-header-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }

/* 標籤縮小 */
.t-cat { font-weight: 900; font-size: 11px; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 6px; border: 1px solid #e2e8f0;}
.t-client-highlight { font-weight: 900; font-size: 12px; color: #ec4899; background: #fdf2f8; padding: 2px 6px; border-radius: 6px; border: 1px solid #fbcfe8; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(236,72,153,0.1);}

.repeat-btn { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 900; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center;}
.repeat-btn:active { transform: scale(0.95); background: #c7d2fe; }

/* 內容區塊間距縮細 */
.t-desc-box { background: white; border-left: 3px solid #cbd5e1; padding-left: 10px; margin-bottom: 2px; }
.t-desc { font-size: 12px; color: #64748b; font-weight: 600; display: flex; align-items: flex-start; gap: 6px; line-height: 1.3; margin-top: 2px !important; }
.icon-lbl { font-size: 11px; font-weight: 800; color: #94a3b8; white-space: nowrap; margin-top: 1px;}
.t-desc-val { 
  color: #1e293b; 
  font-weight: 900; 
  font-size: 13px; 
  word-break: break-word; 
  white-space: pre-wrap; /* 🟢 確保正常換行 */
  flex: 1; /* 🟢 填滿剩餘空間，避免被擠壓 */
  min-width: 0;
}
.t-staff { font-weight: 900; color: #4f46e2; font-size: 13px; } 
.t-ad { font-size: 11px; color: #d97706; margin-top: 4px; font-weight: 800; background: #fff7ed; display: inline-block; padding: 2px 6px; border-radius: 6px; }

/* 金額與操作按鈕縮細 */
.t-amt { font-weight: 900; font-size: 18px; white-space: nowrap;}
.t-amt.g { color: #10b981; }
.t-amt.r { color: #ef4444; }
.icon-btn { background: #f1f5f9; border: none; font-size: 12px; padding: 6px; border-radius: 6px; cursor: pointer; transition: 0.2s; }
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
.btn-primary { background: #4f46e2; color: white; border: none; transition: 0.2s; cursor: pointer;}
.btn-primary:active { transform: scale(0.96); }

/* 🟢 修改這組：分店過濾標籤 (縮小 20%，減少底部距離) */
.branch-tabs { display: flex; gap: 6px; margin-bottom: 8px; overflow-x: auto; padding-bottom: 2px; }
.branch-tabs button { flex: 1; padding: 6px 8px; border-radius: 10px; border: 1px solid #e2e8f0; background: white; font-weight: 800; color: #64748b; cursor: pointer; white-space: nowrap; transition: 0.2s; font-size: 11px;}
.branch-tabs button.active { background: #eef2ff; color: #4f46e2; border-color: #c7d2fe; box-shadow: 0 2px 8px rgba(79,70,229,0.15);}
</style>
