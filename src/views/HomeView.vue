<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useMainStore } from '../stores/mainStore'
import BzIcon from '../components/BzIcon.vue'
import { getHomeTasks, getOverdueHomeTasks, hkCalendarDate } from '../homeTasks'
import { calculateReport } from '../reportMath'

defineEmits(['search'])
const store = useMainStore()
const today = hkCalendarDate(Date.now())
const currentMonth = today.slice(0, 7)
const selectedMonth = ref(currentMonth)
const months = computed(() => [...new Set([currentMonth, ...store.transactions.map(t => hkCalendarDate(t.created_at).slice(0, 7)).filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))])].sort((a, b) => b.localeCompare(a)))
const todayRows = computed(() => store.transactions.filter(t => hkCalendarDate(t.created_at) === today))
const tasks = computed(() => getHomeTasks(store.clients))
const visibleTasks = computed(() => tasks.value.slice(0, 3))
const overdueTasks = computed(() => getOverdueHomeTasks(store.clients))
const showOverdue = ref(false)
const overdueQuery = ref('')
const overdueKind = ref('all')
const overduePage = ref(1)
const overdueListTop = ref(null)
const overduePageSize = 15
const overdueCounts = computed(() => ({
  trial: overdueTasks.value.filter(task => task.kind === 'trial').length,
  expiry: overdueTasks.value.filter(task => task.kind === 'expiry').length
}))
const reviewedOverdueTasks = computed(() => {
  const query = overdueQuery.value.trim().toLocaleLowerCase()
  return overdueTasks.value.filter(task =>
    (overdueKind.value === 'all' || task.kind === overdueKind.value) &&
    (!query || `${task.name} ${task.branch} ${task.label} ${task.detail}`.toLocaleLowerCase().includes(query))
  )
})
const overduePageCount = computed(() => Math.max(1, Math.ceil(reviewedOverdueTasks.value.length / overduePageSize)))
const pagedOverdueTasks = computed(() => reviewedOverdueTasks.value.slice((overduePage.value - 1) * overduePageSize, overduePage.value * overduePageSize))
watch([overdueQuery, overdueKind], () => { overduePage.value = 1 })
watch(overduePageCount, count => { if (overduePage.value > count) overduePage.value = count })
function changeOverduePage(page) {
  overduePage.value = Math.min(Math.max(page, 1), overduePageCount.value)
  nextTick(() => overdueListTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
const isNewAccount = computed(() => !store.isInitialLoading && !store.clients.length && !store.transactions.length)
const monthReport = computed(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return calculateReport(store.transactions, { start: `${selectedMonth.value}-01`, end })
})
const income = computed(() => monthReport.value.income)
const profit = computed(() => monthReport.value.net)
const dataPending = computed(() => store.isSyncing || store.hasMoreTxn || store.isFetchingMore || Boolean(store.transactionsLoadError))
const todayIncome = computed(() => todayRows.value.reduce((n, t) => n + (t.type === 'income' ? Number(t.amount || 0) : 0), 0))
const todaySales = computed(() => todayRows.value.filter(t => t.type === 'income').length)
const todayShipments = computed(() => todayRows.value.filter(t => t.type === 'income' && (t.product_name || /零售|產品|出貨/.test(t.category || ''))).length)
const todayExpenses = computed(() => todayRows.value.filter(t => t.type === 'expense'))
const expenseTotal = computed(() => todayExpenses.value.reduce((n, t) => n + Number(t.amount || 0), 0))
const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
const greeting = hour < 11 ? '早晨！' : hour < 18 ? '午安！' : '晚上好！'
const greetingIcon = hour < 18 ? '☀️' : '🌙'
const money = n => n === null ? '—' : Number(n || 0).toLocaleString('en-HK', { maximumFractionDigits: 2 })
function quick(view, kind) {
  store.pendingQuickEntry = kind ? { kind, type: 'expense' } : null
  store.view = view
}
function openTask(task) {
  store.pendingClientTask = { id: task.id, action: task.action }
  store.view = 'clients'
}
</script>

<template>
  <main class="bz-home">
    <div class="bz-home-wash" aria-hidden="true"><i/><i/><i/></div>
    <header class="bz-home-header">
      <div class="bz-home-brand"><span class="bz-leaf-mark" aria-hidden="true"><i/><i/></span><span><strong>BZ記錄器</strong><small>康寶萊業務管理 · 客戶 · 產品 · 記帳 · 報表</small></span></div>
      <div class="bz-home-icons"><button type="button" aria-label="搜尋" @click="$emit('search')"><BzIcon name="search" :size="20" /></button><button type="button" aria-label="查看設定" @click="store.view='settings'"><BzIcon name="user" :size="21" /></button></div>
    </header>

    <section class="bz-welcome">
      <div><h1>{{ greeting }} <span>{{ greetingIcon }}</span></h1><p>今日都繼續為健康與事業加油！</p></div>
      <label class="bz-month-picker"><BzIcon name="calendar" :size="19"/><select v-model="selectedMonth" aria-label="選擇月份"><option v-for="month in months" :key="month" :value="month">{{ month.slice(0, 4) }}年{{ Number(month.slice(5)) }}月</option></select><span aria-hidden="true">⌄</span></label>
    </section>

    <section class="bz-workbench-entry" aria-label="開始記錄">
      <button type="button" @click="$emit('search')"><BzIcon name="search" :size="22"/><span><strong>先搵客戶，再記錄</strong><small>輸入姓名或電話；已有檔案會直接打開</small></span><BzIcon name="chevronRight" :size="18"/></button>
      <button type="button" class="bz-workbench-new" @click="quick('clients', 'client')">＋ 新客戶</button>
    </section>

    <section v-if="!isNewAccount" class="bz-home-tasks" aria-label="今日要做">
      <div class="bz-home-tasks-head"><div><span>今日工作台</span><h2>{{ tasks.length ? `${tasks.length} 件事，逐件做就得` : '今日暫時冇待辦' }}</h2></div><BzIcon name="calendar" :size="22" /></div>
      <div v-if="visibleTasks.length" class="bz-home-task-list">
        <button v-for="task in visibleTasks" :key="`${task.action}-${task.id}`" type="button" @click="openTask(task)">
          <span class="bz-home-task-dot" :class="task.action" aria-hidden="true">{{ task.action === 'renewal' ? '↻' : task.action === 'trial' ? '✓' : '◷' }}</span>
          <span class="bz-home-task-text"><strong>{{ task.name }}</strong><small>{{ task.label }} · {{ task.branch }} · {{ task.detail }}</small></span>
          <BzIcon name="chevronRight" :size="17" />
        </button>
      </div>
      <p v-else class="bz-home-tasks-empty">試堂結果同 7 日內到期嘅套票，會自動喺呢度提醒你。</p>
      <button v-if="tasks.length > visibleTasks.length" class="bz-home-tasks-all" type="button" @click="store.view='clients'">去客戶管理 <BzIcon name="chevronRight" :size="15"/></button>
      <button v-if="overdueTasks.length" class="bz-overdue-link" type="button" :aria-expanded="showOverdue" aria-controls="bz-overdue-review" @click="showOverdue = !showOverdue">
        <span><strong>{{ overdueTasks.length }} 筆較早資料可核對</strong><small>舊試堂 {{ overdueCounts.trial }} · 舊套票到期 {{ overdueCounts.expiry }}；每頁 15 筆</small></span><span class="bz-overdue-chevron" aria-hidden="true">{{ showOverdue ? '⌃' : '⌄' }}</span>
      </button>
      <div v-if="showOverdue && overdueTasks.length" id="bz-overdue-review" class="bz-overdue-review">
        <p>以下係按客戶檔案日期列出嘅舊紀錄，未必係今日要處理。請先核實原始資料，再逐項更新。</p>
        <div class="bz-overdue-filters" role="group" aria-label="較早資料類型">
          <button type="button" :class="{ active: overdueKind === 'all' }" @click="overdueKind = 'all'">全部 {{ overdueTasks.length }}</button>
          <button type="button" :class="{ active: overdueKind === 'trial' }" @click="overdueKind = 'trial'">舊試堂 {{ overdueCounts.trial }}</button>
          <button type="button" :class="{ active: overdueKind === 'expiry' }" @click="overdueKind = 'expiry'">舊套票 {{ overdueCounts.expiry }}</button>
        </div>
        <input v-model="overdueQuery" type="search" class="bz-overdue-search" aria-label="搜尋較早資料" placeholder="搜尋姓名、分店或日期" />
        <span ref="overdueListTop" class="bz-overdue-result-count" aria-live="polite">{{ reviewedOverdueTasks.length ? `${(overduePage - 1) * overduePageSize + 1}–${Math.min(overduePage * overduePageSize, reviewedOverdueTasks.length)}` : '0' }} / {{ reviewedOverdueTasks.length }} 筆<span v-if="reviewedOverdueTasks.length !== overdueTasks.length">（全部 {{ overdueTasks.length }} 筆）</span></span>
        <div class="bz-overdue-list">
          <button v-for="task in pagedOverdueTasks" :key="`${task.kind}-${task.id}`" type="button" @click="openTask(task)">
            <span class="bz-home-task-text"><strong>{{ task.name }}</strong><small>{{ task.label }} · {{ task.branch || '未填分店' }} · {{ task.detail }}</small></span>
            <BzIcon name="chevronRight" :size="17" />
          </button>
          <p v-if="!reviewedOverdueTasks.length" class="bz-overdue-empty">冇符合搜尋條件嘅紀錄。可清除搜尋或轉返「全部」。</p>
        </div>
        <nav v-if="overduePageCount > 1" class="bz-overdue-pagination" aria-label="較早資料分頁">
          <button type="button" :disabled="overduePage === 1" @click="changeOverduePage(overduePage - 1)">上一頁</button>
          <span>第 {{ overduePage }} / {{ overduePageCount }} 頁</span>
          <button type="button" :disabled="overduePage === overduePageCount" @click="changeOverduePage(overduePage + 1)">下一頁</button>
        </nav>
      </div>
    </section>

    <section class="bz-metrics" aria-label="每月財務概況">
      <button type="button" class="bz-metric" @click="store.view='dashboard'"><span class="bz-metric-icon terracotta"><BzIcon name="coins" :size="23" /></span><span class="bz-metric-copy"><span>本月營業額</span><strong>HK$ {{ money(income) }}</strong></span><BzIcon class="bz-metric-chevron" name="chevronRight" :size="18" /></button>
      <button type="button" class="bz-metric" @click="store.view='dashboard'"><span class="bz-metric-icon olive"><BzIcon name="chart" :size="23" /></span><span class="bz-metric-copy"><span>本月帳面淨利</span><strong>{{ profit === null ? '—' : `HK$ ${money(profit)}` }}</strong><small v-if="profit === null">{{ monthReport.missingProfit }} 筆收入缺成本及利潤，待核對</small><small v-else-if="dataPending">資料未齊 · 暫列</small><small v-else-if="income">淨利率 {{ (profit / income * 100).toFixed(1) }}%</small></span><BzIcon class="bz-metric-chevron" name="chevronRight" :size="18" /></button>
    </section>
    <p v-if="dataPending" class="bz-sync-note">{{ store.transactionsLoadError ? `帳目讀取未完成：${store.transactionsLoadError}` : store.isSyncing ? '正在同步最新資料，金額暫列。' : '舊交易仍在載入，金額暫列。' }}</p>

    <section class="bz-quick-section">
      <h2><span aria-hidden="true">ϟ</span> 快速記錄</h2>
      <div class="bz-quick-actions">
        <button class="primary" type="button" @click="quick('retail')"><BzIcon name="plus" :size="26"/><span>新增交易</span></button>
        <button type="button" @click="quick('retail')"><BzIcon name="box"/><span>出貨／銷售</span></button>
        <button type="button" @click="quick('inventory')"><BzIcon name="cart"/><span>入貨／補貨</span></button>
        <button type="button" @click="quick('accounting', 'transaction')"><BzIcon name="receipt"/><span>支出記錄</span></button>
        <button type="button" @click="quick('clients', 'client')"><BzIcon name="userPlus"/><span>新增客戶</span></button>
      </div>
      <button class="bz-history-shortcut" type="button" @click="store.view='history'">有過去兩年嘅 Excel？快速回補舊紀錄 <BzIcon name="chevronRight" :size="15"/></button>
    </section>

    <section v-if="isNewAccount" class="bz-home-start" aria-label="開始使用">
      <span class="bz-home-start-icon" aria-hidden="true">✦</span>
      <div><h2>由第一位客戶開始</h2><p>只需填姓名，分店會記住上次選擇；試堂時間可以直接由課表揀。</p></div>
      <button type="button" @click="quick('clients', 'client')">新增客戶 <BzIcon name="chevronRight" :size="16"/></button>
    </section>

    <section class="bz-management" aria-label="管理功能">
      <button class="clients" type="button" @click="store.view='clients'"><BzIcon name="users" :size="29"/><span><strong>客戶管理</strong><small>客戶資料 · 跟進 · 購買紀錄</small></span><BzIcon name="chevronRight" :size="18"/></button>
      <button class="stock" type="button" @click="store.view='inventory'"><BzIcon name="box" :size="29"/><span><strong>庫存管理</strong><small>產品庫存 · 有效期 · 補貨提醒</small></span><BzIcon name="chevronRight" :size="18"/></button>
      <button class="products" type="button" @click="store.view='products'"><BzIcon name="bag" :size="29"/><span><strong>產品管理</strong><small>產品資料 · 售價 · 成本</small></span><BzIcon name="chevronRight" :size="18"/></button>
      <button class="reports" type="button" @click="store.view='dashboard'"><BzIcon name="chart" :size="29"/><span><strong>報表分析</strong><small>收入 · 利潤 · 銷售統計</small></span><BzIcon name="chevronRight" :size="18"/></button>
    </section>

    <section class="bz-today">
      <div class="bz-today-title"><h2><BzIcon name="calendar" :size="21"/> 今日概況</h2><button type="button" @click="store.view='accounting'">查看全部 <BzIcon name="chevronRight" :size="15"/></button></div>
      <div class="bz-today-card">
        <div><BzIcon name="bag" :size="20"/><strong>銷售收入</strong><span>{{ todaySales }} 筆</span><b class="green">HK$ {{ money(todayIncome) }}</b></div>
        <div><BzIcon name="box" :size="20"/><strong>產品出貨</strong><span>{{ todayShipments }} 筆</span><b>—</b></div>
        <div><BzIcon name="wallet" :size="20"/><strong>支出</strong><span>{{ todayExpenses.length }} 筆</span><b class="orange">HK$ {{ money(expenseTotal) }}</b></div>
      </div>
    </section>
  </main>
</template>
