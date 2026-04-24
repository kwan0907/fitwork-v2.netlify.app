<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useMainStore } from '../stores/mainStore'

const store = useMainStore()
// 預設收款人
const payeesInput = ref('kwan, Cat')

onMounted(() => {
  if (store.settings?.payees) {
    payeesInput.value = store.settings.payees.join(', ')
  }
})

async function saveSettings() {
  const arr = payeesInput.value.split(',').map(s => s.trim()).filter(s => s)
  store.settings = { ...store.settings, payees: arr }
  localStorage.setItem('fitwork_settings', JSON.stringify(store.settings)) // 💡 儲存到手機
  alert('✅ 收款人設定已儲存！關閉 App 再打開也不會消失了。')
}

async function handleLogout() {
  if(confirm('確定要登出系統嗎？')) {
    await supabase.auth.signOut()
    window.location.reload()
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">⚙️ 系統設定</h2>

    <div class="card">
      <div class="section-title">💰 設定結帳收款人</div>
      <p class="desc">請輸入你們團隊負責收款的人名，用「逗號」隔開。這將顯示在零售和運動套票的結帳按鈕上。</p>
      <input class="modern-inp" v-model="payeesInput" placeholder="例如: kwan, Cat">
      <button class="btn-save" @click="saveSettings">儲存收款人名單</button>
    </div>

    <div class="card" style="margin-top:20px; border-color:#fecdd3; background:#fff1f2;">
      <div class="section-title" style="color:#e11d48;">🚪 帳號安全</div>
      <button class="btn-logout" @click="handleLogout">登出系統</button>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; margin-bottom: 20px; color: #1e293b; }
.card { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; }
.section-title { font-size: 16px; font-weight: 900; color: #1e293b; margin-bottom: 10px; }
.desc { font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 15px; line-height: 1.5; }
.modern-inp { width: 100%; border: 2px solid #cbd5e1; padding: 12px; border-radius: 10px; font-weight: 700; color: #1e293b; outline: none; margin-bottom: 15px; }
.btn-save { width: 100%; padding: 15px; border-radius: 10px; background: #4f46e2; color: white; border: none; font-weight: 900; font-size: 16px; cursor: pointer; }
.btn-logout { width: 100%; padding: 15px; border-radius: 10px; background: transparent; color: #e11d48; border: 2px solid #fda4af; font-weight: 900; font-size: 16px; cursor: pointer; }
</style>