<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BaseModal from '../components/BaseModal.vue'

const store = useMainStore()

// --- 全局篩選狀態 ---
const filterTime = ref('month') // today, week, month, all, custom
const customStart = ref('')
const customEnd = ref('')
const filterBranch = ref('全部分店')

// --- 編輯試堂狀態 ---
const showEditModal = ref(false)
const editingClient = ref(null)

// --- 日期格式化工具 (1:1 還原舊版) ---
const getMonthStr = (d) => { const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']; return months[new Date(d).getMonth()] }
const getDayStr = (d) => new Date(d).getDate().toString().padStart(2, '0')
const getTimeStr = (d) => new Date(d).toLocaleTimeString('zh-HK', {hour:'2-digit', minute:'2-digit'})

// --- 全局時間篩選邏輯 ---
const isDateInRange = (dateStr) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (filterTime.value === 'all') return true
  if (filterTime.value === 'today') return d.toDateString() === now.toDateString()
  if (filterTime.value === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (filterTime.value === 'week') {
    const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo && d <= now;
  }
  if (filterTime.value === 'custom') {
    if (!customStart.value || !customEnd.value) return true
    const start = new Date(customStart.value); start.setHours(0,0,0,0)
    const end = new Date(customEnd.value); end.setHours(23,59,59,999)
    return d >= start && d <= end
  }
  return true
}

// --- 1. 基本預約與客戶數據 ---
const prospectClients = computed(() => store.clients.filter(c => c.status === 'prospect'))
const activeClients = computed(() => store.clients.filter(c => c.status === 'active'))

const branchCounts = computed(() => {
  return {
    kwunTong: activeClients.value.filter(c => c.branch === '觀塘').length,
    central: activeClients.value.filter(c => c.branch === '中環').length,
    jordan: activeClients.value.filter(c => c.branch === '佐敦').length
  }
})

// 近期試堂 (過濾過去的時間，並正確排序)
const upcomingTrials = computed(() => {
  const now = new Date(); now.setHours(0,0,0,0);
  return prospectClients.value
    .filter(c => c.trial_date)
    .filter(c => { const tDate = new Date(c.trial_date); return tDate >= now || tDate.toDateString() === now.toDateString(); })
    .filter(c => filterBranch.value === '全部分店' ? true : c.branch === filterBranch.value)
    .sort((a,b) => new Date(a.trial_date) - new Date(b.trial_date))
    .slice(0, 5)
})

// --- 🌟 財務總覽 (完美結合你保留的UI，並套用時間過濾) ---
const financialStats = computed(() => {
  let revenue = 0, cost = 0, profit = 0;
  store.transactions.filter(t => isDateInRange(t.created_at)).forEach(t => {
    if (filterBranch.value !== '全部分店' && t.branch !== filterBranch.value) return;

    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      revenue += amt;
      profit += Number(t.profit ?? amt);
    } else if (t.type === 'expense') {
      cost += amt;
      profit -= amt;
    }
  })
  return { revenue, cost, profit };
})

// --- 2. 馬拉松百分比 ---
const marathonRate = computed(() => {
  if (activeClients.value.length === 0) return "0.0"
  const runners = activeClients.value.filter(c => c.is_marathon).length
  return ((runners / activeClients.value.length) * 100).toFixed(1)
})

// --- 3. 經手人資金結算 (手上現金 - 套用時間過濾) ---
const cashSummary = computed(() => {
  const summary = {}
  store.transactions.filter(t => isDateInRange(t.created_at)).forEach(t => {
    if (!t.handled_by && !t.staff) return
    const person = t.handled_by || t.staff
    if (!summary[person]) summary[person] = { in: 0, out: 0 }
    if (t.type === 'income') summary[person].in += Number(t.amount)
    if (t.type === 'expense') summary[person].out += Number(t.amount)
  })
  return summary
})

