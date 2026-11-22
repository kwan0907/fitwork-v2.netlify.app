<script setup>
import { ref, onMounted, watch } from 'vue'
import { useMainStore } from './stores/mainStore'
import { supabase, isReadOnlyPreview } from './supabase'
import { makeDemoPreviewData } from './demoPreview'
import { getRememberLogin, setRememberLogin } from './authStorage'

// 視圖組件引入
import ReportCenterView from './views/ReportCenterView.vue'
import HomeView from './views/HomeView.vue'
import MoreView from './views/MoreView.vue'
import GlobalSearch from './components/GlobalSearch.vue'
import BzIcon from './components/BzIcon.vue'
import PromoView from './views/PromoView.vue'
import HerbalifePromo from './views/HerbalifePromo.vue' 
import ClientsView from './views/ClientsView.vue'
import AccountingView from './views/AccountingView.vue'
import InventoryView from './views/InventoryView.vue'
import ProductsView from './views/ProductsView.vue'
import HistoryBackfillView from './views/HistoryBackfillView.vue'
import MovementView from './views/MovementView.vue'
import RetailView from './views/RetailView.vue'
import SettingsView from './views/SettingsView.vue'

// 公用組件引入

const store = useMainStore()

// --- 系統狀態 ---
const session = ref(null)
watch(() => session.value?.user?.email, (email, previousEmail) => {
  if (email !== previousEmail) store.monitorProfiles = []
})
const email = ref('')
const password = ref('')
const isLoggingIn = ref(false)
const isRegistering = ref(false)
const isDemoMode = ref(false)
const loginError = ref('')
const authMessage = ref('')
const rememberLogin = ref(getRememberLogin())
const showPassword = ref(false)
const isResettingPassword = ref(false)
const newPassword = ref('')
const showNewPassword = ref(false)

// 💡 驗證碼專用狀態
const isVerifying = ref(false)
const verificationCode = ref('')

const tempName = ref('')
const searchOpen = ref(false)
const quickOpen = ref(false)

function enterDemoPreview() {
  if (!isReadOnlyPreview && !import.meta.env.DEV) return
  if (isReadOnlyPreview && !new URLSearchParams(window.location.search).has('demo')) {
    window.location.search = '?demo=1'
    return
  }
  const demo = makeDemoPreviewData()
  isDemoMode.value = true
  store.monitorProfiles = []
  session.value = { user: { id: 'local-demo-preview' } }
  store.currentUser = '示範預覽'
  store.view = 'home'
  store.clients = demo.clients
  store.products = demo.products
  store.transactions = demo.transactions
  store.stock = demo.stock
  store.stockExpiry = demo.stockExpiry
  store.promotions = demo.promotions
  store.isInitialLoading = false
  store.isSyncing = false
  store.hasMoreTxn = false
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  if ((isReadOnlyPreview && params.has('demo')) || (import.meta.env.DEV && params.has('bz-preview'))) {
    enterDemoPreview()
    return
  }
  supabase.auth.getSession().then(({ data }) => {
    if (isDemoMode.value) return
    session.value = data.session
    if (session.value && params.has('password-reset')) isResettingPassword.value = true
    if (session.value && !isResettingPassword.value) {
      store.syncAll().then(() => store.loadAllTransactions())
    }
  })

  supabase.auth.onAuthStateChange((_event, _session) => {
    if (isDemoMode.value) return
    session.value = _session
    if (_event === 'PASSWORD_RECOVERY' || (_session && params.has('password-reset'))) isResettingPassword.value = true
    if (_session && _event === 'SIGNED_IN' && !isResettingPassword.value) {
      store.syncAll().then(() => store.loadAllTransactions())
    }
  })
})

watch(() => store.view, () => {
  quickOpen.value = false
  contentRef.value?.scrollTo({ top: 0 })
})

function saveName() {
  if (!tempName.value.trim()) return alert('請輸入稱呼喔！')
  store.setDeviceUsers(tempName.value.trim())
}

