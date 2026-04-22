<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

const searchClient = ref('')
const selectedClient = ref(null)
const selectedPkg = ref('pkg_35')
const isNewCustomer = ref(false)
const isReferral = ref(false)

const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat'])

const packages = {
  'trial': { name: '🧪 試堂 ($98)', price: 98, baseCost: 0 },
  'pkg_10': { name: '🎟️ 10點套票 ($850)', price: 850, baseCost: 385 }, // 250(店) + 135(產品)
  'pkg_35': { name: '👑 35點套票 ($2550)', price: 2550, baseCost: 1272.5 } // 800(店) + 472.5(產品)
}

// 自動下拉搜尋客戶
const clientOptions = computed(() => {
  if (!searchClient.value || selectedClient.value) return []
  const q = searchClient.value.toLowerCase()
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q) || c.phone?.includes(q))).slice(0, 5)
})

function selectClient(c) {
  selectedClient.value = c
  searchClient.value = c.name
  // 若是試堂客，自動開啟「新客首買」
  isNewCustomer.value = c.status === 'prospect'
}

// 核心：精確計算營業額與成本
const exCalc = computed(() => {
  let p = packages[selectedPkg.value].price
  let c = packages[selectedPkg.value].baseCost
  
  // 新客首買優惠：扣減 $98 營業額 (試堂除外)
  if (isNewCustomer.value && selectedPkg.value !== 'trial') {
    p -= 98
  }
  // 轉介紹優惠堂：增加 $52 成本
  if (isReferral.value) {
    c += 52
  }
  
  return { price: p, cost: c, profit: p - c }
})

async function handleCheckout(staff) {
  if (!selectedClient.value) return alert('請在上方搜尋並選擇客戶！')

  const calc = exCalc.value
  const branch = selectedClient.value.branch || '觀塘'
  const pkgName = packages[selectedPkg.value].name.split(' ')[1]

  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', 
    category: selectedPkg.value === 'trial' ? '試堂' : '運動套票', 
    amount: calc.price, 
    cost: calc.cost,
    profit: calc.profit,
    branch: branch, 
    client_id: selectedClient.value.id,
    staff: staff,
    handled_by: staff,
    note: `售出 ${pkgName} ${isNewCustomer.value? '(首買扣98)':''} ${isReferral.value? '(轉介加52成本)':''}`
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  // 更新客戶狀態
  if (selectedPkg.value !== 'trial') {
    const updates = { 
      status: 'active', 
      pkg_count: (selectedClient.value.pkg_count || 0) + 1 
    }
    await supabase.from('clients').update(updates).eq('id', selectedClient.value.id)
  }

  alert(`✅ 結帳成功！\n由 ${staff} 收取 $${calc.price}\n預估淨利潤: $${calc.profit}`)
  selectedClient.value = null; searchClient.value = ''; isNewCustomer.value = false; isReferral.value = false;
  store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">運動套票收銀</h2>

    <div class="glass-card">
      <div class="form-item">
        <label>1. 選擇套票類型</label>
        <select v-model="selectedPkg" class="modern-select highlight-sel">
          <option v-for="(pkg, key) in packages" :key="key" :value="key">{{ pkg.name }}</option>
        </select>
      </div>

      <div class="form-item" style="margin-top:20px;">
        <label>2. 搜尋客戶 (必填) <span style="color:#ef4444">*</span></label>
        <div class="search-rel">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="selectedClient = null">
          <div v-if="clientOptions.length > 0" class="drop-menu">
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              {{ c.name }} <span class="sub-text">({{ c.phone }})</span>
            </div>
          </div>
        </div>
        <div v-if="selectedClient" class="selected-badge">✔ 已選擇: {{ selectedClient.name }}</div>
      </div>
    </div>

    <div class="glass-card" style="background:#f8fafc;">
      <div class="toggle-row">
        <div><div class="t-title">🆕 新客首買優惠</div><div class="t-sub">自動扣減 $98</div></div>
        <div class="toggle" :class="{on: isNewCustomer}" @click="isNewCustomer = !isNewCustomer"></div>
      </div>
      <div class="divider-dash"></div>
      <div class="toggle-row">
        <div><div class="t-title">🤝 轉介紹優惠堂</div><div class="t-sub" style="color:#ef4444;">成本將增加 $52</div></div>
        <div class="toggle" :class="{on: isReferral}" @click="isReferral = !isReferral"></div>
      </div>
    </div>

    <div class="total-display">
      <div class="t-label">應收總額 (營業額)</div>
      <div class="t-val">$ {{ exCalc.price }}</div>
      <div class="p-label">預估扣除成本後淨利潤: <span style="color:#10b981; font-size:18px;">$ {{ exCalc.profit }}</span></div>
    </div>

    <div class="payee-buttons" style="margin-top:20px;" v-if="staffList.length > 0">
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
.glass-card { background: white; padding: 20px; border-radius: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #1e293b; }
.modern-inp, .modern-select { width: 100%; border: 1px solid #cbd5e1; padding: 14px; border-radius: 12px; font-weight: 700; color: #1e293b; outline: none; }
.modern-inp:focus { border-color: #4f46e2; }
.highlight-sel { border: 2px solid #4f46e2; color: #4f46e2; font-weight: 900; background: #eef2ff; }

.search-rel { position: relative; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 12px; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; }
.drop-item { padding: 14px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #333; }
.sub-text { font-size: 12px; color: #64748b; font-weight: normal; margin-left: 5px; }
.selected-badge { background: #eef2ff; color: #4f46e2; padding: 10px 14px; border-radius: 10px; margin-top: 12px; font-weight: 800; font-size: 14px; }

.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
.t-title { font-weight: 800; font-size: 15px; color: #1e293b; }
.t-sub { font-size: 12px; color: #f59e0b; font-weight: 700; margin-top: 4px; }
.toggle { width: 50px; height: 28px; background: #cbd5e1; border-radius: 99px; position: relative; cursor: pointer; transition: 0.3s; }
.toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 24px; height: 24px; background: white; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.toggle.on { background: #4f46e2; }
.toggle.on::after { transform: translateX(22px); }
.divider-dash { border-bottom: 1px dashed #cbd5e1; margin: 15px 0; }

.total-display { background: #eef2ff; border: 2px solid #4f46e2; border-radius: 20px; padding: 30px; text-align: center; }
.t-label { color: #64748b; font-weight: 800; font-size: 14px; }
.t-val { font-size: 48px; font-weight: 900; color: #4f46e2; margin: 10px 0; }
.p-label { font-size: 14px; font-weight: 800; color: #475569; }

.payee-buttons { display: flex; gap: 12px; }
.payee-btn { flex: 1; padding: 18px; border-radius: 16px; border: none; font-weight: 900; color: white; font-size: 16px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
.payee-btn:active { transform: scale(0.95); }
.style-0 { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.style-1 { background: linear-gradient(135deg, #ec4899, #db2777); }
</style>