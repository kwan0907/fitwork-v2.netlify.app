<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

// --- 🌟 1. 建立新紀錄的表單狀態 ---
// 移除預設時間，改為空值等待打卡
const form = ref({
  type: '派傳單',
  promo_date: new Date().toISOString().split('T')[0],
  start_time: '',
  end_time: '',
  flyers_count: ''
})

// 💡 【超強升級】草稿讀取：關閉 APP 再打開，資料也不會不見！
onMounted(() => {
  const savedDraft = localStorage.getItem('fitwork_promo_draft')
  if (savedDraft) {
    try {
      const parsed = JSON.parse(savedDraft)
      if (parsed && typeof parsed === 'object') {
        form.value = { ...form.value, ...parsed }
      }
    } catch (e) {
      console.error('草稿讀取失敗', e)
    }
  }
})

// 💡 【超強升級】自動存檔：任何欄位變動，都會即時存進手機的暫存區
watch(form, (newVal) => {
  localStorage.setItem('fitwork_promo_draft', JSON.stringify(newVal))
}, { deep: true })

// 💡 【超強升級】一鍵填入當下時間
const setTimeNow = (field) => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  form.value[field] = `${hh}:${mm}`
}

// --- 🌟 2. 自動計算花費時間 ---
const calculatedDuration = computed(() => {
  if (!form.value.start_time || !form.value.end_time) return '0 小時 0 分鐘'
  
  const start = new Date(`2000-01-01T${form.value.start_time}`)
  const end = new Date(`2000-01-01T${form.value.end_time}`)
  
  let diffMs = end - start
  // 處理跨午夜的情況 (例如晚上 11 點派到凌晨 1 點)
  if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000 
  
  const hrs = Math.floor(diffMs / (1000 * 60 * 60))
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  
  return `${hrs} 小時 ${mins} 分鐘`
})

// 提交新紀錄
async function submitPromoRecord() {
  if (!form.value.start_time) return alert('請輸入或點擊設定「開始時間」！')
  if (!form.value.end_time) return alert('請輸入或點擊設定「結束時間」！')
  if (!form.value.flyers_count) return alert('請輸入「派發數量」！')

  const { error } = await supabase.from('promotions').insert({
    type: form.value.type,
    promo_date: form.value.promo_date,
    start_time: form.value.start_time,
    end_time: form.value.end_time,
    duration: calculatedDuration.value,
    flyers_count: parseInt(form.value.flyers_count),
    inquiries: 0,
    trials: 0,
    conversions: 0
  })

  if (error) return alert('新增失敗: ' + error.message)
  
  alert(`✅ ${form.value.type} 紀錄已成功建立！`)
  
  // 💡 提交成功後：清空表單，並刪除手機裡的草稿暫存
  form.value = {
    type: '派傳單',
    promo_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    flyers_count: ''
  }
  localStorage.removeItem('fitwork_promo_draft')
  
  store.syncAll()
}

// --- 🌟 3. 歷史紀錄列表與更新成效 ---
const promoList = computed(() => {
  const list = store.promotions || []
  // 依照日期由新到舊排序
  return list.sort((a, b) => new Date(b.promo_date) - new Date(a.promo_date))
})

async function updatePerformance(p) {
  const { error } = await supabase.from('promotions').update({
    inquiries: parseInt(p.inquiries || 0),
    trials: parseInt(p.trials || 0),
    conversions: parseInt(p.conversions || 0)
  }).eq('id', p.id)

  if (error) return alert('數據更新失敗: ' + error.message)
  alert('✅ 推廣成效已成功更新！')
  store.syncAll()
}
</script>

