<script setup>
import { ref, computed, onMounted, watch } from 'vue'

// 💡 1. 建立從 2025-12 到 2026-12 的逐月資料庫
const availableMonths = [
  '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
  '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'
]

const monthlyStats = ref(
  availableMonths.reduce((acc, month) => {
    acc[month] = { vp: '', recruits: '' }
    return acc
  }, {})
)

// 💡 2. 精準還原海報細節，並加入「開始/結束月份」供系統過濾
const promos = ref([
  { 
    id: 1, name: '🌴 BZ 閒情浪漫遊 - 沖繩', date: '2025/12/1 ~ 2026/9/30', 
    startMonth: '2025-12', endMonth: '2026-09',
    defaultImage: 'https://images.unsplash.com/photo-1590559899731-a382839cecd5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImage: null,
    targetVp: 30000, targetRecruits: 0,
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
    targetVp: 40000, targetRecruits: 0,
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
    targetVp: 25000, targetRecruits: 0,
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
    targetVp: 0, targetRecruits: 10,
    details: [
      '【條件1】確保 10 名新推薦直銷商或優惠客戶 (含至少 5 名新直銷商)',
      '【條件2】每位需在登記月或下個月累計至少 250 VP',
      '【條件3】擁有兩位頭線新領班'
    ]
  },
  { 
    id: 5, name: '🦁 BLUE ZONE 團隊新加坡旅遊', date: '2026/4/1 ~ 2026/5/31', 
    startMonth: '2026-04', endMonth: '2026-05',
    defaultImage: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImage: null,
    targetVp: 5000, targetRecruits: 0,
    details: [
      '【基本賞】連續二個月 2,500 點 (非績優組限定)',
      '【升級賞】連續二個月 4,000 點 (補助12000)',
      '【最高賞】連續二個月 6,000 點 (補助18000)'
    ]
  },
])

// 💡 讀取草稿與自訂圖片記憶
onMounted(() => {
  const savedStats = localStorage.getItem('herbalife_monthly_stats')
  if (savedStats) try { monthlyStats.value = JSON.parse(savedStats) } catch (e) {}

  const savedImages = localStorage.getItem('herbalife_custom_images')
  if (savedImages) {
    try {
      const parsedImages = JSON.parse(savedImages)
      promos.value.forEach(p => {
        const match = parsedImages.find(img => img.id === p.id)
        if (match && match.customImage) p.customImage = match.customImage
      })
    } catch (e) {}
  }
})

// 自動存檔：分數與自訂圖片
watch(monthlyStats, (newVal) => { localStorage.setItem('herbalife_monthly_stats', JSON.stringify(newVal)) }, { deep: true })
watch(promos, (newVal) => {
  const imageStore = newVal.map(p => ({ id: p.id, customImage: p.customImage }))
  localStorage.setItem('herbalife_custom_images', JSON.stringify(imageStore))
}, { deep: true })

// --- 幫助函數 ---
const formatMonthLabel = (mStr) => {
  const [y, m] = mStr.split('-')
  return `${y.slice(2)}年 ${parseInt(m)}月`
}

const isMonthInRange = (monthStr, startStr, endStr) => {
  const m = new Date(monthStr + '-01')
  const s = new Date(startStr + '-01')
  const e = new Date(endStr + '-01')
  return m >= s && m <= e
}

// 💡 自訂圖片上傳邏輯
const handleImageUpload = (event, promo) => {
  const file = event.target.files[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) return alert('圖片檔案過大，請選擇小於 2MB 的圖片！')
  
  const reader = new FileReader()
  reader.onload = (e) => { promo.customImage = e.target.result }
  reader.readAsDataURL(file)
}

