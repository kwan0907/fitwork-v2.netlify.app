<script setup>
import { computed, onMounted, ref } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import {
  calculateMovementPackage,
  loadMovementPackages,
  packageDisplayName
} from '../movementPackages'

const store = useMainStore()

const searchClient = ref('')
const filterBranch = ref('全部')
const selectedClient = ref(null)
const selectedPkg = ref('pkg_10')
const isNewCustomer = ref(false)
const isReferral = ref(false)
const showDropdown = ref(false)
const packageRows = ref([])
const packageLoading = ref(true)
const packageError = ref('')

const getLocalHKDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong',
  year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date())

const checkoutDate = ref(getLocalHKDate())
const staffList = computed(() => store.settings?.payees?.length ? store.settings.payees : ['kwan', 'Cat'])

const packages = computed(() => {
  const map = {}
  for (const pkg of packageRows.value) map[pkg.package_key] = pkg
  return map
})

const selectedPackage = computed(() => packages.value[selectedPkg.value] || packageRows.value[0] || null)

const clientOptions = computed(() => {
  const q = searchClient.value.trim().toLowerCase()
  if (!q) return []
  return store.clients.filter(c => {
    const name = String(c.name || '').toLowerCase()
    const phone = String(c.phone || '').replace(/\s+/g, '')
    const needle = q.replace(/\s+/g, '')
    const matchKeyword = name.includes(q) || phone.includes(needle)
    const matchBranch = filterBranch.value === '全部' || c.branch === filterBranch.value
    return matchKeyword && matchBranch
  }).slice(0, 8)
})

function selectClient(c) {
  selectedClient.value = c
  searchClient.value = c.name
  showDropdown.value = false
  isNewCustomer.value = String(c.status || '').toLowerCase() === 'prospect'
}

const showQuickAddModal = ref(false)
const quickNewClient = ref({ name: '', phone: '', branch: '觀塘' })

async function handleQuickAdd() {
  if (!quickNewClient.value.name || !quickNewClient.value.phone) return alert('請填寫姓名及電話！')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const dataToInsert = {
    name: quickNewClient.value.name.trim(),
    phone: quickNewClient.value.phone.trim(),
    branch: quickNewClient.value.branch,
    source: '廣告',
    status: 'prospect',
    join_date: getLocalHKDate(),
    owner_email: user.email,
    own_email: user.email,
    user_id: user.id
  }

  const { data, error } = await supabase.from('clients').insert([dataToInsert]).select().single()
  if (error) return alert('新增失敗: ' + error.message)

  await store.syncAll()
  selectClient(data)
  showQuickAddModal.value = false
  quickNewClient.value = { name: '', phone: '', branch: '觀塘' }
}

async function refreshPackages() {
  packageLoading.value = true
  packageError.value = ''
  try {
    packageRows.value = await loadMovementPackages({ includeInactive: false, ensureDefaults: true })
    if (!packageRows.value.some(p => p.package_key === selectedPkg.value)) {
      selectedPkg.value = packageRows.value[0]?.package_key || ''
    }
  } catch (err) {
    console.error('movement package load failed', err)
    packageError.value = err?.message || '套票設定讀取失敗'
  } finally {
    packageLoading.value = false
  }
}

onMounted(async () => {
  await refreshPackages()
  if (store.quickActionClient) {
    const targetName = store.quickActionClient
    store.quickActionClient = null
    const foundClient = store.clients.find(c => c.name === targetName)
    if (foundClient) selectClient(foundClient)
    else searchClient.value = targetName
  }
})

const exCalc = computed(() => {
  if (!selectedPackage.value) return { price: 0, cost: 0, profit: 0, type: 'income', amount: 0 }
  return calculateMovementPackage(selectedPackage.value, {
    isNewCustomer: isNewCustomer.value,
    isReferral: isReferral.value
  })
})

function addYearsYmd(ymd, years) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const target = new Date(y, m - 1, d)
  target.setFullYear(target.getFullYear() + Number(years || 0))
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

