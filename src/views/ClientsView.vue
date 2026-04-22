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
const filterStatus = ref('active') // 預設看正式會員

// 預設今天日期 (YYYY-MM-DD 格式)
const todayStr = new Date().toISOString().split('T')[0]

// 新增客戶：還原舊版的完整欄位
const newClient = ref({ 
  name: '', 
  phone: '', 
  branch: '觀塘', 
  source: '廣告', // 新增：來源
  status: 'active', 
  is_vip: false,    // 對應：升級為折扣會員
  join_date: todayStr,     // 新增：成為客戶日期
  package_count: 0,        // 新增：套票總次數
  expiry_date: todayStr,   // 新增：到期日
})

// 編輯客戶專用的暫存包
const editingClient = ref({})

// --- 篩選邏輯 ---
const filteredClients = computed(() => {
  let list = store.clients
  const q = clientSearch.value.toLowerCase()
  
  if (q) {
    list = list.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) || 
      (c.phone && c.phone.includes(q))
    )
  }
  
  if (filterBranch.value) list = list.filter(c => c.branch === filterBranch.value)
  
  // 狀態篩選
  if (filterStatus.value === 'active') {
    list = list.filter(c => c.status !== 'prospect')
  } else {
    list = list.filter(c => c.status === 'prospect')
  }
  
  return list
})

// --- 功能函數 ---

// 1. 新增客戶
async function handleAddClient() {
  if (!newClient.value.name) return alert('請填寫姓名')
  
  const { error } = await supabase.from('clients').insert([newClient.value])
  
  if (error) {
    alert('新增失敗: ' + error.message)
  } else {
    showAddModal.value = false 
    // 重置表單
    newClient.value = { name: '', phone: '', branch: '觀塘', source: '廣告', status: 'active', is_vip: false, join_date: todayStr, package_count: 0, expiry_date: todayStr } 
    store.syncAll() 
  }
}

// 2. 打開編輯彈窗 (點擊客戶卡片時觸發)
function openEditModal(client) {
  // 把該客戶的資料複製一份到編輯暫存包
  editingClient.value = { ...client }
  showEditModal.value = true
}

// 3. 儲存編輯修改
async function handleUpdateClient() {
  if (!editingClient.value.name) return alert('請填寫姓名')
  
  const { error } = await supabase
    .from('clients')
    .update(editingClient.value)
    .eq('id', editingClient.value.id)
  
  if (error) {
    alert('更新失敗: ' + error.message)
  } else {
    showEditModal.value = false 
    store.syncAll() 
  }
}

// 計算客戶代數
const getClientGen = (id) => {
  let g = 1
  let c = store.clients.find(x => x.id === id)
  let count = 0
  while (c && c.referred_by_id && count < 15) {
    g++
    c = store.clients.find(x => x.id === c.referred_by_id)
    count++
  }
  return g
}

