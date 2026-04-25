<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '../supabase'

// 💡 管理員權限設定
const currentUserEmail = ref('')
const isAdmin = computed(() => currentUserEmail.value === 'yimwingkwan0907@gmail.com')

// 全螢幕看圖狀態
const viewingImage = ref(null)

// 💡 1. 產生從 2025 年完整開始，到未來幾年的所有月份
const availableMonths = computed(() => {
  const months = []
  let curr = new Date('2025-01-01') // 💡 從 2025 全年完整開始
  const end = new Date()
  end.setFullYear(end.getFullYear() + 3) // 延伸至未來3年
  while (curr <= end) {
    const y = curr.getFullYear()
    const m = String(curr.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
    curr.setMonth(curr.getMonth() + 1)
  }
  return months
})

// 💡 2. 萃取可用的年份，並設定當前選中的年份 (預設為今年)
const availableYears = computed(() => {
  return [...new Set(availableMonths.value.map(m => m.split('-')[0]))]
})
const selectedYear = ref(new Date().getFullYear().toString())

// 💡 3. 只顯示「目前選中」年份的月份卡片，避免無限滑動
const displayedMonths = computed(() => {
  return availableMonths.value.filter(m => m.startsWith(selectedYear.value))
})

const monthlyStats = ref({})
const isSyncing = ref(false)

const promos = ref([
  { 
    id: 1, name: '🌴 BZ 閒情浪漫遊 - 沖繩', date: '2025/12/1 ~ 2026/9/30', 
    startMonth: '2025-12', endMonth: '2026-09',
    doubleVpMonth: '2025-12', doubleVpMaxExtra: 2500, 
    defaultImage: 'https://images.unsplash.com/photo-1590559899731-a382839cecd5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImage: null,
    targetVp: 30000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【非績優組】特別賞: 30,000點 / 第一重: 40,000點 / 第二重: 50,000點',
      '【績優組】特別賞: 40,000點 / 第一重: 60,000點 / 第二重: 80,000點',
      '📌 12月加碼：最多可雙重計算 5,000 個人點數'
    ]
  },
  { 
    id: 2, name: '🏖️ 2027 馬爾代夫閒情浪漫遊', date: '2026/1/1 ~ 2026/12/31', 
    startMonth: '2026-01', endMonth: '2026-12',
    defaultImage: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImage: null,
    targetVp: 40000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【卓越組及以上限定】最低門檻累積 40,000 總銷售量點數',
      '【級別要求】第一級: 6萬點 / 第二級: 8萬點 / 第三級: 10萬點',
      '📌 開放予所有全資格領班及以上參與'
    ]
  },
  { 
    id: 3, name: '🎓 香港世界組大學訓練', date: '2026/1/1 ~ 2026/6/30', 
    startMonth: '2026-01', endMonth: '2026-06',
    defaultImage: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImage: null,
    targetVp: 25000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【條件A】累計達 25,000 總銷售量點數',
      '【條件B】連續四個月均達 2,500 點',
      '【條件C】於爭取資格期限內成為新升世界組',
      '📌 會議日期：2026年9月12日'
    ]
  },
  { 
    id: 4, name: '🏆 2026 Herbalife Premier League', date: '2026/1/1 ~ 2026/12/31', 
    startMonth: '2026-01', endMonth: '2026-12',
    defaultImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImage: null,
    targetVp: 0, targetVip: 10, targetGold: 0, targetSup: 2, 
    details: [
      '【條件1】確保 10 名新推薦直銷商或優惠客戶 (系統追蹤 VIP/PC)',
      '【條件2】每位需在登記月或下個月累計至少 250 VP',
      '【條件3】擁有兩位頭線新領班 (系統追蹤 領班)'
    ]
  },
  { 
    id: 5, name: '🦁 BLUE ZONE 團隊新加坡旅遊', date: '2026/4/1 ~ 2026/5/31', 
    startMonth: '2026-04', endMonth: '2026-05',
    defaultImage: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImage: null,
    targetVp: 5000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【基本賞】連續二個月 2,500 點 (非績優組限定)',
      '【升級賞】連續二個月 4,000 點 (補助12000)',
      '【最高賞】連續二個月 6,000 點 (補助18000)'
    ]
  },
])