<template>
  <div class="page" style="padding-bottom: 120px;">
    <h2 class="page-title">宣傳成效追蹤</h2>

    <div class="card add-card">
      <div class="card-header">
        📋 新增推廣活動
        <span style="font-size:11px; font-weight:700; color:#10b981; float:right; margin-top:2px;">(草稿會自動儲存)</span>
      </div>
      
      <div class="grid-2">
        <div class="form-item"><label>活動類型</label>
          <select v-model="form.type" class="mod-inp">
            <option value="派傳單">📄 派傳單</option>
            <option value="Road Show">🎪 Road Show</option>
          </select>
        </div>
        <div class="form-item"><label>活動日期</label>
          <input type="date" v-model="form.promo_date" class="mod-inp">
        </div>
      </div>

      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item">
          <label>開始打卡</label>
          <div class="time-input-group">
            <input type="time" v-model="form.start_time" class="mod-inp px-small">
            <button class="btn-now" @click="setTimeNow('start_time')">現在</button>
          </div>
        </div>
        <div class="form-item">
          <label>結束打卡</label>
          <div class="time-input-group">
            <input type="time" v-model="form.end_time" class="mod-inp px-small">
            <button class="btn-now" @click="setTimeNow('end_time')">現在</button>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item"><label>本次耗時</label><div class="dur-box">{{ calculatedDuration }}</div></div>
        <div class="form-item">
          <label>派發 / 接觸 (總數)</label>
          <input type="number" v-model="form.flyers_count" class="mod-inp" placeholder="輸入數字...">
        </div>
      </div>

      <button class="btn-main" @click="submitPromoRecord">💾 完成並建立成效追蹤</button>
    </div>

    <div class="section-title">📊 歷史推廣成效 (Funnel)</div>
    <div v-if="promoList.length === 0" style="text-align:center; color:#94a3b8; padding: 30px;">目前尚無紀錄</div>
    
    <div v-for="p in promoList" :key="p.id" class="card result-card">
      <div class="r-head">
        <div class="r-title">{{ p.type === '派傳單' ? '📄' : '🎪' }} {{ p.type }}</div>
        <div class="r-date">{{ p.promo_date }}</div>
      </div>
      
      <div class="r-meta">
        <span>⏰ {{ p.start_time?.slice(0,5) }} - {{ p.end_time?.slice(0,5) }} ({{ p.duration }})</span>
        <span class="stk-tag">派發: <b>{{ p.flyers_count }}</b></span>
      </div>

      <div class="funnel-divider"></div>

      <div class="funnel-grid">
        <div class="f-item">
          <label>💬 查詢</label>
          <input type="number" v-model="p.inquiries" class="f-inp">
        </div>
        <div class="f-item">
          <label>🧪 試堂</label>
          <input type="number" v-model="p.trials" class="f-inp">
        </div>
        <div class="f-item">
          <label>👑 開卡</label>
          <input type="number" v-model="p.conversions" class="f-inp highlight-inp">
        </div>
      </div>

      <button class="btn-save-stats" @click="updatePerformance(p)">更新當前轉化數據</button>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; margin-bottom: 20px; }
.card { background: white; border-radius: 20px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.02); }
.add-card { border-top: 5px solid #4f46e2; }
.card-header { font-weight: 900; font-size: 16px; color: #1e293b; margin-bottom: 15px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

.form-item label { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; }

/* 防手機放大 */
.mod-inp { 
  width: 100%; border: 1px solid #cbd5e1; padding: 12px; border-radius: 12px; 
  font-weight: 700; outline: none; color: #1e293b; font-size: 16px; 
  appearance: none; background: #f8fafc;
}
.mod-inp:focus { border-color: #4f46e2; background: white; }

/* 💡 時間打卡專用排版 */
.time-input-group { display: flex; gap: 6px; }
.px-small { padding: 12px 8px; }
.btn-now { 
  background: #eef2ff; color: #4f46e2; border: 1px solid #c7d2fe; border-radius: 10px; 
  font-weight: 900; font-size: 13px; padding: 0 12px; cursor: pointer; white-space: nowrap; 
  transition: 0.2s;
}
.btn-now:active { background: #e0e7ff; transform: scale(0.95); }

.dur-box { 
  background: #eef2ff; color: #4f46e2; padding: 12px; border-radius: 12px; 
  font-weight: 900; font-size: 13px; text-align: center; border: 1px dashed #a5b4fc; 
}

.btn-main { 
  width: 100%; padding: 16px; background: #4f46e2; color: white; border: none; 
  border-radius: 14px; font-weight: 900; font-size: 16px; margin-top: 20px; 
  cursor: pointer; transition: 0.2s; 
}
.btn-main:active { transform: scale(0.97); }

.section-title { font-size: 15px; font-weight: 900; color: #475569; margin: 30px 0 15px; }

.result-card { background: white; border-left: 5px solid #10b981; }
.r-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.r-title { font-weight: 900; font-size: 17px; color: #1e293b; }
.r-date { font-size: 12px; font-weight: 800; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; }
.r-meta { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; color: #475569; }
.stk-tag { background: #fff7ed; color: #d97706; padding: 2px 8px; border-radius: 6px; }
.funnel-divider { border-bottom: 1px dashed #e2e8f0; margin: 15px 0; }

.funnel-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px; }
.f-item label { display: block; font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 5px; text-align: center; }
.f-inp { 
  width: 100%; border: 1.5px solid #cbd5e1; padding: 10px; border-radius: 10px; 
  font-weight: 900; font-size: 18px; text-align: center; outline: none; 
  color: #1e293b; background: white;
}
.highlight-inp { border-color: #10b981; color: #10b981; background: #ecfdf5; }

.btn-save-stats { 
  width: 100%; padding: 12px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; 
  border-radius: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; 
}
.btn-save-stats:active { background: #e2e8f0; }
</style>