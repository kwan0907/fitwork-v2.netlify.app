<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

const store = useMainStore()

// --- 🌟 1. 建立新紀錄的表單狀態 ---
const form = ref({
  type: '派傳單',
  promo_date: new Date().toISOString().split('T')[0],
  start_time: '',
  end_time: '',
  flyers_count: '',
  note: '' 
})

// 💡 編輯視窗狀態
const showEditModal = ref(false)
const editingPromo = ref({})

// 💡 草稿讀取
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

// 💡 自動存檔
watch(form, (newVal) => {
  localStorage.setItem('fitwork_promo_draft', JSON.stringify(newVal))
}, { deep: true })

// 💡 一鍵填入當下時間
const setTimeNow = (field) => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  form.value[field] = `${hh}:${mm}`
}

const setEditTimeNow = (field) => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  editingPromo.value[field] = `${hh}:${mm}`
}

// --- 🌟 2. 自動計算花費時間 ---
const calculatedDuration = computed(() => {
  if (!form.value.start_time || !form.value.end_time) return '0 小時 0 分鐘'
  const start = new Date(`2000-01-01T${form.value.start_time}`)
  const end = new Date(`2000-01-01T${form.value.end_time}`)
  let diffMs = end - start
  if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000 
  const hrs = Math.floor(diffMs / (1000 * 60 * 60))
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  return `${hrs} 小時 ${mins} 分鐘`
})

const editCalculatedDuration = computed(() => {
  if (!editingPromo.value.start_time || !editingPromo.value.end_time) return '0 小時 0 分鐘'
  const start = new Date(`2000-01-01T${editingPromo.value.start_time}`)
  const end = new Date(`2000-01-01T${editingPromo.value.end_time}`)
  let diffMs = end - start
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
    note: form.value.note, 
    inquiries: 0,
    trials: 0,
    conversions: 0
  })

  if (error) return alert('新增失敗: ' + error.message)
  alert(`✅ ${form.value.type} 紀錄已成功建立！`)
  
  form.value = {
    type: '派傳單', promo_date: new Date().toISOString().split('T')[0],
    start_time: '', end_time: '', flyers_count: '', note: '' 
  }
  localStorage.removeItem('fitwork_promo_draft')
  store.syncAll()
}

// --- 🌟 3. 歷史紀錄列表與資料統計 ---
const promoList = computed(() => {
  const list = store.promotions || []
  // 💡 修復即時刷新問題：拷貝一份陣列再排序，不再卡住 Vue 的大腦
  return [...list].sort((a, b) => new Date(b.promo_date) - new Date(a.promo_date))
})

// 💡 【完美修復版】統計大腦：計算 Sum 與 轉換率
const promoSummary = computed(() => {
  let totalMins = 0, flyers = 0, inquiries = 0, trials = 0, conversions = 0
  
  promoList.value.forEach(p => {
    // 時間拆解
    const hrsMatch = (p.duration || '').match(/(\d+)\s*小時/)
    const minsMatch = (p.duration || '').match(/(\d+)\s*分鐘/)
    totalMins += (hrsMatch ? parseInt(hrsMatch[1]) * 60 : 0) + (minsMatch ? parseInt(minsMatch[1]) : 0)
    
    // 💡 安全的數字轉換，防止有空格或空值導致計算崩潰
    flyers += Number(p.flyers_count) || 0
    inquiries += Number(p.inquiries) || 0
    trials += Number(p.trials) || 0
    conversions += Number(p.conversions) || 0
  })

  const finalHrs = Math.floor(totalMins / 60)
  const finalMins = totalMins % 60
  const durStr = `${finalHrs} 小時 ${finalMins} 分鐘`

  // 轉換率計算
  const inquiryRate = flyers > 0 ? ((inquiries / flyers) * 100).toFixed(1) : "0.0"
  const trialRate = inquiries > 0 ? ((trials / inquiries) * 100).toFixed(1) : "0.0"
  const conversionRate = trials > 0 ? ((conversions / trials) * 100).toFixed(1) : "0.0"
  const overallRate = flyers > 0 ? ((conversions / flyers) * 100).toFixed(1) : "0.0"

  return { durStr, flyers, inquiries, trials, conversions, inquiryRate, trialRate, conversionRate, overallRate }
})

// 漏斗數據更新
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

// --- 🌟 4. 編輯與刪除功能 ---
function openEditModal(p) {
  editingPromo.value = { ...p }
  showEditModal.value = true
}

async function saveEditPromo() {
  const { error } = await supabase.from('promotions').update({
    type: editingPromo.value.type,
    promo_date: editingPromo.value.promo_date,
    start_time: editingPromo.value.start_time,
    end_time: editingPromo.value.end_time,
    duration: editCalculatedDuration.value,
    flyers_count: parseInt(editingPromo.value.flyers_count || 0),
    note: editingPromo.value.note
  }).eq('id', editingPromo.value.id)

  if (error) return alert('修改失敗: ' + error.message)
  alert('✅ 紀錄已成功修改！')
  showEditModal.value = false
  store.syncAll()
}