// --- 初始化載入資料 ---
const loadCloudStats = async () => {
  isSyncing.value = true
  
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.email) {
    currentUserEmail.value = session.user.email
  }

  // 初始化所有的月份欄位
  availableMonths.value.forEach(m => {
    if (!monthlyStats.value[m]) monthlyStats.value[m] = { vp: '', vip: '', gold: '', sup: '' }
  })

  // 抓取雲端成績
  const { data: statsData } = await supabase.from('herbalife_stats').select('*')
  if (statsData) {
    statsData.forEach(row => {
      if (monthlyStats.value[row.month]) {
        monthlyStats.value[row.month].vp = row.vp || ''
        monthlyStats.value[row.month].vip = row.recruits_vip || ''
        monthlyStats.value[row.month].gold = row.recruits_gold || ''
        monthlyStats.value[row.month].sup = row.recruits_sup || ''
      }
    })
  }

  // 抓取雲端海報
  const { data: imgData } = await supabase.from('herbalife_images').select('*')
  if (imgData) {
    imgData.forEach(row => {
      const match = promos.value.find(p => p.id === row.promo_id)
      if (match) match.customImage = row.image_data
    })
  }
  
  isSyncing.value = false
}

onMounted(() => { loadCloudStats() })

const saveMonthToCloud = async (month) => {
  const stats = monthlyStats.value[month]
  await supabase.from('herbalife_stats').upsert({
    month: month,
    vp: Number(stats.vp) || 0,
    recruits_vip: Number(stats.vip) || 0,
    recruits_gold: Number(stats.gold) || 0,
    recruits_sup: Number(stats.sup) || 0
  })
}

// 💡 自動壓縮圖片引擎
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        const maxWidth = 800
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
    }
  })
}

const handleImageUpload = async (event, promo) => {
  const file = event.target.files[0]
  if (!file) return
  
  alert('🔄 圖片壓縮與同步中，請稍候...')
  const compressedBase64 = await compressImage(file)
  
  promo.customImage = compressedBase64
  const { error } = await supabase.from('herbalife_images').upsert({ promo_id: promo.id, image_data: compressedBase64 })
  if (error) alert('上傳失敗: ' + error.message)
  else alert('✅ 專屬海報已更新並同步至全團隊！')
}

const resetImage = async (promo) => {
  if(!confirm('確定要還原預設圖片嗎？這將刪除雲端的海報以節省空間。')) return
  promo.customImage = null
  await supabase.from('herbalife_images').delete().eq('promo_id', promo.id)
}

// --- 幫助函數 ---
const formatMonthLabel = (mStr) => {
  const [y, m] = mStr.split('-')
  return `${parseInt(m)} 月`
}

const isMonthInRange = (monthStr, startStr, endStr) => {
  const m = new Date(monthStr + '-01')
  const s = new Date(startStr + '-01')
  const e = new Date(endStr + '-01')
  return m >= s && m <= e
}

// 💡 核心計算大腦
const promoStatus = computed(() => {
  return promos.value.map(promo => {
    let calculatedVp = 0, calculatedVip = 0, calculatedGold = 0, calculatedSup = 0

    for (const [month, stats] of Object.entries(monthlyStats.value)) {
      if (isMonthInRange(month, promo.startMonth, promo.endMonth)) {
        let monthVp = Number(stats.vp) || 0
        if (promo.doubleVpMonth === month && monthVp > 0) {
          let extraBonus = Math.min(monthVp, promo.doubleVpMaxExtra)
          monthVp += extraBonus 
        }
        calculatedVp += monthVp
        calculatedVip += Number(stats.vip) || 0
        calculatedGold += Number(stats.gold) || 0
        calculatedSup += Number(stats.sup) || 0
      }
    }

    const vpShort = Math.max(0, promo.targetVp - calculatedVp)
    const vipShort = Math.max(0, promo.targetVip - calculatedVip)
    const goldShort = Math.max(0, promo.targetGold - calculatedGold)
    const supShort = Math.max(0, promo.targetSup - calculatedSup)
    
    const isQualified = vpShort === 0 && vipShort === 0 && goldShort === 0 && supShort === 0 && 
                        (promo.targetVp > 0 || promo.targetVip > 0 || promo.targetGold > 0 || promo.targetSup > 0)
    
    let percents = []
    if (promo.targetVp > 0) percents.push(Math.min(100, (calculatedVp / promo.targetVp) * 100))
    if (promo.targetVip > 0) percents.push(Math.min(100, (calculatedVip / promo.targetVip) * 100))
    if (promo.targetGold > 0) percents.push(Math.min(100, (calculatedGold / promo.targetGold) * 100))
    if (promo.targetSup > 0) percents.push(Math.min(100, (calculatedSup / promo.targetSup) * 100))
    
    const progressPercent = percents.length > 0 ? percents.reduce((a,b)=>a+b,0) / percents.length : 0

    return { ...promo, calculatedVp, calculatedVip, calculatedGold, calculatedSup, vpShort, vipShort, goldShort, supShort, isQualified, progressPercent }
  })
})

