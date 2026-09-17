<script setup>
import { ref, computed, onMounted, watch } from 'vue' 
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

const MOVEMENT_BRANCHES = ['全部', '觀塘', '中環', '佐敦']
const getSavedMovementBranch = () => {
  try {
    const saved = localStorage.getItem('fitwork:movement-filter-branch')
    return MOVEMENT_BRANCHES.includes(saved) ? saved : '全部'
  } catch {
    return '全部'
  }
}

const searchClient = ref('')
const filterBranch = ref(getSavedMovementBranch())
const selectedClient = ref(null)
const selectedPkg = ref('pkg_10')
const isNewCustomer = ref(false)
const isReferral = ref(false)
const showDropdown = ref(false)

watch(filterBranch, (branch) => {
  if (!MOVEMENT_BRANCHES.includes(branch)) return
  try { localStorage.setItem('fitwork:movement-filter-branch', branch) } catch {}
})

// 🟢 終極防護：鎖死香港時區
const getLocalHKDate = () => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Hong_Kong', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  }).format(new Date());
}

const checkoutDate = ref(getLocalHKDate())

const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat'])

// 🟢 價格與成本大更新
const packages = {
  'trial': { name: '🧪 試堂 ($98)', price: 98, baseCost: 52 }, 
  'pkg_10': { name: '🎟️ 10點套票 ($880)', price: 880, baseCost: 399 }, // 成本 264(30%) + 135(產品) = 399
  'pkg_35': { name: '👑 35點套票 ($2640)', price: 2640, baseCost: 1316.5 }, // 成本 844(30%) + 472.5(產品) = 1316.5
  'pkg_vip30': { name: '🌟 VIP點數30點 ($0)', price: 0, baseCost: 1155 }, // 成本 405+750
  'referral_free': { name: '🤝 介紹朋友贈堂 ($0)', price: 0, baseCost: 53 }, // 成本更新為 53
  'exp_30': { name: '🎟️ 體驗卡30人次', price: 0, baseCost: 750 },
  'pkg_1_free': { name: '🆓 新增1格 ($0)', price: 0, baseCost: 25.5 }, // 利潤 -25.5 -> 成本 25.5
  'redeem_50': { name: '🎁 50積分兌換 ($0)', price: 0, baseCost: 399 }, // 利潤 -399 -> 成本 399
  'redeem_100': { name: '🎁 100積分兌換 ($0)', price: 0, baseCost: 1197 } // 利潤 -1197 -> 成本 1197
}

const clientOptions = computed(() => {
  const q = searchClient.value.toLowerCase()
  if (!q) return []
  return store.clients.filter(c => {
    const matchKeyword = c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
    const matchBranch = filterBranch.value === '全部' || c.branch === filterBranch.value
    return matchKeyword && matchBranch
  }).slice(0, 5)
})

function selectClient(c) {
  selectedClient.value = c
  searchClient.value = c.name
  showDropdown.value = false
  isNewCustomer.value = c.status === 'prospect'
}

// 🚀 極速新增專用變數
const showQuickAddModal = ref(false)
const quickNewClient = ref({ name: '', phone: '', branch: '觀塘' })

async function handleQuickAdd() {
  if (!quickNewClient.value.name || !quickNewClient.value.phone) return alert('請填寫姓名及電話！')
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const dataToInsert = { 
    name: quickNewClient.value.name,
    phone: quickNewClient.value.phone,
    branch: quickNewClient.value.branch,
    source: '其他', 
    status: 'prospect', // 預設試堂
    join_date: getLocalHKDate(),
    own_email: user.email,
    user_id: user.id 
  }

  // 加上 .select() 才能拿回剛新增的資料
  const { data, error } = await supabase.from('clients').insert([dataToInsert]).select()
  
  if (error) return alert('新增失敗: ' + error.message)
  
  await store.syncAll() 

  // 自動選取剛剛極速新增的客人
  if (data && data.length > 0) {
    selectClient(data[0]) 
  }

  showQuickAddModal.value = false
  quickNewClient.value = { name: '', phone: '', branch: '觀塘' }
  setTimeout(() => alert('✅ 極速新增成功，已自動為你選取客戶！'), 100)
}

onMounted(() => {
  if (store.quickActionClient) {
    const targetName = store.quickActionClient
    store.quickActionClient = null 
    const foundClient = store.clients.find(c => c.name === targetName)
    if (foundClient) selectClient(foundClient) 
    else searchClient.value = targetName 
  }
})

const exCalc = computed(() => {
  let p = packages[selectedPkg.value].price
  let c = packages[selectedPkg.value].baseCost
  
  if (isReferral.value && selectedPkg.value !== 'referral_free') {
    c += 53 // 🟢 更新：轉介紹成本更新為 53
    if (selectedPkg.value === 'trial') p = 0
  }
  
  if (isNewCustomer.value && selectedPkg.value !== 'trial' && selectedPkg.value !== 'referral_free') {
    p -= 98
  }
  
  // 🟢 特殊邏輯：VIP點數30點，因為其他地方已收利潤，此處帳面利潤強制為 0
  let calculatedProfit = p - c
  if (selectedPkg.value === 'pkg_vip30') {
    calculatedProfit = 0
  }
  
  return { price: p, cost: c, profit: calculatedProfit }
})

