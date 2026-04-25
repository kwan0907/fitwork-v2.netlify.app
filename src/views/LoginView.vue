<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase'

const isSignUp = ref(false) // 切換登入或註冊
const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const loading = ref(false)

// 💡 新增：驗證碼專用狀態
const isVerifying = ref(false)
const verificationCode = ref('')

async function handleAuth() {
  loading.value = true
  try {
    if (isSignUp.value) {
      // 💡 註冊：發送 6 碼驗證碼
      const { error } = await supabase.auth.signUp({ 
        email: email.value, 
        password: password.value
      })
      if (error) throw error
      alert('系統已發送驗證碼到您的信箱！請輸入信件中的 6 位數驗證碼。')
      isVerifying.value = true // 自動切換到輸入驗證碼畫面
    } else {
      // 💡 登入
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value
      })
      if (error) {
        // 💡 防呆：如果登入失敗是因為沒驗證，自動彈出驗證框接住他
        if (error.message.includes('Email not confirmed')) {
          alert('您的信箱尚未驗證！請檢查您的信箱，並輸入 6 位數驗證碼。')
          isVerifying.value = true
          return
        }
        throw error
      }
    }
  } catch (e) {
    alert(e.message)
  } finally {
    loading.value = false
  }
}

// 💡 新增：處理 6 位數驗證碼的邏輯
async function handleVerify() {
  if (!email.value) return alert('請確認您的 Email 帳號')
  if (!verificationCode.value) return alert('請輸入 6 位數驗證碼')
  
  loading.value = true
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: email.value,
      token: verificationCode.value,
      type: 'signup' // 告訴系統這是註冊信箱的驗證
    })
    if (error) throw error
    
    alert('✅ 驗證成功！系統將為您自動登入。')
    isVerifying.value = false
    isSignUp.value = false
    verificationCode.value = ''
    email.value = ''
    password.value = ''
  } catch (e) {
    alert('驗證失敗：' + e.message + ' (請確認驗證碼是否正確或已過期)')
  } finally {
    loading.value = false
  }
}

async function handleForgotPassword() {
  if (!email.value) return alert('請先輸入 Email')
  const { error } = await supabase.auth.resetPasswordForEmail(email.value)
  if (error) alert(error.message)
  else alert('重設密碼郵件已發送！')
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h2 class="auth-title">{{ isVerifying ? '信箱安全驗證' : (isSignUp ? '建立專屬系統' : '歡迎回來') }}</h2>
      <p class="auth-sub">{{ isVerifying ? '請輸入信件中的 6 碼驗證碼' : '每個帳號擁有獨立的個人化資料空間' }}</p>

      <div v-if="isVerifying">
        <div class="form-group">
          <label>確認您的 Email</label>
          <input v-model="email" type="email" class="auth-inp" placeholder="you@example.com">
        </div>

        <div class="form-group">
          <label style="text-align: center;">6 碼驗證碼</label>
          <input 
            v-model="verificationCode" 
            type="text" 
            inputmode="numeric"
            class="auth-inp" 
            placeholder="000000" 
            maxlength="6"
            @keyup.enter="handleVerify"
            style="text-align: center; font-size: 24px; font-weight: 900; letter-spacing: 8px;"
          >
        </div>

        <button class="auth-submit" @click="handleVerify" :disabled="loading">
          {{ loading ? '驗證中...' : '確認並登入' }}
        </button>

        <div class="auth-switch">
          <button @click="isVerifying = false; isSignUp = false">取消並返回登入</button>
        </div>
      </div>

      <div v-else>
        <div class="form-group">
          <label>Email 帳號</label>
          <input v-model="email" type="email" class="auth-inp" placeholder="you@example.com">
        </div>

        <div class="form-group">
          <label>登入密碼</label>
          <input v-model="password" type="password" class="auth-inp" placeholder="輸入密碼">
        </div>

        <div class="auth-options">
          <label class="remember-box">
            <input type="checkbox" v-model="rememberMe"> 記住我
          </label>
          <button v-if="!isSignUp" class="forgot-btn" @click="handleForgotPassword">忘記密碼？</button>
        </div>

        <button class="auth-submit" @click="handleAuth" :disabled="loading">
          {{ loading ? '處理中...' : (isSignUp ? '立即註冊' : '登入系統') }}
        </button>

        <div class="auth-switch">
          {{ isSignUp ? '已有帳號？' : '還沒有自己的系統？' }}
          <button @click="isSignUp = !isSignUp">{{ isSignUp ? '立即登入' : '免費註冊' }}</button>
        </div>

        <div class="auth-switch" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0;" v-if="!isSignUp">
          <button @click="isVerifying = true; isSignUp = false">👉 已經有 6 碼驗證碼？點此輸入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f1f5f9; padding: 20px; }
.auth-card { background: white; width: 100%; max-width: 400px; padding: 40px 30px; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.05); }
.auth-title { font-size: 26px; font-weight: 900; color: #1e293b; text-align: center; margin-bottom: 8px; }
.auth-sub { font-size: 14px; color: #64748b; text-align: center; margin-bottom: 30px; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 800; color: #475569; margin-bottom: 8px; }
.auth-inp { width: 100%; padding: 14px; border-radius: 12px; border: 2px solid #e2e8f0; font-weight: 700; outline: none; font-size: 16px; }
.auth-inp:focus { border-color: #4f46e2; }
.auth-options { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
.remember-box { font-size: 14px; font-weight: 700; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.forgot-btn { background: none; border: none; color: #4f46e2; font-weight: 800; cursor: pointer; font-size: 14px; }
.auth-submit { width: 100%; padding: 16px; border-radius: 14px; border: none; background: #1e293b; color: white; font-weight: 900; font-size: 16px; cursor: pointer; margin-bottom: 20px; transition: 0.3s; }
.auth-submit:hover { background: #4f46e2; transform: translateY(-2px); }
.auth-switch { text-align: center; font-size: 14px; font-weight: 700; color: #64748b; }
.auth-switch button { background: none; border: none; color: #4f46e2; font-weight: 800; cursor: pointer; margin-left: 5px; }
</style>