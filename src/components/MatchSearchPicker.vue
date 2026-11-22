<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  label: { type: String, required: true },
  placeholder: { type: String, default: '輸入名稱搜尋' }
})
const emit = defineEmits(['update:modelValue'])
const input = ref(null)
const query = ref('')
const open = ref(false)
const activeIndex = ref(-1)
let blurTimer

const selected = computed(() => props.options.find(option => option.value === props.modelValue))
watch([() => props.modelValue, () => selected.value?.label], () => {
  if (!open.value) query.value = selected.value?.label || ''
}, { immediate: true })

const matches = computed(() => {
  const words = query.value.trim().toLocaleLowerCase().normalize('NFKC').split(/\s+/).filter(Boolean)
  return props.options.filter(option => {
    const text = String(option.searchText || option.label).toLocaleLowerCase().normalize('NFKC')
    return words.every(word => text.includes(word))
  })
})
const visibleMatches = computed(() => matches.value.slice(0, 8))

function onInput(event) {
  query.value = event.target.value
  open.value = true
  activeIndex.value = -1
  if (props.modelValue && query.value !== selected.value?.label) emit('update:modelValue', '')
}

function pick(option) {
  clearTimeout(blurTimer)
  query.value = option.label
  open.value = false
  emit('update:modelValue', option.value)
}

function clearSelection() {
  clearTimeout(blurTimer)
  query.value = ''
  activeIndex.value = -1
  open.value = true
  emit('update:modelValue', '')
  input.value?.focus()
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    open.value = false
    query.value = selected.value?.label || ''
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    const move = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = Math.max(0, Math.min(visibleMatches.value.length - 1, activeIndex.value + move))
  } else if (event.key === 'Enter' && open.value && visibleMatches.value.length) {
    event.preventDefault()
    pick(visibleMatches.value[activeIndex.value] || visibleMatches.value[0])
  }
}

function closeSoon() {
  clearTimeout(blurTimer)
  blurTimer = setTimeout(() => { open.value = false }, 180)
}
onBeforeUnmount(() => clearTimeout(blurTimer))
</script>

<template>
  <div class="match-picker">
    <div class="match-input-wrap">
      <span class="match-search-icon" aria-hidden="true">⌕</span>
      <input ref="input" :value="query" type="text" inputmode="search" role="combobox" :aria-label="label" aria-autocomplete="list" :aria-expanded="open" :placeholder="placeholder" autocomplete="off" @focus="open = true; $event.target.select()" @input="onInput" @keydown="onKeydown" @blur="closeSoon">
      <button v-if="query" type="button" class="match-clear" :aria-label="`清除${label}`" @mousedown.prevent @click="clearSelection">×</button>
    </div>
    <div v-if="open" class="match-results" role="listbox" :aria-label="`${label}搜尋結果`">
      <button v-for="(option, index) in visibleMatches" :key="option.value" type="button" role="option" :aria-selected="option.value === modelValue" :class="{ active: index === activeIndex }" @mousedown.prevent @click="pick(option)">
        <span>{{ option.label }}</span><strong v-if="option.value === modelValue">✓</strong>
      </button>
      <p v-if="!matches.length">搵唔到相符資料；試吓其他字、電話或 SKU。</p>
      <p v-else-if="matches.length > visibleMatches.length">仲有 {{ matches.length - visibleMatches.length }} 項，繼續輸入可縮窄結果。</p>
    </div>
  </div>
</template>

<style scoped>
.match-picker { min-width: 0; }
.match-input-wrap { position: relative; display: flex; align-items: center; }
.match-input-wrap input { width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 9px 40px 9px 36px; border: 1px solid #dfcabc; border-radius: 11px; background: #fff; color: #342922; font: inherit; font-size: 16px; }
.match-input-wrap input:focus { outline: 2px solid #c98260; outline-offset: 1px; }
.match-search-icon { position: absolute; left: 13px; color: #9f7a65; font-size: 24px; pointer-events: none; }
.match-clear { position: absolute; right: 6px; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: #f5ebe4; color: #84604c; font-size: 21px; cursor: pointer; }
.match-results { margin-top: 5px; padding: 4px; border: 1px solid #e5d4c7; border-radius: 11px; background: #fffdfa; box-shadow: 0 8px 20px rgba(62,42,30,.08); }
.match-results button { display: flex; justify-content: space-between; gap: 8px; width: 100%; min-height: 42px; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent; color: #3b2d25; text-align: left; font: inherit; font-size: 14px; cursor: pointer; }
.match-results button + button { border-top: 1px solid #f3ebe5; }
.match-results button:hover,.match-results button.active { background: #f8eee7; }
.match-results strong { color: #658052; }
.match-results p { margin: 5px 9px; color: #957c6b; font-size: 12px; line-height: 1.4; }
</style>
