<script setup>
import { ref, computed, onMounted, watch } from 'vue'

// 💡 1. 全局中央控制台 (Global Stats) - 輸入一次，全體連動！
const globalStats = ref({
  vp: 0,
  recruits: 0
})

// 讀取草稿記憶
onMounted(() => {
  const saved = localStorage.getItem('herbalife_global_stats')
  if (saved) {
    try { globalStats.value = JSON.parse(saved) } catch (e) { console.error(e) }
  }
})

// 自動存檔
watch(globalStats, (newVal) => {
  localStorage.setItem('herbalife_global_stats', JSON.stringify(newVal))
}, { deep: true })

// 💡 2. 精準還原海報細節與加入圖片
const promos = ref([
  { 
    id: 1, 
    name: '🌴 BZ 閒情浪漫遊 - 沖繩', 
    date: '2025/12/1 ~ 2026/9/30', 
    image: 'https://images.unsplash.com/photo-1590559899731-a382839cecd5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    targetVp: 30000, targetRecruits: 0,
    details: [
      '【非績優組】特別賞: 30,000點 / 第一重: 40,000點 / 第二重: 50,000點',
      '【績優組】特別賞: 40,000點 / 第一重: 60,000點 / 第二重: 80,000點',
      '📌 12月加碼：最多可雙重計算 5,000 個人點數'
    ]
  },
  { 
    id: 2, 
    name: '🏖️ 2027 馬爾代夫閒情浪漫遊', 
    date: '2026/1/1 ~ 2026/12/31', 
    image: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    targetVp: 40000, targetRecruits: 0,
    details: [
      '【卓越組及以上限定】最低門檻累積 40,000 總銷售量點數',
      '【級別要求】第一級: 6萬點 / 第二級: 8萬點 / 第三級: 10萬點',
      '📌 開放予所有全資格領班及以上參與'
    ]
  },
  { 
    id: 3, 
    name: '🎓 香港世界組大學訓練', 
    date: '2026/1/1 ~ 2026/6/30', 
    image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    targetVp: 25000, targetRecruits: 0,
    details: [
      '【條件A】累計達 25,000 總銷售量點數',
      '【條件B】連續四個月均達 2,500 點',
      '【條件C】於爭取資格期限內成為新升世界組',
      '📌 會議日期：2026年9月12日'
    ]
  },
  { 
    id: 4, 
    name: '🏆 2026 Herbalife Premier League', 
    date: '2026/1/1 ~ 2026/12/31', 
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    targetVp: 0, targetRecruits: 10,
    details: [
      '【條件1】確保 10 名新推薦直銷商或優惠客戶 (含至少 5 名新直銷商)',
      '【條件2】每位需在登記月或下個月累計至少 250 VP',
      '【條件3】擁有兩位頭線新領班'
    ]
  },
  { 
    id: 5, 
    name: '🦁 BLUE ZONE 團隊新加坡旅遊', 
    date: '2026/4/1 ~ 2026/5/31', 
    image: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    targetVp: 5000, targetRecruits: 0,
    details: [
      '【基本賞】連續二個月 2,500 點 (非績優組限定)',
      '【升級賞】連續二個月 4,000 點 (補助12000)',
      '【最高賞】連續二個月 6,000 點 (補助18000)'
    ]
  },
])

// 💡 3. 核心計算大腦：自動從頂部數字計算所有進度
const promoStatus = computed(() => {
  return promos.value.map(promo => {
    const vpShort = Math.max(0, promo.targetVp - globalStats.value.vp)
    const recruitsShort = Math.max(0, promo.targetRecruits - globalStats.value.recruits)
    
    // 判斷是否達標 (以設定的最高目標為準)
    const isQualified = vpShort === 0 && recruitsShort === 0 && (promo.targetVp > 0 || promo.targetRecruits > 0)
    
    let progressPercent = 0
    if (promo.targetVp > 0 && promo.targetRecruits > 0) {
      const vpP = Math.min(100, (globalStats.value.vp / promo.targetVp) * 100)
      const recP = Math.min(100, (globalStats.value.recruits / promo.targetRecruits) * 100)
      progressPercent = (vpP + recP) / 2
    } else if (promo.targetVp > 0) {
      progressPercent = Math.min(100, (globalStats.value.vp / promo.targetVp) * 100)
    } else if (promo.targetRecruits > 0) {
      progressPercent = Math.min(100, (globalStats.value.recruits / promo.targetRecruits) * 100)
    }

    return { ...promo, vpShort, recruitsShort, isQualified, progressPercent }
  })
})

