<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase' 

const store = useMainStore()

// --- 狀態定義 ---
const showAddModal = ref(false)
const showEditModal = ref(false)
const clientSearch = ref('') 
const filterBranch = ref('')
const filterStatus = ref('active')

// 💡 排序狀態
const sortBy = ref('default') 

// 計算正確的香港本地時區日期
const getLocalHKDate = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().split('T')[0]
}
const todayStr = getLocalHKDate()

const defaultNewClient = { 
  name: '', phone: '', branch: '觀塘', source: '廣告', status: 'active', 
  is_vip: false, is_marathon: false, join_date: todayStr, 
  package_count: 0, expiry_date: '', handled_by: '', payment_received: 0,
  referred_by_id: null, vip_tier: '銅級(88折)', 
  trial_date: '' 
}

const newClient = ref({ ...defaultNewClient })
const editingClient = ref({})

const allClientsOptions = computed(() => {
    return store.clients.map(c => ({ id: c.id, name: c.name, phone: c.phone }))
})

// 💡 智能計算套票購買次數 (10點 / 35點)
const getClientPackageStats = (clientName) => {
  if (!clientName) return { pkg10: 0, pkg35: 0 }
  let pkg10 = 0, pkg35 = 0
  
  store.transactions.forEach(t => {
    if ((t.category === '運動套票' || t.category === '運動') && t.note && t.note.includes(clientName)) {
      if (t.amount === 850 || t.note.includes('10點') || t.note.includes('pkg_10')) pkg10++
      if (t.amount === 2550 || t.amount === 2800 || t.note.includes('35點') || t.note.includes('pkg_35')) pkg35++
    }
  })
  return { pkg10, pkg35 }
}

// ==========================================
// 🍎 終極防護：破除 Safari 自動 +8 小時魔咒
// ==========================================
const parseLocal = (dateStr) => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  
  // 1. 擷取字串前 19 位 (YYYY-MM-DDTHH:mm:ss)
  let cleanStr = String(dateStr).slice(0, 19);
  
  // 2. 破除 Safari 魔咒：把 "-" 換成 "/"，把 "T" 換成空格
  // 變成 "YYYY/MM/DD HH:mm:ss" 後，所有設備都會強制判定為本地時間！
  cleanStr = cleanStr.replace(/-/g, '/').replace('T', ' ');
  
  return new Date(cleanStr); 
}

// 1. 將資料庫回傳的時間，轉換成列表上漂亮的顯示格式
const formatTrialDate = (dateStr) => {
  if (!dateStr) return ''
  const d = parseLocal(dateStr)
  if (isNaN(d)) return ''
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}月${day}日 ${h}:${min}`
}

// 2. 將資料庫回傳的時間，填入編輯表單的 YYYY-MM-DDTHH:mm 格式
const toLocalDatetimeString = (dateStr) => {
  if (!dateStr) return ''
  const d = parseLocal(dateStr)
  if (isNaN(d)) return ''
  const yyyy = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`
}

// --- 篩選與排序邏輯 ---
const filteredClients = computed(() => {
  let list = [...store.clients] 
  
  const q = clientSearch.value.toLowerCase()
  if (q) list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.phone && c.phone.includes(q)))
  if (filterBranch.value) list = list.filter(c => c.branch === filterBranch.value)
  if (filterStatus.value === 'active') list = list.filter(c => c.status !== 'prospect')
  else list = list.filter(c => c.status === 'prospect')

  if (sortBy.value === 'name') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-HK'))
  } else if (sortBy.value === 'phone') {
    list.sort((a, b) => (a.phone || '').localeCompare(b.phone || ''))
  } else if (sortBy.value === 'expiry_asc') {
    list.sort((a, b) => {
      if (!a.expiry_date) return 1 
      if (!b.expiry_date) return -1
      return new Date(a.expiry_date) - new Date(b.expiry_date)
    })
  } else if (sortBy.value === 'expiry_desc') {
    list.sort((a, b) => {
      if (!a.expiry_date) return 1
      if (!b.expiry_date) return -1
      return new Date(b.expiry_date) - new Date(a.expiry_date)
    })
  }

  return list
})

// ==========================================
// 🟢 快捷操作選單邏輯 (跳轉功能)
// ==========================================
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