async function handleCheckout(staff) {
  if (!selectedClient.value) return alert('請先搜尋並選擇客戶！')

  const { data: authData } = await supabase.auth.getSession()
  const userEmail = authData?.session?.user?.email
  if (!userEmail) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const calc = exCalc.value
  const branch = selectedClient.value.branch || '觀塘'
  const pkgName = packages[selectedPkg.value].name.split(' ')[1] || packages[selectedPkg.value].name

  let categoryStr = '運動套票'
  if (selectedPkg.value === 'trial') categoryStr = '試堂'
  if (selectedPkg.value === 'referral_free' || selectedPkg.value === 'pkg_1_free') categoryStr = '贈堂'
  if (selectedPkg.value === 'redeem_50' || selectedPkg.value === 'redeem_100') categoryStr = '積分兌換'

  const [yyyy, mm, dd] = checkoutDate.value.split('-')
  const now = new Date()
  const txnDate = new Date(yyyy, mm - 1, dd, now.getHours(), now.getMinutes(), now.getSeconds())
  const fullIsoCreatedAt = txnDate.toISOString()

// ==========================================
  // 🟢 核心邏輯修正：免費贈堂轉化為實質「支出」
  // ==========================================
  let finalType = 'income'
  let finalAmount = calc.price
  let finalProfit = calc.profit

  // 💡 如果客人付 $0，但我們有成本支出，直接記為「支出 (expense)」
  // 🟢 新增：VIP 30點是零售附贈品，即使 $0 也要維持 income 狀態，總覽才會計算舖頭 750！
  if (calc.price === 0 && calc.cost > 0 && selectedPkg.value !== 'pkg_vip30') {
    finalType = 'expense'
    finalAmount = calc.cost
    finalProfit = -calc.cost
  }

  const { error } = await supabase.from('transactions').insert([{
    type: finalType,
    category: categoryStr,
    amount: finalAmount,
    cost: calc.cost,
    profit: finalProfit,
    client_name: selectedClient.value.name,
    staff: staff,
    branch: branch,
    created_at: fullIsoCreatedAt,
    own_email: userEmail,
    note: packages[selectedPkg.value].name
  }])

  if (error) return alert('結帳失敗: ' + error.message)

  if (!['trial', 'referral_free', 'pkg_1_free', 'redeem_50', 'redeem_100'].includes(selectedPkg.value)) {
    const currentCount = selectedClient.value.pkg_count || 0
    const purchaseDate = checkoutDate.value
    let newJoinDate = selectedClient.value.join_date
    if (!newJoinDate || purchaseDate < newJoinDate) newJoinDate = purchaseDate

    const expiry = new Date(purchaseDate)
    expiry.setFullYear(expiry.getFullYear() + 1)
    const expiryDate = expiry.toISOString().split('T')[0]

    await supabase.from('clients').update({
      status: 'active',
      pkg_count: currentCount + 1,
      join_date: newJoinDate,
      expiry_date: expiryDate
    }).eq('id', selectedClient.value.id)
  }

  alert(`✅ 結帳成功！\n客戶：${selectedClient.value.name}\n項目：${packages[selectedPkg.value].name}\n實收：$${finalAmount}\n成本：$${calc.cost}\n利潤：$${finalProfit}`)

  selectedClient.value = null
  searchClient.value = ''
  isNewCustomer.value = false
  isReferral.value = false
  store.syncAll()
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">🏋️ 運動套票收銀</h2>

    <div class="glass-card top-card">
      <div class="form-item">
        <label>🎟️ 選擇套票</label>
        <select v-model="selectedPkg" class="modern-select">
          <option v-for="(pkg, key) in packages" :key="key" :value="key">{{ pkg.name }}</option>
        </select>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>🏢 客戶分店篩選</label>
        <div class="branch-tabs">
          <button v-for="b in MOVEMENT_BRANCHES" :key="b" type="button" :class="{ active: filterBranch === b }" @click="filterBranch = b">{{ b }}</button>
        </div>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>👤 搜尋客戶</label>
        <div class="search-rel">
          <input v-model="searchClient" @focus="showDropdown = true" class="modern-inp" placeholder="輸入姓名或電話...">
          <div v-if="showDropdown && searchClient" class="drop-menu">
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              <span>{{ c.name }} <small>({{ c.phone }})</small></span>
              <span>{{ c.branch }}</span>
            </div>
            <div v-if="clientOptions.length === 0" class="drop-item" @click="showQuickAddModal = true">➕ 找不到？極速新增客戶</div>
          </div>
        </div>
        <div v-if="selectedClient" class="selected-badge">✅ 已選：{{ selectedClient.name }}｜{{ selectedClient.branch }}</div>
      </div>

      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item">
          <label>📅 購買日期</label>
          <input type="date" v-model="checkoutDate" class="modern-inp">
        </div>
        <div class="form-item">
          <label>💰 計算結果</label>
          <div class="calc-box">
            <b>$ {{ exCalc.price }}</b>
            <small>成本 ${{ exCalc.cost }}｜利潤 ${{ exCalc.profit }}</small>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:15px;">
        <label class="toggle-card"><input type="checkbox" v-model="isNewCustomer"><span>🆕 新客優惠</span></label>
        <label class="toggle-card"><input type="checkbox" v-model="isReferral"><span>🤝 轉介紹</span></label>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>💳 選擇收款人</label>
        <div class="payee-buttons">
          <button v-for="(staff, index) in staffList" :key="staff" type="button" class="payee-btn" :class="'style-' + (index % 2)" @click="handleCheckout(staff)">✅ {{ staff }} 收款</button>
        </div>
      </div>
    </div>

    <div v-if="showQuickAddModal" class="modal-overlay" @click.self="showQuickAddModal = false">
      <div class="center-modal action-modal" style="max-width:350px;">
        <div class="m-header">⚡ 極速新增客戶<button class="close-x" @click="showQuickAddModal = false">✕</button></div>
        <div class="form-item"><label>姓名 *</label><input v-model="quickNewClient.name" class="modern-inp" placeholder="請輸入姓名"></div>
        <div class="form-item" style="margin-top:12px;"><label>電話 *</label><input v-model="quickNewClient.phone" type="tel" inputmode="tel" class="modern-inp" placeholder="請輸入電話"></div>
        <div class="form-item" style="margin-top:12px;"><label>所屬分店</label><select v-model="quickNewClient.branch" class="modern-select"><option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option></select></div>
        <button class="payee-btn style-0" style="width:100%;margin-top:18px;" @click="handleQuickAdd">✅ 確認新增並選取</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 10px 15px !important; padding-bottom: calc(120px + env(safe-area-inset-bottom)); background:#f8fafc; min-height:100vh; }
.page-title { font-weight:900; font-size:22px; color:#1e293b; margin:0 0 10px !important; }
.glass-card { background:white; padding:20px; border-radius:20px; margin-bottom:20px; border:1px solid #e2e8f0; }
.form-item label { display:block; margin-bottom:8px; font-weight:800; font-size:13px; color:#1e293b; }
.modern-inp,.modern-select { width:100%; border:1px solid #cbd5e1; padding:12px; border-radius:10px; font-weight:700; color:#1e293b; outline:none; background:#f8fafc; }
.branch-tabs { display:flex; gap:8px; overflow-x:auto; }
.branch-tabs button { border:0; border-radius:999px; padding:9px 14px; background:#e2e8f0; color:#64748b; font-weight:900; white-space:nowrap; }
.branch-tabs button.active { background:#4f46e2; color:#fff; }
.search-rel { position:relative; }
.drop-menu { position:absolute; top:100%; left:0; width:100%; background:#fff; border:1px solid #e2e8f0; border-radius:12px; z-index:100; box-shadow:0 10px 25px rgba(0,0,0,.1); overflow:hidden; }
.drop-item { padding:14px 15px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-weight:700; display:flex; justify-content:space-between; gap:8px; }
.selected-badge { background:#eef2ff; color:#4f46e2; padding:10px 14px; border-radius:10px; margin-top:12px; font-weight:800; font-size:14px; }
.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.calc-box { min-height:44px; padding:8px 10px; border-radius:10px; background:#eef2ff; color:#312e81; display:flex; flex-direction:column; justify-content:center; }
.calc-box small { margin-top:2px; color:#64748b; font-weight:700; }
.toggle-card { display:flex !important; align-items:center; gap:8px; min-height:44px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; }
.payee-buttons { display:flex; gap:10px; }
.payee-btn { flex:1; min-height:48px; border:0; border-radius:14px; color:#fff; font-weight:900; font-size:16px; }
.style-0 { background:linear-gradient(135deg,#3b82f6,#2563eb); }
.style-1 { background:linear-gradient(135deg,#ec4899,#db2777); }
.modal-overlay { position:fixed; inset:0; z-index:999; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding:16px; }
.center-modal { width:100%; background:#fff; padding:20px; border-radius:20px; }
.m-header { display:flex; justify-content:space-between; align-items:center; font-weight:900; font-size:18px; margin-bottom:16px; }
.close-x { width:32px; height:32px; border:0; border-radius:50%; background:#f1f5f9; color:#475569; font-weight:900; }
@media(max-width:600px){.glass-card{padding:14px}.grid-2{grid-template-columns:1fr}.payee-buttons{flex-direction:column}}
</style>
