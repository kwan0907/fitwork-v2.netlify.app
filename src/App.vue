<script setup>
import { onMounted } from 'vue'
import { useMainStore } from './stores/mainStore'

import DashboardView from './views/DashboardView.vue'
import ClientsView from './views/ClientsView.vue'
import AccountingView from './views/AccountingView.vue'
import InventoryView from './views/InventoryView.vue'
import MovementView from './views/MovementView.vue'
import RetailView from './views/RetailView.vue'

const store = useMainStore()

onMounted(() => {
  store.syncAll()
})
</script>

<template>
  <div id="app">
    <div class="header">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:24px;">💪</span>
        <span style="font-weight:900; font-size:18px; color:var(--p); letter-spacing:-1px;">FITWORK PRO</span>
      </div>
      <button class="icon-btn" @click="store.syncAll()"><span>↻</span></button>
    </div>

    <div class="content">
      <DashboardView v-if="store.view === 'dashboard'" />
      <PromoView v-else-if="store.view === 'promo'" />
      <ClientsView v-else-if="store.view === 'clients'" />
      <MovementView v-else-if="store.view === 'movement'" />
      <RetailView v-else-if="store.view === 'retail'" />
      <InventoryView v-else-if="store.view === 'inventory'" />
      <AccountingView v-else-if="store.view === 'accounting'" />
    </div>

    <div class="nav">
      <div class="nav-item" :class="{active: store.view==='dashboard'}" @click="store.view='dashboard'"><span>📊</span><span>總覽</span></div>
      <div class="nav-item" :class="{active: store.view==='promo'}" @click="store.view='promo'"><span>📢</span><span>宣傳</span></div>
      <div class="nav-item" :class="{active: store.view==='clients'}" @click="store.view='clients'"><span>👥</span><span>客戶</span></div>
      <div class="nav-item" :class="{active: store.view==='movement'}" @click="store.view='movement'"><span>🏋️</span><span>運動</span></div>
      <div class="nav-item" :class="{active: store.view==='retail'}" @click="store.view='retail'"><span>🛒</span><span>零售</span></div>
      <div class="nav-item" :class="{active: store.view==='inventory'}" @click="store.view='inventory'"><span>📦</span><span>庫存</span></div>
      <div class="nav-item" :class="{active: store.view==='accounting'}" @click="store.view='accounting'"><span>📝</span><span>記帳</span></div>
    </div>
  </div>
</template>

<style>
#app { height: 100vh; display: flex; flex-direction: column; }
.header { background: rgba(255,255,255,0.9); backdrop-filter: blur(20px); padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 50; }
.content { flex: 1; overflow-y: auto; padding-bottom: 120px; }
.nav { background: rgba(255,255,255,0.95); backdrop-filter: blur(20px); border-top: 1px solid var(--border); display: flex; padding: 10px 4px 30px; position: fixed; bottom: 0; width: 100%; z-index: 100; }
.nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; color: var(--t3); font-size: 10px; font-weight: 700; cursor: pointer; }
.nav-item.active { color: var(--p); }
.nav-item span:first-child { font-size: 24px; margin-bottom: 4px; }
.icon-btn { background: var(--bg); border: none; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-weight: 900; }
</style>