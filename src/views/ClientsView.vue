<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase' 

const store = useMainStore()

const showAddModal = ref(false)
const showEditModal = ref(false)
const clientSearch = ref('') 
const filterBranch = ref('')
const filterStatus = ref('active')
const filterMyGiftExpiring = ref(false) 
const sortBy = ref('default') 
const consumeMyGift = ref(false)
const activeTab = ref('basic') // 🚀 新增：用來控制目前顯示哪一個分頁 ('basic', 'source', 'advanced')

const getLocalHKDate = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().split('T')[0]
}
const todayStr = getLocalHKDate()

const defaultNewClient = { 
  name: '', phone: '', branch: '觀塘', source: '廣告', status: 'prospect', 
  is_vip: false, is_marathon: false, join_date: todayStr, 
  package_count: 0, expiry_date: '', handled_by: '', payment_received: 0,
  referred_by_id: null, vip_tier: '銅級(88折)', 
  trial_date: '', remark: '' 
}

const newClient = ref({ ...defaultNewClient })
const editingClient = ref({})

const allClientsOptions = computed(() => {
    return store.clients.map(c => ({ id: c.id, name: c.name, phone: c.phone }))
})
// 🟢 朋友介紹搜尋框專用變數
const referrerSearch = ref('')
const filteredReferrerOptions = computed(() => {
  const q = referrerSearch.value.toLowerCase()
  if (!q) return allClientsOptions.value
  return allClientsOptions.value.filter(c => 
    (c.name && c.name.toLowerCase().includes(q)) || 
    (c.phone && c.phone.includes(q))
  )
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
    let earliest = getEarliestTxnDate(c.name)
    
    if (earliest) {
        // 如果實際購買日 比 設定的加入日 還要早，系統自動往前修正為購買日
        if (!fixedClient.join_date || fixedClient.join_date > earliest) {
            fixedClient.join_date = earliest
        }
        // 只要有買過套票，就強制轉為「正式會員」，徹底解決套票次數被隱藏的問題！
        if (fixedClient.status === 'prospect' || fixedClient.status === 'absent') {
            fixedClient.status = 'active'
        }
    }
    return fixedClient
  })
  
  // 2️⃣ 接下來走原本的搜尋與過濾邏輯
  const q = clientSearch.value.toLowerCase()
  if (q) {
    list = list.filter(c => (c?.name && c?.name.toLowerCase().includes(q)) || (c?.phone && c?.phone.includes(q)))
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
    newClient.value = { ...defaultNewClient, handled_by: store.currentUser || 'kwan' }
    consumeMyGift.value = false 
    referrerSearch.value = '' 
    activeTab.value = 'basic' // 🚀 新增：每次打開都預設回到「基本資料」分頁
    showAddModal.value = true
}

async function handleAddClient() {
  if (!newClient.value.name) return alert('請填寫姓名')
  
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
  
  const now = new Date();
  const hkYMD = getLocalHKDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  if (consumeMyGift.value && dataToInsert.referred_by_id) {
    const referrer = store.clients.find(c => c.id === dataToInsert.referred_by_id);
    if (referrer) {
      const dummyTxn = {
        type: 'expense', amount: 0,
        note: `推薦新客: ${dataToInsert.name}`,
        client_name: referrer.name,
        category: 'MyGift消耗',
        handled_by: store.currentUser || '系統自動',
        own_email: user.email,
        created_at: `${hkYMD}T${hh}:${mm}:${ss}`
      };
      await supabase.from('transactions').insert(dummyTxn);
    }
  } 
  else if (dataToInsert.status === 'prospect') {
    const trialIncomeTxn = {
      type: 'income', amount: 98, cost: 52, profit: 46,
      note: `預約試堂收費: ${dataToInsert.name}`,
      client_name: dataToInsert.name,
      category: '試堂',
      handled_by: dataToInsert.handled_by || store.currentUser || '系統',
      own_email: user.email,
      created_at: `${hkYMD}T${hh}:${mm}:${ss}`
    };
    await supabase.from('transactions').insert(trialIncomeTxn);
  }

  showAddModal.value = false; 
  store.syncAll(); 
  alert('✅ 新增成功') 
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

  const { error } = await supabase.from('clients').update(dataToUpdate).eq('id', dataToUpdate.id)
  if (error) alert('更新失敗: ' + error.message)
  else { showEditModal.value = false; store.syncAll(); alert('✅ 修改已儲存') }
}

async function handleDeleteClient() {
  if(!confirm(`⚠️ 徹底刪除「${editingClient.value.name}」？此操作不可還原！`)) return
  const { error } = await supabase.from('clients').delete().eq('id', editingClient.value.id)
  if (error) alert('刪除失敗')
  else { showEditModal.value = false; store.syncAll(); alert('已刪除') }
}

