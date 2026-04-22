<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

// --- 狀態定義 ---
const searchClient = ref('')
const selectedClient = ref(null)
const selectedPackage = ref({ name: '10點套票 ($850)', price: 850, cost: 385 })
const isFirstBuy = ref(false)   // 新客首買優惠
const isReferral = ref(false)   // 轉介優惠堂

// 套票選項 (可自行增減)
const packageOptions = [
  { name: '10點套票 ($850)', price: 850, cost: 385 },
  { name: '35點套票 ($2800)', price: 2800, cost: 1200 },
  { name: '50點套票 ($3800)', price: 3800, cost: 1600 }
]

// 客戶搜尋邏輯 (修正搜尋不到的問題)
const clientOptions = computed(() => {
  if (!searchClient.value || selectedClient.value) return []
  const q = searchClient.value.toLowerCase()
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q) || c.phone?.includes(q))).slice(0, 5)
})

// 金額計算邏輯
const finalAmount = computed(() => {
  let total = selectedPackage.value.price
  if (isFirstBuy.value) total -= 98 // 首買扣減
  return total
})

const estimatedProfit = computed(() => {
  let cost = selectedPackage.value.cost
  if (isReferral.value) cost += 52 // 轉介成本增加
  return finalAmount.value - cost
})

async function handleCheckout() {
  if (!selectedClient.value) return alert('請先搜尋並選擇客戶！')
  
  // 1. 寫入交易紀錄
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income',
    category: '運動套票',
    amount: finalAmount.value,
    profit: estimatedProfit.value,
    branch: selectedClient.value.branch || '觀塘',
    note: `${selectedClient.value.name} 購買 ${selectedPackage.value.name}`,
    created_at: new Date().toISOString()
  }])

  if (txnError) return alert('收銀失敗')

  // 2. 更新 stock 表 (套票也是庫存的一種)
  // 這裡假設 stock 表裡有對應套票名稱的庫存
  const sItem = store.stock.find(s => s.prod_name.includes(selectedPackage.value.name.split(' ')[0]))
  if (sItem) {
    await supabase.from('stock').update({ quantity: sItem.quantity - 1 }).eq('id', sItem.id)
  }

  alert(`✅ 收銀成功！\n應收金額：$${finalAmount.value}`)
  store.syncAll()
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">運動套票收銀</h2>

    <div class="card cashier-card">
      <div class="form-item">
        <label>1. 選擇套票類型</label>
        <select v-model="selectedPackage" class="inp">
          <option v-for="opt in packageOptions" :key="opt.name" :value="opt">🎟️ {{ opt.name }}</option>
        </select>
      </div>

      <div class="form-item" style="margin-top:20px;">
        <label>2. 搜尋客戶 (必填)</label>
        <div style="position:relative;">
          <input class="inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="selectedClient = null">
          <div v-if="clientOptions.length > 0" class="dropdown">
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectedClient = c; searchClient = c.name">
              {{ c.name }} ({{ c.phone }})
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card toggle-card">
      <div class="toggle-row">
        <div>
          <div class="t-title">🆕 新客首買優惠</div>
          <div class="t-sub">自動扣減 $98</div>
        </div>
        <div class="switch" :class="{on: isFirstBuy}" @click="isFirstBuy = !isFirstBuy"></div>
      </div>
      <div class="divider"></div>
      <div class="toggle-row">
        <div>
          <div class="t-title">🤝 轉介介紹優惠堂</div>
          <div class="t-sub">成本將增加 $52</div>
        </div>
        <div class="switch" :class="{on: isReferral}" @click="isReferral = !isReferral"></div>
      </div>
    </div>

    <div class="total-box">
      <div class="total-label">應收總額 (營業額)</div>
      <div class="total-val">$ {{ finalAmount }}</div>
      <div class="profit-val">預估扣除成本後淨利潤：<span style="color:#10b981;">$ {{ estimatedProfit }}</span></div>
    </div>

    <button class="btn-checkout" @click="handleCheckout" :disabled="!selectedClient">確認收銀</button>
  </div>
</template>

<style scoped>
.cashier-card { padding: 25px; border-radius: 20px; background: #fff; border: 1px solid #eee; margin-bottom: 20px; }
.form-item label { display: block; margin-bottom: 10px; font-weight: 800; color: #333; }
.dropdown { position: absolute; top: 100%; left: 0; width: 100%; background: white; border-radius: 12px; box-shadow: 0 10px 20px rgba(0,0,0,0.1); z-index: 10; }
.drop-item { padding: 12px; border-bottom: 1px solid #f8fafc; cursor: pointer; font-weight: 700; }

.toggle-card { padding: 20px; border-radius: 20px; }
.toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; }
.t-title { font-weight: 800; font-size: 14px; }
.t-sub { font-size: 11px; color: #ef4444; font-weight: 700; margin-top: 2px; }
.switch { width: 50px; height: 26px; background: #e2e8f0; border-radius: 99px; position: relative; cursor: pointer; transition: 0.3s; }
.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; background: white; border-radius: 50%; transition: 0.3s; }
.switch.on { background: #6366f1; }
.switch.on::after { transform: translateX(24px); }

.total-box { background: #eef2ff; border: 2px solid #6366f1; padding: 30px; border-radius: 24px; text-align: center; margin-top: 25px; }
.total-label { color: #6366f1; font-weight: 800; font-size: 13px; }
.total-val { font-size: 42px; font-weight: 900; color: #4f46e2; margin: 10px 0; }
.profit-val { font-size: 12px; font-weight: 700; color: #64748b; }

.btn-checkout { width: 100%; margin-top: 20px; padding: 18px; border-radius: 18px; background: #6366f1; color: white; font-weight: 900; font-size: 18px; border: none; cursor: pointer; }
.btn-checkout:disabled { background: #cbd5e1; cursor: not-allowed; }
</style>