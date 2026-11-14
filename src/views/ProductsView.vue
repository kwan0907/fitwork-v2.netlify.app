<script setup>
import { computed, ref } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BzIcon from '../components/BzIcon.vue'

const store = useMainStore()
const query = ref('')
const category = ref('全部')
const formOpen = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const editingId = ref(null)
const priceFields = [['retail_price', '零售參考價'], ['price_standard', '標準售價'], ['price_bronze', '銅級'], ['price_silver', '銀級'], ['price_gold', '金級'], ['price_58', '58折'], ['price_50', '半價'], ['cost', '成本']]
const form = ref({ name: '', category: '', unit: '件', retail_price: '', price_standard: '', price_bronze: '', price_silver: '', price_gold: '', price_58: '', price_50: '', cost: '' })
let originalProduct = null
const categories = computed(() => ['全部', ...new Set(store.products.map(p => p.category).filter(Boolean))])
const results = computed(() => store.products.filter(p => {
  const q = query.value.trim().toLowerCase()
  return (category.value === '全部' || p.category === category.value) &&
    (!q || [p.name, p.name_en, p.id, p.category].some(v => String(v || '').toLowerCase().includes(q)))
}))
const money = value => Number(value || 0).toLocaleString('en-HK', { maximumFractionDigits: 2 })
function edit(product) {
  editingId.value = product.id
  originalProduct = product
  form.value = { name: product.name || '', category: product.category || '', unit: product.unit || '件' }
  priceFields.forEach(([key]) => { form.value[key] = product[key] ?? '' })
  errorMessage.value = ''
  formOpen.value = true
}
function add() {
  editingId.value = null
  originalProduct = null
  form.value = { name: '', category: '', unit: '件' }
  priceFields.forEach(([key]) => { form.value[key] = '' })
  errorMessage.value = ''
  formOpen.value = true
}
async function save() {
  const name = form.value.name.trim()
  if (!name || priceFields.some(([key]) => form.value[key] !== '' && (!Number.isFinite(Number(form.value[key])) || Number(form.value[key]) < 0))) {
    errorMessage.value = '請填寫產品名稱；價格同成本只可輸入零或正數。'
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('登入已過期，請重新登入。')
    const payload = { name, category: form.value.category.trim(), unit: form.value.unit.trim() || '件' }
    priceFields.forEach(([key]) => {
      const next = form.value[key] === '' ? null : Number(form.value[key])
      if (!originalProduct || next !== originalProduct[key]) payload[key] = next
    })
    if (!originalProduct) payload.price = payload.retail_price || payload.price_standard || 0
    const request = editingId.value
      ? supabase.from('products').update(payload).eq('id', editingId.value)
      : supabase.from('products').insert(payload)
    const { data, error } = await request.select('*').single()
    if (error) throw error
    if (!data) throw new Error('未能確認儲存結果；請重新整理再檢查。')
    await store.syncAll()
    formOpen.value = false
  } catch (err) {
    errorMessage.value = '儲存失敗：' + (err?.message || '請稍後再試')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="bz-products-page">
    <div class="bz-products-heading"><div><small>產品資料</small><h1>產品管理</h1><p>搜尋產品、查閱售價及成本。</p></div><button type="button" class="btn-primary" @click="add"><BzIcon name="plus" :size="18"/> 新增產品</button></div>
    <label class="bz-product-search"><BzIcon name="search" :size="20"/><input v-model="query" type="search" placeholder="搜尋產品名稱、英文名稱或編號"></label>
    <div class="bz-product-cats"><button v-for="cat in categories" :key="cat" type="button" :class="{ active: category === cat }" @click="category=cat">{{ cat }}</button></div>
    <div class="bz-products-count">共 {{ results.length }} 款產品</div>
    <div class="bz-product-grid">
      <button v-for="p in results" :key="p.id" type="button" class="bz-product-card" @click="edit(p)"><span class="bz-product-mark"><BzIcon name="bag" :size="25"/></span><span class="bz-product-details"><strong>{{ p.name }}</strong><small>{{ p.name_en || p.category || '未分類' }}</small><span>標準價 HK$ {{ money(p.price_standard ?? p.retail_price ?? p.price) }} <i>·</i> 成本 HK$ {{ money(p.cost) }}</span></span><BzIcon name="chevronRight" :size="18"/></button>
      <p v-if="!results.length" class="bz-product-empty">搵唔到產品。試吓其他關鍵字。</p>
    </div>

    <div v-if="formOpen" class="bz-product-overlay" @click.self="formOpen=false">
      <form class="bz-product-modal" @submit.prevent="save"><div class="bz-product-modal-head"><h2>{{ editingId ? '編輯產品' : '新增產品' }}</h2><button type="button" aria-label="關閉" @click="formOpen=false">×</button></div>
        <label>產品名稱<input v-model="form.name" required maxlength="120"></label>
        <label>分類<input v-model="form.category" list="bz-product-categories"><datalist id="bz-product-categories"><option v-for="cat in categories.slice(1)" :key="cat" :value="cat"/></datalist></label>
        <label>單位<input v-model="form.unit" maxlength="20"></label>
        <div class="bz-product-fields"><label v-for="[key, label] in priceFields" :key="key">{{ label }}（HK$）<input v-model="form[key]" type="number" inputmode="decimal" min="0" step="0.01" placeholder="未設定"></label></div>
        <p class="bz-product-hint">只會儲存以上產品欄位；現有交易同庫存數量唔會改動。</p>
        <p v-if="errorMessage" role="alert" class="bz-product-error">{{ errorMessage }}</p>
        <button type="submit" class="btn-primary" :disabled="busy">{{ busy ? '儲存中…' : '儲存產品' }}</button>
      </form>
    </div>
  </div>
</template>
