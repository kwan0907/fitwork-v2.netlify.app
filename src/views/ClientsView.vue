<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase' 
import BaseModal from '../components/BaseModal.vue' 

const store = useMainStore()

// --- 狀態定義 ---
const showAddModal = ref(false)
const showEditModal = ref(false)
const clientSearch = ref('') 
const filterBranch = ref('')
const filterStatus = ref('active')
const todayStr = new Date().toISOString().split('T')[0]
const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat', '股東'])

const defaultNewClient = { 
  name: '', phone: '', branch: '觀塘', source: '廣告', status: 'active', 
  is_vip: false, is_marathon: false, join_date: todayStr, 
  package_count: 0, expiry_date: '', handled_by: staffList.value[0], payment_received: 0,
  referred_by_id: null // 用於紀錄是誰介紹的
}

const newClient = ref({ ...defaultNewClient })
const editingClient = ref({})

// 獲取所有客戶列表供選擇 (用於朋友介紹)
const allClientsOptions = computed(() => {
    return store.clients.map(c => ({ id: c.id, name: c.name, phone: c.phone }))
})

// --- 篩選邏輯 ---
const filteredClients = computed(() => {
  let list = store.clients
  const q = clientSearch.value.toLowerCase()
  if (q) list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.phone && c.phone.includes(q)))
  if (filterBranch.value) list = list.filter(c => c.branch === filterBranch.value)
  if (filterStatus.value === 'active') list = list.filter(c => c.status !== 'prospect')
  else list = list.filter(c => c.status === 'prospect')
  return list
})

// --- 功能函數 ---
function openAddModal() {
    newClient.value = { ...defaultNewClient }
    showAddModal.value = true
}

async function handleAddClient() {
  if (!newClient.value.name) return alert('請填寫姓名')
  
  // 清理來源數據
  const dataToInsert = { ...newClient.value }
  if (dataToInsert.source !== '朋友介紹') {
      dataToInsert.referred_by_id = null
  }

  const { error } = await supabase.from('clients').insert([dataToInsert])
  if (error) alert('新增失敗: ' + error.message)
  else { showAddModal.value = false; store.syncAll(); alert('✅ 新增成功') }
}

async function handleUpdateClient() {
  if (!editingClient.value.name) return alert('請填寫姓名')
  const { error } = await supabase.from('clients').update(editingClient.value).eq('id', editingClient.value.id)
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
  showEditModal.value = true
}

// 核心功能：計算代數
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