// --- 功能函數 ---
function openAddModal() {
    newClient.value = { ...defaultNewClient, handled_by: store.currentUser || 'kwan' }
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
  
  // 🟢 儲存時硬加 Z 偽裝成 UTC，騙過 Supabase 讓它記下你輸入的原始數字
  dataToInsert.trial_date = dataToInsert.trial_date ? `${dataToInsert.trial_date.slice(0, 16)}:00Z` : null

  const { error } = await supabase.from('clients').insert([dataToInsert])
  if (error) alert('新增失敗: ' + error.message)
  else { showAddModal.value = false; store.syncAll(); alert('✅ 新增成功') }
}

async function handleUpdateClient() {
  if (!editingClient.value.name) return alert('請填寫姓名')
  
  const dataToUpdate = { ...editingClient.value }
  
  if (dataToUpdate.source !== '朋友介紹' && dataToUpdate.source !== '廣告+朋友介紹') {
      dataToUpdate.referred_by_id = null
  }
  
  if (!dataToUpdate.expiry_date) dataToUpdate.expiry_date = null
  if (!dataToUpdate.join_date) dataToUpdate.join_date = null

  // 🟢 儲存時硬加 Z 偽裝成 UTC，騙過 Supabase 讓它記下你輸入的原始數字
  dataToUpdate.trial_date = dataToUpdate.trial_date ? `${dataToUpdate.trial_date.slice(0, 16)}:00Z` : null

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
  
  showEditModal.value = true
}

const getClientGen = (id) => {
  let g = 1; let c = store.clients.find(x => x.id === id); let count = 0
  while (c && c.referred_by_id && count < 15) { g++; c = store.clients.find(x => x.id === c.referred_by_id); count++ }
  return g
}

const getExpiryClass = (date) => {
  if (!date) return ''
  const d = (new Date(date) - new Date()) / 86400000
  return d < 0 ? 'tag-red' : (d < 14 ? 'tag-orange' : 'tag-green')
}

// ==========================================
// 🚀 終極強化：客戶資料 CSV 真實批量匯入
// ==========================================
function downloadCSVTemplate() {
    const BOM = "\uFEFF"; 
    const header = "姓名(必填),電話,分店(觀塘/中環/佐敦),狀態(active/prospect),加入日期(YYYY-MM-DD),來源(廣告/傳單/朋友介紹等),到期日(YYYY-MM-DD)\n";
    const sample1 = "王大明,98765432,觀塘,active,2024-01-01,廣告,\n";
    const sample2 = "陳小美,91234567,中環,prospect,,,朋友介紹,\n";
    
    const csvContent = "data:text/csv;charset=utf-8," + BOM + header + sample1 + sample2;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "fitwork_clients_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function triggerFileInput() {
    document.getElementById('csvFileInput').click()
}

async function handleImport(event) {
    const file = event.target.files[0]
    if (!file) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

    const reader = new FileReader()
    reader.onload = async (e) => {
        try {
            const text = e.target.result
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
            if (lines.length <= 1) return alert('❌ CSV 檔案沒有資料列！')

            const insertData = []

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',')
                
                const name = cols[0]?.trim()
                if (!name) continue 

                const phone = cols[1]?.trim() || ''
                const branch = cols[2]?.trim() || '觀塘'
                const status = cols[3]?.trim() === 'prospect' ? 'prospect' : 'active'
                const join_date = cols[4]?.trim() || null
                const source = cols[5]?.trim() || '其他'
                const expiry_date = cols[6]?.trim() || null

                insertData.push({
                    name, phone, branch, status, join_date, source, expiry_date,
                    own_email: user.email,
                    user_id: user.id
                })
            }

            if (insertData.length === 0) return alert('❌ 沒有找到有效的客戶資料！請檢查格式。')

            const { error } = await supabase.from('clients').insert(insertData)
            if (error) throw error

            alert(`✅ 成功匯入 ${insertData.length} 筆客戶資料！`)
            store.syncAll() 
        } catch (err) {
            console.error('匯入失敗:', err)
            alert('❌ 匯入發生錯誤: ' + err.message)
        } finally {
            event.target.value = ''
        }
    }
    reader.readAsText(file)
}
</script>

