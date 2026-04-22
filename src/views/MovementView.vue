<script setup>
import { ref, computed } from 'vue'

const selectedPackage = ref('10點套票 ($850)')
const searchClient = ref('')
const isNewClient = ref(false)
const isReferral = ref(false)

// 模擬計算
const basePrice = 850
const baseCost = 400

const totalAmount = computed(() => {
  return basePrice - (isNewClient.value ? 98 : 0)
})

const finalProfit = computed(() => {
  return totalAmount.value - baseCost + (isReferral.value ? 52 : 0)
})
</script>

<template>
  <div class="page">
    <h2 class="page-title">運動套票收銀</h2>

    <div class="card" style="padding:20px; margin-bottom:15px;">
      <div class="form-item" style="margin-bottom:15px;">
        <label>1. 選擇套票類型</label>
        <select v-model="selectedPackage" class="inp" style="color:var(--p); font-weight:800;">
          <option>🎟️ 10點套票 ($850)</option>
          <option>🎟️ 35點套票 ($2500)</option>
        </select>
      </div>

      <div class="form-item">
        <label>2. 搜尋客戶 (必填)</label>
        <input class="inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話...">
      </div>
    </div>

    <div class="card" style="padding:15px 20px; margin-bottom:20px;">
      <div class="toggle-row" style="margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid var(--border);">
        <div>
          <div class="toggle-title">🆕 新客首買優惠</div>
          <div class="toggle-desc" style="color:#d97706;">自動扣減 $98</div>
        </div>
        <input type="checkbox" v-model="isNewClient" class="toggle-checkbox">
      </div>

      <div class="toggle-row">
        <div>
          <div class="toggle-title">🤝 轉介紹優惠堂</div>
          <div class="toggle-desc" style="color:#dc2626;">成本將增加 $52</div>
        </div>
        <input type="checkbox" v-model="isReferral" class="toggle-checkbox">
      </div>
    </div>

    <div class="summary-box">
      <div style="font-size:13px; font-weight:800; color:var(--t2);">應收總額 (營業額)</div>
      <div class="amount">$ {{ totalAmount }}</div>
      <div style="font-size:12px; font-weight:700; color:#16a34a; margin-top:8px;">
        預估扣除成本後淨利潤: $ {{ finalProfit }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: var(--t2); }
.toggle-row { display: flex; justify-content: space-between; align-items: center; }
.toggle-title { font-weight: 800; font-size: 14px; color: var(--t); margin-bottom: 2px; }
.toggle-desc { font-size: 11px; font-weight: 700; }

/* 簡單的 Checkbox 替代 Switch UI */
.toggle-checkbox { width: 45px; height: 24px; accent-color: var(--p); cursor: pointer; }

.summary-box { background: #eef2ff; border: 2px solid var(--p); border-radius: 16px; padding: 25px; text-align: center; }
.summary-box .amount { font-size: 36px; font-weight: 900; color: var(--p); margin-top: 5px; }
</style>