async function deletePromo() {
  if(!confirm('⚠️ 確定要徹底刪除這筆紀錄嗎？操作不可還原！')) return
  const { error } = await supabase.from('promotions').delete().eq('id', editingPromo.value.id)
  if (error) return alert('刪除失敗: ' + error.message)
  alert('🗑️ 紀錄已刪除')
  showEditModal.value = false
  store.syncAll()
}

// 💡 5. 【進化版】匯出包含「統計、轉換率」的 Excel/CSV
function exportToExcel() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  const s = promoSummary.value

  // 📝 頂部：【統計報表區塊】
  csvContent += "📊 【宣傳總結統計報表】\n"
  csvContent += "總耗時,總派發數量,總查詢數,總試堂數,總開卡數,總查詢率(%),試堂轉化率(%),最終成交率(%)\n"
  csvContent += `"${s.durStr}",${s.flyers},${s.inquiries},${s.trials},${s.conversions},${s.inquiryRate}%,${s.trialRate}%,${s.conversionRate}%\n\n`

  // 📝 底部：【詳細明細區塊】
  csvContent += "📝 【詳細紀錄明細】\n"
  csvContent += "活動類型,活動日期,開始時間,結束時間,耗時,派發數量,查詢數,試堂數,開卡數,綜合轉換率(開卡/派發),備註\n"

  promoList.value.forEach(p => {
    const safeNote = String(p.note || '').replace(/"/g, '""').replace(/\n/g, ' ')
    const singleRate = p.flyers_count > 0 ? ((p.conversions / p.flyers_count) * 100).toFixed(1) : 0
    
    const row = `"${p.type}","${p.promo_date}","${p.start_time || ''}","${p.end_time || ''}","${p.duration || ''}",${p.flyers_count || 0},${p.inquiries || 0},${p.trials || 0},${p.conversions || 0},${singleRate}%,"${safeNote}"`
    csvContent += row + "\n"
  })

  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  const dateStr = new Date().toISOString().slice(0, 10)
  link.setAttribute("download", `宣傳成效總表_${dateStr}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="page" style="padding-bottom: 120px;">
    
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 class="page-title" style="margin-bottom: 0;">宣傳成效追蹤</h2>
      <button class="btn-export" @click="exportToExcel">📥 匯出統計報表</button>
    </div>

    <div class="card summary-card" v-if="promoList.length > 0">
      <div class="s-title">📈 累積宣傳成效總結</div>
      <div class="s-grid">
        <div class="s-stat"><div class="s-val text-white">{{ promoSummary.durStr }}</div><div class="s-lbl">總耗時</div></div>
        <div class="s-stat"><div class="s-val text-white">{{ promoSummary.flyers.toLocaleString() }}</div><div class="s-lbl">總派發/接觸</div></div>
        <div class="s-stat"><div class="s-val text-green">{{ promoSummary.conversions }}</div><div class="s-lbl">總開卡數</div></div>
      </div>
      <div class="s-rates">
        <div class="rate-item">查詢率 <b class="text-white">{{ promoSummary.inquiryRate }}%</b></div>
        <div class="rate-item">試堂率 <b class="text-white">{{ promoSummary.trialRate }}%</b></div>
        <div class="rate-item text-green">成交率 <b class="text-white">{{ promoSummary.conversionRate }}%</b></div>
      </div>
    </div>

    <div class="card add-card">
      <div class="card-header">
        📋 新增推廣活動
        <span style="font-size:11px; font-weight:700; color:#10b981; float:right; margin-top:2px;">(草稿會自動儲存)</span>
      </div>
      
      <div class="grid-2">
        <div class="form-item"><label>活動類型</label>
          <select v-model="form.type" class="mod-inp"><option value="派傳單">📄 派傳單</option><option value="Road Show">🎪 Road Show</option></select>
        </div>
        <div class="form-item"><label>活動日期</label><input type="date" v-model="form.promo_date" class="mod-inp"></div>
      </div>

      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item"><label>開始打卡</label>
          <div class="time-input-group">
            <input type="time" v-model="form.start_time" class="mod-inp px-small">
            <button class="btn-now" @click="setTimeNow('start_time')">現在</button>
          </div>
        </div>
        <div class="form-item"><label>結束打卡</label>
          <div class="time-input-group">
            <input type="time" v-model="form.end_time" class="mod-inp px-small">
            <button class="btn-now" @click="setTimeNow('end_time')">現在</button>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item"><label>本次耗時</label><div class="dur-box">{{ calculatedDuration }}</div></div>
        <div class="form-item"><label>派發 / 接觸 (總數)</label><input type="number" v-model="form.flyers_count" class="mod-inp" placeholder="輸入數字..."></div>
      </div>

      <div class="form-item" style="margin-top:15px;">
        <label>📝 備註 (當天發生什麼事？)</label>
        <textarea v-model="form.note" class="mod-inp" placeholder="例如：今天下大雨、人流較少..." rows="2" style="resize: vertical;"></textarea>
      </div>

      <button class="btn-main" @click="submitPromoRecord">💾 完成並建立成效追蹤</button>
    </div>

    <div class="section-title">📊 歷史推廣成效 (Funnel)</div>
    <div v-if="promoList.length === 0" style="text-align:center; color:#94a3b8; padding: 30px;">目前尚無紀錄</div>
    
    <div v-for="p in promoList" :key="p.id" class="card result-card">
      <div class="r-head">
        <div class="r-title">{{ p.type === '派傳單' ? '📄' : '🎪' }} {{ p.type }} <span class="r-date">{{ p.promo_date }}</span></div>
        <button class="btn-edit" @click="openEditModal(p)">✏️ 編輯</button>
      </div>
      
      <div class="r-meta">
        <span>⏰ {{ p.start_time?.slice(0,5) }} - {{ p.end_time?.slice(0,5) }} ({{ p.duration }})</span>
        <div style="display:flex; gap:5px;">
          <span class="stk-tag">派發: <b>{{ p.flyers_count }}</b></span>
          <span class="stk-tag rate">綜合率: <b>{{ p.flyers_count > 0 ? ((p.conversions / p.flyers_count)*100).toFixed(1) : 0 }}%</b></span>
        </div>
      </div>

      <div v-if="p.note" class="r-note">📝 {{ p.note }}</div>

      <div class="funnel-divider"></div>

      <div class="funnel-grid">
        <div class="f-item"><label>💬 查詢</label><input type="number" v-model="p.inquiries" class="f-inp"></div>
        <div class="f-item"><label>🧪 試堂</label><input type="number" v-model="p.trials" class="f-inp"></div>
        <div class="f-item"><label>👑 開卡</label><input type="number" v-model="p.conversions" class="f-inp highlight-inp"></div>
      </div>

      <button class="btn-save-stats" @click="updatePerformance(p)">更新當前轉化數據</button>
    </div>

    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="center-modal">
        <div class="m-header">✏️ 編輯推廣紀錄 <button class="close-x" @click="showEditModal=false">✕</button></div>
        
        <div class="grid-2">
          <div class="f-item"><label>活動類型</label>
            <select v-model="editingPromo.type" class="mod-inp"><option value="派傳單">📄 派傳單</option><option value="Road Show">🎪 Road Show</option></select>
          </div>
          <div class="f-item"><label>活動日期</label><input type="date" v-model="editingPromo.promo_date" class="mod-inp"></div>
        </div>

        <div class="grid-2" style="margin-top:15px;">
          <div class="f-item"><label>開始時間</label>
            <div class="time-input-group">
              <input type="time" v-model="editingPromo.start_time" class="mod-inp px-small">
              <button class="btn-now" @click="setEditTimeNow('start_time')">現在</button>
            </div>
          </div>
          <div class="f-item"><label>結束時間</label>
            <div class="time-input-group">
              <input type="time" v-model="editingPromo.end_time" class="mod-inp px-small">
              <button class="btn-now" @click="setEditTimeNow('end_time')">現在</button>
            </div>
          </div>
        </div>

        <div class="grid-2" style="margin-top:15px;">
          <div class="f-item"><label>本次耗時</label><div class="dur-box">{{ editCalculatedDuration }}</div></div>
          <div class="f-item"><label>派發 / 接觸</label><input type="number" v-model="editingPromo.flyers_count" class="mod-inp"></div>
        </div>

        <div class="f-item" style="margin-top:15px;">
          <label>📝 備註修改</label>
          <textarea v-model="editingPromo.note" class="mod-inp" rows="2"></textarea>
        </div>

        <div class="action-row">
          <button class="btn-del" @click="deletePromo">🗑️ 刪除紀錄</button>
          <button class="btn-confirm" @click="saveEditPromo">確認修改</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; color: #1e293b; margin-bottom: 20px; }

/* 💡 強制保護總結卡片的背景和文字顏色，徹底解決隱形文字問題！ */
.card.summary-card { background: linear-gradient(135deg, #1e293b, #0f172a) !important; color: white !important; border: none; padding: 25px 20px; margin-bottom: 25px; box-shadow: 0 15px 30px rgba(0,0,0,0.15); }
.text-white { color: white !important; }
.s-title { font-size: 14px; font-weight: 800; color: #94a3b8; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px;}
.s-grid { display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px dashed #334155; padding-bottom: 15px; }
.s-val { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
.s-lbl { font-size: 11px; font-weight: 700; color: #94a3b8; }
.text-green { color: #10b981 !important; }
.s-rates { display: flex; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 12px; }
.rate-item { font-size: 12px; font-weight: 700; color: #cbd5e1; display: flex; flex-direction: column; align-items: center; gap: 4px;}
.rate-item b { font-size: 16px; }

.btn-export { background: white; border: 2px solid #10b981; color: #10b981; padding: 8px 16px; border-radius: 12px; font-weight: 800; font-size: 14px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
.btn-export:active { transform: scale(0.95); background: #f0fdf4; }

.card { background: white; border-radius: 20px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.02); }
.add-card { border-top: 5px solid #4f46e2; }
.card-header { font-weight: 900; font-size: 16px; color: #1e293b; margin-bottom: 15px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.form-item label, .f-item label { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; }

.mod-inp { width: 100%; border: 1px solid #cbd5e1; padding: 12px; border-radius: 12px; font-weight: 700; outline: none; color: #1e293b; font-size: 16px; appearance: none; background: #f8fafc; }
.mod-inp:focus { border-color: #4f46e2; background: white; }

.time-input-group { display: flex; gap: 6px; }
.px-small { padding: 12px 8px; }
.btn-now { background: #eef2ff; color: #4f46e2; border: 1px solid #c7d2fe; border-radius: 10px; font-weight: 900; font-size: 13px; padding: 0 12px; cursor: pointer; white-space: nowrap; transition: 0.2s; }
.btn-now:active { background: #e0e7ff; transform: scale(0.95); }

.dur-box { background: #eef2ff; color: #4f46e2; padding: 12px; border-radius: 12px; font-weight: 900; font-size: 13px; text-align: center; border: 1px dashed #a5b4fc; }

.btn-main { width: 100%; padding: 16px; background: #4f46e2; color: white; border: none; border-radius: 14px; font-weight: 900; font-size: 16px; margin-top: 20px; cursor: pointer; transition: 0.2s; }
.btn-main:active { transform: scale(0.97); }

.section-title { font-size: 15px; font-weight: 900; color: #475569; margin: 30px 0 15px; }

.result-card { background: white; border-left: 5px solid #10b981; }
.r-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.r-title { font-weight: 900; font-size: 16px; color: #1e293b; display: flex; align-items: center; gap: 8px;}
.r-date { font-size: 11px; font-weight: 800; color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; }
.btn-edit { background: transparent; border: 1px solid #cbd5e1; color: #64748b; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800; cursor: pointer; }

.r-meta { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #475569; }
.stk-tag { background: #fff7ed; color: #d97706; padding: 2px 8px; border-radius: 6px; }
.rate { background: #ecfdf5; color: #10b981; }

.r-note { font-size: 13px; color: #64748b; font-weight: 600; margin-top: 12px; background: #f8fafc; padding: 10px 12px; border-radius: 8px; border-left: 3px solid #cbd5e1; line-height: 1.4;}

.funnel-divider { border-bottom: 1px dashed #e2e8f0; margin: 15px 0; }
.funnel-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px; }
.f-item label { display: block; font-size: 11px; font-weight: 800; color: #64748b; margin-bottom: 5px; text-align: center; }
.f-inp { width: 100%; border: 1.5px solid #cbd5e1; padding: 10px; border-radius: 10px; font-weight: 900; font-size: 18px; text-align: center; outline: none; color: #1e293b; background: white; }
.highlight-inp { border-color: #10b981; color: #10b981; background: #ecfdf5; }

.btn-save-stats { width: 100%; padding: 12px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 10px; font-weight: 800; cursor: pointer; transition: 0.2s; }
.btn-save-stats:active { background: #e2e8f0; }

/* 💡 編輯 Modal 樣式 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: center; justify-content: center; }
.center-modal { background: white; width: 90%; max-width: 450px; border-radius: 24px; padding: 25px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); animation: popIn 0.3s ease-out; max-height: 85vh; overflow-y: auto; }
@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.m-header { font-weight: 900; font-size: 18px; margin-bottom: 20px; display: flex; justify-content: space-between; color: #1e293b; }
.close-x { background: #f1f5f9; border-radius: 50%; width: 30px; height: 30px; border: none; font-size: 14px; font-weight: 900; color: #475569; cursor: pointer; display: flex; justify-content: center; align-items: center;}

.action-row { display: flex; gap: 10px; margin-top: 25px; }
.btn-confirm { flex: 1; background: #6366f1; color: white; border: none; padding: 14px; border-radius: 14px; font-weight: 800; font-size: 15px; cursor: pointer;}
.btn-del { background: #fff1f2; color: #e11d48; border: none; padding: 14px; border-radius: 14px; font-weight: 800; cursor: pointer;}
</style>