<template>
  <div class="page">
    <div class="header-section">
      <h2 class="page-title">FITWORK PRO 管理端</h2>
      <p class="subtitle">數據即時同步中 ⚡️</p>
    </div>
    
    <div class="card search-box">
      <input class="inp-clean" v-model="clientSearch" placeholder="🔍 即時搜尋姓名、電話、負責人...">
      
      <div class="filter-row">
        <button class="f-btn" :class="{active: filterStatus==='active'}" @click="filterStatus='active'">⭐️ 正式會員</button>
        <button class="f-btn" :class="{active: filterStatus==='prospect'}" @click="filterStatus='prospect'">👀 試堂/預約</button>
        <div class="v-line"></div>
        <button v-for="b in ['觀塘','中環','佐敦']" :key="b" class="f-btn" :class="{active: filterBranch===b}" @click="filterBranch = filterBranch===b ? '' : b">{{ b }}</button>
      </div>

      <div class="sort-row">
        <span class="sort-label">排序方式：</span>
        <select v-model="sortBy" class="sort-select">
          <option value="default">🕒 預設 (最新加入)</option>
          <option value="name">🔤 姓名 (A-Z)</option>
          <option value="phone">📞 電話號碼</option>
          <option value="expiry_asc">⏳ 到期日 (由近到遠)</option>
          <option value="expiry_desc">📅 到期日 (由遠到近)</option>
        </select>
      </div>
    </div>

    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 15px;">
        <button class="btn-outline" @click="downloadCSVTemplate">📥 下載匯入格式</button>
        <button class="btn-outline" style="border-color:#4f46e2; color:#4f46e2; font-weight:900;" @click="triggerFileInput">📤 批量匯入客戶</button>
        <input type="file" id="csvFileInput" accept=".csv" style="display: none;" @change="handleImport">
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
            <span v-if="c.status === 'prospect' && c.trial_date" class="trial-time-tag">
              ⏰ {{ formatTrialDate(c.trial_date) }}
            </span>
          </div>

          <div class="c-packages" v-if="c.status !== 'prospect'">
            🎟️ 買卡: 
            <span class="pkg-tag t-10" v-if="getClientPackageStats(c.name).pkg10 > 0">10點 <b style="font-size:12px;">x{{ getClientPackageStats(c.name).pkg10 }}</b></span>
            <span class="pkg-tag t-35" v-if="getClientPackageStats(c.name).pkg35 > 0">35點 <b style="font-size:12px;">x{{ getClientPackageStats(c.name).pkg35 }}</b></span>
            <span class="pkg-zero" v-if="getClientPackageStats(c.name).pkg10 === 0 && getClientPackageStats(c.name).pkg35 === 0">尚未買卡</span>
          </div>
          
        </div>
        <div class="c-side">
          <div class="c-gen" v-if="c.status!=='prospect'">Gen {{ getClientGen(c.id) }}</div>
          <div :class="['c-expiry', getExpiryClass(c.expiry_date)]">
            {{ c.status==='prospect' ? '預約中' : (c.expiry_date || '無效期') }}
          </div>
        </div>
      </div>
    </div>

    <button class="main-fab" @click="openAddModal">+</button>

    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="center-modal scrollable-modal">
        <div class="m-header">🔧 客戶詳細設定 <button class="close-x" @click="showEditModal=false">✕</button></div>
        
        <div class="toggle-group" style="margin-bottom: 20px;">
          <button class="t-btn" :class="{active: editingClient.status === 'active'}" @click="editingClient.status = 'active'">正式會員</button>
          <button class="t-btn" :class="{active: editingClient.status === 'prospect'}" @click="editingClient.status = 'prospect'">試堂預約</button>
        </div>

        <div class="section-title">👤 基本資料</div>
        <div class="f-item"><label>姓名</label><input v-model="editingClient.name" class="modern-inp"></div>
        <div class="f-item"><label>電話</label><input v-model="editingClient.phone" class="modern-inp"></div>

        <div class="grid-2">
          <div class="f-item"><label>分店</label><select v-model="editingClient.branch" class="modern-select"><option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option></select></div>
          <div class="f-item">
              <label>來源</label>
              <select v-model="editingClient.source" class="modern-select">
                  <option value="廣告">廣告</option>
                  <option value="廣告+朋友介紹">廣告 + 朋友介紹</option>
                  <option value="傳單">傳單</option>
                  <option value="IG">IG</option>
                  <option value="朋友介紹">朋友介紹</option>
                  <option value="朋友">朋友</option>
              </select>
            </div>
        </div>
        
        <div class="f-item" v-if="editingClient.source === '朋友介紹' || editingClient.source === '廣告+朋友介紹'" style="margin-top: 12px;">
            <label>介紹人</label>
            <select v-model="editingClient.referred_by_id" class="modern-select">
                <option :value="null">請選擇介紹人...</option>
                <option v-for="c in allClientsOptions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.phone }})</option>
            </select>
        </div>

        <div class="section-title">📅 關鍵日期</div>
        <div class="f-item" v-if="editingClient.status === 'prospect'" style="margin-bottom: 12px; animation: popIn 0.3s ease-out;">
          <label>⏰ 預約試堂日期與時間</label>
          <input type="datetime-local" v-model="editingClient.trial_date" class="modern-date" style="margin-bottom: 10px;">
          <label>📍 預約試堂地點 (同步分店資料)</label>
          <select v-model="editingClient.branch" class="modern-select">
            <option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="f-item"><label>加入日期</label><input type="date" v-model="editingClient.join_date" class="modern-date"></div>
          <div class="f-item"><label>套票到期日</label><input type="date" v-model="editingClient.expiry_date" class="modern-date" placeholder="若無可留空"></div>
        </div>

        <div class="section-title">🏆 項目設定</div>
        <div class="row-flex">
          <div class="toggle-card" :class="{active: editingClient.is_marathon}" @click="editingClient.is_marathon = !editingClient.is_marathon">🏃 馬拉松</div>
          <div class="toggle-card" :class="{active: editingClient.is_vip}" @click="editingClient.is_vip = !editingClient.is_vip">💎 VIP 折扣</div>
        </div>

        <div class="f-item" v-if="editingClient.is_vip" style="margin-top: 15px; animation: popIn 0.3s ease-out;">
          <label>🎖️ 請選擇 VIP 等級</label>
          <select v-model="editingClient.vip_tier" class="modern-select">
            <option value="銅級(88折)">🥉 銅級 (88折)</option>
            <option value="銀級(75折)">🥈 銀級 (75折)</option>
            <option value="金級(65折)">🥇 金級 (65折)</option>
            <option value="直接58折">💎 直接58折</option>
            <option value="領班(半折)">👑 領班 (半折)</option>
          </select>
        </div>

        <div class="action-row">
          <button class="btn-del" @click="handleDeleteClient">🗑️ 刪除</button>
          <button class="btn-confirm" @click="handleUpdateClient">確認修改</button>
        </div>
      </div>
    </div>

    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="center-modal scrollable-modal">
        <div class="m-header">➕ 登記新客戶 <button class="close-x" @click="showAddModal=false">✕</button></div>
        
        <div class="toggle-group" style="margin-bottom: 20px;">
          <button class="t-btn" :class="{active: newClient.status === 'active'}" @click="newClient.status = 'active'">正式會員</button>
          <button class="t-btn" :class="{active: newClient.status === 'prospect'}" @click="newClient.status = 'prospect'">試堂預約</button>
        </div>

        <div class="section-title">👤 基本資料</div>
        <div class="f-item"><label>姓名</label><input v-model="newClient.name" class="modern-inp" placeholder="請輸入姓名"></div>
        <div class="f-item"><label>電話</label><input v-model="newClient.phone" class="modern-inp" placeholder="請輸入電話"></div>
        
        <div class="grid-2">
            <div class="f-item"><label>分店</label>
                <select v-model="newClient.branch" class="modern-select">
                    <option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
                </select>
            </div>
            <div class="f-item"><label>認識來源</label>
                <select v-model="newClient.source" class="modern-select">
                    <option value="廣告">廣告</option>
                    <option value="廣告+朋友介紹">廣告 + 朋友介紹</option>
                    <option value="傳單">傳單</option>
                    <option value="朋友介紹">朋友介紹</option>
                    <option value="IG">IG</option>
                    <option value="朋友">朋友</option>
                </select>
            </div>
        </div>

        <div class="f-item" v-if="newClient.source === '朋友介紹' || newClient.source === '廣告+朋友介紹'" style="margin-top: 12px;">
            <label>是哪位朋友介紹的？(計算代數)</label>
            <select v-model="newClient.referred_by_id" class="modern-select">
                <option :value="null">請選擇...</option>
                <option v-for="c in allClientsOptions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.phone }})</option>
            </select>
        </div>

        <div class="section-title">📅 關鍵日期</div>
        <div class="f-item" v-if="newClient.status === 'prospect'" style="margin-bottom: 12px; animation: popIn 0.3s ease-out;">
          <label>⏰ 預約試堂日期與時間</label>
          <input type="datetime-local" v-model="newClient.trial_date" class="modern-date" style="margin-bottom: 10px;">
          <label>📍 預約試堂地點 (同步分店資料)</label>
          <select v-model="newClient.branch" class="modern-select">
            <option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="f-item"><label>成為客戶日期</label><input type="date" v-model="newClient.join_date" class="modern-date"></div>
          <div class="f-item"><label>套票有效期 (選填)</label><input type="date" v-model="newClient.expiry_date" class="modern-date"></div>
        </div>

        <div class="section-title">🏆 項目設定</div>
        <div class="row-flex">
          <div class="toggle-card" :class="{active: newClient.is_marathon}" @click="newClient.is_marathon = !newClient.is_marathon">🏃 馬拉松</div>
          <div class="toggle-card" :class="{active: newClient.is_vip}" @click="newClient.is_vip = !newClient.is_vip">💎 VIP 折扣</div>
        </div>

        <div class="f-item" v-if="newClient.is_vip" style="margin-top: 15px; animation: popIn 0.3s ease-out;">
          <label>🎖️ 請選擇 VIP 等級</label>
          <select v-model="newClient.vip_tier" class="modern-select">
            <option value="銅級(88折)">🥉 銅級 (88折)</option>
            <option value="銀級(75折)">🥈 銀級 (75折)</option>
            <option value="金級(65折)">🥇 金級 (65折)</option>
            <option value="直接58折">💎 直接58折</option>
            <option value="領班(半折)">👑 領班 (半折)</option>
          </select>
        </div>

        <button class="btn-confirm" style="width:100%; margin-top:20px;" @click="handleAddClient">立即新增</button>
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
.search-box { background: white; padding: 18px; border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.03); margin-bottom: 20px; }
.inp-clean { width: 100%; border: none; background: #f1f5f9; padding: 14px 20px; border-radius: 15px; font-size: 16px; font-weight: 600; outline: none; }
.filter-row { display: flex; gap: 8px; margin-top: 15px; overflow-x: auto; }
.f-btn { padding: 8px 18px; border-radius: 99px; border: 1px solid #e2e8f0; background: white; font-weight: 700; font-size: 13px; white-space: nowrap; cursor: pointer;}
.f-btn.active { background: #6366f1; color: white; border-color: #6366f1; }
.v-line { width: 1px; background: #e2e8f0; margin: 0 5px; }
.sort-row { display: flex; align-items: center; gap: 8px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0; }
.sort-label { font-size: 13px; font-weight: 800; color: #64748b; }
.sort-select { background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #1e293b; outline: none; cursor: pointer; }
.sort-select:focus { border-color: #6366f1; }
.btn-outline { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; transition: 0.2s;}
.btn-outline:active { transform: scale(0.95); }
.client-card { background: white; padding: 16px; border-radius: 20px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid #f1f5f9; transition: 0.2s; cursor: pointer;}
.client-card:active { transform: scale(0.97); }
.c-avatar { width: 48px; height: 48px; background: #6366f1; color: white; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; }
.c-name { font-weight: 800; font-size: 17px; color: #1e293b; }
.badge-vip { background: #fef9c3; color: #a16207; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; margin-left: 5px; }
.badge-run { background: linear-gradient(135deg, #4f46e2, #9333ea); color: white; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; margin-left: 5px; }
.c-meta { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
.trial-time-tag { background: #fffbeb; color: #d97706; padding: 2px 6px; border-radius: 6px; font-weight: 800; margin-left: 8px; font-size: 11px; }
.c-packages { font-size: 11px; font-weight: 800; color: #94a3b8; margin-top: 6px; display: flex; gap: 6px; align-items: center;}
.pkg-tag { padding: 2px 6px; border-radius: 6px; font-weight: 900; color: white; }
.t-10 { background: #3b82f6; }
.t-35 { background: #ec4899; }
.pkg-zero { background: #f1f5f9; color: #94a3b8; padding: 2px 6px; border-radius: 6px;}
.c-gen { font-weight: 900; color: #6366f1; font-size: 12px; text-align: right;}
.c-expiry { font-size: 11px; font-weight: 800; margin-top: 4px; text-align: right;}
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: center; justify-content: center; }
.center-modal { background: white; width: 90%; max-width: 450px; border-radius: 24px; padding: 25px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); animation: popIn 0.3s ease-out; }
.scrollable-modal { max-height: 85vh; overflow-y: auto; padding-right: 5px; }
@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.m-header { font-weight: 900; font-size: 18px; margin-bottom: 20px; display: flex; justify-content: space-between; color: #1e293b; }
.close-x { background: #f1f5f9; border-radius: 50%; width: 30px; height: 30px; border: none; font-size: 14px; font-weight: 900; color: #475569; cursor: pointer; display: flex; justify-content: center; align-items: center;}
.section-title { font-size: 12px; font-weight: 900; color: #6366f1; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 1px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modern-inp, .modern-select, .modern-date { width: 100%; background: #f8fafc; border: 2px solid #f1f5f9; padding: 12px 15px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; font-size: 16px; appearance: none; }
.modern-inp:focus, .modern-select:focus { border-color: #6366f1; background: white; }
.f-item { margin-bottom: 12px; }
.f-item label { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; }
.toggle-group { display: flex; gap: 8px; background: #f1f5f9; padding: 5px; border-radius: 15px; }
.t-btn { flex: 1; border: none; padding: 10px; border-radius: 11px; font-weight: 800; color: #64748b; background: transparent; cursor: pointer;}
.t-btn.active { background: white; color: #6366f1; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.row-flex { display: flex; gap: 10px; }
.toggle-card { flex: 1; padding: 15px; border-radius: 15px; border: 2px solid #f1f5f9; text-align: center; font-weight: 800; font-size: 14px; cursor: pointer;}
.toggle-card.active { border-color: #6366f1; background: #eef2ff; color: #6366f1; }
.toggle-card.active:first-child { background: linear-gradient(135deg, #4f46e2, #9333ea); color: white; border: none; }
.action-row { display: flex; gap: 10px; margin-top: 30px; }
.btn-confirm { flex: 1; background: #6366f1; color: white; border: none; padding: 16px; border-radius: 16px; font-weight: 800; font-size: 16px; box-shadow: 0 10px 20px rgba(99,102,241,0.2); cursor: pointer;}
.btn-del { background: #fff1f2; color: #e11d48; border: none; padding: 16px; border-radius: 16px; font-weight: 800; cursor: pointer;}
.main-fab { position: fixed; bottom: 100px; right: 25px; width: 64px; height: 64px; background: #6366f1; color: white; border-radius: 22px; font-size: 32px; border: none; box-shadow: 0 15px 30px rgba(99,102,241,0.4); z-index: 99; cursor: pointer;}
.tag-red { color: #e11d48; } .tag-orange { color: #f59e0b; } .tag-green { color: #10b981; }

.action-modal { animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.action-menu-list { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.action-big-btn { 
  display: flex; align-items: center; gap: 15px; 
  width: 100%; padding: 18px; border-radius: 20px; 
  border: none; cursor: pointer; transition: 0.2s all;
  background: #f8fafc; text-align: left;
}
.action-big-btn:active { transform: scale(0.96); }
.action-big-btn .emoji-icon { font-size: 28px; background: white; padding: 10px; border-radius: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.action-big-btn .text-left { display: flex; flex-direction: column; gap: 4px; }
.action-big-btn strong { font-size: 16px; color: #1e293b; font-weight: 800; }
.action-big-btn small { font-size: 12px; color: #64748b; font-weight: 600; }

.btn-edit-style:hover { background: #e0f2fe; }
.btn-edit-style:hover strong { color: #0284c7; }
.btn-move-style:hover { background: #ede9fe; }
.btn-move-style:hover strong { color: #6366f1; }
.btn-retail-style:hover { background: #fce7f3; }
.btn-retail-style:hover strong { color: #db2777; }
</style>