function go(view) { store.view = view; quickOpen.value = false }
function quick(kind, type) {
  quickOpen.value = false
  if (kind === 'transaction') {
    store.pendingQuickEntry = { kind, type }
    go('accounting')
  } else if (kind === 'client') {
    store.pendingQuickEntry = { kind }
    go('clients')
  } else go(kind)
}

// 💡 智能升級：攔截「Email未驗證」錯誤，自動引導輸入驗證碼
async function handleAuth() {
  const loginEmail = email.value.trim()
  if (!loginEmail || !password.value) {
    return alert('請完整輸入帳號與密碼')
  }
  loginError.value = ''
  authMessage.value = ''
  isLoggingIn.value = true
  setRememberLogin(rememberLogin.value)
  let authError = null

  if (isRegistering.value) {
    const result = await supabase.auth.signUp({
      email: loginEmail,
      password: password.value,
    })
    authError = result.error
    if (!authError) {
      if (result.data?.session) {
        authMessage.value = '帳戶已建立，登入成功。'
      } else {
        authMessage.value = '已送出驗證電郵。請按信內連結，或輸入 6 位驗證碼；驗證後返嚟登入。'
        isVerifying.value = true
      }
    }
  } else {
    const result = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: password.value,
    })
    authError = result.error
    
    // 💡 關鍵防呆：如果登入失敗是因為「信箱未驗證」，自動幫他打開驗證碼格子！
    if (authError && authError.message.includes('Email not confirmed')) {
      authMessage.value = '電郵尚未驗證。請按信內連結，或輸入 6 位驗證碼。'
      isVerifying.value = true
      authError = null // 清除錯誤，因為我們已經幫他切換畫面了
    }
  }
  
  isLoggingIn.value = false

  if (authError) {
    loginError.value = authError.code === 'invalid_credentials'
      ? `電郵或密碼唔正確，請核對原有帳戶資料。${isReadOnlyPreview ? '你亦可以先用下方示範資料體驗新版。' : ''}`
      : (isRegistering.value ? '註冊失敗：' : '登入失敗：') + authError.message
  } else if (!isVerifying.value) {
    // 只有在真的登入成功且不需要驗證時，才清空密碼
    email.value = ''
    password.value = ''
  }
}

// 處理 6 位數驗證碼的邏輯
async function handleVerify() {
  if (!email.value) return alert('請輸入要驗證的 Email 帳號')
  if (!verificationCode.value) return alert('請輸入 6 位數驗證碼')
  
  isLoggingIn.value = true
  const { error } = await supabase.auth.verifyOtp({
    email: email.value,
    token: verificationCode.value,
    type: 'signup' // 告訴系統這是註冊信箱的驗證
  })
  isLoggingIn.value = false

  if (error) {
    loginError.value = '驗證失敗：' + error.message
  } else {
    authMessage.value = '電郵驗證成功，登入中。'
    isVerifying.value = false
    isRegistering.value = false
    verificationCode.value = ''
    email.value = ''
    password.value = ''
  }
}

async function handleForgotPassword() {
  if (!email.value.trim()) { loginError.value = '請先輸入 Email 帳號。'; return }
  loginError.value = ''
  authMessage.value = ''
  isLoggingIn.value = true
  const redirectTo = `${window.location.origin}${window.location.pathname}?password-reset=1`
  const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), { redirectTo })
  isLoggingIn.value = false
  if (error) {
    loginError.value = '發送重設密碼電郵失敗：' + error.message
  } else {
    authMessage.value = '重設密碼電郵已送出。請按信內連結，再喺呢度設定新密碼。'
  }
}

async function handleResetPassword() {
  if (newPassword.value.length < 6) { loginError.value = '新密碼最少要 6 個字元。'; return }
  if (!session.value) { loginError.value = '重設連結未完成驗證，請重新按電郵內連結。'; return }
  isLoggingIn.value = true
  loginError.value = ''
  const { error } = await supabase.auth.updateUser({ password: newPassword.value })
  isLoggingIn.value = false
  if (error) { loginError.value = '更新密碼失敗：' + error.message; return }
  newPassword.value = ''
  isResettingPassword.value = false
  window.history.replaceState({}, '', window.location.pathname)
  await store.syncAll()
  await store.loadAllTransactions()
}