// 💡 4. 匯出完美 Excel 報表
function exportToExcel() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  csvContent += "活動名稱,考核期限,目標要求,目前進度(中央同步),完成率(%),達標狀態\n"

  promoStatus.value.forEach(p => {
    let targetText = p.targetVp > 0 ? `${p.targetVp} VP` : `${p.targetRecruits} 人`
    let currentText = p.targetVp > 0 ? `${globalStats.value.vp} VP` : `${globalStats.value.recruits} 人`
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
          <div class="mc-title">中央進度控制台</div>
          <div class="mc-desc">在此輸入總分數，系統將自動計算所有活動的達標進度。</div>
        </div>
      </div>

      <div class="mc-grid">
        <div class="mc-item">
          <label>🔥 目前總累積 VP 分數</label>
          <div class="mc-inp-wrap">
            <input type="number" v-model="globalStats.vp" class="mc-inp">
            <span class="mc-unit">VP</span>
          </div>
        </div>
        <div class="mc-item">
          <label>👥 目前累積達標人數</label>
          <div class="mc-inp-wrap">
            <input type="number" v-model="globalStats.recruits" class="mc-inp">
            <span class="mc-unit">人</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">🎯 各項獎勵目標分析</div>

    <div class="promo-grid">
      <div v-for="p in promoStatus" :key="p.id" class="promo-card" :class="{'qualified': p.isQualified}">
        
        <div class="p-cover" :style="{ backgroundImage: `url(${p.image})` }">
          <div class="p-cover-overlay">
            <div class="p-date">🕒 {{ p.date }}</div>
          </div>
        </div>
        
        <div class="p-content">
          <div class="p-name">{{ p.name }}</div>
          
          <div class="p-details-box">
            <div class="p-detail-title">🔍 考核條件要求：</div>
            <ul class="p-ul">
              <li v-for="(rule, idx) in p.details" :key="idx">{{ rule }}</li>
            </ul>
          </div>
          
          <div class="funnel-divider"></div>

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

/* 👑 中央控制台樣式 */
.master-control-card { background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 24px; padding: 25px; box-shadow: 0 15px 30px rgba(0,0,0,0.15); margin-bottom: 10px; color: white; border: 1px solid #334155;}
.mc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 1px dashed #334155; padding-bottom: 15px;}
.mc-title { font-size: 18px; font-weight: 900; letter-spacing: 0.5px; }
.mc-desc { font-size: 11px; font-weight: 600; color: #94a3b8; margin-top: 4px; line-height: 1.4;}
.mc-grid { display: grid; grid-template-columns: 1fr; gap: 15px; }
@media (min-width: 600px) { .mc-grid { grid-template-columns: 1fr 1fr; } }
.mc-item label { display: block; font-size: 13px; font-weight: 800; color: #cbd5e1; margin-bottom: 8px; }
.mc-inp-wrap { display: flex; align-items: center; background: rgba(255,255,255,0.05); border: 2px solid #475569; border-radius: 14px; overflow: hidden; transition: 0.2s; }
.mc-inp-wrap:focus-within { border-color: #10b981; background: rgba(255,255,255,0.1); }
.mc-inp { width: 100%; border: none; background: transparent; color: white; font-size: 26px; font-weight: 900; padding: 12px 15px; outline: none; text-align: right;}
.mc-unit { padding: 0 15px 0 5px; color: #94a3b8; font-weight: 800; font-size: 14px; }

/* 🎯 活動卡片樣式 */
.promo-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 768px) { .promo-grid { grid-template-columns: 1fr 1fr; } }

.promo-card { background: white; border-radius: 20px; overflow: hidden; border: 2px solid #e2e8f0; position: relative; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.promo-card.qualified { border-color: #10b981; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.15); transform: translateY(-3px); }

/* 🖼️ 圖片封面 */
.p-cover { height: 160px; background-size: cover; background-position: center; position: relative; }
.p-cover-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.6)); display: flex; align-items: flex-end; padding: 15px;}
.p-date { font-size: 11px; font-weight: 800; color: white; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 8px;}

.p-content { padding: 20px; }
.p-name { font-size: 18px; font-weight: 900; color: #1e293b; line-height: 1.3; margin-bottom: 15px; }

/* 📋 詳細條件清單 */
.p-details-box { background: #f8fafc; border-radius: 12px; padding: 12px 15px; border-left: 4px solid #6366f1; }
.p-detail-title { font-size: 12px; font-weight: 900; color: #475569; margin-bottom: 6px; }
.p-ul { margin: 0; padding-left: 20px; color: #64748b; font-size: 12px; font-weight: 600; line-height: 1.5; }
.p-ul li { margin-bottom: 4px; }
.p-ul li:last-child { margin-bottom: 0; }

.funnel-divider { border-bottom: 1px dashed #e2e8f0; margin: 15px 0; }

.status-row { margin-bottom: 12px; }
.status-badge { display: inline-block; padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 900; width: 100%; text-align: center;}
.success { background: #10b981; color: white; }
.warning { background: #fffbeb; color: #b45309; border: 1px dashed #fcd34d; }

.progress-bar-bg { background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
.progress-bar-fill { background: #78C257; height: 100%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 6px; }
.qualified .progress-bar-fill { background: #10b981; }

.p-req { font-size: 12px; color: #94a3b8; font-weight: 800; }
</style>