<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

const searchClient = ref('')
const selectedClient = ref(null)
const selectedPkg = ref('pkg_10')
const isNewCustomer = ref(false)
const isReferral = ref(false)
const showDropdown = ref(false)

const staffList = computed(() => store.settings?.payees || ['kwan', 'Cat'])

// 💡 核心更新：新增了「介紹朋友贈堂」項目
const packages = {
  'trial': { name: '🧪 試堂 ($98)', price: 98, baseCost: 0 },
  'pkg_10': { name: '🎟️ 10點套票 ($850)', price: 850, baseCost: 385 },
  'pkg_35': { name: '👑 35點套票 ($2550)', price: 2550, baseCost: 1272.5 },
  'referral_free': { name: '🤝 介紹朋友贈堂 ($0)', price: 0, baseCost: 52 },
  
  // 💡 新增：體驗卡30人次。
  // 設定 baseCost: 0 保證不會扣減淨利潤，但結算大腦會自動把它加進應付舖頭的黃色卡片！
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

// 💡 自動防呆計算
const exCalc = computed(() => {
  let p = packages[selectedPkg.value].price
  let c = packages[selectedPkg.value].baseCost
  
  // 如果已經選了「介紹朋友贈堂」，就不需要再重複疊加轉介紹優惠
  if (isReferral.value && selectedPkg.value !== 'referral_free') {
    c += 52
    if (selectedPkg.value === 'trial') p = 0
  }
  
  if (isNewCustomer.value && selectedPkg.value !== 'trial' && selectedPkg.value !== 'referral_free') {
    p -= 98
  }
  
  return { price: p, cost: c, profit: p - c }
})

async function handleCheckout(staff) {
  if (!selectedClient.value) return alert('請先搜尋並選擇客戶！')

  const calc = exCalc.value
  const branch = selectedClient.value.branch || '觀塘'
  const pkgName = packages[selectedPkg.value].name.split(' ')[1] || packages[selectedPkg.value].name

  // 設定分類，讓流水帳看起來更清楚
  let categoryStr = '運動套票'
  if (selectedPkg.value === 'trial') categoryStr = '試堂'
  if (selectedPkg.value === 'referral_free') categoryStr = '贈堂'

  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', 
    category: categoryStr, 
    amount: calc.price, 
    cost: calc.cost, 
    profit: calc.profit,
    branch: branch, 
    client_id: selectedClient.value.id, 
    staff: staff, 
    handled_by: staff,
    note: `售出 ${pkgName} ${isNewCustomer.value && selectedPkg.value !== 'trial' && selectedPkg.value !== 'referral_free' ? '(新客扣98)' : ''} ${isReferral.value && selectedPkg.value !== 'referral_free' ? '(轉介)' : ''}`
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  // 買套票自動升級為正式客戶並增加次數 (贈堂或試堂不加套票次數)
  if (selectedPkg.value !== 'trial' && selectedPkg.value !== 'referral_free') {
    await supabase.from('clients').update({ 
      status: 'active', 
      pkg_count: (selectedClient.value.pkg_count || 0) + 1 
    }).eq('id', selectedClient.value.id)
  }

  alert(`✅ 結帳成功！\n由 ${staff} 收取營業額 $${calc.price}\n(淨利潤: $${calc.profit})`)
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
          <div v-if="showDropdown && clientOptions.length > 0" class="drop-menu">
            <div style="padding:8px; text-align:center; font-size:12px; color:#ef4444; background:#f8fafc; border-bottom:1px solid #eee; cursor:pointer;" @click="showDropdown = false">✕ 關閉搜尋</div>
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              {{ c.name }} <span class="sub-text">({{ c.phone }})</span>
            </div>
          </div>
        </div>
        <div v-if="selectedClient" class="selected-badge">✔ 已選擇: {{ selectedClient.name }}</div>
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

/* 確保不放大 */
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