<script setup>
import { computed, nextTick, ref, watch, onUnmounted } from 'vue'
import { useMainStore } from '../stores/mainStore'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const store = useMainStore()
const query = ref('')
const input = ref(null)
const loadingHistory = ref(false)
const term = computed(() => query.value.trim().toLocaleLowerCase('zh-HK'))
const matches = (...parts) => parts.some(part => String(part || '').toLocaleLowerCase('zh-HK').includes(term.value))
const clients = computed(() => term.value ? store.clients.filter(c => matches(c.name, c.phone, c.branch, c.remark)).slice(0, 8) : store.clients.slice(0, 3))
const transactions = computed(() => term.value ? store.transactions.filter(t => matches(t.client_name, t.category, t.note, t.amount, t.staff)).slice(0, 8) : store.transactions.slice(0, 3))
const products = computed(() => term.value ? store.products.filter(p => matches(p.name, p.name_en, p.id)).slice(0, 8) : [])

watch(() => props.open, async open => {
  if (!open) return
  query.value = ''
  await nextTick()
  input.value?.focus()
  if (store.hasMoreTxn) {
    loadingHistory.value = true
    try { await store.loadAllTransactions() } finally { loadingHistory.value = false }
  }
})
const onKeydown = event => { if (event.key === 'Escape' && props.open) emit('close') }
window.addEventListener('keydown', onKeydown)
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function openResult(kind, row) {
  store.pendingSearch = { kind, id: kind === 'client' ? row.id : undefined,
    query: kind === 'client' || kind === 'product' ? row.name : (row.client_name || row.category || row.note || '') }
  store.view = kind === 'client' ? 'clients' : kind === 'product' ? 'inventory' : 'accounting'
  emit('close')
}
function addClientFromSearch() {
  store.pendingQuickEntry = { kind: 'client', seed: query.value.trim() }
  store.view = 'clients'
  emit('close')
}
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="bz-search-backdrop" @click.self="$emit('close')">
      <section class="bz-search-panel" role="dialog" aria-modal="true" aria-label="搜尋資料">
        <div class="bz-search-head"><h2>搜尋資料</h2><button type="button" aria-label="關閉搜尋" @click="$emit('close')">✕</button></div>
        <div class="bz-search-input"><span>⌕</span><input ref="input" v-model="query" type="search" placeholder="姓名、電話、交易或產品" aria-label="搜尋姓名、電話、交易或產品"><button v-if="query" type="button" @click="query=''">清除</button></div>
        <p class="bz-search-hint">{{ loadingHistory ? '正在讀取舊交易紀錄…' : store.transactionsLoadError ? '舊交易載入失敗，請稍後再試。' : '搜尋已載入嘅客戶、交易同產品' }}</p>
        <div class="bz-search-results">
          <section v-if="clients.length"><h3>客戶 <span>{{ clients.length }}</span></h3><button v-for="c in clients" :key="c.id" type="button" @click="openResult('client', c)"><span class="bz-result-dot client">{{ (c.name || '?').charAt(0) }}</span><span><b>{{ c.name }}</b><small>{{ c.phone || '無電話' }} · {{ c.branch || '未設定分店' }}</small></span><strong>→</strong></button></section>
          <section v-if="transactions.length"><h3>交易 <span>{{ transactions.length }}</span></h3><button v-for="t in transactions" :key="t.id" type="button" @click="openResult('transaction', t)"><span class="bz-result-dot" :class="t.type">{{ t.type === 'expense' ? '−' : '+' }}</span><span><b>{{ t.client_name || t.category || '未分類' }}</b><small>{{ t.category }} · {{ String(t.created_at || '').slice(0, 10) }}</small></span><strong>HK$ {{ Number(t.amount || 0).toLocaleString() }}</strong></button></section>
          <section v-if="products.length"><h3>產品 <span>{{ products.length }}</span></h3><button v-for="p in products" :key="p.id" type="button" @click="openResult('product', p)"><span class="bz-result-dot stock">▤</span><span><b>{{ p.name }}</b><small>{{ p.name_en || p.id }}</small></span><strong>→</strong></button></section>
          <div v-if="term.length >= 2 && !clients.length && !loadingHistory" class="bz-search-add">
            <p>客戶檔案暫時搵唔到相同姓名或電話。</p>
            <button type="button" @click="addClientFromSearch">＋ 用「{{ query.trim() }}」新增客戶</button>
            <small>儲存前仍會再核對正式客戶資料，避免重複。</small>
          </div>
          <p v-else-if="term && !clients.length && !transactions.length && !products.length && !loadingHistory" class="bz-empty">搵唔到相關資料，試吓其他字眼或電話號碼。</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>
