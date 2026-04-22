<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'

const store = useMainStore()
const filterMonth = ref('本月')
const filterBranch = ref('全部分店')

// 1. 近期試堂預約
const recentProspects = computed(() => {
  let list = store.clients.filter(c => c.status === 'prospect')
  if (filterBranch.value !== '全部分店') {
    list = list.filter(c => c.branch === filterBranch.value)
  }
  return list.slice(0, 5) // 顯示最近 5 筆
})

// 2. 財務數據計算 (從 transactions 表抓取)
const financialData = computed(() => {
  let txns = store.transactions || []
  
  // 篩選分店
  if (filterBranch.value !== '全部分店') {
    txns = txns.filter(t => t.branch === filterBranch.value)
  }
  
  // 簡單月份篩選邏輯 (實際應用可根據 created_at 解析)
  const currentMonth = new Date().getMonth()
  if (filterMonth.value === '本月') {
    txns = txns.filter(t => new Date(t.created_at).getMonth() === currentMonth)
  }

  let revenue = 0
  let cost = 0
  let packageSalesCount = 0

  txns.forEach(t => {
    if (t.type === 'income') {
      revenue += (t.amount || 0)
      cost += ((t.amount || 0) - (t.profit || 0)) // 成本 = 營業額 - 利潤
      if (t.category === '運動套票') packageSalesCount++
    }
  })

  return {
    revenue,
    cost,
    profit: revenue - cost,
    packageSalesCount
  }
})
</script>

<template>
  <div class="page" style="padding-bottom: 120px;">
    <div class="header-filters">
      <h2 class="page-title">數據中心</h2>
      <div class="filter-group">
        <select v-model="filterMonth" class="mini-select">
          <option value="全部">全部時間</option>
          <option value="本月">本月</option>
        </select>
        <select v-model="filterBranch" class="mini-select">
          <option value="全部分店">全部分店</option>
          <option value="觀塘">觀塘</option>
          <option value="中環">中環</option>
        </select>
      </div>
    </div>

    <div class="section-title">📅 近期試堂預約 ({{ filterBranch }})</div>
    <div class="prospect-list">
      <div v-if="recentProspects.length === 0" class="empty-text">目前無預約資料</div>
      <div v-for="p in recentProspects" :key="p.id" class="prospect-card">
        <div class="date-box">
          <span class="m">4月</span>
          <span class="d">28</span>
        </div>
        <div class="p-info">
          <div class="p-name">{{ p.name }} <span class="time">下午01:10</span></div>
          <div class="p-meta">📍 {{ p.branch }} · 📞 {{ p.phone }}</div>
        </div>
      </div>
    </div>

    <div class="finance-grid">
      <div class="f-card">
        <div class="f-val text-green">$ {{ financialData.revenue.toLocaleString() }}</div>
        <div class="f-label">總營業額</div>
      </div>
      <div class="f-card">
        <div class="f-val text-red">$ {{ financialData.cost.toLocaleString() }}</div>
        <div class="f-label">總成本支出</div>
      </div>
    </div>

    <div class="profit-box">
      <div style="display:flex; align-items:center; gap:8px;">
        <span>💎</span> <span style="font-weight:800; color:#4f46e2;">總實收淨利潤</span>
      </div>
      <div class="profit-val">$ {{ financialData.profit.toLocaleString() }}</div>
    </div>

    <div class="section-title" style="margin-top:25px;">🎟️ 運動套票銷售數量</div>
    <div class="finance-grid">
      <div class="f-card">
        <div class="f-val" style="color:#f59e0b;">{{ financialData.packageSalesCount }} 張</div>
        <div class="f-label">套票售出</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f4f7f6; min-height: 100vh; }
.header-filters { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-title { font-weight: 900; font-size: 24px; margin: 0; }
.filter-group { display: flex; gap: 8px; }
.mini-select { border: 1px solid #ddd; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; background: white; }

.section-title { font-size: 14px; font-weight: 900; color: #333; margin-bottom: 12px; }
.empty-text { text-align: center; color: #999; padding: 20px; font-size: 13px; }

.prospect-card { background: white; padding: 15px; border-radius: 16px; display: flex; align-items: center; gap: 15px; margin-bottom: 10px; border: 1px solid #eee; }
.date-box { background: #fffbeb; color: #d97706; padding: 8px 12px; border-radius: 12px; text-align: center; }
.date-box .m { display: block; font-size: 10px; font-weight: 800; }
.date-box .d { display: block; font-size: 18px; font-weight: 900; }
.p-name { font-weight: 800; font-size: 15px; color: #333; }
.time { font-size: 11px; color: #999; margin-left: 8px; font-weight: normal; }
.p-meta { font-size: 12px; color: #666; margin-top: 4px; }

.finance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; }
.f-card { background: white; padding: 20px; border-radius: 16px; text-align: center; border: 1px solid #eee; }
.f-val { font-size: 20px; font-weight: 900; margin-bottom: 5px; }
.f-label { font-size: 12px; color: #666; font-weight: 700; }
.text-green { color: #10b981; }
.text-red { color: #ef4444; }

.profit-box { background: #eef2ff; border: 1.5px solid #6366f1; padding: 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; }
.profit-val { font-size: 24px; font-weight: 900; color: #4f46e2; }
</style>