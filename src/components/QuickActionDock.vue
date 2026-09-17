<script setup>
import { ref } from 'vue'
import { useMainStore } from '../stores/mainStore'

const store = useMainStore()
const open = ref(false)

const go = (view) => {
  store.view = view
  open.value = false
  requestAnimationFrame(() => {
    const el = document.querySelector('.content')
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
  })
}
</script>

<template>
  <div class="qa-wrap" :class="{ open }">
    <div v-if="open" class="qa-menu" aria-label="快速操作">
      <button class="qa-action" @click="go('clients')"><span>👤</span><b>客戶</b><small>新增／搜尋</small></button>
      <button class="qa-action" @click="go('movement')"><span>🏋️</span><b>運動</b><small>套票收銀</small></button>
      <button class="qa-action" @click="go('retail')"><span>🛒</span><b>零售</b><small>快速結帳</small></button>
      <button class="qa-action" @click="go('accounting')"><span>📝</span><b>記帳</b><small>收入／支出</small></button>
    </div>
    <button class="qa-main" :aria-expanded="open" aria-label="開啟快速操作" @click="open = !open">
      <span :class="{ rotate: open }">＋</span>
    </button>
  </div>
</template>