// --- 4. 廣告與試堂追蹤 (套用時間過濾) ---
const marketingStats = computed(() => {
  let adSpend = 0, inquiries = 0
  store.transactions.filter(t => isDateInRange(t.created_at)).forEach(t => {
    if(t.type === 'expense' && t.category === '廣告費用') {
      adSpend += Number(t.amount)
      inquiries += (t.ad_inquiries || 0)
    }
  })
  // 廣告客戶轉化依然看總體
  const adClients = store.clients.filter(c => c.source === '廣告')
  return {
    adSpend, inquiries,
    cpaInquiry: inquiries > 0 ? Math.round(adSpend / inquiries) : 0,
    adCount: adClients.length,
    adActive: adClients.filter(c => c.status === 'active').length,
  }
})

// --- 5. 續卡與套票數量統計 (套用時間過濾) ---
const packageStats = computed(() => {
  let pkg850 = 0, pkg2550 = 0
  store.transactions.filter(t => isDateInRange(t.created_at)).forEach(t => {
    if (t.category === '運動套票' || t.category === '運動') {
      if (t.amount === 850 || (t.note && t.note.includes('pkg_10'))) pkg850++
      if (t.amount === 2550 || t.amount === 2800 || (t.note && t.note.includes('pkg_35'))) pkg2550++
    }
  })
  return { pkg850, pkg2550 }
})

// --- 💡 試堂修改功能 ---
function openTrialEdit(client) {
  editingClient.value = { ...client }
  // 將資料庫的 UTC 時間轉為本地輸入框格式
  if (editingClient.value.trial_date) {
    const d = new Date(editingClient.value.trial_date)
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    editingClient.value.trial_date = d.toISOString().slice(0,16)
  }
  showEditModal.value = true
}

async function updateTrial() {
  const { error } = await supabase.from('clients')
    .update({
      name: editingClient.value.name,
      phone: editingClient.value.phone,
      trial_date: editingClient.value.trial_date,
      status: editingClient.value.status
    })
    .eq('id', editingClient.value.id)

  if (error) alert('更新失敗: ' + error.message)
  else { alert('✅ 預約資料已更新'); showEditModal.value = false; store.syncAll() }
}
</script>

