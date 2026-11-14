<script setup>
import { computed, ref } from 'vue'
import { useMainStore } from '../stores/mainStore'
import BzIcon from '../components/BzIcon.vue'

defineEmits(['search'])
const store = useMainStore()
const hkDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
const today = hkDate(Date.now())
const currentMonth = today.slice(0, 7)
const selectedMonth = ref(currentMonth)
const months = computed(() => [...new Set([currentMonth, ...store.transactions.map(t => t.created_at && hkDate(t.created_at).slice(0, 7)).filter(Boolean)])].sort((a, b) => b.localeCompare(a)))
const monthRows = computed(() => store.transactions.filter(t => t.created_at && hkDate(t.created_at).startsWith(selectedMonth.value)))
const todayRows = computed(() => store.transactions.filter(t => t.created_at && hkDate(t.created_at) === today))
const income = computed(() => monthRows.value.reduce((n, t) => n + (t.type === 'income' ? Number(t.amount || 0) : 0), 0))
const profit = computed(() => monthRows.value.reduce((n, t) => n + (t.type === 'income' ? Number(t.profit ?? t.amount ?? 0) : t.type === 'expense' ? -Number(t.amount || 0) : 0), 0))
const todayIncome = computed(() => todayRows.value.reduce((n, t) => n + (t.type === 'income' ? Number(t.amount || 0) : 0), 0))
const todaySales = computed(() => todayRows.value.filter(t => t.type === 'income').length)
const todayShipments = computed(() => todayRows.value.filter(t => t.type === 'income' && (t.product_name || /零售|產品|出貨/.test(t.category || ''))).length)
const todayExpenses = computed(() => todayRows.value.filter(t => t.type === 'expense'))
const expenseTotal = computed(() => todayExpenses.value.reduce((n, t) => n + Number(t.amount || 0), 0))
const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
const greeting = hour < 11 ? '早晨！' : hour < 18 ? '午安！' : '晚上好！'
const greetingIcon = hour < 18 ? '☀️' : '🌙'
const money = n => Number(n || 0).toLocaleString('en-HK', { maximumFractionDigits: 2 })
function quick(view, kind) {
  store.pendingQuickEntry = kind ? { kind, type: 'expense' } : null
  store.view = view
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

    <section class="bz-metrics" aria-label="每月財務概況">
      <button type="button" class="bz-metric" @click="store.view='dashboard'"><span class="bz-metric-icon terracotta"><BzIcon name="coins" :size="23" /></span><span class="bz-metric-copy"><span>本月收入</span><strong>HK$ {{ money(income) }}</strong></span><BzIcon class="bz-metric-chevron" name="chevronRight" :size="18" /></button>
      <button type="button" class="bz-metric" @click="store.view='dashboard'"><span class="bz-metric-icon olive"><BzIcon name="chart" :size="23" /></span><span class="bz-metric-copy"><span>本月利潤</span><strong>HK$ {{ money(profit) }}</strong><small v-if="income">利潤率 {{ (profit / income * 100).toFixed(1) }}%</small></span><BzIcon class="bz-metric-chevron" name="chevronRight" :size="18" /></button>
    </section>
    <p v-if="store.isSyncing || store.hasMoreTxn" class="bz-sync-note">{{ store.isSyncing ? '正在同步最新資料…' : '舊交易仍在載入，金額會自動更新。' }}</p>

    <section class="bz-quick-section">
      <h2><span aria-hidden="true">ϟ</span> 快速記錄</h2>
      <div class="bz-quick-actions">
        <button class="primary" type="button" @click="quick('retail')"><BzIcon name="plus" :size="26"/><span>新增交易</span></button>
        <button type="button" @click="quick('retail')"><BzIcon name="box"/><span>出貨／銷售</span></button>
        <button type="button" @click="quick('inventory')"><BzIcon name="cart"/><span>入貨／補貨</span></button>
        <button type="button" @click="quick('accounting', 'transaction')"><BzIcon name="receipt"/><span>支出記錄</span></button>
        <button type="button" @click="quick('clients', 'client')"><BzIcon name="userPlus"/><span>新增客戶</span></button>
      </div>
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
