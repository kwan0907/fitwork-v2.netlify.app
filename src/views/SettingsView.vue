<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../supabase'
import { useMainStore } from '../stores/mainStore'
import {
  loadMovementPackages,
  normalizeMovementPackage,
  saveMovementPackage,
  setMovementPackageActive
} from '../movementPackages'

const store = useMainStore()
const userEmail = ref('')
const payeesInput = ref('kwan, Cat')
const newPassword = ref('')
const loadingPwd = ref(false)

const packageRows = ref([])
const packagesLoading = ref(false)
const packageEditorOpen = ref(false)
const savingPackage = ref(false)
const keywordsInput = ref('')
const editingPackage = ref(null)

const blankPackage = () => normalizeMovementPackage({
  package_key: `custom_${Date.now()}`,
  label: '', emoji: '🎟️', price: 0, base_cost: 0, category: '運動套票',
  transaction_mode: 'auto', force_profit: null, expiry_years: 1,
  increment_pkg_count: true, apply_new_customer_discount: false, new_customer_discount: 98,
  apply_referral_cost: false, referral_cost: 53, referral_price_override: null,
  force_income_when_zero: false, keywords: [], is_active: true,
  sort_order: (packageRows.value.at(-1)?.sort_order || 90) + 10
})

const editorProfit = computed(() => {
  if (!editingPackage.value) return 0
  if (editingPackage.value.force_profit !== null && editingPackage.value.force_profit !== '') return Number(editingPackage.value.force_profit || 0)
  return Number(editingPackage.value.price || 0) - Number(editingPackage.value.base_cost || 0)
})

onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) userEmail.value = user.email
  if (store.settings?.payees) payeesInput.value = store.settings.payees.join(', ')
  await refreshPackages()
})

async function refreshPackages() {
  packagesLoading.value = true
  try {
    packageRows.value = await loadMovementPackages({ includeInactive: true, ensureDefaults: true })
  } catch (err) {
    alert('套票設定讀取失敗：' + (err?.message || '未知錯誤'))
  } finally {
    packagesLoading.value = false
  }
}

function openNewPackage() {
  editingPackage.value = blankPackage()
  keywordsInput.value = ''
  packageEditorOpen.value = true
}

function openEditPackage(pkg) {
  editingPackage.value = { ...normalizeMovementPackage(pkg) }
  keywordsInput.value = (pkg.keywords || []).join(', ')
  packageEditorOpen.value = true
}

async function savePackage() {
  if (!editingPackage.value?.label?.trim()) return alert('請填寫套票名稱')
  savingPackage.value = true
  try {
    editingPackage.value.keywords = keywordsInput.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
    editingPackage.value.package_key = editingPackage.value.package_key || `custom_${Date.now()}`
    await saveMovementPackage(editingPackage.value)
    await refreshPackages()
    packageEditorOpen.value = false
    alert('✅ 套票設定已儲存，運動收銀下次打開會自動讀取最新設定。')
  } catch (err) {
    alert('儲存失敗：' + (err?.message || '未知錯誤'))
  } finally {
    savingPackage.value = false
  }
}

async function togglePackage(pkg) {
  try {
    await setMovementPackageActive(pkg.id, !pkg.is_active)
    await refreshPackages()
  } catch (err) {
    alert('更新失敗：' + (err?.message || '未知錯誤'))
  }
}

function packageProfit(pkg) {
  return pkg.force_profit !== null ? Number(pkg.force_profit) : Number(pkg.price) - Number(pkg.base_cost)
}

async function saveSettings() {
  const arr = payeesInput.value.split(',').map(s => s.trim()).filter(Boolean)
  store.settings = { ...store.settings, payees: arr }
  localStorage.setItem('fitwork_settings', JSON.stringify(store.settings))
  alert('✅ 收款人設定已儲存！')
}

