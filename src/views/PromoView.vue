<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()
const searchClient = ref('')
const selectedClient = ref(null)

const clientOptions = computed(() => {
  if (!searchClient.value || selectedClient.value) return []
  const q = searchClient.value.toLowerCase()
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q) || c.phone?.includes(q))).slice(0, 5)
})

const promos = [
  { id: 1, title: 'IG 限動打卡', points: 10, icon: '📸' },
  { id: 2, title: 'Google 五星評論', points: 50, icon: '⭐️' },
  { id: 3, title: '帶朋友免費試堂', points: 100, icon: '🤝' }
]

// 💡 核心修復：打卡寫入邏輯
async function handleCheckIn(promo) {
  if (!selectedClient.value) return alert('請先搜尋並選擇客戶！')

  // 寫入宣傳/打卡紀錄 (作為流水帳的一種)
  const { error } = await supabase.from('transactions').insert({
    type: 'income', // 雖然不一定是錢，但歸類為正向互動
    category: '宣傳打卡',
    amount: 0, 
    staff: '系統',
    branch: selectedClient.value.branch || '觀塘',
    client_id: selectedClient.value.id,
    note: `${selectedClient.value.name} 參與 [${promo.title}] (獲得 ${promo.points} 積分)`
  })

  if (error) alert('打卡失敗: ' + error.message)
  else {
    alert(`✅ 打卡成功！\n${selectedClient.value.name} 已記錄參與 ${promo.title}`)
    searchClient.value = ''; selectedClient.value = null; store.syncAll()
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">宣傳與打卡</h2>

    <div class="glass-card">
      <label style="font-weight:900; color:#475569; font-size:13px; display:block; margin-bottom:8px;">1. 搜尋打卡客戶</label>
      <input class="modern-inp" v-model="searchClient" placeholder="🔍 輸入姓名或電話..." @focus="selectedClient = null">
      <div v-if="clientOptions.length > 0" class="drop-menu">
        <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectedClient = c; searchClient = c.name">{{ c.name }}</div>
      </div>
      <div v-if="selectedClient" class="selected-badge">✔ 已選擇: {{ selectedClient.name }}</div>
    </div>

    <div style="margin-top:20px;">
      <div v-for="p in promos" :key="p.id" class="promo-card">
        <div class="p-icon">{{ p.icon }}</div>
        <div style="flex:1;">
          <div class="p-title">{{ p.title }}</div>
          <div class="p-pts">獎勵: {{ p.points }} 積分</div>
        </div>
        <button class="btn-checkin" @click="handleCheckIn(p)">✔ 登記打卡</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; margin-bottom: 20px; }
.glass-card { background: white; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0; position: relative; }
.modern-inp { width: 100%; border: 2px solid #cbd5e1; padding: 12px; border-radius: 10px; font-weight: 700; outline: none; }
.modern-inp:focus { border-color: #4f46e2; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 12px; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
.drop-item { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #333; }
.selected-badge { background: #eef2ff; color: #4f46e2; padding: 8px 12px; border-radius: 8px; margin-top: 10px; font-weight: 800; font-size: 13px; }

.promo-card { background: white; padding: 20px; border-radius: 20px; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
.p-icon { font-size: 32px; background: #f1f5f9; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 16px; }
.p-title { font-weight: 900; font-size: 16px; color: #1e293b; }
.p-pts { font-size: 12px; color: #10b981; font-weight: 800; margin-top: 4px; }
.btn-checkin { background: #4f46e2; color: white; border: none; padding: 12px 16px; border-radius: 12px; font-weight: 900; cursor: pointer; transition: 0.2s; }
.btn-checkin:active { transform: scale(0.95); }
</style>