// 💡 3. 核心大腦：針對每個活動的「專屬月份區間」去加總分數
const promoStatus = computed(() => {
  return promos.value.map(promo => {
    let calculatedVp = 0
    let calculatedRecruits = 0

    // 只加總落在該活動考核期內的月份
    for (const [month, stats] of Object.entries(monthlyStats.value)) {
      if (isMonthInRange(month, promo.startMonth, promo.endMonth)) {
        calculatedVp += Number(stats.vp) || 0
        calculatedRecruits += Number(stats.recruits) || 0
      }
    }

    const vpShort = Math.max(0, promo.targetVp - calculatedVp)
    const recruitsShort = Math.max(0, promo.targetRecruits - calculatedRecruits)
    const isQualified = vpShort === 0 && recruitsShort === 0 && (promo.targetVp > 0 || promo.targetRecruits > 0)
    
    let progressPercent = 0
    if (promo.targetVp > 0 && promo.targetRecruits > 0) {
      const vpP = Math.min(100, (calculatedVp / promo.targetVp) * 100)
      const recP = Math.min(100, (calculatedRecruits / promo.targetRecruits) * 100)
      progressPercent = (vpP + recP) / 2
    } else if (promo.targetVp > 0) {
      progressPercent = Math.min(100, (calculatedVp / promo.targetVp) * 100)
    } else if (promo.targetRecruits > 0) {
      progressPercent = Math.min(100, (calculatedRecruits / promo.targetRecruits) * 100)
    }

    return { ...promo, calculatedVp, calculatedRecruits, vpShort, recruitsShort, isQualified, progressPercent }
  })
})

