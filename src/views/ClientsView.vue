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

const filteredClients = computed(() => {
  let list = [...store.clients] 
  
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
    list.sort((a, b) => {
      const d1 = String(a?.expiry_date || '9999-99-99')
      const d2 = String(b?.expiry_date || '9999-99-99')
      return d1.localeCompare(d2)
    })
  } else if (sortBy.value === 'expiry_desc') {
    list.sort((a, b) => {
      const d1 = String(a?.expiry_date || '0000-00-00')
      const d2 = String(b?.expiry_date || '0000-00-00')
      return d2.localeCompare(d1)
    })
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
    const BOM = "\uFEFF"; 
    const header = "姓名(必填),電話,分店(觀塘/中環/佐敦),狀態(active/prospect/absent),加入日期(YYYY-MM-DD),來源(廣告/傳單/朋友介紹等),到期日(YYYY-MM-DD),備註\n";
    const sample1 = "王大明,98765432,觀塘,active,2024-01-01,廣告,,VIP客戶\n";
    const sample2 = "陳小美,91234567,中環,prospect,,,朋友介紹,需要多關心\n";
    
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
                
                let parsedStatus = 'active';
                const statusStr = cols[3]?.trim();
                if (statusStr === 'prospect') parsedStatus = 'prospect';
                else if (statusStr === 'absent') parsedStatus = 'absent';

                insertData.push({
                    name, phone: cols[1]?.trim() || '', branch: cols[2]?.trim() || '觀塘', 
                    status: parsedStatus, 
                    join_date: cols[4]?.trim() || null, source: cols[5]?.trim() || '其他', 
                    expiry_date: cols[6]?.trim() || null, remark: cols[7]?.trim() || '', 
                    own_email: user.email, user_id: user.id
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
        <button class="f-btn" :class="{active: filterStatus==='absent'}" @click="filterStatus='absent'">⚠️ 缺席/需補堂</button>
        
        <div class="v-line"></div>
        <button v-for="b in ['觀塘','中環','佐敦']" :key="b" class="f-btn" :class="{active: filterBranch===b}" @click="filterBranch = filterBranch===b ? '' : b">{{ b }}</button>
        <div class="v-line"></div>
        <button class="f-btn mygift-btn" :class="{active: filterMyGiftExpiring}" @click="filterMyGiftExpiring = !filterMyGiftExpiring">🎁 MyGift 快過期</button>
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
            
            <a v-if="c.phone" :href="'https://wa.me/852' + c.phone" target="_blank" class="wts-btn" @click.stop>💬 WhatsApp</a>

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
            <span class="pkg-zero" v-if="getClientPackageStats(c.name).pkg10 === 0 && getClientPackageStats(c.name).pkg35 === 0">尚未買卡</span>
            
            <span class="pkg-tag" style="background: #8b5cf6;" v-if="getMyGiftStats(c).available > 0">
              🎁 MyGift: {{ getMyGiftStats(c).available }}張 
              <b style="font-size:10px; margin-left:2px; opacity:0.9;">(至 {{ getMyGiftStats(c).closestExpiry }})</b>
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
      <div class="center-modal scrollable-modal">
        <div class="m-header">🔧 客戶詳細設定 <button class="close-x" @click="showEditModal=false">✕</button></div>
        
        <div class="toggle-group" style="margin-bottom: 20px;">
          <button class="t-btn" :class="{active: editingClient.status === 'active'}" @click="editingClient.status = 'active'">正式會員</button>
          <button class="t-btn" :class="{active: editingClient.status === 'prospect'}" @click="editingClient.status = 'prospect'">試堂預約</button>
          <button class="t-btn" :class="{active: editingClient.status === 'absent'}" @click="editingClient.status = 'absent'" style="color: #ef4444;">缺席補堂</button>
        </div>

        <div class="section-title">👤 基本資料</div>
        <div class="f-item">
          <label>姓名</label>
          <input v-model="editingClient.name" class="modern-inp">
        </div>
        <div class="f-item">
          <label>電話</label>
          <input v-model="editingClient.phone" class="modern-inp">
        </div>

        <div class="grid-2">
          <div class="f-item">
            <label>分店</label>
            <select v-model="editingClient.branch" class="modern-select">
              <option value="觀塘">觀塘</option>
              <option value="中環">中環</option>
              <option value="佐敦">佐敦</option>
            </select>
          </div>
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
        <div class="f-item" v-if="editingClient.status === 'prospect' || editingClient.status === 'absent'" style="margin-bottom: 12px; animation: popIn 0.3s ease-out;">
          <label>⏰ {{ editingClient.status === 'absent' ? '下次補堂日期與時間' : '預約試堂日期與時間' }}</label>
          <input type="datetime-local" v-model="editingClient.trial_date" class="modern-date" style="margin-bottom: 10px;">
          <label>📍 預約試堂地點</label>
          <select v-model="editingClient.branch" class="modern-select">
            <option value="觀塘">觀塘</option>
            <option value="中環">中環</option>
            <option value="佐敦">佐敦</option>
          </select>
        </div>
        
        <div class="grid-2">
          <div class="f-item">
            <label>加入日期</label>
            <input type="date" v-model="editingClient.join_date" class="modern-date">
          </div>
          <div class="f-item">
            <label>套票到期日</label>
            <input type="date" v-model="editingClient.expiry_date" class="modern-date" placeholder="若無可留空">
          </div>
        </div>

        <div class="section-title">💬 客戶備註</div>
        <div class="f-item">
          <textarea v-model="editingClient.remark" class="modern-inp" style="height: 80px;" placeholder="輸入備註事項 (例如：缺席原因、客戶要求)..."></textarea>
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
        
        <div style="height: 50px; width: 100%;"></div>

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
        <div class="f-item">
          <label>姓名</label>
          <input v-model="newClient.name" class="modern-inp" placeholder="請輸入姓名">
        </div>
        <div class="f-item">
          <label>電話</label>
          <input v-model="newClient.phone" class="modern-inp" placeholder="請輸入電話">
        </div>
        
        <div class="grid-2">
            <div class="f-item">
                <label>分店</label>
                <select v-model="newClient.branch" class="modern-select">
                    <option value="觀塘">觀塘</option>
                    <option value="中環">中環</option>
                    <option value="佐敦">佐敦</option>
                </select>
            </div>
            <div class="f-item">
                <label>認識來源</label>
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

        <div class="f-item" v-if="(newClient.source === '朋友介紹' || newClient.source === '廣告+朋友介紹') && newClient.referred_by_id" style="margin-top: 15px; background: #faf5ff; border: 1px dashed #c4b5fd; padding: 15px; border-radius: 12px; animation: popIn 0.3s ease-out;">
           <label style="color: #7c3aed; font-size: 14px;">🎁 是否消耗介紹人的 MyGift？</label>
           <div style="font-size: 12px; color: #64748b; margin-bottom: 10px; font-weight: 700;">
             該介紹人目前剩餘: <span style="color: #ef4444; font-size: 14px; font-weight: 900;">{{ getMyGiftStats(store.clients.find(c => c.id === newClient.referred_by_id)).available }}</span> 張
           </div>
           <div class="toggle-card" style="margin: 0;" :class="{active: consumeMyGift}" @click="consumeMyGift = !consumeMyGift">
             {{ consumeMyGift ? '✅ 是，建立後自動扣減 1 張' : '❌ 否，不扣除' }}
           </div>
        </div>

        <div class="section-title">📅 關鍵日期</div>
        <div class="f-item" v-if="newClient.status === 'prospect'" style="margin-bottom: 12px; animation: popIn 0.3s ease-out;">
          <label>⏰ 預約試堂日期與時間</label>
          <input type="datetime-local" v-model="newClient.trial_date" class="modern-date" style="margin-bottom: 10px;">
          <label>📍 預約試堂地點</label>
          <select v-model="newClient.branch" class="modern-select">
            <option value="觀塘">觀塘</option>
            <option value="中環">中環</option>
            <option value="佐敦">佐敦</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="f-item">
            <label>成為客戶日期</label>
            <input type="date" v-model="newClient.join_date" class="modern-date">
          </div>
          <div class="f-item">
            <label>套票有效期 (選填)</label>
            <input type="date" v-model="newClient.expiry_date" class="modern-date">
          </div>
        </div>

        <div class="section-title">💬 客戶備註</div>
        <div class="f-item">
          <textarea v-model="newClient.remark" class="modern-inp" style="height: 80px;" placeholder="輸入備註事項 (客戶要求、運動習慣等)..."></textarea>
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
        
        <div style="height: 50px; width: 100%;"></div>
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

/* 🟢 Filter 列加入水平滾動，保留原本所有按鈕 */
.filter-row { display: flex; gap: 8px; margin-top: 15px; overflow-x: auto; padding-bottom: 5px; -webkit-overflow-scrolling: touch; }
.f-btn { padding: 8px 18px; border-radius: 99px; border: 1px solid #e2e8f0; background: white; font-weight: 700; font-size: 13px; white-space: nowrap; cursor: pointer; transition: 0.2s; flex-shrink: 0; }
.f-btn.active { background: #6366f1; color: white; border-color: #6366f1; }
.mygift-btn { border-color: #8b5cf6; color: #8b5cf6; background: #faf5ff; }
.mygift-btn.active { background: #8b5cf6; color: white; border-color: #8b5cf6; }
.v-line { width: 1px; background: #e2e8f0; margin: 0 5px; flex-shrink: 0;}

.sort-row { display: flex; align-items: center; gap: 8px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0; }
.sort-label { font-size: 13px; font-weight: 800; color: #64748b; }
.sort-select { background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #1e293b; outline: none; cursor: pointer; }
.sort-select:focus { border-color: #6366f1; }
.btn-outline { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; transition: 0.2s;}
.btn-outline:active { transform: scale(0.95); }

.client-card { background: white; padding: 16px; border-radius: 20px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid #f1f5f9; transition: 0.2s; cursor: pointer;}
.client-card:active { transform: scale(0.97); }

/* 🟢 解決 Icon 變形：強制鎖定 48x48，不能 shrink */
.c-avatar { 
    width: 48px; height: 48px; background: #6366f1; color: white; border-radius: 14px; 
    display: flex; align-items: center; justify-content: center; 
    font-weight: 900; font-size: 20px; flex-shrink: 0; min-width: 48px; min-height: 48px;
}

.c-name { font-weight: 800; font-size: 17px; color: #1e293b; }
.badge-vip { background: #fef9c3; color: #a16207; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; margin-left: 5px; }
.badge-run { background: linear-gradient(135deg, #4f46e2, #9333ea); color: white; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; margin-left: 5px; }

/* Meta 讓它自動折行 */
.c-meta { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.wts-btn { background: #25D366; color: white; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800; text-decoration: none; box-shadow: 0 2px 5px rgba(37,211,102,0.3); display: inline-block; transition: 0.2s; }
.wts-btn:active { transform: scale(0.95); }

.trial-time-tag { background: #fffbeb; color: #d97706; padding: 2px 6px; border-radius: 6px; font-weight: 800; font-size: 11px; }
.c-packages { font-size: 11px; font-weight: 800; color: #94a3b8; margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap;}
.pkg-tag { padding: 2px 6px; border-radius: 6px; font-weight: 900; color: white; }
.t-10 { background: #3b82f6; }
.t-35 { background: #ec4899; }
.pkg-zero { background: #f1f5f9; color: #94a3b8; padding: 2px 6px; border-radius: 6px;}
.c-gen { font-weight: 900; color: #6366f1; font-size: 12px; text-align: right;}
.c-expiry { font-size: 11px; font-weight: 800; margin-top: 4px; text-align: right;}

.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; padding-bottom: 5vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }

/* 🟢 Modal 結構保留原本的，但修正滾動邏輯 */
.center-modal { background: white; width: 90%; max-width: 480px; border-radius: 24px; padding: 25px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); animation: popIn 0.3s ease-out; margin: auto; position: relative; }
.scrollable-modal { max-height: 85vh; overflow-y: auto; padding-right: 5px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }

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

.action-modal { animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); margin-top: 15vh; }
.action-menu-list { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.action-big-btn { display: flex; align-items: center; gap: 15px; width: 100%; padding: 18px; border-radius: 20px; border: none; cursor: pointer; transition: 0.2s all; background: #f8fafc; text-align: left; }
.action-big-btn:active { transform: scale(0.96); }
.action-big-btn .emoji-icon { font-size: 28px; background: white; padding: 10px; border-radius: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); flex-shrink: 0;}
.action-big-btn .text-left { display: flex; flex-direction: column; gap: 4px; }
.action-big-btn strong { font-size: 16px; color: #1e293b; font-weight: 800; }
.action-big-btn small { font-size: 12px; color: #64748b; font-weight: 600; line-height: 1.3; }
</style>