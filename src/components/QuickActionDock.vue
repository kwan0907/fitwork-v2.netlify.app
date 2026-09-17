<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'

const store = useMainStore()
const open = ref(false)

const recentClients = computed(() => {
  const seen = new Set()
  const result = []
  for (const txn of store.transactions) {
    const name = (txn?.client_name || '').trim()
    if (!name || seen.has(name)) continue
    const client = store.clients.find(c => c?.name === name)
    if (!client) continue
    seen.add(name)
    result.push(client)
    if (result.length >= 3) break
  }
  return result
})

const go = (view) => {
  store.view = view
  open.value = false
  requestAnimationFrame(() => {
    const el = document.querySelector('.content')
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

const goClient = (client, view) => {
  store.quickActionClient = client.name
  go(view)
}
</script>

<template>
  <div class="qa-wrap" :class="{ open }">
    <div v-if="open" class="qa-menu" aria-label="快速操作">
      <button class="qa-action" @click="go('clients')"><span>👤</span><b>客戶</b><small>新增／搜尋</small></button>
      <button class="qa-action" @click="go('movement')"><span>🏋️</span><b>運動</b><small>套票收銀</small></button>
      <button class="qa-action" @click="go('retail')"><span>🛒</span><b>零售</b><small>快速結帳</small></button>
      <button class="qa-action" @click="go('accounting')"><span>📝</span><b>記帳</b><small>收入／支出</small></button>

      <div v-if="recentClients.length" class="qa-recent">
        <div class="qa-recent-title"><span>最近客戶</span><small>免搜尋直接帶入</small></div>
        <div v-for="client in recentClients" :key="client.id" class="qa-client-row">
          <div class="qa-client-name"><b>{{ client.name }}</b><small>{{ client.branch || '未設定分店' }}</small></div>
          <button @click="goClient(client, 'movement')" :aria-label="`${client.name} 運動結帳`">🏋️</button>
          <button @click="goClient(client, 'retail')" :aria-label="`${client.name} 零售結帳`">🛒</button>
        </div>
      </div>
    </div>
    <button class="qa-main" :aria-expanded="open" aria-label="開啟快速操作" @click="open = !open">
      <span :class="{ rotate: open }">＋</span>
    </button>
  </div>
</template>