<template>
  <div class="page" style="padding-bottom: 150px;">
    <div class="d-header">
      <h2 class="title">數據中心</h2>
      <div class="filters">
        <select v-model="filterTime" class="f-sel">
          <option value="today">今日</option>
          <option value="week">本週</option>
          <option value="month">本月</option>
          <option value="custom">自訂區間</option>
          <option value="all">全部時間</option>
        </select>
        <select v-model="filterBranch" class="f-sel">
          <option value="全部分店">全部分店</option>
          <option value="觀塘">觀塘</option>
          <option value="中環">中環</option>
          <option value="佐敦">佐敦</option>
        </select>
      </div>
    </div>

    <div v-if="filterTime === 'custom'" class="custom-date-box">
      <input type="date" v-model="customStart" class="d-inp"> <span>至</span> <input type="date" v-model="customEnd" class="d-inp">
    </div>

    <div class="section-title">📅 近期試堂預約 (點擊可修改)</div>
    <div class="card p-list">
      <div v-if="upcomingTrials.length === 0" class="empty">目前無預約資料</div>
      <div v-for="p in upcomingTrials" :key="p.id" class="p-item clickable" @click="openTrialEdit(p)">
        <div class="p-date">
          <div class="m">{{ getMonthStr(p.trial_date) }}</div>
          <div class="d">{{ getDayStr(p.trial_date) }}</div>
        </div>
        <div class="p-info">
          <div class="name">{{ p.name }} <span class="time">{{ getTimeStr(p.trial_date) }}</span></div>
          <div class="meta">📍 {{ p.branch }} · 📞 {{ p.phone || '無電話' }}</div>
        </div>
      </div>
    </div>

    <div class="finance-grid" style="margin-top: 20px;">
      <div class="f-card">
        <div class="f-val text-green">$ {{ financialStats.revenue.toLocaleString() }}</div>
        <div class="f-label">總營業額</div>
      </div>
      <div class="f-card">
        <div class="f-val text-red">$ {{ financialStats.cost.toLocaleString() }}</div>
        <div class="f-label">總成本支出</div>
      </div>
    </div>
    <div class="profit-box">
      <div class="p-title">💎 總實收淨利潤</div>
      <div class="p-val">$ {{ financialStats.profit.toLocaleString() }}</div>
    </div>

    <div class="section-title" style="margin-top: 25px;">👥 分店正式客戶人數</div>
    <div class="grid-3">
      <div class="b-card"><div class="num">{{ branchCounts.kwunTong }}</div><div class="loc">觀塘</div></div>
      <div class="b-card"><div class="num">{{ branchCounts.central }}</div><div class="loc">中環</div></div>
      <div class="b-card"><div class="num">{{ branchCounts.jordan }}</div><div class="loc">佐敦</div></div>
    </div>

    <div class="marathon-card">
      <div class="m-title">客戶轉馬拉松百分比</div>
      <div class="m-val">{{ marathonRate }}% <span style="float:right; font-size:32px;">🏃</span></div>
      <div class="m-foot">
        <span>活躍: {{ activeClients.filter(c=>c.is_marathon).length }} 人</span>
        <span>正式會員: {{ activeClients.length }} 人</span>
      </div>
    </div>

    <div class="section-title" v-if="Object.keys(cashSummary).length > 0">💰 經手人資金結算 (手上現金)</div>
    <div class="grid-2">
      <div v-for="(data, name, index) in cashSummary" :key="name" class="cash-card" :class="'border-'+(index%2)">
        <div class="c-name">{{ name }}</div>
        <div class="c-total">$ {{ (data.in - data.out).toLocaleString() }}</div>
        <div class="c-foot"><span>收: ${{ data.in }}</span><span>支: ${{ data.out }}</span></div>
      </div>
    </div>

    <div class="section-title">📈 廣告與套票數據</div>
    <div class="grid-2">
      <div class="stat-card">
        <div class="s-val">{{ marketingStats.adCount }} 人</div>
        <div class="s-label">廣告來源客戶</div>
        <div class="s-sub">成功轉正式: {{ marketingStats.adActive }} 人</div>
      </div>
      <div class="stat-card">
        <div class="s-val">{{ packageStats.pkg850 }} / {{ packageStats.pkg2550 }}</div>
        <div class="s-label">套票銷量</div>
        <div class="s-sub">10點(850) / 35點(2550)</div>
      </div>
    </div>

    <BaseModal :show="showEditModal" title="✏️ 編輯試堂預約" @close="showEditModal=false">
      <div v-if="editingClient">
        <div class="form-item"><label>客戶姓名</label><input v-model="editingClient.name" class="mod-inp"></div>
        <div class="form-item" style="margin-top:12px;"><label>聯絡電話</label><input v-model="editingClient.phone" class="mod-inp"></div>
        <div class="form-item" style="margin-top:12px;"><label>預約日期與時間</label><input type="datetime-local" v-model="editingClient.trial_date" class="mod-inp"></div>
        <div class="form-item" style="margin-top:12px;"><label>更改狀態</label>
          <select v-model="editingClient.status" class="mod-inp">
            <option value="prospect">👀 維持預約狀態</option>
            <option value="active">⭐️ 轉為正式會員</option>
          </select>
        </div>
        <button class="btn-save" style="margin-top:25px; width:100%; padding:15px; background:#4f46e2; color:white; border:none; border-radius:12px; font-weight:900; cursor:pointer;" @click="updateTrial">確認儲存</button>
      </div>
    </BaseModal>

  </div>
</template>

