<script setup>
import { ref, onMounted } from 'vue'
import { useMainStore } from './stores/mainStore'
import { supabase } from './supabase'

// 視圖組件引入
import DashboardView from './views/DashboardView.vue'
import PromoView from './views/PromoView.vue'
import ClientsView from './views/ClientsView.vue'
import AccountingView from './views/AccountingView.vue'
import InventoryView from './views/InventoryView.vue'
import MovementView from './views/MovementView.vue'
import RetailView from './views/RetailView.vue'
import SettingsView from './views/SettingsView.vue'

// 公用組件引入
import BaseModal from './components/BaseModal.vue'

const store = useMainStore()

// --- 系統狀態 ---
const session = ref(null)
const email = ref('')
const password = ref('')
const isLoggingIn = ref(false)
const isRegistering = ref(false)
const rememberMe = ref(false)

// --- 更新通知狀態 ---
const showUpdateModal = ref(false)

// 💡 優化：合拼所有初始化邏輯到同一個生命週期鉤子
onMounted(() => {
  // 1. 檢查 Supabase 登入狀態
  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
    if (session.value) {
      store.syncAll()
    }
  })

  supabase.auth.onAuthStateChange((_event, _session) => {
    session.value = _session
    if (_session) {
      store.syncAll()
    }
  })

  // 2. 檢查更新通知 (標記改為 v2 確保能彈出)
  const hasSeen = localStorage.getItem('hasSeenUpdate_v2')
  if (!hasSeen) {
    setTimeout(() => {
      showUpdateModal.value = true
    }, 500)
  }
})

// --- 系統通知功能 ---
function closeUpdateModal() {
  localStorage.setItem('hasSeenUpdate_v2', 'true')
  showUpdateModal.value = false
}

// --- 登入/註冊功能 ---
async function handleAuth() {
  if (!email.value || !password.value) {
    return alert('請完整輸入帳號與密碼')
  }
  
  isLoggingIn.value = true
  let error = null

  if (isRegistering.value) {
    const result = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
    })
    error = result.error
    if (!error) {
      alert('註冊成功！請檢查您的信箱以驗證帳號。')
      isRegistering.value = false
    }
  } else {
    const result = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    error = result.error
  }
  
  isLoggingIn.value = false

  if (error) {
    alert((isRegistering.value ? '註冊失敗：' : '登入失敗：') + error.message)
  } else {
    email.value = ''
    password.value = ''
  }
}

// --- 忘記密碼功能 ---
async function handleForgotPassword() {
  if (!email.value) return alert('請先輸入您的 Email 帳號')
  const { error } = await supabase.auth.resetPasswordForEmail(email.value)
  if (error) {
    alert('發送重設密碼信件失敗: ' + error.message)
  } else {
    alert('已發送重設密碼信件，請檢查您的信箱！')
  }
}

// --- 登出功能 ---
async function handleLogout() {
  if(confirm('確定要登出系統嗎？')) {
    await supabase.auth.signOut()
  }
}
</script>

