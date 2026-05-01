<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BaseModal from '../components/BaseModal.vue'

const store = useMainStore()

// ==========================================
// 🛡️ 終極防護大絕招：字串絕對隔離法
// ==========================================
const getLocalYMD = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().split('T')[0]
}

// 🟢 1. 先宣告狀態變數 (非常重要，順序不能錯)
const activeCategory = ref('全部')
const filterMonth = ref(getLocalYMD().substring(0, 7)) // 🟢 自動預設為「當前月份」
const searchQuery = ref('') // 🟢 新增：搜尋關鍵字

// 🟢 2. 然後才能設定監聽器：當切換「月份」、「分類」或「搜尋」時，畫面自動滾回第一行
watch([filterMonth, activeCategory, searchQuery], () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const pageEl = document.querySelector('.page')
    if (pageEl) pageEl.scrollTo({ top: 0, behavior: 'smooth' })
  }, 50)

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
      months.add(String(t.created_at).substring(0, 7)) // 只取 'YYYY-MM'
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
    branch: '觀塘', // 🟢 新增
    date: getLocalYMD() 
  }
  showExpModal.value = true
}

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

  expForm.value = {
    type: t?.type, amount: t?.amount, 
    note: extractedNote, 
    client_name: extractedClient, 
    staff: t?.staff || t?.handled_by || '',
    category: t?.category, ad_inquiries: t?.ad_inquiries || 0, ad_phones: t?.ad_phones || 0,
    branch: t?.branch || '觀塘', // 🟢 讀取舊紀錄的分店
    date: String(t?.created_at || '').slice(0, 10) 
  }
  showExpModal.value = true
}
// 🛡️ 加上防護盾
const activeClientsOptions = computed(() => {
  return store.clients.map(c => c?.name || '').sort((a,b) => a.localeCompare(b, 'zh-HK'))
})

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
    filteredList = filteredList.filter(t => String(t?.created_at || '').startsWith(filterMonth.value))
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

  filteredList.forEach(t => {
    // 🛡️ 加上防護盾
    const dateStr = String(t?.created_at || '').slice(0, 10)
    if (!dateStr || dateStr.length < 10) return
    
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
  
  const match = t?.note?.match(/\((.*)\)$/)
  if (match) {
    const itemString = match[1]
    // 🟢 智能正則：只用逗號分隔「不在括號內」的產品
    const parts = itemString.split(/,\s*(?![^()]*\))/)
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

  store.pendingRepeatOrder = { clientName: client, branch: t?.branch, items: items }
  store.view = 'retail'
}

  
  const match = extractedNote.match(/^【(.*?)】\s*(.*)$/)
  if (match) {
    if (!extractedClient) extractedClient = match[1]
    extractedNote = match[2]
  } else if (extractedClient && extractedNote.startsWith(extractedClient + ' (')) {
    extractedNote = extractedNote.replace(extractedClient + ' ', '')
  }

  expForm.value = {
    type: t?.type, amount: t?.amount, 
    note: extractedNote, 
    client_name: extractedClient, 
    staff: t?.staff || t?.handled_by || '',
    category: t?.category, ad_inquiries: t?.ad_inquiries || 0, ad_phones: t?.ad_phones || 0,
    date: String(t?.created_at || '').slice(0, 10) 
  }
  showExpModal.value = true

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
  
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  
  const finalString = `${expForm.value.date}T${hh}:${mm}:${ss}`
  const updatePayload = { ...data, created_at: finalString }

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
        const pQty = parseInt(p.substring(lastXIndex + 1))
        
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

  // 開始退還(或扣除)庫存
  if (itemsToRefund.length > 0) {
    let stockUpdateFailed = false
    
    for (const item of itemsToRefund) {
      const { data: stockData } = await supabase.from('stock')
        .select('quantity').eq('prod_name', item.name).eq('branch', t.branch || '觀塘').eq('user_id', user.id).maybeSingle()

      const currentQty = stockData ? stockData.quantity : 0
      const newQty = isProcurement ? currentQty - item.qty : currentQty + item.qty 

      if (stockData) {
        const { error: updateErr } = await supabase.from('stock').update({ quantity: newQty }).eq('prod_name', item.name).eq('branch', t.branch || '觀塘').eq('user_id', user.id)
        if (updateErr) stockUpdateFailed = true
      } else {
        const { error: insertErr } = await supabase.from('stock').insert({
            prod_name: item.name, branch: t.branch || '觀塘', quantity: newQty, user_id: user.id, own_email: user.email
        })
        if (insertErr) stockUpdateFailed = true
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
</script>

<template>
  <div class="page" style="padding-bottom: 150px;">
    
    <!-- 💡 置頂區塊 Wrapper 開始 -->
    <div class="sticky-top-bar">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h2 class="page-title" style="margin:0;">收支流水帳</h2>
        <div style="display: flex; gap: 8px; align-items: center;">
          <select v-model="filterMonth" class="modern-select" style="padding: 6px 10px; width: auto; font-size: 13px; border-radius: 10px; margin: 0; background: white; border-color: #e2e8f0;">
            <option value="all">所有月份</option>
            <option v-for="m in availableMonths" :key="m" :value="m">{{ formatMonthLabel(m) }}</option>
          </select>
          <button class="btn-primary" style="padding:8px 14px; border-radius:10px; font-weight:800; font-size: 13px;" @click="openExpForm">+ 新增收支</button>
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
      <!-- 🟢 新增：超強搜尋列 -->
      <div style="position: relative; margin-bottom: 10px;">
        <span style="position: absolute; left: 12px; top: 10px; font-size: 14px;">🔍</span>
        <input class="modern-inp" v-model="searchQuery" placeholder="搜尋客戶名稱、項目或備註..." style="padding: 10px 10px 10px 35px; border-radius: 12px; font-size: 14px; background: white; border: 1px solid #cbd5e1; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); width: 100%; outline: none; transition: 0.2s;">
      </div>
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
          
          <div style="text-align:right;display:flex;align-items:center;gap:10px; margin-left: 10px; flex-shrink: 0;">
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
      
<!-- 加上一個外層的 div 來把按鈕頂上來，避免被手機底部控制列擋住 -->
<div style="padding-bottom: 80px;">
  <button class="btn-primary" style="margin-top:30px; width:100%; padding:16px; font-size:16px;" @click="saveTransaction">✅ 儲存</button>
</div>    </BaseModal>

    <!-- 💡 浮動回到最上層按鈕 -->
    <button v-if="showScrollTop" class="scroll-top-btn" @click="scrollToTop">⬆️</button>

  </div>
</template>

<style scoped>

/* 💡 超強置頂樣式 */
.sticky-top-bar {
  position: -webkit-sticky; /* 這是專門給 iOS Safari / iPhone 的防彈衣 */
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: #f8fafc; 
  margin-top: -20px;
  margin-left: -20px;
  margin-right: -20px;
  padding-top: 20px;
  padding-left: 20px;
  padding-right: 20px;
  padding-bottom: 10px;
  box-shadow: 0 6px 15px -3px rgba(248, 250, 252, 0.95);
}

.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; }

/* 🟢 新增：過濾列與按鈕樣式 */
.filter-row { display: flex; gap: 8px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 5px; -webkit-overflow-scrolling: touch; }
.filter-row::-webkit-scrollbar { display: none; }
.f-btn { padding: 8px 16px; border-radius: 99px; border: 1px solid #e2e8f0; background: white; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
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
.t-desc-val { color: #1e293b; font-weight: 900; font-size: 13px; word-break: break-word; } 
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
</style>