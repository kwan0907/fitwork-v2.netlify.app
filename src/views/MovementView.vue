<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()
const searchClient = ref('')
const selectedClient = ref(null)

// 修正：從 Store 搜尋現有客戶
const clientOptions = computed(() => {
  if (!searchClient.value || selectedClient.value) return []
  const q = searchClient.value.toLowerCase()
  return store.clients.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.phone && c.phone.includes(q))).slice(0, 5)
})

const exercises = [
  { name: 'CardioStep', icon: '👟' },
  { name: 'Trampoline', icon: '🦘' },
  { name: 'TRX', icon: '⛓️' },
  { name: 'Fat Loss', icon: '🔥' },
  { name: 'Yoga', icon: '🧘' }
]

const record = ref({ 
  type: 'CardioStep', 
  date: new Date().toISOString().split('T')[0], 
  intensity: 5,
  note: '' 
})

async function saveMovement() {
  if (!selectedClient.value) return alert('請先選擇客戶')
  const { error } = await supabase.from('movement_records').insert([{
    client_id: selectedClient.value.id,
    client_name: selectedClient.value.name,
    ...record.value
  }])
  if (error) alert('儲存失敗')
  else { alert('✅ 訓練記錄已同步'); searchClient.value = ''; selectedClient.value = null; }
}
</script>

<template>
  <div class="page movement-page">
    <div class="hero-section">
      <h2 class="hero-title">Training Log</h2>
      <div class="status-dot">LIVE</div>
    </div>

    <div class="glass-box">
      <label class="box-label">TRAINEE 客戶</label>
      <div class="search-wrapper">
        <input v-model="searchClient" class="ghost-inp" placeholder="搜尋客戶姓名..." @focus="selectedClient = null">
        <div v-if="clientOptions.length > 0" class="ghost-drop">
          <div v-for="c in clientOptions" :key="c.id" class="ghost-item" @click="selectedClient = c; searchClient = c.name">
            {{ c.name }} <span class="sub">{{ c.phone }}</span>
          </div>
        </div>
      </div>
      <div v-if="selectedClient" class="client-active-tag">已選擇: {{ selectedClient.name }}</div>
    </div>

    <div class="exercise-scroller">
      <div v-for="ex in exercises" :key="ex.name" 
           class="ex-pill" :class="{active: record.type === ex.name}"
           @click="record.type = ex.name">
        <span class="ex-pill-icon">{{ ex.icon }}</span>
        <span class="ex-pill-name">{{ ex.name }}</span>
      </div>
    </div>

    <div class="glass-box" style="margin-top:20px;">
      <label class="box-label">INTENSITY 強度: {{ record.intensity }}</label>
      <input type="range" min="1" max="10" v-model="record.intensity" class="pro-range">
      <div class="range-labels"><span>Easy</span><span>Mid</span><span>Hard</span></div>
    </div>

    <button class="btn-action" @click="saveMovement">UPLOAD TRAINING DATA</button>
  </div>
</template>

<style scoped>
.movement-page { background: #0f172a; color: #f8fafc; min-height: 100vh; padding: 25px; }
.hero-section { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
.hero-title { font-weight: 900; font-size: 32px; letter-spacing: -2px; }
.status-dot { background: #10b981; color: white; padding: 2px 8px; border-radius: 5px; font-size: 10px; font-weight: 900; }

.glass-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 24px; }
.box-label { font-size: 11px; font-weight: 900; color: #6366f1; letter-spacing: 2px; margin-bottom: 15px; display: block; }
.ghost-inp { width: 100%; background: transparent; border: none; border-bottom: 2px solid rgba(255,255,255,0.1); padding: 10px 0; color: white; font-size: 18px; font-weight: 700; outline: none; }
.ghost-inp:focus { border-bottom-color: #6366f1; }

.exercise-scroller { display: flex; gap: 10px; overflow-x: auto; margin-top: 25px; padding-bottom: 10px; }
.ex-pill { background: rgba(255,255,255,0.05); padding: 12px 20px; border-radius: 99px; display: flex; align-items: center; gap: 8px; white-space: nowrap; transition: 0.3s; border: 1px solid transparent; }
.ex-pill.active { background: #6366f1; border-color: #818cf8; box-shadow: 0 10px 20px rgba(99,102,241,0.3); }
.ex-pill-name { font-weight: 800; font-size: 14px; }

.btn-action { width: 100%; margin-top: 40px; background: white; color: #0f172a; border: none; padding: 20px; border-radius: 20px; font-weight: 900; letter-spacing: 1px; box-shadow: 0 20px 40px rgba(255,255,255,0.1); }
.btn-action:active { transform: scale(0.98); }

.pro-range { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 5px; appearance: none; outline: none; }
.pro-range::-webkit-slider-thumb { appearance: none; width: 24px; height: 24px; background: #6366f1; border: 4px solid white; border-radius: 50%; cursor: pointer; }
</style>