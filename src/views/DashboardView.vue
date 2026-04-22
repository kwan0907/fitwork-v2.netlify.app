<script setup>
import { computed } from 'vue'
import { useMainStore } from '../stores/mainStore'

const store = useMainStore()

const stats = computed(() => {
  let income = 0, expense = 0, profit = 0
  store.transactions.forEach(t => {
    const val = Number(t.amount) || 0
    if (t.type === 'income') {
      income += val
      profit += (Number(t.profit) || 0)
    } else {
      expense += val
    }
  })
  return { income, expense, net: income - expense, profit }
})

const branchStats = computed(() => {
  const counts = { '觀塘': 0, '中環': 0, '佐敦': 0 }
  store.clients.forEach(c => {
    if (c.status !== 'prospect' && counts[c.branch] !== undefined) {
      counts[c.branch]++
    }
  })
  return counts
})

const marathon = computed(() => {
  const formal = store.clients.filter(c => c.status !== 'prospect').length
  const runners = store.clients.filter(c => c.is_marathon).length
  const rate = formal ? ((runners / formal) * 100).toFixed(1) : 0
  return { rate, formal, runners }
})

const recentTrials = computed(() => {
  return store.clients.filter(c => c.status === 'prospect').slice(0, 3)
})
</script>

<template>
  <div class="page">
    <div class="stat-grid-2">
      <div class="card stat-main">
        <div class="lbl">總營業額</div>
        <div class="val">$ {{ stats.income.toLocaleString() }}</div>
      </div>
      <div class="card stat-main">
        <div class="lbl">總成本支出</div>
        <div class="val" style="color:var(--t2)">$ {{ stats.expense.toLocaleString() }}</div>
      </div>
    </div>

    <div class="card profit-banner">
      <div style="display:flex; align-items:center; gap:8px;">
        <span>💎</span> 總實收淨利潤
      </div>
      <div class="val">$ {{ stats.net.toLocaleString() }}</div>
    </div>

    <div class="section-title">🗓️ 近期試堂預約</div>
    <div v-if="recentTrials.length === 0" class="card empty-box">近期沒有預約</div>
    <div v-for="c in recentTrials" :key="c.id" class="card trial-item">
      <div class="date-badge">
        <div class="m">4月</div><div class="d">28</div>
      </div>
      <div style="flex:1">
        <div class="name">{{ c.name }} <span class="time">下午01:10</span></div>
        <div class="loc">📍 {{ c.branch }} · 📞 {{ c.phone }}</div>
      </div>
    </div>

    <div class="section-title" style="margin-top:25px;">👥 分店正式客戶人數</div>
    <div class="stat-grid-3">
      <div class="card mini-card" v-for="(count, b) in branchStats" :key="b">
        <div class="num">{{ count }}</div>
        <div class="lbl">{{ b }}</div>
      </div>
    </div>

    <div class="card marathon-card">
      <div class="header">
        <div><div class="lbl">客戶轉馬拉松百分比</div><div class="val">{{ marathon.rate }}%</div></div>
        <span class="icon">🏃</span>
      </div>
      <div class="bar-bg"><div class="bar-fill" :style="{width: marathon.rate+'%'}"></div></div>
      <div class="footer">
        <span>活躍: 0 人</span><span>正式會員: {{ marathon.formal }} 人</span>
      </div>
    </div>

    <div class="section-title" style="color:#854d0e; margin-top:25px;">💰 經手人資金結算 (手上現金)</div>
    <div class="card settlement-card">
      <div class="owner">股東</div>
      <div class="amount">$ {{ stats.net.toLocaleString() }}</div>
      <div class="detail">
        <span style="color:var(--p)">收: ${{ stats.income }}</span>
        <span style="color:var(--r)">支: ${{ stats.expense }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.stat-main { padding: 16px; text-align: center; }
.stat-main .lbl { font-size: 12px; color: var(--t3); font-weight: 700; margin-bottom: 8px; }
.stat-main .val { font-size: 20px; font-weight: 900; color: var(--p); }

.profit-banner { 
  background: var(--ps); border: 2px solid var(--p); padding: 16px 20px;
  display: flex; justify-content: space-between; align-items: center;
  font-weight: 800; color: var(--p); font-size: 15px; margin-bottom: 25px;
}
.profit-banner .val { font-size: 20px; font-weight: 900; }

.section-title { font-size: 14px; font-weight: 800; margin: 20px 0 10px; color: var(--t2); }

.trial-item { display: flex; align-items: center; gap: 15px; padding: 12px; margin-bottom: 10px; }
.date-badge { background: var(--bg); padding: 8px; border-radius: 12px; text-align: center; min-width: 50px; }
.date-badge .m { font-size: 10px; color: var(--t3); font-weight: 700; }
.date-badge .d { font-size: 18px; font-weight: 900; }
.trial-item .name { font-weight: 800; font-size: 16px; }
.trial-item .time { font-size: 12px; color: var(--t3); font-weight: 500; margin-left: 5px; }
.trial-item .loc { font-size: 12px; color: var(--t2); margin-top: 4px; font-weight: 600; }

.stat-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.mini-card { padding: 15px; text-align: center; }
.mini-card .num { font-size: 24px; font-weight: 900; }
.mini-card .lbl { font-size: 12px; color: var(--t3); font-weight: 700; }

.marathon-card { background: var(--p); color: #fff; padding: 20px; border: none; margin-top: 15px; border-radius: 20px;}
.marathon-card .header { display: flex; justify-content: space-between; align-items: center; }
.marathon-card .lbl { font-size: 12px; opacity: 0.8; font-weight: 700; }
.marathon-card .val { font-size: 28px; font-weight: 900; margin-top: 4px; }
.marathon-card .icon { font-size: 30px; }
.bar-bg { background: rgba(255,255,255,0.2); height: 8px; border-radius: 10px; margin: 15px 0; }
.bar-fill { background: #fff; height: 100%; border-radius: 10px; }
.marathon-card .footer { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; opacity: 0.9; }

.settlement-card { border: 2px solid var(--p); padding: 18px; margin-top: 10px; border-radius: 20px;}
.settlement-card .owner { color: var(--p); font-weight: 900; font-size: 14px; }
.settlement-card .amount { font-size: 26px; font-weight: 900; color: var(--p); margin: 8px 0; }
.settlement-card .detail { display: flex; justify-content: space-between; font-size: 13px; font-weight: 800; }

.empty-box { padding: 30px; text-align: center; color: var(--t3); font-weight: 700; }
</style>