const getExpiryClass = (date) => {
  if (!date) return ''
  const d = (new Date(date) - new Date()) / 86400000
  return d < 0 ? 'tag-red' : (d < 14 ? 'tag-orange' : 'tag-green')
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">客戶管理系統</h2>
    
    <div class="card" style="padding:15px; margin-bottom:15px;">
      <input class="inp search-inp" v-model="clientSearch" placeholder="🔍 即時搜尋姓名、電話...">
      <div class="filter-tags" style="margin-top:12px;">
        <button class="filter-btn" :class="{active: filterStatus==='active'}" @click="filterStatus='active'">⭐️ 正式會員</button>
        <button class="filter-btn" :class="{active: filterStatus==='prospect'}" @click="filterStatus='prospect'">👀 試堂/預約</button>
        <div class="divider"></div>
        <button v-for="b in ['觀塘','中環','佐敦']" :key="b" 
                class="filter-btn" :class="{active: filterBranch===b}" 
                @click="filterBranch = filterBranch===b ? '' : b">{{ b }}</button>
      </div>
    </div>

    <div v-if="filteredClients.length === 0" class="empty-msg">找不到相關客戶</div>

    <div v-for="c in filteredClients" :key="c.id" class="item-card clickable-card" @click="openEditModal(c)">
      <div class="client-avatar">{{ (c.name || '?').charAt(0).toUpperCase() }}</div>
      <div style="flex:1;">
        <div class="client-name">
          {{ c.name }} 
          <span v-if="c.is_vip" class="tag-gold">折扣會員</span>
        </div>
        <div class="client-info">
          {{ c.phone || '未錄入' }} · {{ c.branch || '未設定' }}
          <span v-if="c.source" style="margin-left:4px; opacity:0.7;">(來源: {{ c.source }})</span>
        </div>
      </div>
      <div style="text-align:right;">
        <div class="gen-tag" v-if="c.status!=='prospect'">第 {{ getClientGen(c.id) }} 代</div>
        <div :class="['expiry-date', getExpiryClass(c.expiry_date)]">
          {{ c.status==='prospect' ? '試堂預約' : (c.expiry_date || '無效期') }}
        </div>
      </div>
    </div>
    
    <button class="fab-large" @click="showAddModal = true"><span>+</span> 新增客戶</button>

    <BaseModal :show="showAddModal" title="✨ 新增客戶" @close="showAddModal = false">
      <div class="status-toggle-box">
        <button class="filter-btn" :class="{active: newClient.status === 'active'}" @click="newClient.status = 'active'">⭐️ 正式會員</button>
        <button class="filter-btn" :class="{active: newClient.status === 'prospect'}" @click="newClient.status = 'prospect'">👀 試堂/預約</button>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>姓名</label>
        <input v-model="newClient.name" class="inp" placeholder="請輸入姓名">
      </div>
      
      <div class="form-item" style="margin-top:15px;">
        <label>電話</label>
        <input v-model="newClient.phone" class="inp" placeholder="請輸入聯絡電話">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px;">
        <div class="form-item">
          <label>分店</label>
          <select v-model="newClient.branch" class="inp">
            <option value="觀塘">觀塘</option>
            <option value="中環">中環</option>
            <option value="佐敦">佐敦</option>
          </select>
        </div>
        <div class="form-item">
          <label>來源</label>
          <select v-model="newClient.source" class="inp">
            <option value="廣告">廣告</option>
            <option value="朋友介紹">朋友介紹</option>
            <option value="IG">IG</option>
            <option value="FB">FB</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>

      <div class="vip-toggle-box" @click="newClient.is_vip = !newClient.is_vip">
        <div class="vip-text">👑 升級為折扣會員</div>
        <div class="toggle-switch" :class="{on: newClient.is_vip}"></div>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>成為客戶日期</label>
        <input type="date" v-model="newClient.join_date" class="inp">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>購買運動套票總次數</label>
        <input type="number" v-model="newClient.package_count" class="inp">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>到期日 (購買套票會自動延長)</label>
        <input type="date" v-model="newClient.expiry_date" class="inp">
      </div>

      <button class="btn-primary submit-btn" @click="handleAddClient">
        確認提交資料
      </button>
    </BaseModal>


    <BaseModal :show="showEditModal" title="✏️ 編輯客戶資料" @close="showEditModal = false">
      <div class="status-toggle-box">
        <button class="filter-btn" :class="{active: editingClient.status === 'active'}" @click="editingClient.status = 'active'">⭐️ 正式會員</button>
        <button class="filter-btn" :class="{active: editingClient.status === 'prospect'}" @click="editingClient.status = 'prospect'">👀 試堂/預約</button>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>姓名</label>
        <input v-model="editingClient.name" class="inp">
      </div>
      
      <div class="form-item" style="margin-top:15px;">
        <label>電話</label>
        <input v-model="editingClient.phone" class="inp">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px;">
        <div class="form-item">
          <label>分店</label>
          <select v-model="editingClient.branch" class="inp">
            <option value="觀塘">觀塘</option>
            <option value="中環">中環</option>
            <option value="佐敦">佐敦</option>
          </select>
        </div>
        <div class="form-item">
          <label>來源</label>
          <select v-model="editingClient.source" class="inp">
            <option value="廣告">廣告</option>
            <option value="朋友介紹">朋友介紹</option>
            <option value="IG">IG</option>
            <option value="FB">FB</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>

      <div class="vip-toggle-box" @click="editingClient.is_vip = !editingClient.is_vip">
        <div class="vip-text">👑 升級為折扣會員</div>
        <div class="toggle-switch" :class="{on: editingClient.is_vip}"></div>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>成為客戶日期</label>
        <input type="date" v-model="editingClient.join_date" class="inp">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>購買運動套票總次數</label>
        <input type="number" v-model="editingClient.package_count" class="inp">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>到期日</label>
        <input type="date" v-model="editingClient.expiry_date" class="inp">
      </div>

      <button class="btn-primary submit-btn" @click="handleUpdateClient">
        儲存修改
      </button>
    </BaseModal>
  </div>
</template>

<style scoped>
/* 搜尋框美化 */
.search-inp { border-radius: 99px; padding-left: 20px; font-size: 15px; }

/* 篩選按鈕美化 (還原 V1 紫色圓角風格) */
.filter-tags { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.filter-btn {
  padding: 8px 16px;
  border-radius: 99px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--t2);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.filter-btn:hover { background: #f3f4f6; }
.filter-btn.active {
  background: var(--p);
  color: white;
  border-color: var(--p);
  box-shadow: 0 4px 10px rgba(79,70,229,0.25);
}

.divider { width: 1px; background: var(--border); margin: 0 5px; flex-shrink: 0; }
.client-name { font-weight: 800; font-size: 17px; display: flex; align-items: center; gap: 6px; }
.client-info { font-size: 13px; color: var(--t2); margin-top: 4px; font-weight: 600; }
.gen-tag { font-size: 12px; color: var(--p); font-weight: 900; margin-bottom: 4px; }
.expiry-date { font-size: 12px; font-weight: 800; color: var(--t3); }

.tag-red { color: var(--r); }
.tag-orange { color: var(--o); }
.tag-green { color: var(--g); }

/* 卡片與點擊效果 */
.item-card { background: var(--card); border-radius: 16px; padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border); transition: transform 0.2s, box-shadow 0.2s; }
.clickable-card { cursor: pointer; }
.clickable-card:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,0,0,0.05); border-color: var(--p); }
.clickable-card:active { transform: translateY(0); }

