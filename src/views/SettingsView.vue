<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useMainStore } from '../stores/mainStore'

const store = useMainStore()
const userEmail = ref('')
const payeesInput = ref('kwan, Cat')

// 修改密碼相關
const newPassword = ref('')
const loadingPwd = ref(false)

onMounted(async () => {
  // 獲取當前用戶 Email
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    userEmail.value = user.email
  }

  if (store.settings?.payees) {
    payeesInput.value = store.settings.payees.join(', ')
  }
})

async function saveSettings() {
  const arr = payeesInput.value.split(',').map(s => s.trim()).filter(s => s)
  store.settings = { ...store.settings, payees: arr }
  localStorage.setItem('fitwork_settings', JSON.stringify(store.settings))
  alert('✅ 收款人設定已儲存！')
}

async function updatePassword() {
  if (newPassword.value.length < 6) return alert('密碼長度至少需要 6 位！')
  
  loadingPwd.value = true
  const { error } = await supabase.auth.updateUser({ password: newPassword.value })
  
  if (error) {
    alert('❌ 修改失敗: ' + error.message)
  } else {
    alert('✅ 密碼修改成功！')
    newPassword.value = ''
  }
  loadingPwd.value = false
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

    <div class="card info-card">
      <div class="section-title">👤 個人資訊</div>
      <div class="email-display">{{ userEmail || '載入中...' }}</div>
      <p class="desc">這是您目前的登入帳號</p>
    </div>

    <div class="card">
      <div class="section-title">💰 設定結帳收款人</div>
      <p class="desc">請輸入團隊收款人名，用「逗號」隔開。</p>
      <input class="modern-inp" v-model="payeesInput" placeholder="例如: kwan, Cat">
      <button class="btn-save" @click="saveSettings">儲存收款人名單</button>
    </div>

    <div class="card">
      <div class="section-title">🔒 修改帳號密碼</div>
      <p class="desc">若要更改密碼，請在下方輸入新密碼並點擊更新。</p>
      <input 
        type="password" 
        class="modern-inp" 
        v-model="newPassword" 
        placeholder="輸入新密碼 (至少 6 位)"
      >
      <button 
        class="btn-save btn-pwd" 
        @click="updatePassword" 
        :disabled="loadingPwd"
      >
        {{ loadingPwd ? '正在更新...' : '更新密碼' }}
      </button>
    </div>

    <div class="card logout-card">
      <div class="section-title" style="color:#e11d48;">🚪 帳號安全</div>
      <button class="btn-logout" @click="handleLogout">登出系統</button>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; padding-bottom: 100px; }
.page-title { font-weight: 900; font-size: 24px; margin-bottom: 20px; color: #1e293b; }
.card { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
.info-card { border-left: 5px solid #4f46e2; }
.email-display { font-size: 18px; font-weight: 800; color: #4f46e2; margin: 5px 0; }
.section-title { font-size: 16px; font-weight: 900; color: #1e293b; margin-bottom: 10px; }
.desc { font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 15px; }
.modern-inp { width: 100%; border: 2px solid #f1f5f9; padding: 12px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; margin-bottom: 12px; }
.modern-inp:focus { border-color: #4f46e2; }
.btn-save { width: 100%; background: #1e293b; color: white; border: none; padding: 12px; border-radius: 12px; font-weight: 800; cursor: pointer; transition: 0.2s; }
.btn-save:active { transform: scale(0.98); }
.btn-pwd { background: #4f46e2; margin-top: 5px; }
.logout-card { border-color: #fecdd3; background: #fff1f2; }
.btn-logout { width: 100%; background: white; color: #e11d48; border: 2px solid #e11d48; padding: 12px; border-radius: 12px; font-weight: 800; cursor: pointer; transition: 0.2s; }
.btn-logout:hover { background: #e11d48; color: white; }
</style>