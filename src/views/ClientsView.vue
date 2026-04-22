<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase' 
import BaseModal from '../components/BaseModal.vue' 

const store = useMainStore()

// --- 狀態定義 ---
const showAddModal = ref(false)
const clientSearch = ref('') 
const filterBranch = ref('')
const filterStatus = ref('active') // 預設看正式會員

// 新客戶表單資料
const newClient = ref({ 
  name: '', 
  phone: '', 
  branch: '觀塘', 
  status: 'active', // 預設為正式會員
  is_marathon: false,
  is_vip: false
})

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
  
  // 狀態篩選：正式會員(active) 或 試堂(prospect)
  if (filterStatus.value === 'active') {
    list = list.filter(c => c.status !== 'prospect')
  } else {
    list = list.filter(c => c.status === 'prospect')
  }
  
  return list
})

// --- 功能函數 ---
async function handleAddClient() {
  if (!newClient.value.name) return alert('請填寫姓名')
  
  const { error } = await supabase.from('clients').insert([newClient.value])
  
  if (error) {
    alert('新增失敗: ' + error.message)
  } else {
    showAddModal.value = false 
    // 重置表單
    newClient.value = { name: '', phone: '', branch: '觀塘', status: 'active', is_marathon: false, is_vip: false } 
    store.syncAll() // 刷新資料
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
      <input class="inp" v-model="clientSearch" placeholder="🔍 搜尋姓名、電話...">
      <div class="filter-tags" style="margin-top:12px;">
        <button class="tag" :class="{active: filterStatus==='active'}" @click="filterStatus='active'">⭐️ 正式會員</button>
        <button class="tag" :class="{active: filterStatus==='prospect'}" @click="filterStatus='prospect'">👀 試堂/預約</button>
        <div class="divider"></div>
        <button v-for="b in ['觀塘','中環','佐敦']" :key="b" 
                class="tag" :class="{active: filterBranch===b}" 
                @click="filterBranch = filterBranch===b ? '' : b">{{ b }}</button>
      </div>
    </div>

    <div v-if="filteredClients.length === 0" class="empty-msg">找不到相關客戶</div>

    <div v-for="c in filteredClients" :key="c.id" class="item-card">
      <div class="client-avatar">{{ (c.name || '?').charAt(0) }}</div>
      <div style="flex:1;">
        <div class="client-name">
          {{ c.name }} 
          <span v-if="c.is_vip" class="tag-gold">{{ c.vip_level || 'VIP' }}</span>
          <span v-if="c.is_marathon" class="tag-blue">🏃</span>
        </div>
        <div class="client-info">
          {{ c.phone || '未錄入' }} · {{ c.branch || '未設定' }}
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

    <BaseModal :show="showAddModal" title="登記新客戶" @close="showAddModal = false">
      <div class="form-item">
        <label>客戶姓名</label>
        <input v-model="newClient.name" class="inp" placeholder="例如：陳大文">
      </div>
      
      <div class="form-item" style="margin-top:15px;">
        <label>聯絡電話</label>
        <input v-model="newClient.phone" class="inp" placeholder="例如：98765432">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:15px;">
        <div class="form-item">
          <label>所屬分店</label>
          <select v-model="newClient.branch" class="inp">
            <option value="觀塘">觀塘</option>
            <option value="中環">中環</option>
            <option value="佐敦">佐敦</option>
          </select>
        </div>
        <div class="form-item">
          <label>客戶狀態</label>
          <select v-model="newClient.status" class="inp">
            <option value="active">正式會員</option>
            <option value="prospect">試堂客</option>
          </select>
        </div>
      </div>

      <div style="margin-top:20px; display:flex; gap:10px;">
        <button class="tag" :class="{active: newClient.is_marathon}" @click="newClient.is_marathon = !newClient.is_marathon">🏃 參加馬拉松</button>
        <button class="tag" :class="{active: newClient.is_vip}" @click="newClient.is_vip = !newClient.is_vip">💎 VIP 會員</button>
      </div>

      <button class="btn-primary" @click="handleAddClient" style="width:100%; margin-top:25px;">
        確認提交資料
      </button>
    </BaseModal>
  </div>
</template>

<style scoped>
.filter-tags { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.divider { width: 1px; background: var(--border); margin: 0 5px; flex-shrink: 0; }
.client-name { font-weight: 800; font-size: 17px; display: flex; align-items: center; gap: 6px; }
.client-info { font-size: 12px; color: var(--t2); margin-top: 4px; font-weight: 600; }
.gen-tag { font-size: 12px; color: var(--p); font-weight: 900; margin-bottom: 4px; }
.expiry-date { font-size: 11px; font-weight: 800; color: var(--t3); }

.tag-red { color: var(--r); }
.tag-orange { color: var(--o); }
.tag-green { color: var(--g); }

.item-card { background: var(--card); border-radius: 16px; padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border); }
.client-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--p), var(--pd)); color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; }

.fab-large { position: fixed; right: 20px; bottom: 100px; padding: 14px 20px; border-radius: 99px; background: var(--p); color: #fff; font-weight: 800; border: none; box-shadow: 0 8px 20px rgba(79,70,229,0.4); z-index: 10; }
.empty-msg { text-align: center; padding: 50px; color: var(--t3); font-weight: 700; }

.tag-gold { background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 800; }
.tag-blue { background: var(--ps); color: var(--p); padding: 2px 6px; border-radius: 6px; font-size: 10px; }

.form-item label { display: block; margin-bottom: 8px; font-weight: 700; font-size: 14px; color: var(--t2); }
</style>