async function handleCheckout(staff) {
  if (!selectedClient.value) return alert('請先搜尋並選擇客戶！')
  if (!selectedPackage.value) return alert('請先選擇套票！')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const pkg = selectedPackage.value
  const calc = exCalc.value
  const branch = selectedClient.value.branch || '觀塘'
  const [yyyy, mm, dd] = checkoutDate.value.split('-')
  const now = new Date()
  const txnDate = new Date(Number(yyyy), Number(mm) - 1, Number(dd), now.getHours(), now.getMinutes(), now.getSeconds())

  const notes = [`售出 ${pkg.label}`]
  if (isNewCustomer.value && pkg.apply_new_customer_discount) notes.push(`(新客扣${pkg.new_customer_discount})`)
  if (isReferral.value && pkg.apply_referral_cost) notes.push('(轉介)')

  const txnPayload = {
    type: calc.type,
    category: pkg.category,
    amount: calc.amount,
    cost: calc.cost,
    profit: calc.profit,
    branch,
    client_id: selectedClient.value.id,
    client_name: selectedClient.value.name,
    staff,
    handled_by: staff,
    created_at: txnDate.toISOString(),
    owner_email: user.email,
    own_email: user.email,
    user_id: user.id,
    is_new_client: Boolean(isNewCustomer.value),
    is_renewal: !isNewCustomer.value,
    is_referral: Boolean(isReferral.value),
    is_trial: pkg.category === '試堂' || pkg.package_key === 'trial',
    note: notes.join(' ')
  }

  const { error: txnError } = await supabase.from('transactions').insert([txnPayload])
  if (txnError) return alert('結帳失敗: ' + txnError.message)

  if (pkg.expiry_years > 0 || pkg.increment_pkg_count) {
    let finalJoinDate = selectedClient.value.join_date
    if (!finalJoinDate || checkoutDate.value < finalJoinDate) finalJoinDate = checkoutDate.value

    const clientUpdate = {
      status: 'active',
      join_date: finalJoinDate
    }
    if (pkg.increment_pkg_count) clientUpdate.pkg_count = Number(selectedClient.value.pkg_count || 0) + 1
    if (pkg.expiry_years > 0) clientUpdate.expiry_date = addYearsYmd(checkoutDate.value, pkg.expiry_years)

    const { error: clientError } = await supabase.from('clients').update(clientUpdate).eq('id', selectedClient.value.id)
    if (clientError) {
      alert(`✅ 購買紀錄已寫入，但客戶資料更新失敗：${clientError.message}`)
    }
  }

  await store.syncAll()

  let msg = `✅ 結帳成功！\n日期: ${checkoutDate.value}\n處理人: ${staff}\n項目: ${pkg.label}`
  if (calc.type === 'income') msg += `\n\n💰 營業額: $${calc.price}\n淨利潤: $${calc.profit}`
  else msg += `\n\n🎁 此項目記作成本支出\n支出: -$${calc.cost}\n利潤: $${calc.profit}`
  alert(msg)

  selectedClient.value = null
  searchClient.value = ''
  isNewCustomer.value = false
  isReferral.value = false
}
</script>