// 💡 4. 匯出完美 Excel 報表
function exportToExcel() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  csvContent += "活動名稱,考核期限,目標要求,該區間已累積(VP/人數),完成率(%),達標狀態\n"

  promoStatus.value.forEach(p => {
    let targetText = p.targetVp > 0 ? `${p.targetVp} VP` : `${p.targetRecruits} 人`
    let currentText = p.targetVp > 0 ? `${p.calculatedVp} VP` : `${p.calculatedRecruits} 人`
    let statusText = p.isQualified ? "🎉 已達標" : `尚差 ${p.targetVp > 0 ? p.vpShort + ' VP' : p.recruitsShort + ' 人'}`
    
    const row = `"${p.name}","${p.date}","${targetText}","${currentText}",${p.progressPercent.toFixed(1)}%,"${statusText}"`
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
        <span style="font-size: 24px;">🎛️</span>
        <div>
          <div class="mc-title">逐月考核分數控制台</div>
          <div class="mc-desc">輸入各月份分數，系統會「自動過濾」各活動所屬的月份並結算。</div>
        </div>
      </div>

      <div class="months-scroll-container">
        <div class="month-card" v-for="month in availableMonths" :key="month">
          <div class="m-title">📅 {{ formatMonthLabel(month) }}</div>
          
          <div class="m-inp-group">
            <label>VP</label>
            <input type="number" v-model="monthlyStats[month].vp" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group" style="margin-top: 8px;">
            <label>人數</label>
            <input type="number" v-model="monthlyStats[month].recruits" class="m-inp" placeholder="0">
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
              <input type="file" :id="'img-up-'+p.id" accept="image/*" style="display: none;" @change="e => handleImageUpload(e, p)">
              <label :for="'img-up-'+p.id" class="btn-change-img">📷 換封面</label>
              <button v-if="p.customImage" class="btn-reset-img" @click="p.customImage = null">✕ 還原</button>
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
            <div class="cr-title">💡 系統已抓取該考核區間累積：</div>
            <div class="cr-value">
              <span v-if="p.targetVp > 0">{{ p.calculatedVp.toLocaleString() }} VP</span>
              <span v-if="p.targetVp > 0 && p.targetRecruits > 0"> ＋ </span>
              <span v-if="p.targetRecruits > 0">{{ p.calculatedRecruits }} 人</span>
            </div>
          </div>

          <div class="status-row">
            <div v-if="p.isQualified" class="status-badge success">🎉 恭喜！已達成最低目標！</div>
            <div v-else class="status-badge warning">
              ⚠️ 距離達標尚差: 
              <span v-if="p.vpShort > 0"> {{ p.vpShort.toLocaleString() }} VP </span>
              <span v-if="p.recruitsShort > 0"> {{ p.recruitsShort }} 人</span>
            </div>
          </div>

          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: p.progressPercent + '%' }"></div>
          </div>
          <div class="p-req">
            最低要求: {{ p.targetVp > 0 ? p.targetVp.toLocaleString() + ' VP' : '' }} 
            <span v-if="p.targetVp > 0 && p.targetRecruits > 0"> / </span> 
            {{ p.targetRecruits > 0 ? p.targetRecruits + ' 人' : '' }}
            <span style="float: right; color:#4f46e2;">已完成 {{ p.progressPercent.toFixed(1) }}%</span>
          </div>

        </div>
      </div>
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

/* 👑 新版：逐月中央控制台 */
.master-control-card { background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 24px; padding: 20px; box-shadow: 0 15px 30px rgba(0,0,0,0.15); margin-bottom: 10px; color: white; border: 1px solid #334155;}
.mc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; border-bottom: 1px dashed #334155; padding-bottom: 15px;}
.mc-title { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; }
.mc-desc { font-size: 11px; font-weight: 600; color: #94a3b8; margin-top: 4px; line-height: 1.4;}

/* 左右滑動的月份卡片 */
.months-scroll-container { display: flex; overflow-x: auto; gap: 12px; padding-bottom: 10px; scroll-behavior: smooth;}
.months-scroll-container::-webkit-scrollbar { height: 6px; }
.months-scroll-container::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }

.month-card { min-width: 130px; background: rgba(255,255,255,0.08); border: 1px solid #475569; border-radius: 16px; padding: 12px; }
.m-title { font-size: 13px; font-weight: 900; color: #10b981; margin-bottom: 10px; text-align: center;}
.m-inp-group { display: flex; align-items: center; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 4px 8px;}
.m-inp-group label { font-size: 11px; font-weight: 800; color: #cbd5e1; width: 35px; }
.m-inp { width: 100%; border: none; background: transparent; color: white; font-size: 16px; font-weight: 900; outline: none; text-align: right;}
.m-inp::placeholder { color: #64748b; font-weight: 600;}

/* 🎯 活動卡片樣式 */
.promo-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 768px) { .promo-grid { grid-template-columns: 1fr 1fr; } }

.promo-card { background: white; border-radius: 20px; overflow: hidden; border: 2px solid #e2e8f0; position: relative; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.promo-card.qualified { border-color: #10b981; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.15); transform: translateY(-3px); }

/* 🖼️ 圖片封面 */
.p-cover { height: 180px; background-size: cover; background-position: center; position: relative; }
.p-cover-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.6)); display: flex; justify-content: space-between; align-items: flex-start; padding: 15px;}
.p-date { font-size: 11px; font-weight: 800; color: white; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 8px; height: fit-content;}

/* 📷 更換圖片按鈕 */
.img-actions { display: flex; gap: 6px; }
.btn-change-img { background: rgba(255,255,255,0.9); color: #4f46e2; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: 0.2s;}
.btn-change-img:active { transform: scale(0.95); }
.btn-reset-img { background: rgba(239,68,68,0.9); color: white; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; border: none; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2);}

.p-content { padding: 20px; }
.p-name { font-size: 18px; font-weight: 900; color: #1e293b; line-height: 1.3; margin-bottom: 15px; }

/* 📋 詳細條件清單 */
.p-details-box { background: #f8fafc; border-radius: 12px; padding: 12px 15px; border-left: 4px solid #6366f1; }
.p-detail-title { font-size: 12px; font-weight: 900; color: #475569; margin-bottom: 6px; }
.p-ul { margin: 0; padding-left: 20px; color: #64748b; font-size: 12px; font-weight: 600; line-height: 1.5; }
.p-ul li { margin-bottom: 4px; }
.p-ul li:last-child { margin-bottom: 0; }

.funnel-divider { border-bottom: 1px dashed #e2e8f0; margin: 15px 0; }

/* 💡 新增：自動結算顯示結果 */
.p-calculated-result { background: #eef2ff; border: 1px dashed #a5b4fc; border-radius: 12px; padding: 12px; margin-bottom: 15px; text-align: center;}
.cr-title { font-size: 11px; font-weight: 800; color: #6366f1; margin-bottom: 4px;}
.cr-value { font-size: 20px; font-weight: 900; color: #4f46e2;}

.status-row { margin-bottom: 12px; }
.status-badge { display: inline-block; padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 900; width: 100%; text-align: center;}
.success { background: #10b981; color: white; }
.warning { background: #fffbeb; color: #b45309; border: 1px dashed #fcd34d; }

.progress-bar-bg { background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
.progress-bar-fill { background: #78C257; height: 100%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 6px; }
.qualified .progress-bar-fill { background: #10b981; }

.p-req { font-size: 12px; color: #94a3b8; font-weight: 800; }
</style>