<script setup>
import { ref, onMounted } from 'vue'
import { useMainStore } from './stores/mainStore'
import { supabase } from './supabase' // 引入資料庫與驗證功能

import DashboardView from './views/DashboardView.vue'
import PromoView from './views/PromoView.vue' // 幫你補上宣傳頁的引入
import ClientsView from './views/ClientsView.vue'
import AccountingView from './views/AccountingView.vue'
import InventoryView from './views/InventoryView.vue'
import MovementView from './views/MovementView.vue'
import RetailView from './views/RetailView.vue'

const store = useMainStore()

// --- 登入系統狀態 ---
const session = ref(null)
const email = ref('')
const password = ref('')
const isLoggingIn = ref(false)

onMounted(() => {
  // 1. 網頁載入時，檢查是否已經登入過
  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
    if (session.value) {
      store.syncAll() // 有登入才抓資料
    }
  })

  // 2. 監聽登入/登出狀態改變
  supabase.auth.onAuthStateChange((_event, _session) => {
    session.value = _session
    if (_session) {
      store.syncAll()
    }
  })
})

// --- 登入功能 ---
async function handleLogin() {
  if (!email.value || !password.value) {
    return alert('請完整輸入帳號與密碼')
  }
  
  isLoggingIn.value = true
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })
  isLoggingIn.value = false

  if (error) {
    alert('登入失敗，請檢查帳號密碼：' + error.message)
  } else {
    // 登入成功後清空輸入框
    email.value = ''
    password.value = ''
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
        <label>登入帳號 (Email)</label>
        <input v-model="email" type="email" class="inp" placeholder="輸入您的帳號" @keyup.enter="handleLogin">
      </div>

      <div class="form-group">
        <label>登入密碼</label>
        <input v-model="password" type="password" class="inp" placeholder="輸入您的密碼" @keyup.enter="handleLogin">
      </div>

      <button class="btn-primary login-btn" @click="handleLogin" :disabled="isLoggingIn">
        {{ isLoggingIn ? '驗證中...' : '安全登入' }}
      </button>
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
</template>

<style>
/* 原本的系統樣式 */
#app-main { height: 100vh; display: flex; flex-direction: column; }
.header { background: rgba(255,255,255,0.9); backdrop-filter: blur(20px); padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 50; }
.content { flex: 1; overflow-y: auto; padding-bottom: 120px; }
.nav { background: rgba(255,255,255,0.95); backdrop-filter: blur(20px); border-top: 1px solid var(--border); display: flex; padding: 10px 4px 30px; position: fixed; bottom: 0; width: 100%; z-index: 100; }
.nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; color: var(--t3); font-size: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; }
.nav-item.active { color: var(--p); transform: translateY(-2px); }
.nav-item span:first-child { font-size: 24px; margin-bottom: 4px; }
.icon-btn { background: var(--bg); border: none; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-weight: 900; display: flex; align-items: center; justify-content: center; }
.icon-btn:active { transform: scale(0.95); }

/* 全新登入畫面樣式 */
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
.login-btn { width: 100%; padding: 16px; font-size: 16px; border-radius: 14px; margin-top: 10px; box-shadow: 0 8px 20px rgba(79,70,229,0.3); }
</style>