function openEditModal(client) {
  editingClient.value = { ...client }
  if (editingClient.value.trial_date) {
    editingClient.value.trial_date = toLocalDatetimeString(editingClient.value.trial_date)
  }
  referrerSearch.value = '' 
  activeTab.value = 'basic' // 🚀 新增：每次打開都預設回到「基本資料」分頁
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

  // 🚀 終極修復：不要從 store 拿，直接跟 Supabase 要最新的登入憑證！
  // 這樣不管你怎麼重新整理，只要你是登入狀態，就一定抓得到 Email。
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
      
      let count = 0;
      for (const line of rows) {
        const row = line.split(',');
        
        if (!row[0]) continue; 

        const { error } = await supabase.from('clients').insert([{
          name: String(row[0] || '').trim(),
          phone: String(row[1] || '').trim(),
          branch: (row[2] || '觀塘').trim(),
          status: (row[3] || 'active').trim(),
          join_date: row[4] ? row[4].trim() : null,
          source: (row[5] || '其他').trim(),
          expiry_date: row[6] ? row[6].trim() : null,
          remark: (row[7] || '').trim(),
          owner_email: currentUserEmail // 👈 強制寫入剛剛跟 Supabase 要到的 Email
        }]);

        if (!error) count++;
      }
      
      alert(`✅ 匯入成功！共有 ${count} 位客戶已歸屬到您的帳號 (${currentUserEmail})。`);
      await store.syncAll(); 
      
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
      <h2 class="page-title">FITWORK PRO 管理端</h2>
      <p class="subtitle">數據即時同步中 ⚡️</p>
    </div>
    
    <div class="card search-box">
      <!-- 1. 搜尋列 (減少了上下 padding) -->
      <input class="inp-clean" v-model="clientSearch" placeholder="🔍 即時搜尋姓名、電話、負責人...">

      <!-- 2. 客戶狀態過濾 (移除分店，減輕滑動負擔) -->
      <div class="filter-row">
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
            <div class="f-item"><label>電話</label><input v-model="editingClient.phone" class="modern-inp"></div>
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
   <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="center-modal scrollable-modal" style="padding-bottom: 0;">
        <div class="m-header">➕ 登記新客戶 <button class="close-x" @click="showAddModal=false">✕</button></div>
        
        <div class="tab-nav">
          <button class="tab-btn" :class="{active: activeTab === 'basic'}" @click="activeTab = 'basic'">👤 基本</button>
          <button class="tab-btn" :class="{active: activeTab === 'source'}" @click="activeTab = 'source'">📅 來源/預約</button>
          <button class="tab-btn" :class="{active: activeTab === 'advanced'}" @click="activeTab = 'advanced'">💎 進階設定</button>
        </div>

        <div class="toggle-group sticky-toggle">
          <button class="t-btn" :class="{active: newClient.status === 'active'}" @click="newClient.status = 'active'">正式會員</button>
          <button class="t-btn" :class="{active: newClient.status === 'prospect'}" @click="newClient.status = 'prospect'">試堂預約</button>
        </div>

        <div class="tab-content-area">
          <div v-show="activeTab === 'basic'" class="tab-pane">
            <div class="f-item"><label>姓名</label><input v-model="newClient.name" class="modern-inp" placeholder="請輸入姓名"></div>
            <div class="f-item"><label>電話</label><input v-model="newClient.phone" class="modern-inp" placeholder="請輸入電話"></div>
            <div class="f-item">
                <label>分店</label>
                <select v-model="newClient.branch" class="modern-select">
                    <option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
                </select>
            </div>
          </div>

          <div v-show="activeTab === 'source'" class="tab-pane">
            <div class="f-item">
                <label>認識來源</label>
                <select v-model="newClient.source" class="modern-select">
                    <option value="廣告">廣告</option><option value="廣告+朋友介紹">廣告 + 朋友介紹</option>
                    <option value="傳單">傳單</option><option value="朋友介紹">朋友介紹</option>
                    <option value="IG">IG</option><option value="朋友">朋友</option>
                </select>
            </div>

            <div class="f-item" v-if="newClient.source === '朋友介紹' || newClient.source === '廣告+朋友介紹'" style="margin-top: 12px;">
                <label>介紹人 (計算代數)</label>
                <input v-model="referrerSearch" class="modern-inp" placeholder="🔍 快速搜尋姓名或電話..." style="margin-bottom: 8px; font-size: 14px; padding: 10px;">
                <select v-model="newClient.referred_by_id" class="modern-select">
                    <option :value="null">請選擇...</option>
                    <option v-for="c in filteredReferrerOptions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.phone }})</option>
                </select>
            </div>

            <div class="f-item" v-if="(newClient.source === '朋友介紹' || newClient.source === '廣告+朋友介紹') && newClient.referred_by_id" style="margin-top: 15px; background: #faf5ff; border: 1px dashed #c4b5fd; padding: 15px; border-radius: 12px; animation: popIn 0.3s ease-out;">
               <label style="color: #7c3aed; font-size: 14px;">🎁 是否消耗介紹人的 MyGift？</label>
               <div style="font-size: 12px; color: #64748b; margin-bottom: 10px; font-weight: 700;">
                 介紹人目前剩餘: <span style="color: #ef4444; font-size: 14px; font-weight: 900;">{{ getMyGiftStats(store.clients.find(c => c.id === newClient.referred_by_id)).available }}</span> 張
               </div>
               <div class="toggle-card" style="margin: 0;" :class="{active: consumeMyGift}" @click="consumeMyGift = !consumeMyGift">
                 {{ consumeMyGift ? '✅ 是，建立後自動扣減 1 張' : '❌ 否，不扣除' }}
               </div>
            </div>

            <div class="f-item" v-if="newClient.status === 'prospect'" style="margin-top: 12px; animation: popIn 0.3s ease-out;">
              <label>⏰ 預約試堂日期與時間</label>
              <input type="datetime-local" v-model="newClient.trial_date" class="modern-date" style="margin-bottom: 10px;">
              <label>📍 預約試堂地點</label>
              <select v-model="newClient.branch" class="modern-select">
                <option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
              </select>
            </div>
            
            <div class="grid-2" style="margin-top: 12px;">
              <div class="f-item"><label>成為客戶日期</label><input type="date" v-model="newClient.join_date" class="modern-date"></div>
              <div class="f-item"><label>套票有效期 (選填)</label><input type="date" v-model="newClient.expiry_date" class="modern-date"></div>
            </div>
          </div>

          <div v-show="activeTab === 'advanced'" class="tab-pane">
            <div class="f-item">
              <label>💬 客戶備註</label>
              <textarea v-model="newClient.remark" class="modern-inp" style="height: 100px;" placeholder="輸入備註事項 (客戶要求、運動習慣等)..."></textarea>
            </div>

            <label style="font-size: 12px; font-weight: 800; color: #475569; margin: 15px 0 6px; display:block;">🏆 項目設定</label>
            <div class="row-flex">
              <div class="toggle-card" :class="{active: newClient.is_marathon}" @click="newClient.is_marathon = !newClient.is_marathon">🏃 馬拉松</div>
              <div class="toggle-card" :class="{active: newClient.is_vip}" @click="newClient.is_vip = !newClient.is_vip">💎 VIP 折扣</div>
            </div>

            <div class="f-item" v-if="newClient.is_vip" style="margin-top: 15px; animation: popIn 0.3s ease-out;">
              <label>🎖️ 請選擇 VIP 等級</label>
              <select v-model="newClient.vip_tier" class="modern-select">
                <option value="銅級(88折)">🥉 銅級 (88折)</option><option value="銀級(75折)">🥈 銀級 (75折)</option>
                <option value="金級(65折)">🥇 金級 (65折)</option><option value="直接58折">💎 直接58折</option><option value="領班(半折)">👑 領班 (半折)</option>
              </select>
            </div>
          </div>
        </div>

        <div class="sticky-action-row">
          <button class="btn-confirm" style="width:100%; margin: 0;" @click="handleAddClient">立即新增客戶</button>
        </div>

      </div>
    </div>

    <div v-if="showActionModal" class="modal-overlay" @click.self="showActionModal = false">
      <div class="center-modal action-modal" style="max-width: 350px;">
        <div class="m-header">
          ⚡ 快捷操作：{{ selectedClientForAction?.name }}
          <button class="close-x" @click="showActionModal = false">✕</button>
        </div>
        
        <div class="action-menu-list">
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
  padding: 25px 25px 50px 25px; /* 內部底部多加一點 padding，讓按鈕有呼吸空間 */
  box-shadow: 0 20px 50px rgba(0,0,0,0.3); 
  animation: popIn 0.3s ease-out; position: relative; 
  
  /* 2️⃣ 自動填滿剛剛設定的安全空間，只要內容超過，就會在內部產生順滑捲軸 */
  margin: 0; 
  max-height: 100%; 
  overflow-y: auto; -webkit-overflow-scrolling: touch; 
  overscroll-behavior: contain;
}

@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.m-header { font-weight: 900; font-size: 18px; margin-bottom: 20px; display: flex; justify-content: space-between; color: #1e293b; align-items: center;}
.close-x { background: #f1f5f9; border-radius: 50%; width: 30px; height: 30px; border: none; font-size: 14px; font-weight: 900; color: #475569; cursor: pointer; display: flex; justify-content: center; align-items: center; flex-shrink: 0;}
.section-title { font-size: 12px; font-weight: 900; color: #6366f1; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 1px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modern-inp, .modern-select, .modern-date { width: 100%; background: #f8fafc; border: 2px solid #f1f5f9; padding: 12px 15px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; font-size: 16px; appearance: none; }
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
  min-height: 280px; 
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