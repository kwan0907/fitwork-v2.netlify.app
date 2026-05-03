<script setup>
import { ref, computed, onMounted } from 'vue' 
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

const searchClient = ref('')
const selectedClient = ref(null)
const selectedPkg = ref('pkg_10')
const isNewCustomer = ref(false)
const isReferral = ref(false)
const showDropdown = ref(false)

// 🟢 終極防護：鎖死香港時區
const getLocalHKDate = () => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Hong_Kong', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  }).format(new Date());
}

const checkoutDate = ref(getLocalHKDate())

const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat'])

const packages = {
  'trial': { name: '🧪 試堂 ($98)', price: 98, baseCost: 52 }, 
  'pkg_10': { name: '🎟️ 10點套票 ($850)', price: 850, baseCost: 385 },
  'pkg_35': { name: '👑 35點套票 ($2550)', price: 2550, baseCost: 1272.5 },
  'pkg_vip30': { name: '🌟 VIP點數30點 ($0)', price: 0, baseCost: 1155 }, // 👈 成本 405+750
  'referral_free': { name: '🤝 介紹朋友贈堂 ($0)', price: 0, baseCost: 52 },
  'exp_30': { name: '🎟️ 體驗卡30人次', price: 0, baseCost: 750 } 
}
const clientOptions = computed(() => {
  const q = searchClient.value.toLowerCase()
  if (!q) return []
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q) || c.phone?.includes(q))).slice(0, 5)
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
    c += 52
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
  if (selectedPkg.value === 'referral_free') categoryStr = '贈堂'

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
  }

  const { error: txnError } = await supabase.from('transactions').insert([{
    type: finalType, 
    category: categoryStr, 
    amount: finalAmount, 
    cost: calc.cost, 
    profit: finalProfit,
    branch: branch, 
    client_id: selectedClient.value.id, 
    client_name: selectedClient.value.name, 
    staff: staff, 
    handled_by: staff,
    created_at: fullIsoCreatedAt,
    own_email: userEmail, 
    note: `售出 ${pkgName} ${isNewCustomer.value && selectedPkg.value !== 'trial' && selectedPkg.value !== 'referral_free' ? '(新客扣98)' : ''} ${isReferral.value && selectedPkg.value !== 'referral_free' ? '(轉介)' : ''}`.trim()
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  if (selectedPkg.value !== 'trial' && selectedPkg.value !== 'referral_free') {
    
    // 🟢 自動化引擎 1：計算一年後嘅到期日 (手動排版避開時差蟲)
    const expiryDate = new Date(checkoutDate.value)
    expiryDate.setFullYear(expiryDate.getFullYear() + 1)
    const y = expiryDate.getFullYear()
    const m = String(expiryDate.getMonth() + 1).padStart(2, '0')
    const d = String(expiryDate.getDate()).padStart(2, '0')
    const newExpiryDateStr = `${y}-${m}-${d}`

    // 🟢 自動化引擎 2：檢查加入日期是否需要「時光倒流」
    let finalJoinDate = selectedClient.value.join_date
    const purchaseDateObj = new Date(checkoutDate.value)
    const currentJoinDateObj = new Date(finalJoinDate || '2100-01-01') // 防呆：如果無日期就當成未來
    
    // 如果客底無加入日期，或者今次買卡日期早過原本個加入日期，就直接覆蓋！
    if (!finalJoinDate || purchaseDateObj < currentJoinDateObj) {
        finalJoinDate = checkoutDate.value
    }

    // 🚀 執行客底資料全面自動更新！
    await supabase.from('clients').update({ 
      status: 'active', 
      pkg_count: (selectedClient.value.pkg_count || 0) + 1,
      join_date: finalJoinDate,        // ✨ 自動對齊第一日
      expiry_date: newExpiryDateStr    // ✨ 自動續命 365 日
    }).eq('id', selectedClient.value.id)
  }

  // 💡 動態提示：讓結帳成功視窗更明確告訴你這是收入還是支出
  let alertMsg = `✅ 結帳成功！\n日期: ${checkoutDate.value}\n處理人: ${staff}\n`
  if (finalType === 'income') {
     alertMsg += `\n💰 營業額: $${calc.price}\n(淨利潤: $${calc.profit})`
  } else {
     alertMsg += `\n🎁 客戶免費贈堂 ($0)\n⚠️ 紀錄為成本支出: -$${calc.cost}`
  }

  alert(alertMsg)
  
  selectedClient.value = null; searchClient.value = ''; isNewCustomer.value = false; isReferral.value = false;
  store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">運動套票收銀</h2>

    <div class="glass-card">
      <div class="form-item"><label>1. 選擇套票類型</label>
        <select v-model="selectedPkg" class="modern-select highlight-sel"><option v-for="(pkg, key) in packages" :key="key" :value="key">{{ pkg.name }}</option></select>
      </div>

      <div class="form-item" style="margin-top:15px;"><label>2. 搜尋客戶 (必填) <span style="color:#ef4444">*</span></label>
        <div class="search-rel">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="showDropdown = true" @input="showDropdown = true">
          <!-- 🚀 改為只要有打字就顯示 Menu -->
          <div v-if="showDropdown && searchClient" class="drop-menu">
            <div style="padding:8px; text-align:center; font-size:12px; color:#ef4444; background:#f8fafc; border-bottom:1px solid #eee; cursor:pointer;" @click="showDropdown = false">✕ 關閉搜尋</div>
            
            <!-- 有結果時顯示客戶列表 -->
            <div v-if="clientOptions.length > 0">
              <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)" style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                <span>{{ c.name }} <span class="sub-text">({{ c.phone }})</span></span>
                <span style="font-size: 10px; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; font-weight: 800; white-space: nowrap;">
                  📍 {{ c.branch || '未知分店' }}
                </span>
              </div>
            </div>

            <!-- 🚀 無結果時顯示極速新增按鈕 -->
            <div v-else style="padding: 15px; text-align: center;">
              <div style="color: #64748b; font-size: 13px; font-weight: 800; margin-bottom: 10px;">找不到此客戶</div>
              <button @click="showQuickAddModal = true; showDropdown = false; quickNewClient.name = isNaN(searchClient) ? searchClient : ''; quickNewClient.phone = !isNaN(searchClient) ? searchClient : ''" style="background: #4f46e2; color: white; border: none; padding: 10px 15px; border-radius: 10px; font-weight: 900; width: 100%; cursor: pointer; transition: 0.2s;">
                ➕ 查無此人，立即新增
              </button>
            </div>
          </div>
        </div>
        <div v-if="selectedClient" class="selected-badge">✔ 已選擇: {{ selectedClient.name }}</div>
      </div>
      
      <div class="form-item" style="margin-top:15px;">
        <label>3. 📅 購買日期 (補紀錄請修改)</label>
        <input type="date" v-model="checkoutDate" class="modern-inp">
      </div>
    </div>

    <div class="glass-card" style="background:#f8fafc; padding: 15px 20px;">
      <div class="toggle-row">
        <div><div class="t-title">🆕 新客首次買卡優惠</div><div class="t-sub">購買套票自動扣減 $98</div></div>
        <div class="toggle" :class="{on: isNewCustomer}" @click="isNewCustomer = !isNewCustomer"></div>
      </div>
      <div class="divider-dash"></div>
      <div class="toggle-row">
        <div><div class="t-title">🤝 轉介紹優惠 / 免費試堂</div><div class="t-sub" style="color:#ef4444;">成本增加 $52 (若是試堂則免費)</div></div>
        <div class="toggle" :class="{on: isReferral}" @click="isReferral = !isReferral"></div>
      </div>
    </div>

    <!-- 🚀 極速新增客戶 Modal -->
    <div v-if="showQuickAddModal" class="modal-overlay" @click.self="showQuickAddModal = false">
      <div class="center-modal action-modal" style="max-width: 350px;">
        <div class="m-header">
          ⚡ 極速新增客戶
          <button class="close-x" @click="showQuickAddModal = false">✕</button>
        </div>
        
        <div style="margin-bottom: 15px; font-size: 12px; color: #475569; font-weight: 700; background: #f8fafc; padding: 10px; border-radius: 8px; border-left: 3px solid #4f46e2;">
          💡 極速通道：加完會自動為你選取這個新客！
        </div>

        <div class="form-item">
          <label>姓名 <span style="color:#ef4444">*</span></label>
          <input v-model="quickNewClient.name" class="modern-inp" placeholder="請輸入姓名">
        </div>
        
        <div class="form-item" style="margin-top: 12px;">
          <label>電話 <span style="color:#ef4444">*</span></label>
          <input v-model="quickNewClient.phone" type="tel" inputmode="tel" class="modern-inp" placeholder="請輸入電話">
        </div>
        
        <div class="form-item" style="margin-top: 12px;">
          <label>所屬分店</label>
          <select v-model="quickNewClient.branch" class="modern-select">
            <option value="觀塘">觀塘</option>
            <option value="中環">中環</option>
            <option value="佐敦">佐敦</option>
          </select>
        </div>

        <button class="payee-btn style-0" style="width: 100%; margin-top: 20px;" @click="handleQuickAdd">
          ✅ 確認新增並選取
        </button>
      </div>
    </div>
    <div class="compact-total-display">
      <div class="t-label">應收總額 (營業額)</div>
      <div class="t-val">$ {{ exCalc.price }}</div>
      <div class="p-label">扣除成本後淨利潤: <span style="color:#10b981; font-weight:900;" :class="{'text-red': exCalc.profit < 0}">$ {{ exCalc.profit }}</span></div>
    </div>

    <div class="payee-buttons" style="margin-top:15px;" v-if="staffList.length > 0">
      <button v-for="(staff, index) in staffList" :key="staff" class="payee-btn" :class="'style-' + (index % 2)" @click="handleCheckout(staff)">
        💰 {{ staff }} 結帳
      </button>
    </div>
    <div v-else style="text-align:center; color:#ef4444; font-weight:700; margin-top:20px;">請先至設定新增收款人</div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f4f7f6; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; margin-bottom: 20px; color: #1e293b; }
.glass-card { background: white; padding: 20px; border-radius: 20px; margin-bottom: 15px; border: 1px solid #e2e8f0; }
.form-item label { display: block; margin-bottom: 6px; font-weight: 800; font-size: 13px; color: #1e293b; }
.modern-inp, .modern-select { width: 100%; border: 1px solid #cbd5e1; padding: 12px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; font-size: 16px; appearance: none; }
.modern-inp:focus { border-color: #4f46e2; }
.highlight-sel { border: 2px solid #4f46e2; color: #4f46e2; font-weight: 900; background: #eef2ff; }
.search-rel { position: relative; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 12px; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; }
.drop-item { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #333; }
.drop-item:hover { background: #f8fafc; }
.sub-text { font-size: 12px; color: #64748b; font-weight: normal; margin-left: 5px; }
.selected-badge { background: #eef2ff; color: #4f46e2; padding: 8px 12px; border-radius: 10px; margin-top: 10px; font-weight: 800; font-size: 13px; }
.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
.t-title { font-weight: 800; font-size: 14px; color: #1e293b; }
.t-sub { font-size: 11px; color: #f59e0b; font-weight: 700; margin-top: 2px; }
.toggle { width: 44px; height: 24px; background: #cbd5e1; border-radius: 99px; position: relative; cursor: pointer; transition: 0.3s; }
.toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.toggle.on { background: #4f46e2; }
.toggle.on::after { transform: translateX(20px); }
.divider-dash { border-bottom: 1px dashed #cbd5e1; margin: 10px 0; }
.compact-total-display { background: #eef2ff; border: 2px solid #4f46e2; border-radius: 16px; padding: 15px 20px; text-align: center; display: flex; flex-direction: column; gap: 5px; }
.t-label { color: #64748b; font-weight: 800; font-size: 12px; }
.t-val { font-size: 32px; font-weight: 900; color: #4f46e2; margin: 0; line-height: 1; }
.p-label { font-size: 12px; font-weight: 800; color: #475569; }
.text-red { color: #ef4444 !important; }
.payee-buttons { display: flex; gap: 10px; }
.payee-btn { flex: 1; padding: 15px; border-radius: 14px; border: none; font-weight: 900; color: white; font-size: 15px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
.payee-btn:active { transform: scale(0.95); }
.style-0 { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.style-1 { background: linear-gradient(135deg, #ec4899, #db2777); }
</style>