<template>
  <div class="page movement-dynamic-page">
    <div class="page-head">
      <div>
        <h2 class="page-title">運動套票收銀</h2>
        <div class="sync-note">套票價格與規則由「設定」即時同步</div>
      </div>
      <button class="refresh-btn" @click="refreshPackages" :disabled="packageLoading">↻</button>
    </div>

    <div class="glass-card">
      <div class="form-item">
        <label>1. 選擇套票類型</label>
        <div v-if="packageLoading" class="loading-box">正在讀取套票設定…</div>
        <div v-else-if="packageError" class="error-box">{{ packageError }}</div>
        <select v-else v-model="selectedPkg" class="modern-select highlight-sel">
          <option v-for="pkg in packageRows" :key="pkg.id || pkg.package_key" :value="pkg.package_key">
            {{ packageDisplayName(pkg) }}
          </option>
        </select>
      </div>

      <div class="form-item section-gap">
        <label>2. 搜尋客戶 (必填) <span class="required">*</span></label>
        <div class="branch-tabs">
          <button v-for="b in ['全部','觀塘','中環','佐敦']" :key="b" :class="{ active: filterBranch === b }" @click="filterBranch = b">
            {{ b === '全部' ? '🌍' : '📍' }} {{ b }}
          </button>
        </div>

        <div class="search-rel">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="showDropdown = true" @input="showDropdown = true">
          <div v-if="showDropdown && searchClient" class="drop-menu">
            <button class="close-search" @click="showDropdown = false">✕ 關閉搜尋</button>
            <button v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              <span><strong>{{ c.name }}</strong> <small>({{ c.phone }})</small></span>
              <span class="branch-badge">📍 {{ c.branch || '未知' }}</span>
            </button>
            <button v-if="clientOptions.length === 0" class="quick-add-entry" @click="showQuickAddModal = true">
              ＋ 找不到客戶？極速新增
            </button>
          </div>
        </div>

        <div v-if="selectedClient" class="selected-client">
          <div>
            <strong>{{ selectedClient.name }}</strong>
            <small>{{ selectedClient.phone }} · {{ selectedClient.branch }}</small>
          </div>
          <button @click="selectedClient = null; searchClient = ''">重新選擇</button>
        </div>
      </div>

      <div class="form-item section-gap">
        <label>3. 購買日期</label>
        <input type="date" class="modern-inp" v-model="checkoutDate">
      </div>
    </div>

    <div class="glass-card options-card" v-if="selectedPackage">
      <label class="switch-row">
        <div>
          <strong>🆕 新客首次買卡優惠</strong>
          <small v-if="selectedPackage.apply_new_customer_discount">此項目會自動扣減 ${{ selectedPackage.new_customer_discount }}</small>
          <small v-else>此項目沒有新客扣減</small>
        </div>
        <input type="checkbox" v-model="isNewCustomer" :disabled="!selectedPackage.apply_new_customer_discount">
      </label>

      <label class="switch-row">
        <div>
          <strong>🤝 轉介紹優惠 / 免費試堂</strong>
          <small v-if="selectedPackage.apply_referral_cost">成本額外 +${{ selectedPackage.referral_cost }}{{ selectedPackage.referral_price_override !== null ? `；售價改為 $${selectedPackage.referral_price_override}` : '' }}</small>
          <small v-else>此項目沒有轉介紹額外規則</small>
        </div>
        <input type="checkbox" v-model="isReferral" :disabled="!selectedPackage.apply_referral_cost">
      </label>
    </div>

    <div class="glass-card calc-card" v-if="selectedPackage">
      <div class="calc-title">📊 即時計算</div>
      <div class="calc-grid">
        <div><span>客戶付款</span><b>${{ exCalc.price }}</b></div>
        <div><span>成本</span><b>${{ exCalc.cost }}</b></div>
        <div><span>利潤</span><b :class="{ negative: exCalc.profit < 0 }">${{ exCalc.profit }}</b></div>
      </div>
      <div class="rule-note">
        {{ selectedPackage.category }} · {{ exCalc.type === 'income' ? '收入' : '支出' }}
        <template v-if="selectedPackage.expiry_years > 0"> · 有效期 +{{ selectedPackage.expiry_years }} 年</template>
      </div>
    </div>

    <div class="glass-card checkout-card">
      <div class="checkout-title">4. 選擇收款人並結帳</div>
      <div class="staff-grid">
        <button v-for="staff in staffList" :key="staff" class="staff-btn" @click="handleCheckout(staff)" :disabled="!selectedClient || !selectedPackage">
          ✅ {{ staff }} 收款
        </button>
      </div>
    </div>

    <div v-if="showQuickAddModal" class="quick-overlay" @click.self="showQuickAddModal = false">
      <div class="quick-modal">
        <div class="quick-head">＋ 極速新增客戶 <button @click="showQuickAddModal = false">✕</button></div>
        <label>姓名</label><input class="modern-inp" v-model="quickNewClient.name">
        <label>電話</label><input class="modern-inp" v-model="quickNewClient.phone" inputmode="tel">
        <label>分店</label>
        <select class="modern-select" v-model="quickNewClient.branch">
          <option>觀塘</option><option>中環</option><option>佐敦</option>
        </select>
        <button class="quick-confirm" @click="handleQuickAdd">新增並選取</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.movement-dynamic-page{padding:20px 20px 180px;background:#f8fafc;min-height:100vh;color:#1e293b}.page-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.page-title{font-size:28px;font-weight:950;margin:0}.sync-note{font-size:12px;color:#64748b;font-weight:700;margin-top:5px}.refresh-btn{width:42px;height:42px;border-radius:14px;border:1px solid #dbe3ef;background:#fff;font-size:22px;color:#4f46e2}.glass-card{background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:22px;margin-bottom:16px;box-shadow:0 12px 32px rgba(15,23,42,.05)}.form-item label,.checkout-title{display:block;font-size:15px;font-weight:900;color:#475569;margin-bottom:10px}.section-gap{margin-top:20px}.required{color:#ef4444}.modern-inp,.modern-select{width:100%;box-sizing:border-box;border:2px solid #dbe3ef;background:#fff;border-radius:16px;padding:14px 16px;font-size:16px;font-weight:800;color:#1e293b;outline:none}.highlight-sel{border-color:#818cf8;background:#eef2ff;color:#4f46e2;font-size:18px}.branch-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.branch-tabs button{border:1px solid #dbe3ef;background:#fff;border-radius:14px;padding:11px 8px;font-weight:800;color:#64748b}.branch-tabs button.active{background:#eef2ff;border-color:#a5b4fc;color:#4f46e2}.search-rel{position:relative}.drop-menu{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:80;background:#fff;border:1px solid #dbe3ef;border-radius:16px;box-shadow:0 18px 45px rgba(15,23,42,.15);overflow:hidden}.drop-item,.close-search,.quick-add-entry{width:100%;border:0;background:#fff;padding:12px 14px;text-align:left;display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #eef2f7}.close-search{display:block;text-align:center;color:#ef4444;font-size:12px}.quick-add-entry{display:block;text-align:center;color:#4f46e2;font-weight:900}.branch-badge{font-size:11px;background:#f1f5f9;border-radius:8px;padding:3px 7px;white-space:nowrap}.selected-client{margin-top:12px;padding:12px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:16px;display:flex;align-items:center;justify-content:space-between}.selected-client strong,.selected-client small{display:block}.selected-client small{font-size:12px;color:#64748b;margin-top:3px}.selected-client button{border:0;background:#fff;color:#047857;border-radius:10px;padding:8px 10px;font-weight:800}.switch-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 0;border-bottom:1px dashed #dbe3ef}.switch-row:last-child{border-bottom:0}.switch-row strong,.switch-row small{display:block}.switch-row small{margin-top:4px;color:#64748b;font-size:12px}.switch-row input{width:50px;height:28px;accent-color:#6366f1}.calc-title{font-weight:900;margin-bottom:12px}.calc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.calc-grid>div{background:#f8fafc;border-radius:16px;padding:14px;text-align:center}.calc-grid span,.calc-grid b{display:block}.calc-grid span{font-size:11px;color:#64748b;font-weight:800}.calc-grid b{font-size:21px;margin-top:6px;color:#059669}.calc-grid b.negative{color:#e11d48}.rule-note{text-align:center;color:#64748b;font-size:11px;font-weight:700;margin-top:10px}.staff-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.staff-btn{border:0;border-radius:16px;background:#4f46e2;color:#fff;padding:15px;font-weight:900;font-size:16px}.staff-btn:disabled{opacity:.4}.loading-box,.error-box{border-radius:14px;padding:14px;background:#f8fafc;color:#64748b;font-weight:800}.error-box{background:#fff1f2;color:#be123c}.quick-overlay{position:fixed;inset:0;z-index:200000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px}.quick-modal{width:min(420px,92vw);background:#fff;border-radius:22px;padding:18px}.quick-head{font-size:18px;font-weight:900;display:flex;justify-content:space-between;margin-bottom:16px}.quick-head button{border:0;background:#f1f5f9;border-radius:50%;width:34px;height:34px}.quick-modal label{display:block;font-size:12px;font-weight:900;color:#64748b;margin:10px 0 5px}.quick-confirm{width:100%;margin-top:14px;border:0;border-radius:14px;background:#4f46e2;color:#fff;padding:14px;font-weight:900}
@media(max-width:600px){.movement-dynamic-page{padding:14px 12px 150px}.page-title{font-size:24px}.glass-card{padding:16px;border-radius:20px}.branch-tabs{grid-template-columns:repeat(2,1fr)}.calc-grid{gap:6px}.calc-grid>div{padding:10px 6px}.calc-grid b{font-size:17px}}
</style>