function exportToExcel() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  csvContent += "活動名稱,考核期限,該區間已累積(VP),已累積(VIP),已累積(金級),已累積(領班),綜合完成率(%),達標狀態\n"

  promoStatus.value.forEach(p => {
    let statusText = p.isQualified ? "🎉 已達標" : `尚差: ${p.vpShort>0?p.vpShort+'VP ':''}${p.vipShort>0?p.vipShort+'VIP ':''}${p.goldShort>0?p.goldShort+'金級 ':''}${p.supShort>0?p.supShort+'領班 ':''}`
    const row = `"${p.name}","${p.date}",${p.calculatedVp},${p.calculatedVip},${p.calculatedGold},${p.calculatedSup},${p.progressPercent.toFixed(1)}%,"${statusText}"`
    csvContent += row + "\n"
  })

  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  const dateStr = new Date().toISOString().slice(0, 10)
  link.setAttribute("download", `康寶萊全球推廣進度_${dateStr}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="page" style="padding-bottom: 150px;">
    
    <div class="header-row">
      <h2 class="title">🏆 全球推廣獎賞</h2>
      <button class="btn-export" @click="exportToExcel">📥 匯出報表</button>
    </div>

    <div class="master-control-card">
      <div class="mc-header">
        <span style="font-size: 24px;">☁️</span>
        <div style="flex:1;">
          <div class="mc-title">逐月成績控制台 <span v-if="isSyncing" style="font-size:11px; color:#10b981;">(🔄 同步中...)</span></div>
          <div class="mc-desc">請選擇年份，並填寫各月份考核成績。</div>
        </div>
        <button class="btn-sync" @click="loadCloudStats">🔄 重新整理</button>
      </div>

      <div class="year-tabs">
        <button 
          v-for="year in availableYears" 
          :key="year" 
          class="year-btn" 
          :class="{ 'active': selectedYear === year }"
          @click="selectedYear = year"
        >
          {{ year }} 年
        </button>
      </div>

      <div class="months-scroll-container">
        <div class="month-card" v-for="month in displayedMonths" :key="month">
          <div class="m-title">📅 {{ formatMonthLabel(month) }}</div>
          
          <div class="m-inp-group">
            <label>VP</label>
            <input type="number" v-model="monthlyStats[month].vp" @blur="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>VIP</label>
            <input type="number" v-model="monthlyStats[month].vip" @blur="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>金級</label>
            <input type="number" v-model="monthlyStats[month].gold" @blur="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>領班</label>
            <input type="number" v-model="monthlyStats[month].sup" @blur="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">🎯 系統自動結算分析</div>

    <div class="promo-grid">
      <div v-for="p in promoStatus" :key="p.id" class="promo-card" :class="{'qualified': p.isQualified}">
        
        <div class="p-cover" :style="{ backgroundImage: `url(${p.customImage || p.defaultImage})` }">
          <div class="p-cover-overlay">
            <div class="p-date">🕒 {{ p.date }}</div>
            
            <div class="img-actions">
              <button class="btn-view-img" @click="viewingImage = p.customImage || p.defaultImage">🔍 放大</button>
              
              <template v-if="isAdmin">
                <input type="file" :id="'img-up-'+p.id" accept="image/*" style="display: none;" @change="e => handleImageUpload(e, p)">
                <label :for="'img-up-'+p.id" class="btn-change-img">📷 換圖</label>
                <button v-if="p.customImage" class="btn-reset-img" @click="resetImage(p)">✕ 刪除</button>
              </template>
            </div>
          </div>
        </div>
        
        <div class="p-content">
          <div class="p-name">{{ p.name }}</div>
          
          <div class="p-details-box">
            <div class="p-detail-title">🔍 考核條件與規則：</div>
            <ul class="p-ul">
              <li v-for="(rule, idx) in p.details" :key="idx">{{ rule }}</li>
            </ul>
          </div>
          
          <div class="funnel-divider"></div>

          <div class="p-calculated-result">
            <div class="cr-title">💡 該考核區間，系統為您結算：</div>
            <div class="cr-value-wrap">
              <div v-if="p.targetVp > 0" class="cr-stat">
                <span class="cr-num">{{ p.calculatedVp.toLocaleString() }}</span>
                <span class="cr-lbl">VP</span>
                <div v-if="p.doubleVpMonth" class="double-tag">⚡️ 已含雙倍加乘</div>
              </div>
              
              <div v-if="p.targetVip > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedVip }}</span><span class="cr-lbl">VIP/PC</span></div>
              <div v-if="p.targetGold > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedGold }}</span><span class="cr-lbl">金級</span></div>
              <div v-if="p.targetSup > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedSup }}</span><span class="cr-lbl">領班</span></div>
            </div>
          </div>

          <div class="status-row">
            <div v-if="p.isQualified" class="status-badge success">🎉 恭喜！已達成最低目標！</div>
            <div v-else class="status-badge warning">
              ⚠️ 尚差: 
              <span v-if="p.vpShort > 0"> {{ p.vpShort.toLocaleString() }} VP </span>
              <span v-if="p.vipShort > 0"> | {{ p.vipShort }} VIP </span>
              <span v-if="p.goldShort > 0"> | {{ p.goldShort }} 金級 </span>
              <span v-if="p.supShort > 0"> | {{ p.supShort }} 領班 </span>
            </div>
          </div>

          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: p.progressPercent + '%' }"></div>
          </div>
          <div class="p-req">綜合完成率：<span style="color:#4f46e2; font-weight:900;">{{ p.progressPercent.toFixed(1) }}%</span></div>

        </div>
      </div>
    </div>

    <div v-if="viewingImage" class="image-modal-overlay" @click.self="viewingImage = null">
      <button class="close-x" @click="viewingImage = null">✕</button>
      <img :src="viewingImage" class="full-size-img" />
    </div>

  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.title { font-weight: 900; font-size: 24px; color: #1e293b; margin: 0; }

.btn-export { background: white; border: 2px solid #78C257; color: #78C257; padding: 8px 14px; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer; transition: 0.2s; display: flex; align-items: center;}
.btn-export:active { transform: scale(0.95); background: #f0fdf4; }

.section-title { font-size: 14px; font-weight: 900; color: #64748b; margin: 25px 0 15px; text-transform: uppercase; letter-spacing: 1px;}

.master-control-card { background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 24px; padding: 20px; box-shadow: 0 15px 30px rgba(0,0,0,0.15); margin-bottom: 10px; color: white; border: 1px solid #334155;}
.mc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; border-bottom: 1px dashed #334155; padding-bottom: 15px;}
.mc-title { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; }
.mc-desc { font-size: 11px; font-weight: 600; color: #94a3b8; margin-top: 4px; line-height: 1.4;}
.btn-sync { background: rgba(255,255,255,0.1); border: 1px solid #475569; color: white; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; cursor: pointer;}
.btn-sync:active { background: rgba(255,255,255,0.2); }

/* 💡 新版：年份切換列 */
.year-tabs { display: flex; gap: 8px; margin-bottom: 15px; overflow-x: auto; padding-bottom: 4px; }
.year-tabs::-webkit-scrollbar { display: none; }
.year-btn { background: rgba(255,255,255,0.05); border: 1px solid #475569; color: #cbd5e1; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 800; cursor: pointer; transition: 0.2s; white-space: nowrap;}
.year-btn.active { background: #10b981; border-color: #10b981; color: white; box-shadow: 0 4px 10px rgba(16,185,129,0.25); }

.months-scroll-container { display: flex; overflow-x: auto; gap: 12px; padding-bottom: 10px; scroll-behavior: smooth;}
.months-scroll-container::-webkit-scrollbar { height: 6px; }
.months-scroll-container::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }

.month-card { min-width: 140px; background: rgba(255,255,255,0.08); border: 1px solid #475569; border-radius: 16px; padding: 12px; }
.m-title { font-size: 15px; font-weight: 900; color: #10b981; margin-bottom: 10px; text-align: center;}
.m-inp-group { display: flex; align-items: center; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 4px 8px;}
.m-inp-group label { font-size: 11px; font-weight: 800; color: #cbd5e1; width: 35px; white-space: nowrap;}
.m-inp { width: 100%; border: none; background: transparent; color: white; font-size: 15px; font-weight: 900; outline: none; text-align: right;}
.m-inp::placeholder { color: #64748b; font-weight: 600;}
.mt-2 { margin-top: 6px; }

.promo-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 768px) { .promo-grid { grid-template-columns: 1fr 1fr; } }

.promo-card { background: white; border-radius: 20px; overflow: hidden; border: 2px solid #e2e8f0; position: relative; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.promo-card.qualified { border-color: #10b981; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.15); transform: translateY(-3px); }

.p-cover { height: 180px; background-size: cover; background-position: center; position: relative; }
.p-cover-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.6)); display: flex; justify-content: space-between; align-items: flex-start; padding: 15px;}
.p-date { font-size: 11px; font-weight: 800; color: white; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 8px; height: fit-content;}

.img-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end;}
.btn-view-img { background: rgba(0,0,0,0.7); color: white; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; border: none; cursor: pointer; backdrop-filter: blur(4px);}
.btn-change-img { background: rgba(255,255,255,0.9); color: #4f46e2; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2);}
.btn-reset-img { background: rgba(239,68,68,0.9); color: white; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; border: none; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2);}

.p-content { padding: 20px; }
.p-name { font-size: 18px; font-weight: 900; color: #1e293b; line-height: 1.3; margin-bottom: 15px; }

.p-details-box { background: #f8fafc; border-radius: 12px; padding: 12px 15px; border-left: 4px solid #6366f1; }
.p-detail-title { font-size: 12px; font-weight: 900; color: #475569; margin-bottom: 6px; }
.p-ul { margin: 0; padding-left: 20px; color: #64748b; font-size: 12px; font-weight: 600; line-height: 1.5; }
.p-ul li { margin-bottom: 4px; }
.p-ul li:last-child { margin-bottom: 0; }

.funnel-divider { border-bottom: 1px dashed #e2e8f0; margin: 15px 0; }

.p-calculated-result { background: #eef2ff; border: 1px dashed #a5b4fc; border-radius: 12px; padding: 15px 12px; margin-bottom: 15px; text-align: center;}
.cr-title { font-size: 11px; font-weight: 800; color: #6366f1; margin-bottom: 10px;}
.cr-value-wrap { display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; }
.cr-stat { display: flex; flex-direction: column; align-items: center; }
.cr-num { font-size: 22px; font-weight: 900; color: #4f46e2; line-height: 1;}
.cr-lbl { font-size: 11px; font-weight: 800; color: #64748b; margin-top: 4px;}
.double-tag { background: #fdf2f8; color: #ec4899; font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 6px; margin-top: 4px; border: 1px solid #fbcfe8;}

.status-row { margin-bottom: 12px; }
.status-badge { display: inline-block; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 900; width: 100%; text-align: center;}
.success { background: #10b981; color: white; }
.warning { background: #fffbeb; color: #b45309; border: 1px dashed #fcd34d; }

.progress-bar-bg { background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
.progress-bar-fill { background: #78C257; height: 100%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 6px; }
.qualified .progress-bar-fill { background: #10b981; }

.p-req { font-size: 12px; color: #94a3b8; font-weight: 800; text-align: right; }

.image-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); backdrop-filter: blur(5px); z-index: 9999; display: flex; justify-content: center; align-items: center; cursor: pointer;}
.full-size-img { max-width: 95%; max-height: 90vh; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); object-fit: contain; animation: popIn 0.3s ease-out;}
.close-x { position: absolute; top: 25px; right: 25px; background: rgba(255,255,255,0.2); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 18px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);}
@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
</style>