async function updatePassword() {
  if (newPassword.value.length < 6) return alert('密碼長度至少需要 6 位！')
  loadingPwd.value = true
  const { error } = await supabase.auth.updateUser({ password: newPassword.value })
  if (error) alert('❌ 修改失敗: ' + error.message)
  else {
    alert('✅ 密碼修改成功！')
    newPassword.value = ''
  }
  loadingPwd.value = false
}

async function handleLogout() {
  if (confirm('確定要登出系統嗎？')) {
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
      <input class="modern-inp" v-model="payeesInput" placeholder="例如: Kwan, Cat">
      <button class="btn-save" @click="saveSettings">儲存收款人名單</button>
    </div>

    <div class="card package-settings-card">
      <div class="package-head">
        <div>
          <div class="section-title">🏋️ 運動套票設定</div>
          <p class="desc">價格、成本、利潤、有效期及優惠規則都儲存在雲端。修改後，運動收銀會自動讀取最新版本，不需要再改程式碼。</p>
        </div>
        <button class="btn-add-package" @click="openNewPackage">＋ 新增項目</button>
      </div>

      <div v-if="packagesLoading" class="package-loading">正在讀取套票設定…</div>
      <div v-else class="package-list">
        <div v-for="pkg in packageRows" :key="pkg.id" class="package-row" :class="{ disabled: !pkg.is_active }">
          <div class="package-main">
            <div class="package-name">{{ pkg.emoji }} {{ pkg.label }} <span v-if="!pkg.is_active">（已停用）</span></div>
            <div class="package-money">
              <span>售價 <b>${{ pkg.price }}</b></span>
              <span>成本 <b>${{ pkg.base_cost }}</b></span>
              <span>利潤 <b :class="{ loss: packageProfit(pkg) < 0 }">${{ packageProfit(pkg) }}</b></span>
            </div>
            <div class="package-rules">
              <span>{{ pkg.category }}</span>
              <span>{{ pkg.expiry_years > 0 ? `有效期 +${pkg.expiry_years}年` : '不延長有效期' }}</span>
              <span v-if="pkg.apply_new_customer_discount">新客 -${{ pkg.new_customer_discount }}</span>
              <span v-if="pkg.apply_referral_cost">轉介成本 +${{ pkg.referral_cost }}</span>
              <span v-if="pkg.force_profit !== null">固定利潤 ${{ pkg.force_profit }}</span>
            </div>
          </div>
          <div class="package-actions">
            <button class="edit-btn" @click="openEditPackage(pkg)">修改</button>
            <button class="toggle-btn" @click="togglePackage(pkg)">{{ pkg.is_active ? '停用' : '啟用' }}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">🔒 修改帳號密碼</div>
      <p class="desc">若要更改密碼，請在下方輸入新密碼並點擊更新。</p>
      <input type="password" class="modern-inp" v-model="newPassword" placeholder="輸入新密碼 (至少 6 位)">
      <button class="btn-save btn-pwd" @click="updatePassword" :disabled="loadingPwd">{{ loadingPwd ? '正在更新...' : '更新密碼' }}</button>
    </div>

    <div class="card logout-card">
      <div class="section-title" style="color:#e11d48;">🚪 帳號安全</div>
      <button class="btn-logout" @click="handleLogout">登出系統</button>
    </div>

    <div v-if="packageEditorOpen" class="editor-overlay" @click.self="packageEditorOpen = false">
      <div class="editor-modal">
        <div class="editor-head">
          <strong>{{ editingPackage?.id ? '修改套票' : '新增套票' }}</strong>
          <button @click="packageEditorOpen = false">✕</button>
        </div>

        <div class="editor-scroll" v-if="editingPackage">
          <div class="grid-2 compact-grid">
            <div><label>Emoji</label><input class="modern-inp" v-model="editingPackage.emoji"></div>
            <div><label>排序</label><input class="modern-inp" type="number" v-model.number="editingPackage.sort_order"></div>
          </div>
          <label>名稱</label><input class="modern-inp" v-model="editingPackage.label" placeholder="例如：10點套票">
          <label>系統代碼</label><input class="modern-inp" v-model="editingPackage.package_key" :disabled="Boolean(editingPackage.id)">

          <div class="grid-3">
            <div><label>售價</label><input class="modern-inp" type="number" step="0.01" v-model.number="editingPackage.price"></div>
            <div><label>成本</label><input class="modern-inp" type="number" step="0.01" v-model.number="editingPackage.base_cost"></div>
            <div><label>目前利潤</label><div class="readonly-profit" :class="{ loss: editorProfit < 0 }">${{ editorProfit }}</div></div>
          </div>

          <div class="grid-2">
            <div><label>交易分類</label><select class="modern-inp" v-model="editingPackage.category"><option>運動套票</option><option>試堂</option><option>贈堂</option><option>積分兌換</option></select></div>
            <div><label>收入 / 支出模式</label><select class="modern-inp" v-model="editingPackage.transaction_mode"><option value="auto">自動判斷</option><option value="income">固定收入</option><option value="expense">固定支出</option></select></div>
          </div>

          <div class="grid-2">
            <div><label>固定利潤（留空＝售價-成本）</label><input class="modern-inp" type="number" step="0.01" v-model="editingPackage.force_profit" placeholder="自動"></div>
            <div><label>有效期增加（年）</label><input class="modern-inp" type="number" min="0" v-model.number="editingPackage.expiry_years"></div>
          </div>

          <div class="toggle-list">
            <label><input type="checkbox" v-model="editingPackage.increment_pkg_count"> 購買後增加買卡次數</label>
            <label><input type="checkbox" v-model="editingPackage.force_income_when_zero"> $0 項目仍記作收入（VIP 30點類型）</label>
            <label><input type="checkbox" v-model="editingPackage.apply_new_customer_discount"> 套用新客首次買卡扣減</label>
          </div>
          <div v-if="editingPackage.apply_new_customer_discount"><label>新客扣減金額</label><input class="modern-inp" type="number" step="0.01" v-model.number="editingPackage.new_customer_discount"></div>

          <div class="toggle-list"><label><input type="checkbox" v-model="editingPackage.apply_referral_cost"> 套用轉介紹規則</label></div>
          <div v-if="editingPackage.apply_referral_cost" class="grid-2">
            <div><label>轉介紹額外成本</label><input class="modern-inp" type="number" step="0.01" v-model.number="editingPackage.referral_cost"></div>
            <div><label>轉介紹售價覆蓋（留空＝原價）</label><input class="modern-inp" type="number" step="0.01" v-model="editingPackage.referral_price_override" placeholder="例如試堂填 0"></div>
          </div>

          <label>Excel 自動識別關鍵字</label>
          <textarea class="modern-inp keywords-box" v-model="keywordsInput" placeholder="例如：運動10點, 10點套票, 10點"></textarea>
          <p class="desc">可用逗號或換行分隔。快速匯入可用同一份關鍵字設定做自動配對。</p>
        </div>

        <div class="editor-actions">
          <button class="cancel-btn" @click="packageEditorOpen = false">取消</button>
          <button class="save-package-btn" @click="savePackage" :disabled="savingPackage">{{ savingPackage ? '儲存中…' : '儲存套票設定' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page{padding:20px;background:#f8fafc;min-height:100vh;padding-bottom:120px}.page-title{font-weight:900;font-size:24px;margin-bottom:20px;color:#1e293b}.card{background:#fff;padding:20px;border-radius:16px;border:1px solid #e2e8f0;margin-bottom:20px}.info-card{border-left:5px solid #4f46e2}.email-display{font-size:18px;font-weight:800;color:#4f46e2;margin:5px 0}.section-title{font-size:16px;font-weight:900;color:#1e293b;margin-bottom:10px}.desc{font-size:12px;color:#64748b;font-weight:600;margin:0 0 15px}.modern-inp{width:100%;box-sizing:border-box;border:2px solid #f1f5f9;padding:12px;border-radius:12px;font-weight:700;color:#1e293b;outline:none;margin-bottom:12px;font-size:16px;background:#fff}.modern-inp:focus{border-color:#4f46e2}.btn-save{width:100%;background:#1e293b;color:#fff;border:0;padding:12px;border-radius:12px;font-weight:800}.btn-pwd{background:#4f46e2;margin-top:5px}.logout-card{border-color:#fecdd3;background:#fff1f2}.btn-logout{width:100%;background:#fff;color:#e11d48;border:2px solid #e11d48;padding:12px;border-radius:12px;font-weight:800}.package-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.btn-add-package{border:0;background:#4f46e2;color:#fff;border-radius:12px;padding:10px 13px;font-weight:900;white-space:nowrap}.package-list{display:flex;flex-direction:column;gap:10px}.package-row{border:1px solid #e2e8f0;border-radius:16px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}.package-row.disabled{opacity:.55;background:#f8fafc}.package-main{min-width:0;flex:1}.package-name{font-size:16px;font-weight:900;color:#1e293b}.package-money,.package-rules{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px}.package-money span{background:#f8fafc;padding:5px 8px;border-radius:8px;font-size:12px;color:#64748b;font-weight:700}.package-money b{color:#0f172a}.package-money b.loss,.readonly-profit.loss{color:#e11d48}.package-rules span{font-size:10px;background:#eef2ff;color:#4f46e2;padding:4px 7px;border-radius:999px;font-weight:800}.package-actions{display:flex;gap:7px;flex-shrink:0}.package-actions button{border:0;border-radius:10px;padding:8px 10px;font-weight:800}.edit-btn{background:#eef2ff;color:#4f46e2}.toggle-btn{background:#f1f5f9;color:#475569}.package-loading{padding:20px;text-align:center;color:#64748b}.editor-overlay{position:fixed;inset:0;z-index:2147483200;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:5vh 5vw}.editor-modal{width:min(760px,90vw);max-height:90dvh;background:#fff;border-radius:22px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 80px rgba(15,23,42,.25)}.editor-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #e2e8f0;font-size:18px}.editor-head button{border:0;background:#f1f5f9;width:34px;height:34px;border-radius:50%}.editor-scroll{overflow-y:auto;padding:16px 18px;overscroll-behavior:contain}.editor-scroll>label,.editor-scroll .grid-2 label,.editor-scroll .grid-3 label{display:block;font-size:12px;color:#475569;font-weight:900;margin-bottom:5px}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.compact-grid{grid-template-columns:110px 1fr}.readonly-profit{height:46px;border-radius:12px;background:#ecfdf5;color:#047857;display:flex;align-items:center;padding:0 12px;font-weight:900}.toggle-list{display:grid;gap:9px;background:#f8fafc;border-radius:14px;padding:12px;margin-bottom:12px}.toggle-list label{font-size:13px!important;color:#334155!important;margin:0!important}.toggle-list input{margin-right:7px}.keywords-box{min-height:78px;resize:vertical}.editor-actions{display:flex;gap:10px;padding:12px 18px;border-top:1px solid #e2e8f0}.editor-actions button{border:0;border-radius:12px;padding:12px;font-weight:900}.cancel-btn{background:#f1f5f9;color:#475569;flex:1}.save-package-btn{background:#4f46e2;color:#fff;flex:2}.save-package-btn:disabled{opacity:.55}
@media(max-width:600px){.page{padding:14px 12px 110px}.package-head{flex-direction:column}.btn-add-package{width:100%}.package-row{align-items:flex-start;flex-direction:column}.package-actions{width:100%}.package-actions button{flex:1}.editor-overlay{padding:5dvh 5vw}.editor-modal{width:90vw;max-height:90dvh}.grid-2,.grid-3,.compact-grid{grid-template-columns:1fr}.editor-actions{padding-bottom:calc(12px + env(safe-area-inset-bottom))}}
</style>
