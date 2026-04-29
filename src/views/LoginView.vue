<script setup>
import { ref } from 'vue'
import { supabase } from '../supabase'

const isSignUp = ref(false)
const email = ref('')
const password = ref('')
const showPassword = ref(false) // 💡 密碼顯示開關
const rememberMe = ref(true)
const loading = ref(false)

const isVerifying = ref(false)
const verificationCode = ref('')

async function handleAuth() {
  loading.value = true
  try {
    if (isSignUp.value) {
      const { error } = await supabase.auth.signUp({ 
        email: email.value, 
        password: password.value
      })
      if (error) throw error
      alert('系統已發送驗證碼到您的信箱！請輸入信件中的 6 位數驗證碼。')
      isVerifying.value = true 
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value
      })
      if (error) {
        if (error.message.includes('Email not confirmed')) {
          alert('您的信箱尚未驗證！請檢查您的信箱，並輸入 6 位數驗證碼。')
          isVerifying.value = true
          return
        }
        throw error
      }
    }
  } catch (error) {
    alert('錯誤: ' + error.message)
  } finally {
    loading.value = false
  }
}

async function verifyOtp() {
  loading.value = true
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: email.value,
      token: verificationCode.value,
      type: 'signup'
    })
    if (error) throw error
    alert('驗證成功！正在登入...')
    window.location.reload()
  } catch (error) {
    alert('驗證失敗: ' + error.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div v-if="!isVerifying">
        <h2 class="auth-title">{{ isSignUp ? '建立新帳號' : '歡迎回來' }}</h2>
        <p class="auth-sub">{{ isSignUp ? '請輸入 Email 及密碼加入 Fitwork' : '請登入以管理您的健身工作室' }}</p>

        <div class="form-group">
          <label>電子信箱</label>
          <input type="email" class="auth-inp" v-model="email" placeholder="name@example.com">
        </div>

        <div class="form-group">
          <label>密碼</label>
          <div class="password-wrapper">
            <input 
              :type="showPassword ? 'text' : 'password'" 
              class="auth-inp" 
              v-model="password" 
              placeholder="請輸入密碼"
            >
            <button class="toggle-eye" @click="showPassword = !showPassword" type="button">
              {{ showPassword ? '👁️' : '🙈' }}
            </button>
          </div>
        </div>

        <div class="auth-options" v-if="!isSignUp">
          <label class="remember-box" @click="rememberMe = !rememberMe">
            <input type="checkbox" v-model="rememberMe"> 記住我
          </label>
        </div>

        <button class="auth-btn" @click="handleAuth" :disabled="loading" style="margin-bottom: 20px;">
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

      <div v-else>
        <h2 class="auth-title">驗證您的信箱</h2>
        <p class="auth-sub">我們已向 {{ email }} 發送了 6 位數驗證碼</p>
        <div class="form-group">
          <input type="text" class="auth-inp code-inp" v-model="verificationCode" placeholder="000000" maxlength="6">
        </div>
        <button class="auth-btn" @click="verifyOtp" :disabled="loading">確認驗證碼</button>
        <div class="auth-switch" style="margin-top: 20px; text-align: center;">
          <button @click="isVerifying = false">返回修改 Email / 登入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f7f6; padding: 20px; }
.auth-card { background: white; width: 100%; max-width: 400px; padding: 40px 30px; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.05); }
.auth-title { font-size: 26px; font-weight: 900; color: #1e293b; text-align: center; margin-bottom: 8px; }
.auth-sub { font-size: 14px; color: #64748b; text-align: center; margin-bottom: 30px; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 800; color: #475569; margin-bottom: 8px; }

/* 密碼切換排版 */
.password-wrapper { position: relative; display: flex; align-items: center; }
.auth-inp { width: 100%; padding: 14px; border-radius: 12px; border: 2px solid #e2e8f0; font-weight: 700; outline: none; font-size: 16px; transition: 0.2s; }
.auth-inp:focus { border-color: #4f46e2; }
.toggle-eye { position: absolute; right: 12px; background: none; border: none; font-size: 18px; cursor: pointer; padding: 5px; opacity: 0.7; }
.toggle-eye:hover { opacity: 1; }

.code-inp { text-align: center; font-size: 24px; letter-spacing: 10px; border-color: #4f46e2; }
.auth-options { margin-bottom: 20px; }
.remember-box { font-size: 14px; font-weight: 700; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 5px; }

.auth-btn { width: 100%; padding: 16px; border-radius: 14px; border: none; background: #4f46e2; color: white; font-size: 16px; font-weight: 900; cursor: pointer; transition: 0.3s; box-shadow: 0 10px 20px rgba(79, 70, 226, 0.2); }
.auth-btn:hover { background: #4338ca; transform: translateY(-2px); }
.auth-btn:disabled { background: #cbd5e1; transform: none; }

/* 切換按鈕樣式 */
.auth-switch { text-align: center; font-size: 14px; font-weight: 800; color: #64748b; }
.auth-switch button { background: none; border: none; color: #4f46e2; font-weight: 900; font-size: 14px; cursor: pointer; padding: 0 5px; text-decoration: underline; }
</style>