<style scoped>
/* 原有樣式一字不刪，新增可點擊與自訂日期樣式 */
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.d-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.title { font-weight: 900; font-size: 24px; color: #1e293b; }
.filters { display: flex; gap: 8px; }
.f-sel { border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 8px; font-weight: 700; background: white; outline: none; }
.custom-date-box { background: #eef2ff; padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border: 1px solid #c7d2fe; font-weight: 800; color: #4f46e2; }
.d-inp { border: 1px solid #cbd5e1; padding: 5px; border-radius: 6px; outline: none; }
.section-title { font-size: 14px; font-weight: 900; color: #475569; margin: 25px 0 10px; }
.card { background: white; border-radius: 20px; padding: 15px; border: 1px solid #e2e8f0; }

.p-item { display: flex; align-items: center; gap: 15px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
.p-item:last-child { border-bottom: none; margin-bottom:0; padding-bottom:0; }
.clickable { cursor: pointer; transition: background 0.2s; }
.clickable:hover { background: #f8fafc; border-radius: 12px; padding: 10px; }
.p-date { background: #fffbeb; color: #d97706; padding: 10px 12px; border-radius: 12px; text-align: center; }
.p-date .m { font-size: 11px; font-weight: 800; text-transform: uppercase;}
.p-date .d { font-size: 18px; font-weight: 900; line-height: 1.1; margin-top:2px; }
.name { font-weight: 800; font-size: 16px; }
.time { font-size: 12px; color: #d97706; background: #fff7ed; padding: 2px 8px; border-radius: 6px; margin-left: 8px; font-weight: 800;}
.meta { font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600;}
.empty { text-align: center; color: #94a3b8; font-weight: 700; padding: 20px; }

.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.b-card { background: white; padding: 20px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
.b-card .num { font-size: 24px; font-weight: 900; color: #1e293b; }
.b-card .loc { font-size: 12px; font-weight: 700; color: #64748b; margin-top: 5px; }

.marathon-card { background: linear-gradient(135deg, #4f46e2, #4338ca); color: white; padding: 25px; border-radius: 20px; margin-top: 20px; box-shadow: 0 10px 25px rgba(79,70,229,0.3); }
.m-title { font-size: 13px; font-weight: 800; opacity: 0.9; }
.m-val { font-size: 42px; font-weight: 900; margin: 10px 0; border-bottom: 2px solid rgba(255,255,255,0.2); padding-bottom: 15px; }
.m-foot { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; opacity: 0.9; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cash-card { background: white; padding: 20px; border-radius: 16px; border: 2px solid #e2e8f0; }
.border-0 { border-color: #3b82f6; background: #eff6ff;} 
.border-1 { border-color: #ec4899; background: #fdf2f8;} 
.c-name { font-weight: 900; font-size: 16px; color: #4f46e2; }
.border-1 .c-name { color: #ec4899; }
.c-total { font-size: 24px; font-weight: 900; margin: 10px 0; color: #1e293b; }
.c-foot { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: #64748b; }

.stat-card { background: white; border: 1px solid #e2e8f0; padding: 20px; border-radius: 16px; text-align: center; }
.s-val { font-size: 24px; font-weight: 900; color: #f59e0b; }
.s-label { font-size: 13px; font-weight: 800; color: #1e293b; margin-top: 5px; }
.s-sub { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 5px; }

/* 財務區塊樣式保留 */
.finance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px; }
.f-card { background: white; padding: 20px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
.f-val { font-size: 20px; font-weight: 900; margin-bottom: 5px; }
.f-label { font-size: 12px; color: #64748b; font-weight: 700; }
.text-green { color: #10b981; }
.text-red { color: #ef4444; }

.profit-box { background: #eef2ff; border: 1.5px solid #6366f1; padding: 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.p-title { font-size: 15px; font-weight: 800; color: #4f46e2; display: flex; align-items: center; gap: 8px; }
.p-val { font-size: 24px; font-weight: 900; color: #4f46e2; }

/* 表單樣式 */
.form-item label { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; }
.mod-inp { width: 100%; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; font-weight: 700; outline: none; color: #1e293b; }
.mod-inp:focus { border-color: #4f46e2; }
</style>