// --- 匯入功能 ---
function downloadCSVTemplate() {
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF姓名,電話,分店(觀塘/中環/佐敦),狀態(active/prospect),加入日期(YYYY-MM-DD)\n王小明,98765432,觀塘,active,2024-01-01"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "fitwork_clients_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

function triggerFileInput() {
    document.getElementById('csvFileInput').click()
}

async function handleImport(event) {
    const file = event.target.files[0]
    if (!file) return
    
    // 這裡只是簡單示範讀取，實際需要解析 CSV
    const reader = new FileReader()
    reader.onload = async (e) => {
        const text = e.target.result
        console.log("讀取到檔案內容:", text)
        alert("匯入功能正在開發中，準備好解析 CSV！\n(需要安裝 papa-parse 處理)")
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
        <button v-for="b in ['觀塘','中環']" :key="b" class="f-btn" :class="{active: filterBranch===b}" @click="filterBranch = filterBranch===b ? '' : b">{{ b }}</button>
      </div>
    </div>

    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 15px;">
        <button class="btn-outline" @click="downloadCSVTemplate">📥 下載匯入格式</button>
        <button class="btn-outline" @click="triggerFileInput">📤 匯入客戶名單</button>
        <input type="file" id="csvFileInput" accept=".csv" style="display: none;" @change="handleImport">
    </div>

    <div class="list-container">
      <div v-for="c in filteredClients" :key="c.id" class="client-card" @click="openEditModal(c)">
        <div class="c-avatar">{{ (c.name || '?').charAt(0) }}</div>
        <div class="c-main">
          <div class="c-name-row">
            <span class="c-name">{{ c.name }}</span>
            <span v-if="c.is_vip" class="badge-vip">VIP</span>
            <span v-if="c.is_marathon" class="badge-run">RUN</span>
          </div>
          <div class="c-meta">
            {{ c.phone || '無電話' }} · {{ c.branch }}
            <span v-if="c.handled_by" class="handled-text"> (由 {{ c.handled_by }} 持有)</span>
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

    <BaseModal :show="showEditModal" title="🔧 客戶詳細設定" @close="showEditModal = false">
      <div class="modal-form">
        <div class="toggle-group">
          <button class="t-btn" :class="{active: editingClient.status === 'active'}" @click="editingClient.status = 'active'">正式會員</button>
          <button class="t-btn" :class="{active: editingClient.status === 'prospect'}" @click="editingClient.status = 'prospect'">試堂預約</button>
        </div>

        <div class="section-title">💰 財務持有設定</div>
        <div class="grid-2">
          <div class="f-item">
            <label>誰負責收錢？</label>
            <select v-model="editingClient.handled_by" class="modern-select">
                <option v-for="staff in staffList" :key="staff" :value="staff">{{ staff }}</option>
            </select>
          </div>
          <div class="f-item">
            <label>持有金額 ($)</label>
            <input type="number" v-model="editingClient.payment_received" class="modern-inp">
          </div>
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
                  <option value="傳單">傳單</option>
                  <option value="IG">IG</option>
                  <option value="朋友介紹">朋友介紹</option>
                  <option value="其他">其他</option>
              </select>
            </div>
        </div>
        
        <div class="f-item" v-if="editingClient.source === '朋友介紹'" style="margin-top: 12px;">
            <label>介紹人</label>
            <select v-model="editingClient.referred_by_id" class="modern-select">
                <option :value="null">請選擇介紹人...</option>
                <option v-for="c in allClientsOptions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.phone }})</option>
            </select>
        </div>

        <div class="section-title">📅 關鍵日期</div>
        <div class="grid-2">
          <div class="f-item"><label>加入日期</label><input type="date" v-model="editingClient.join_date" class="modern-date"></div>
          <div class="f-item"><label>套票到期日</label><input type="date" v-model="editingClient.expiry_date" class="modern-date" placeholder="若無可留空"></div>
        </div>

        <div class="section-title">🏆 項目設定</div>
        <div class="row-flex">
          <div class="toggle-card" :class="{active: editingClient.is_marathon}" @click="editingClient.is_marathon = !editingClient.is_marathon">🏃 馬拉松</div>
          <div class="toggle-card" :class="{active: editingClient.is_vip}" @click="editingClient.is_vip = !editingClient.is_vip">💎 VIP 折扣</div>
        </div>

        <div class="action-row">
          <button class="btn-del" @click="handleDeleteClient">🗑️ 刪除</button>
          <button class="btn-confirm" @click="handleUpdateClient">確認修改並同步</button>
        </div>
      </div>
    </BaseModal>

    <BaseModal :show="showAddModal" title="➕ 登記新客戶" @close="showAddModal = false">
      <div class="modal-form">
        <div class="toggle-group">
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
                    <option value="傳單">傳單</option>
                    <option value="朋友介紹">朋友介紹</option>
                    <option value="IG">IG</option>
                    <option value="其他">其他</option>
                </select>
            </div>
        </div>

        <div class="f-item" v-if="newClient.source === '朋友介紹'" style="margin-top: 12px;">
            <label>是哪位朋友介紹的？(計算代數)</label>
            <select v-model="newClient.referred_by_id" class="modern-select">
                <option :value="null">請選擇...</option>
                <option v-for="c in allClientsOptions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.phone }})</option>
            </select>
        </div>

        <div class="section-title">📅 關鍵日期</div>
        <div class="grid-2">
          <div class="f-item"><label>成為客戶日期</label><input type="date" v-model="newClient.join_date" class="modern-date"></div>
          <div class="f-item"><label>套票有效期 (選填)</label><input type="date" v-model="newClient.expiry_date" class="modern-date"></div>
        </div>

        <div class="section-title">💰 財務設定</div>
        <div class="grid-2">
          <div class="f-item">
            <label>誰負責收錢？</label>
            <select v-model="newClient.handled_by" class="modern-select">
                <option v-for="staff in staffList" :key="staff" :value="staff">{{ staff }}</option>
            </select>
          </div>
          <div class="f-item">
            <label>持有金額 ($)</label>
            <input type="number" v-model="newClient.payment_received" class="modern-inp">
          </div>
        </div>

        <button class="btn-confirm" style="width:100%; margin-top:20px;" @click="handleAddClient">立即新增</button>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
/* 顏色變數 */
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

.btn-outline { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;}

.client-card { background: white; padding: 16px; border-radius: 20px; margin-bottom: 12px; display: flex; align-items: center; gap: 15px; border: 1px solid #f1f5f9; transition: 0.2s; cursor: pointer;}
.client-card:active { transform: scale(0.97); }
.c-avatar { width: 48px; height: 48px; background: #6366f1; color: white; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; }
.c-name { font-weight: 800; font-size: 17px; color: #1e293b; }
.badge-vip { background: #fef9c3; color: #a16207; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; }
.badge-run { background: linear-gradient(135deg, #4f46e2, #9333ea); color: white; font-size: 10px; padding: 2px 6px; border-radius: 6px; font-weight: 900; }
.c-meta { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
.handled-text { color: #6366f1; }
.c-gen { font-weight: 900; color: #6366f1; font-size: 12px; }
.c-expiry { font-size: 11px; font-weight: 800; margin-top: 4px; }

/* 彈窗內樣式 */
.section-title { font-size: 12px; font-weight: 900; color: #6366f1; margin: 20px 0 10px; text-transform: uppercase; letter-spacing: 1px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modern-inp, .modern-select, .modern-date { width: 100%; background: #f8fafc; border: 2px solid #f1f5f9; padding: 12px 15px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; font-size: 16px;}
.modern-inp:focus, .modern-select:focus { border-color: #6366f1; background: white; }

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
</style>