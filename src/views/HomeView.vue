<script setup>
import { computed } from 'vue'
import { useMainStore } from '../stores/mainStore'

defineEmits(['search'])
const store = useMainStore()
const hkDay = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(value))
const today = computed(() => hkDay(Date.now()))
const month = computed(() => today.value.slice(0, 7))
const monthLabel = computed(() => `${Number(month.value.slice(5))} 月`)
const money = value => Number(value || 0).toLocaleString('en-HK', { maximumFractionDigits: 2 })
const thisMonth = computed(() => store.transactions.filter(row => row.created_at && hkDay(row.created_at).startsWith(month.value)))
const income = computed(() => thisMonth.value.reduce((sum, row) => sum + (row.type === 'income' ? Number(row.amount || 0) : 0), 0))
const expense = computed(() => thisMonth.value.reduce((sum, row) => sum + (row.type === 'expense' ? Number(row.amount || 0) : 0), 0))
const recent = computed(() => [...store.transactions].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5))
const followUps = computed(() => store.clients.filter(c => c.status === 'prospect' || c.status === 'absent').sort((a, b) => String(a.trial_date || '').localeCompare(String(b.trial_date || ''))).slice(0, 3))
const lowStock = computed(() => Object.entries(store.stock).filter(([, qty]) => Number(qty) <= 5).sort((a, b) => Number(a[1]) - Number(b[1])).slice(0, 3))

function quick(type) {
  store.pendingQuickEntry = { kind: 'transaction', type }
  store.view = 'accounting'
}
function newClient() {
  store.pendingQuickEntry = { kind: 'client' }
  store.view = 'clients'
}
</script>

<template>
  <div class="bz-home">
    <section class="bz-hero">
      <div class="bz-hero-top"><span>今日工作台</span><span>{{ today }}</span></div>
      <h1>記低每一單，<br>生意更清楚。</h1>
      <p>記帳、搵客戶、睇庫存，由呢度開始。</p>
      <button class="bz-hero-search" type="button" @click="$emit('search')"><span>⌕</span> 搜尋客戶、紀錄或產品 <span>→</span></button>
    </section>

    <section class="bz-actions" aria-label="常用操作">
      <button type="button" @click="quick('income')"><span class="bz-action-icon income">＋</span><b>記收入</b><small>快速新增</small></button>
      <button type="button" @click="quick('expense')"><span class="bz-action-icon expense">−</span><b>記支出</b><small>快速新增</small></button>
      <button type="button" @click="newClient"><span class="bz-action-icon client">♙</span><b>新客戶</b><small>登記資料</small></button>
      <button type="button" @click="store.view='retail'"><span class="bz-action-icon retail">▣</span><b>零售</b><small>開始結帳</small></button>
    </section>

    <section class="bz-section">
      <div class="bz-section-head"><div><small>生意概況</small><h2>{{ monthLabel }}收支</h2></div><button type="button" @click="store.view='dashboard'">詳細報表 →</button></div>
      <p v-if="store.hasMoreTxn" class="bz-subtle">較舊紀錄仍在載入，金額會隨同步更新。</p>
      <div class="bz-stat-grid">
        <div class="bz-stat"><span>收入</span><strong class="positive">HK$ {{ money(income) }}</strong></div>
        <div class="bz-stat"><span>支出</span><strong class="negative">HK$ {{ money(expense) }}</strong></div>
        <div class="bz-stat wide"><span>收支差額</span><strong>HK$ {{ money(income - expense) }}</strong><small>按交易金額計算</small></div>
      </div>
    </section>

    <section class="bz-section">
      <div class="bz-section-head"><div><small>唔使逐頁搵</small><h2>最近紀錄</h2></div><button type="button" @click="store.view='accounting'">查看全部 →</button></div>
      <div class="bz-list">
        <div v-for="row in recent" :key="row.id" class="bz-list-row">
          <span class="bz-row-icon" :class="row.type">{{ row.type === 'expense' ? '−' : '+' }}</span>
          <div><b>{{ row.client_name || row.category || '未分類' }}</b><small>{{ row.category }} · {{ hkDay(row.created_at) }}</small></div>
          <strong :class="row.type">{{ row.type === 'expense' ? '−' : '+' }}${{ money(row.amount) }}</strong>
        </div>
        <p v-if="!recent.length" class="bz-empty">暫時未有紀錄。用上面嘅快捷按鈕記第一筆。</p>
      </div>
    </section>

    <div class="bz-two-columns">
      <section class="bz-section">
        <div class="bz-section-head"><div><small>客戶管理</small><h2>待跟進</h2></div><button type="button" @click="store.view='clients'">客戶 →</button></div>
        <div class="bz-list">
          <div v-for="client in followUps" :key="client.id" class="bz-list-row"><span class="bz-row-icon client">{{ (client.name || '?').charAt(0) }}</span><div><b>{{ client.name }}</b><small>{{ client.branch || '未設定分店' }} · {{ client.status === 'absent' ? '需補堂' : '試堂／預約' }}</small></div></div>
          <p v-if="!followUps.length" class="bz-empty">目前冇待跟進客戶。</p>
        </div>
      </section>
      <section class="bz-section">
        <div class="bz-section-head"><div><small>庫存管理</small><h2>低存量</h2></div><button type="button" @click="store.view='inventory'">庫存 →</button></div>
        <div class="bz-list">
          <div v-for="[key, qty] in lowStock" :key="key" class="bz-list-row"><span class="bz-row-icon stock">▤</span><div><b>{{ key.replace(/_[^_]+$/, '') }}</b><small>{{ key.split('_').at(-1) }}</small></div><strong class="negative">{{ qty }} 件</strong></div>
          <p v-if="!lowStock.length" class="bz-empty">暫時冇低存量項目。</p>
        </div>
      </section>
    </div>
  </div>
</template>
