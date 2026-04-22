<script setup>
import { computed, ref } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BaseModal from '../components/BaseModal.vue'

const store = useMainStore()

// 狀態控制
const showAddModal = ref(false)
const filterType = ref('all')

// 獲取今天日期 YYYY-MM-DD
const today = new Date().toISOString().split('T')[0]

// 表單資料
const newTxn = ref({
  type: 'expense', // 預設支出
  date: today,
  category: '廣告費用',
  amount: '',
  note: '',
  handler: '股東'
})

// 分類清單
const categories = {
  expense: ['廣告費用', '觀塘租金', '中環租金', '佐敦租金', '馬拉松費用', '產品採購', '其他支出'],
  income: ['其他收入', '股東注資']
}

// 監聽類型切換，自動換預設分類
const setTxnType = (t) => {
  newTxn.value.type = t
  newTxn.value.category = categories[t][0]
}

// 提交表單
async function handleAddTxn() {
  if (!newTxn.value.amount || newTxn.value.amount <= 0) return alert('請輸入有效金額')
  
  const txnData = {
    type: newTxn.value.type,
    amount: newTxn.value.amount,
    category: newTxn.value.category,
    note: newTxn.value.note,
    branch: newTxn.value.handler, // 暫時借用 branch 欄位存經手人/歸屬
    created_at: new Date(newTxn.value.date).toISOString()
  }

  const { error } = await supabase.from('transactions').insert([txnData])
  
  if (error) {
    alert('記帳失敗: ' + error.message)
  } else {
    showAddModal.value = false
    newTxn.value = { type: 'expense', date: today, category: '廣告費用', amount: '', note: '', handler: '股東' }
    store.syncAll()
  }
}

// 列表篩選
const filteredTxns = computed(() => {
  let l = store.transactions
  if (filterType.value === 'income') l = l.filter(t => t.type === 'income')
  if (filterType.value === 'expense') l = l.filter(t => t.type === 'expense')
  return l.slice(0, 100)
})

const fmtDate = (d) => new Date(d).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' })
</script>

<template>
  <div class="page">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <h2 class="page-title" style="margin:0;">內部營運流水帳</h2>
      <button class="tag" style="background:var(--p); color:white; border:none; padding:8px 16px;" @click="showAddModal = true">
        + 新增紀錄
      </button>
    </div>

    <div class="card" style="padding:15px; margin-bottom:15px;">
      <div class="filter-tags">
        <button class="tag" :class="{active: filterType==='all'}" @click="filterType='all'">全部</button>
        <button class="tag" :class="{active: filterType==='income'}" @click="filterType='income'">💰 收入</button>
        <button class="tag" :class="{active: filterType==='expense'}" @click="filterType='expense'">💸 支出</button>
      </div>
    </div>

    <div v-for="t in filteredTxns" :key="t.id" class="txn-item">
      <div class="txn-icon" :class="t.type">
        {{ t.type==='income' ? '💰' : '💸' }}
      </div>
      <div style="flex:1">
        <div class="txn-note">{{ t.category }} <span v-if="t.note" style="font-size:13px; color:var(--t3); font-weight:600;">- {{ t.note }}</span></div>
        <div class="txn-meta">經手: {{ t.branch || '股東' }} · {{ fmtDate(t.created_at) }}</div>
      </div>
      <div class="txn-amount" :style="{color: t.type==='income'?'var(--g)':'var(--r)'}">
        {{ t.type==='income' ? '+' : '-' }} ${{ Number(t.amount).toLocaleString() }}
      </div>
    </div>

    <BaseModal :show="showAddModal" title="+ 新增紀錄" @close="showAddModal = false">
      
      <div class="form-item" style="margin-bottom:15px;">
        <label>類型</label>
        <div style="display:flex; gap:10px;">
          <button class="type-btn" :class="{active: newTxn.type==='income'}" @click="setTxnType('income')">💰 收入</button>
          <button class="type-btn expense" :class="{active: newTxn.type==='expense'}" @click="setTxnType('expense')">💸 支出</button>
        </div>
      </div>

      <div class="form-item">
        <label>日期</label>
        <input type="date" v-model="newTxn.date" class="inp">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>選擇分類</label>
        <select v-model="newTxn.category" class="inp">
          <option v-for="cat in categories[newTxn.type]" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>金額 (HK$)</label>
        <input type="number" v-model="newTxn.amount" class="inp" placeholder="輸入金額">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>備註</label>
        <input type="text" v-model="newTxn.note" class="inp" placeholder="選填">
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>經手人</label>
        <select v-model="newTxn.handler" class="inp">
          <option value="股東">股東</option>
          <option value="觀塘店">觀塘店</option>
          <option value="中環店">中環店</option>
        </select>
      </div>

      <button class="btn-primary" @click="handleAddTxn" style="width:100%; margin-top:25px;">
        確認入帳
      </button>
    </BaseModal>
  </div>
</template>

<style scoped>
.txn-item { background: #fff; padding: 16px; border-radius: 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border); }
.txn-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.txn-icon.income { background: #ecfdf5; }
.txn-icon.expense { background: #fef2f2; }
.txn-note { font-weight: 800; font-size: 15px; color: var(--t); }
.txn-meta { font-size: 12px; color: var(--t3); margin-top: 4px; font-weight: 600; }
.txn-amount { font-weight: 900; font-size: 17px; }

.filter-tags { display: flex; gap: 8px; overflow-x: auto; }
.tag { padding: 6px 14px; border-radius: 12px; font-size: 13px; font-weight: 800; background: #fff; border: 1px solid var(--border); }
.tag.active { background: var(--p); color: #fff; border-color: var(--p); }

.form-item label { display: block; margin-bottom: 6px; font-weight: 700; font-size: 13px; color: var(--t2); }
.type-btn { flex: 1; padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: #fff; font-weight: 800; font-size: 14px; cursor: pointer; color: var(--t2); }
.type-btn.active { background: var(--p); color: #fff; border-color: var(--p); }
.type-btn.expense.active { background: var(--r); border-color: var(--r); }
</style>