function returnToLogin() {
  isResettingPassword.value = false
  window.history.replaceState({}, '', window.location.pathname)
}

async function handleLogout() {
  if (isDemoMode.value) {
    window.location.href = window.location.pathname
    return
  }
  if(confirm('確定要登出系統嗎？')) {
    await supabase.auth.signOut()
    window.location.reload()
  }
}
// 🟢 FAB 懸浮按鈕專用邏輯
const contentRef = ref(null) 
const showBackToTop = ref(false)

// 💡 防抖動 (Debounce) 的滑動檢查，效能更好
let scrollTimeout
const checkScroll = (e) => {
  if (scrollTimeout) cancelAnimationFrame(scrollTimeout)
  scrollTimeout = requestAnimationFrame(() => {
    // 檢查 .content 區塊滑動咗幾多
    if (e.target) {
      showBackToTop.value = e.target.scrollTop > 400
    }
  })
}

// 💡 確保平滑滾動到最頂
const scrollToTop = () => {
  if (contentRef.value) {
    contentRef.value.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
</script>

<template>
  <div v-if="!session || isResettingPassword" class="login-screen">
    <div class="login-card">
      <div class="login-logo">BZ</div>
      <h1 class="login-title">BZ記錄器</h1>
      <p class="login-subtitle">生意、客戶、庫存，一個地方記好。</p>
      <p v-if="isReadOnlyPreview" class="bz-preview-login-banner">呢個係只讀預覽。可以註冊／登入帳戶體驗；客戶、交易同庫存只供查看，儲存操作已停用。</p>

      <div v-if="isResettingPassword">
        <h2 class="bz-auth-heading">設定新密碼</h2>
        <p class="bz-auth-help">重設連結驗證後，輸入新密碼就完成。</p>
        <div class="form-group"><label for="reset-password">新密碼</label>
          <div class="bz-password-field"><input id="reset-password" v-model="newPassword" :type="showNewPassword ? 'text' : 'password'" autocomplete="new-password" class="inp" placeholder="最少 6 個字元" @keyup.enter="handleResetPassword"><button type="button" :aria-label="showNewPassword ? '隱藏新密碼' : '顯示新密碼'" :aria-pressed="showNewPassword" @click="showNewPassword=!showNewPassword"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/><path v-if="showNewPassword" d="M3 21 21 3"/></svg></button></div>
        </div>
        <button type="button" class="btn-primary login-btn" :disabled="isLoggingIn || !session" @click="handleResetPassword">{{ isLoggingIn ? '更新中…' : '更新密碼' }}</button>
        <p v-if="!session" class="bz-auth-help">請先按重設電郵內嘅連結完成驗證。</p>
        <p v-if="loginError" class="bz-login-error" role="alert">{{ loginError }}</p>
        <button v-if="!session" type="button" class="bz-auth-link" @click="returnToLogin">返回登入</button>
      </div>

      <div v-else-if="isVerifying">
        
        <div class="form-group">
          <label>請確認您的 Email 帳號</label>
          <input v-model="email" type="email" class="inp" placeholder="you@example.com">
        </div>

        <div class="form-group">
          <label style="text-align: center;">請輸入信件中的 6 碼驗證碼</label>
          <input 
            v-model="verificationCode" 
            type="text" 
            inputmode="numeric"
            class="inp" 
            placeholder="000000" 
            maxlength="6"
            @keyup.enter="handleVerify"
            style="text-align: center; font-size: 24px; font-weight: 900; letter-spacing: 8px; padding: 15px;"
          >
        </div>

        <button class="btn-primary login-btn" @click="handleVerify" :disabled="isLoggingIn">
          {{ isLoggingIn ? '驗證中...' : '確認並登入' }}
        </button>
        <p v-if="authMessage" class="bz-auth-message" role="status">{{ authMessage }}</p>
        <p v-if="loginError" class="bz-login-error" role="alert">{{ loginError }}</p>

        <div class="auth-switch">
          <span @click="isVerifying = false; isRegistering = false; verificationCode = ''">取消並返回登入</span>
        </div>
      </div>

      <div v-else>
        <div class="form-group">
          <label>Email 帳號</label>
          <input v-model="email" type="email" autocomplete="username" class="inp" placeholder="you@example.com" @keyup.enter="handleAuth">
        </div>

        <div class="form-group">
          <label for="login-password">密碼</label>
          <div class="bz-password-field"><input id="login-password" v-model="password" :type="showPassword ? 'text' : 'password'" :autocomplete="isRegistering ? 'new-password' : 'current-password'" class="inp" placeholder="輸入您的密碼 (最少6碼)" @keyup.enter="handleAuth"><button type="button" :aria-label="showPassword ? '隱藏密碼' : '顯示密碼'" :aria-pressed="showPassword" @click="showPassword=!showPassword"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/><path v-if="showPassword" d="M3 21 21 3"/></svg></button></div>
        </div>

        <div class="login-options">
          <label class="remember-me"><input v-model="rememberLogin" type="checkbox">記住密碼</label>
          <button v-if="!isRegistering" type="button" class="forgot-btn" :disabled="isLoggingIn" @click="handleForgotPassword">忘記密碼？</button>
        </div>
        <p class="bz-auth-help">記住登入狀態；密碼由裝置嘅密碼管理器儲存。</p>

        <button class="btn-primary login-btn" @click="handleAuth" :disabled="isLoggingIn">
          {{ isLoggingIn ? '處理中...' : (isRegistering ? '註冊帳號' : '安全登入') }}
        </button>
        <p v-if="loginError" class="bz-login-error" role="alert">{{ loginError }}</p>
        <p v-if="authMessage" class="bz-auth-message" role="status">{{ authMessage }}</p>
        <button v-if="isReadOnlyPreview" type="button" class="bz-demo-button" @click="enterDemoPreview">免登入體驗新版（示範資料）</button>

        <div class="auth-switch">
          {{ isRegistering ? '已經有帳號了？' : '還沒有帳號？' }}
          <button type="button" class="bz-auth-link" @click="isRegistering = !isRegistering; loginError = ''; authMessage = ''">{{ isRegistering ? '返回登入' : '立即註冊' }}</button>
        </div>

        <div class="auth-switch" style="margin-top: 15px; border-top: 1px dashed #e2e8f0; padding-top: 15px;" v-if="!isRegistering">
          <button type="button" class="bz-auth-link" @click="isVerifying = true; isRegistering = false">已有 6 位驗證碼？輸入驗證碼</button>
        </div>

      </div>

    </div>
  </div>

  <div v-else id="app-main">
    <div v-if="!store.currentUser" class="welcome-overlay">
      <div class="welcome-modal">
        <div class="w-icon">👋</div>
        <h2 class="w-title">歡迎來到 BZ記錄器</h2>
        <p class="w-desc">請輸入你們的稱呼（若有兩人請用逗號隔開）：</p>
        
        <input v-model="tempName" placeholder="例如：Kwan, Cat" class="w-inp" @keyup.enter="saveName">
        <button class="w-btn" @click="saveName">開始使用 🚀</button>
      </div>
    </div>

    <header v-if="store.view !== 'home'" class="header bz-header">
      <button type="button" class="bz-brand" @click="go('home')"><span>BZ</span><span><b>BZ記錄器</b><small>{{ store.currentUser || '工作台' }}</small></span></button>
      <div class="bz-header-actions">
        <button v-if="store.deviceUsers?.length > 1" class="bz-user-switch" type="button" @click="store.switchUser()">{{ store.currentUser }} ⇄</button>
        <button class="bz-header-icon" type="button" aria-label="搜尋資料" @click="searchOpen=true">⌕</button>
        <button v-if="!isDemoMode" class="bz-header-icon" type="button" :aria-label="store.isSyncing ? '同步中' : '重新同步'" @click="store.syncAll()">{{ store.isSyncing ? '◌' : '↻' }}</button>
        <button class="bz-header-icon" type="button" aria-label="更多工具" @click="go('more')">⋯</button>
      </div>
    </header>

    <div v-if="isReadOnlyPreview" class="bz-preview-banner" role="status">{{ isDemoMode ? '示範資料預覽：只供查看，唔會連接你嘅正式資料。' : '預覽模式：只供查看，儲存操作已停用。' }} <button v-if="isDemoMode" type="button" @click="handleLogout">返回登入</button></div>
    <div class="content" ref="contentRef" @scroll="checkScroll">
      <HomeView v-if="store.view === 'home'" @search="searchOpen=true" />
      <MoreView v-else-if="store.view === 'more'" />
      <ReportCenterView v-else-if="store.view === 'dashboard'" />
      <PromoView v-else-if="store.view === 'promo'" />
      <HerbalifePromo v-else-if="store.view === 'herbalife'" /> 
      <ClientsView v-else-if="store.view === 'clients'" :current-user-email="session?.user?.email || ''" />
      <MovementView v-else-if="store.view === 'movement'" />
      <RetailView v-else-if="store.view === 'retail'" :account-id="session?.user?.id || ''" />
      <InventoryView v-else-if="store.view === 'inventory'" />
      <ProductsView v-else-if="store.view === 'products'" />
      <HistoryBackfillView v-else-if="store.view === 'history'" />
      <AccountingView v-else-if="store.view === 'accounting'" />
      <SettingsView v-else-if="store.view === 'settings'" />
    </div>

    <nav class="nav bz-nav" aria-label="主要導覽">
      <button type="button" class="nav-item" :class="{active: store.view==='home'}" @click="go('home')"><BzIcon name="home"/><span>首頁</span></button>
      <button type="button" class="nav-item" :class="{active: store.view==='clients'}" @click="go('clients')"><BzIcon name="users"/><span>客戶</span></button>
      <button type="button" class="nav-item" :class="{active: ['inventory','products'].includes(store.view)}" @click="go('inventory')"><BzIcon name="box"/><span>庫存</span></button>
      <button type="button" class="nav-item" :class="{active: store.view==='dashboard'}" @click="go('dashboard')"><BzIcon name="chart"/><span>報表</span></button>
      <button type="button" class="nav-item" :class="{active: ['more','promo','herbalife','movement','retail','settings','accounting','history'].includes(store.view)}" @click="go('more')"><BzIcon name="more"/><span>更多</span></button>
    </nav>
    <button v-if="!['home','dashboard','clients'].includes(store.view)" type="button" class="bz-quick-trigger" aria-label="快速新增" :aria-expanded="quickOpen" @click="quickOpen=!quickOpen">{{ quickOpen ? '×' : '+' }}</button>
    <div v-if="quickOpen" class="bz-quick-backdrop" @click.self="quickOpen=false">
      <section class="bz-quick-sheet" role="dialog" aria-modal="true" aria-label="快速新增">
        <div class="bz-quick-head"><div><small>最常用嘅操作</small><h2>快速新增</h2></div><button type="button" @click="quickOpen=false">關閉</button></div>
        <div class="bz-quick-grid">
          <button type="button" @click="quick('retail')"><span>＋</span><b>新增交易</b><small>產品結帳</small></button>
          <button type="button" @click="quick('retail')"><span>▣</span><b>出貨／銷售</b><small>記錄銷售同扣庫存</small></button>
          <button type="button" @click="quick('inventory')"><span>▤</span><b>入貨／補貨</b><small>新增庫存</small></button>
          <button type="button" @click="quick('transaction','expense')"><span>−</span><b>支出記錄</b><small>新增一筆支出</small></button>
          <button type="button" @click="quick('client')"><span>♙</span><b>新增客戶</b><small>登記資料</small></button>
          <button type="button" @click="quick('history')"><span>↶</span><b>補舊紀錄</b><small>單筆或 Excel</small></button>
        </div>
      </section>
    </div>
    <GlobalSearch :open="searchOpen" @close="searchOpen=false" />
  </div>

  <!-- 🟢 將按鈕搬出 Modal，放喺最外層，咁先會全域顯示！ -->
  <Transition name="fab-fade">
    <button v-if="showBackToTop && store.view !== 'dashboard'" class="fab-back-to-top" @click="scrollToTop">
      <span style="font-size: 22px;">⬆️</span>
    </button>
  </Transition>

</template>

<style>
/* 💡 終極防下拉回彈 */
html, body {
  overscroll-behavior-y: none;
  overflow: hidden;
  height: 100%;
  margin: 0;
}

#app-main { 
  height: 100vh; 
  display: flex; 
  flex-direction: column; 
  background: #f8fafc; 
}
.header { background: rgba(255,255,255,0.9); backdrop-filter: blur(20px); padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 50; }

.nav { 
  background: rgba(255,255,255,0.95); 
  backdrop-filter: blur(20px); 
  border-top: 1px solid var(--border); 
  display: flex; 
  padding: 8px 2px calc(8px + env(safe-area-inset-bottom)); 
  position: fixed; 
  bottom: 0; 
  width: 100%; 
  z-index: 100; 
}

.content { 
  flex: 1; 
  overflow-y: auto; 
  padding-bottom: calc(120px + env(safe-area-inset-bottom)); 
  overscroll-behavior-y: contain; 
  -webkit-overflow-scrolling: touch;
}

.nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; color: var(--t3); font-size: 9px; font-weight: 800; cursor: pointer; transition: 0.2s; }
.nav-item.active { color: var(--p); transform: translateY(-2px); }
.nav-item span:first-child { font-size: 20px; margin-bottom: 2px; }