<template>
  <div v-if="!session" class="login-screen">
    <div class="login-card">
      <div class="login-logo">💪</div>
      <h1 class="login-title">FITWORK PRO</h1>
      <p class="login-subtitle">旗艦版店務管理系統</p>

      <div class="form-group">
        <label>Email 帳號</label>
        <input v-model="email" type="email" class="inp" placeholder="you@example.com" @keyup.enter="handleAuth">
      </div>

      <div class="form-group">
        <label>密碼</label>
        <input v-model="password" type="password" class="inp" placeholder="輸入您的密碼" @keyup.enter="handleAuth">
      </div>

      <div class="login-options">
        <label class="remember-me">
          <input type="checkbox" v-model="rememberMe"> 記住我
        </label>
        <button v-if="!isRegistering" class="forgot-btn" @click="handleForgotPassword">忘記密碼？</button>
      </div>

      <button class="btn-primary login-btn" @click="handleAuth" :disabled="isLoggingIn">
        {{ isLoggingIn ? '處理中...' : (isRegistering ? '註冊帳號' : '安全登入') }}
      </button>

      <div class="auth-switch">
        {{ isRegistering ? '已經有帳號了？' : '還沒有帳號？' }}
        <span @click="isRegistering = !isRegistering">{{ isRegistering ? '返回登入' : '立即註冊' }}</span>
      </div>
    </div>
  </div>

  <div v-else id="app-main">
    <div class="header">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:24px;">💪</span>
        <span style="font-weight:900; font-size:18px; color:var(--p); letter-spacing:-1px;">FITWORK PRO</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="icon-btn" @click="store.syncAll()"><span>↻</span></button>
        <button class="icon-btn" @click="store.view='settings'"><span style="font-size:16px;">⚙️</span></button>
        <button class="icon-btn" @click="handleLogout"><span style="font-size:14px;">🚪</span></button>
      </div>
    </div>

    <div class="content">
      <DashboardView v-if="store.view === 'dashboard'" />
      <PromoView v-else-if="store.view === 'promo'" />
      <ClientsView v-else-if="store.view === 'clients'" />
      <MovementView v-else-if="store.view === 'movement'" />
      <RetailView v-else-if="store.view === 'retail'" />
      <InventoryView v-else-if="store.view === 'inventory'" />
      <AccountingView v-else-if="store.view === 'accounting'" />
      <SettingsView v-else-if="store.view === 'settings'" />
    </div>

    <div class="nav">
      <div class="nav-item" :class="{active: store.view==='dashboard'}" @click="store.view='dashboard'"><span>📊</span><span>總覽</span></div>
      <div class="nav-item" :class="{active: store.view==='promo'}" @click="store.view='promo'"><span>📢</span><span>宣傳</span></div>
      <div class="nav-item" :class="{active: store.view==='clients'}" @click="store.view='clients'"><span>👥</span><span>客戶</span></div>
      <div class="nav-item" :class="{active: store.view==='movement'}" @click="store.view='movement'"><span>🏋️</span><span>運動</span></div>
      <div class="nav-item" :class="{active: store.view==='retail'}" @click="store.view='retail'"><span>🛒</span><span>零售</span></div>
      <div class="nav-item" :class="{active: store.view==='inventory'}" @click="store.view='inventory'"><span>📦</span><span>庫存</span></div>
      <div class="nav-item" :class="{active: store.view==='accounting'}" @click="store.view='accounting'"><span>📝</span><span>記帳</span></div>
    </div>
  </div>

  <BaseModal :show="showUpdateModal" title="🚀 系統更新通知" @close="closeUpdateModal">
    <div style="padding: 10px 0; font-size: 16px; line-height: 1.6;">
      <p>大家好！我們的系統已經進行了全新升級：</p>
      <ul style="margin-top: 12px; padding-left: 20px; color: var(--t);">
        <li>✅ <strong>更新了運動輸入設備</strong></li>
        <li>✅ 優化了手機端介面，操作更順暢</li>
        <li>✅ 解決了輸入時畫面會自動放大的問題</li>
      </ul>
      <p style="margin-top: 20px; color: #888; font-size: 13px; text-align: center;">
        (此訊息僅顯示一次)
      </p>
    </div>
    <button style="width: 100%; padding: 15px; margin-top: 15px; background: #4f46e2; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer;" @click="closeUpdateModal">
      我知道了，開始使用！
    </button>
  </BaseModal>
</template>

<style>
#app-main { height: 100vh; display: flex; flex-direction: column; }
.header { background: rgba(255,255,255,0.9); backdrop-filter: blur(20px); padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 50; }

/* 💡 優化：自動避開 iPhone 底部橫條 */
.nav { 
  background: rgba(255,255,255,0.95); 
  backdrop-filter: blur(20px); 
  border-top: 1px solid var(--border); 
  display: flex; 
  padding: 10px 4px calc(10px + env(safe-area-inset-bottom)); 
  position: fixed; 
  bottom: 0; 
  width: 100%; 
  z-index: 100; 
}

.content { 
  flex: 1; 
  overflow-y: auto; 
  padding-bottom: calc(120px + env(safe-area-inset-bottom)); 
}

.nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; color: var(--t3); font-size: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
.nav-item.active { color: var(--p); transform: translateY(-2px); }
.nav-item span:first-child { font-size: 24px; margin-bottom: 4px; }
.icon-btn { background: var(--bg); border: none; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-weight: 900; display: flex; align-items: center; justify-content: center; }
.icon-btn:active { transform: scale(0.95); }

/* 登入畫面樣式 */
.login-screen { 
  height: 100vh; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  background: linear-gradient(135deg, #f8fafc, #e2e8f0); 
  padding: 20px;
}
.login-card { 
  background: white; 
  width: 100%; 
  max-width: 400px; 
  padding: 40px 30px; 
  border-radius: 24px; 
  box-shadow: 0 20px 40px rgba(0,0,0,0.08); 
  text-align: center;
}
.login-logo { font-size: 48px; margin-bottom: 10px; }
.login-title { font-weight: 900; font-size: 28px; color: var(--p); letter-spacing: -1px; margin-bottom: 5px; }
.login-subtitle { font-size: 14px; color: var(--t3); font-weight: 600; margin-bottom: 30px; }
.form-group { margin-bottom: 20px; text-align: left; }
.form-group label { display: block; font-size: 13px; font-weight: 700; color: var(--t2); margin-bottom: 8px; padding-left: 4px; }
.login-options { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-size: 13px; }
.remember-me { color: var(--t3); display: flex; align-items: center; gap: 5px; }
.forgot-btn { background: none; border: none; color: var(--p); font-weight: 700; cursor: pointer; }
.login-btn { width: 100%; padding: 16px; font-size: 16px; border-radius: 14px; margin-top: 10px; box-shadow: 0 8px 20px rgba(79,70,229,0.3); }
.auth-switch { margin-top: 20px; font-size: 13px; color: var(--t3); }
.auth-switch span { color: var(--p); font-weight: 700; cursor: pointer; margin-left: 5px; }
</style>