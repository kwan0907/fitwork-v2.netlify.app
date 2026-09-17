<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
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

const close = () => { open.value = false }
const toggle = () => { open.value = !open.value }

watch(() => store.view, close)
watch(open, (isOpen) => {
  document.body.classList.toggle('qa-is-open', isOpen)
})
onBeforeUnmount(() => document.body.classList.remove('qa-is-open'))

const go = (view) => {
  close()
  store.view = view
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
  <Teleport to="body">
    <div v-if="open" class="qa-backdrop" aria-hidden="true" @pointerdown.self="close"></div>
    <div class="qa-wrap" :class="{ open }">
      <div v-if="open" class="qa-menu" aria-label="快速操作" @pointerdown.stop>
        <div class="qa-menu-head">
          <b>快速操作</b>
          <button type="button" class="qa-close" aria-label="收起快速操作" @click.stop.prevent="close">✕ 收起</button>
        </div>
        <button type="button" class="qa-action" @click="go('clients')"><span>👤</span><b>客戶</b><small>新增／搜尋</small></button>
        <button type="button" class="qa-action" @click="go('movement')"><span>🏋️</span><b>運動</b><small>套票收銀</small></button>
        <button type="button" class="qa-action" @click="go('retail')"><span>🛒</span><b>零售</b><small>快速結帳</small></button>
        <button type="button" class="qa-action" @click="go('accounting')"><span>📝</span><b>記帳</b><small>收入／支出</small></button>

        <div v-if="recentClients.length" class="qa-recent">
          <div class="qa-recent-title"><span>最近客戶</span><small>免搜尋直接帶入</small></div>
          <div v-for="client in recentClients" :key="client.id" class="qa-client-row">
            <div class="qa-client-name"><b>{{ client.name }}</b><small>{{ client.branch || '未設定分店' }}</small></div>
            <button type="button" @click="goClient(client, 'movement')" :aria-label="`${client.name} 運動結帳`">🏋️</button>
            <button type="button" @click="goClient(client, 'retail')" :aria-label="`${client.name} 零售結帳`">🛒</button>
          </div>
        </div>
      </div>
      <button type="button" class="qa-main" :class="{ 'is-open': open }" :aria-expanded="open" :aria-label="open ? '收起快速操作' : '開啟快速操作'" @click.stop.prevent="toggle">
        <span>{{ open ? '×' : '＋' }}</span>
      </button>
    </div>
  </Teleport>
</template>