.icon-btn { background: var(--bg); border: none; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-weight: 900; display: flex; align-items: center; justify-content: center; }
.icon-btn:active { transform: scale(0.95); }

.user-switch-btn { background: #eef2ff; color: #4f46e2; border: 2px solid #c7d2fe; padding: 0 12px; height: 36px; border-radius: 12px; font-weight: 900; font-size: 13px; cursor: pointer; transition: 0.2s; display:flex; align-items:center; gap:4px; }
.user-switch-btn:active { transform: scale(0.95); }

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

.welcome-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); z-index: 9999; display: flex; justify-content: center; align-items: center; }
.welcome-modal { background: white; padding: 35px 25px; border-radius: 28px; width: 85%; max-width: 360px; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.3); animation: popIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
.w-icon { font-size: 50px; margin-bottom: 10px; }
.w-title { font-size: 22px; font-weight: 900; color: #1e293b; margin-bottom: 10px; }
.w-desc { font-size: 14px; font-weight: 700; color: #64748b; margin-bottom: 25px; line-height: 1.5; }
.w-inp { width: 100%; padding: 15px; border-radius: 16px; border: 2px solid #e2e8f0; font-size: 18px; font-weight: 900; text-align: center; color: #4f46e2; outline: none; margin-bottom: 20px; transition: 0.2s; }
.w-inp:focus { border-color: #4f46e2; background: #eef2ff; }
.w-btn { width: 100%; padding: 16px; background: #4f46e2; color: white; border: none; border-radius: 16px; font-size: 18px; font-weight: 900; cursor: pointer; box-shadow: 0 10px 20px rgba(79,70,229,0.3); }
.w-btn:active { transform: scale(0.95); }
@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
/* 🟢 懸浮按鈕樣式 */
.fab-back-to-top {
  position: fixed;
  /* 💡 完美計算高度：避開 Nav 列 + 避開各分頁原有的「＋」按鈕！ */
  bottom: calc(145px + env(safe-area-inset-bottom)); 
  right: 20px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f46e2, #3730a3);
  color: white;
  border: none;
  box-shadow: 0 4px 15px rgba(79, 70, 226, 0.4);
  cursor: pointer;
  /* 💡 z-index 要大過 50，但細過 Nav 的 100 */
  z-index: 90; 
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}
/* 🟢 按下時嘅物理回饋效果 */
.fab-back-to-top:active {
  transform: scale(0.85) translateY(2px);
  box-shadow: 0 2px 8px rgba(79, 70, 226, 0.3);
}

/* 🟢 淡入淡出 + 輕微彈跳動畫 */
.fab-fade-enter-active,
.fab-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fab-fade-enter-from,
.fab-fade-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.5); /* 由下面縮細彈出嚟 */
}
</style>