.client-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--p), var(--pd)); color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 18px;}

/* 懸浮大按鈕 */
.fab-large { position: fixed; right: 20px; bottom: 100px; padding: 14px 20px; border-radius: 99px; background: var(--p); color: #fff; font-weight: 800; border: none; box-shadow: 0 8px 20px rgba(79,70,229,0.4); z-index: 10; cursor: pointer; transition: 0.2s; }
.fab-large:hover { transform: scale(1.05); }
.empty-msg { text-align: center; padding: 50px; color: var(--t3); font-weight: 700; }

.tag-gold { background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 800; }

/* 表單樣式美化 */
.form-item label { display: block; margin-bottom: 8px; font-weight: 700; font-size: 13px; color: var(--p); }
.status-toggle-box { display: flex; gap: 10px; margin-bottom: 5px; }

/* 仿 iOS 折扣會員開關 */
.vip-toggle-box { margin-top: 20px; background: #fffbeb; border: 1px solid #fef08a; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
.vip-text { font-weight: 800; color: #854d0e; font-size: 14px; }
.toggle-switch { width: 44px; height: 24px; background: #cbd5e1; border-radius: 99px; position: relative; transition: 0.3s; }
.toggle-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.toggle-switch.on { background: var(--g); }
.toggle-switch.on::after { transform: translateX(20px); }

.submit-btn { width: 100%; margin-top: 25px; padding: 14px; font-size: 16px; border-radius: 12px; background: var(--p); color: white; font-weight: bold; border: none; cursor: pointer; }
.submit-btn:active { opacity: 0.8; }
</style>