<script setup>
import { ref, computed, onMounted, watch } from 'vue'

// 1. 🎯 精準還原海報上的 5 大推廣活動
const defaultPromos = [
  { 
    id: 1, name: '🌴 BZ 閒情浪漫遊 - 沖繩', date: '2025/12/1 ~ 2026/9/30', 
    desc: '非績優組特別賞：累積 30,000 個人點數', 
    targetVp: 30000, targetRecruits: 0, currentVp: 0, currentRecruits: 0 
  },
  { 
    id: 2, name: '🏖️ 2027 馬爾代夫閒情浪漫遊', date: '2026/1/1 ~ 2026/12/31', 
    desc: '卓越組及以上：累積最少 40,000 總銷售量點數', 
    targetVp: 40000, targetRecruits: 0, currentVp: 0, currentRecruits: 0 
  },
  { 
    id: 3, name: '🎓 香港世界組大學訓練', date: '2026/1/1 ~ 2026/6/30', 
    desc: '累計達 25,000 總銷售量點數 或 連四個月2500點', 
    targetVp: 25000, targetRecruits: 0, currentVp: 0, currentRecruits: 0 
  },
  { 
    id: 4, name: '🏆 2026 Herbalife Premier League', date: '2026/1/1 ~ 2026/12/31', 
    desc: '確保 10 名新推薦直銷商或優惠客戶 (含5名直銷商)', 
    targetVp: 0, targetRecruits: 10, currentVp: 0, currentRecruits: 0 
  },
  { 
    id: 5, name: '🦁 BLUE ZONE 團隊新加坡旅遊', date: '2026/4/1 ~ 2026/5/31', 
    desc: '連續二個月 2500 點 (即總共 5000 點)', 
    targetVp: 5000, targetRecruits: 0, currentVp: 0, currentRecruits: 0 
  },
]

const promos = ref([...defaultPromos])

// 💡 讀取草稿記憶：關掉網頁再開進度也不會不見
onMounted(() => {
  const saved = localStorage.getItem('herbalife_promos_data')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      // 合併已存儲的進度，同時保留最新的活動設定
      promos.value = promos.value.map(p => {
        const match = parsed.find(sp => sp.id === p.id)
        return match ? { ...p, currentVp: match.currentVp, currentRecruits: match.currentRecruits } : p
      })
    } catch (e) {
      console.error(e)
    }
  }
})

// 💡 自動存檔：只要數字一改就自動記憶
watch(promos, (newVal) => {
  localStorage.setItem('herbalife_promos_data', JSON.stringify(newVal))
}, { deep: true })

// 2. 🧠 核心計算大腦：自動計算達標率
const promoStatus = computed(() => {
  return promos.value.map(promo => {
    const vpShort = Math.max(0, promo.targetVp - (promo.currentVp || 0))
    const recruitsShort = Math.max(0, promo.targetRecruits - (promo.currentRecruits || 0))
    
    const isQualified = vpShort === 0 && recruitsShort === 0
    
    let progressPercent = 0
    if (promo.targetVp > 0) progressPercent = Math.min(100, ((promo.currentVp || 0) / promo.targetVp) * 100)
    else if (promo.targetRecruits > 0) progressPercent = Math.min(100, ((promo.currentRecruits || 0) / promo.targetRecruits) * 100)

    return { ...promo, vpShort, recruitsShort, isQualified, progressPercent }
  })
})

// 3. 📊 匯出完美 Excel 報表
function exportToExcel() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  csvContent += "活動名稱,考核期限,目標要求,目前進度,完成率(%),達標狀態\n"

  promoStatus.value.forEach(p => {
    let targetText = p.targetVp > 0 ? `${p.targetVp} VP` : `${p.targetRecruits} 人`
    let currentText = p.targetVp > 0 ? `${p.currentVp} VP` : `${p.currentRecruits} 人`
    let statusText = p.isQualified ? "🎉 已達標" : `尚差 ${p.targetVp > 0 ? p.vpShort + ' VP' : p.recruitsShort + ' 人'}`
    
    const row = `"${p.name}","${p.date}","${targetText}","${currentText}",${p.progressPercent.toFixed(1)}%,"${statusText}"`
    csvContent += row + "\n"
  })

  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  const dateStr = new Date().toISOString().slice(0, 10)
  link.setAttribute("download", `康寶萊推廣進度報表_${dateStr}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="page" style="padding-bottom: 150px;">
    
    <div class="header-row">
      <h2 class="title">🏆 康寶萊全球推廣追蹤</h2>
      <button class="btn-export" @click="exportToExcel">📥 匯出進度報表</button>
    </div>

    <div class="promo-grid">
      <div v-for="p in promoStatus" :key="p.id" class="promo-card" :class="{'qualified': p.isQualified}">
        
        <div class="p-header">
          <div class="p-name">{{ p.name }}</div>
          <div class="p-date">🕒 {{ p.date }}</div>
        </div>
        <div class="p-desc">{{ p.desc }}</div>
        
        <div class="funnel-divider"></div>

        <div class="input-section">
          <div class="f-item" v-if="p.targetVp > 0">
            <label>更新 VP 進度</label>
            <div class="inp-box">
              <input type="number" v-model="p.currentVp" class="mod-inp">
              <span class="unit">VP</span>
            </div>
          </div>

          <div class="f-item" v-if="p.targetRecruits > 0">
            <label>更新達標人數</label>
            <div class="inp-box">
              <input type="number" v-model="p.currentRecruits" class="mod-inp">
              <span class="unit">人</span>
            </div>
          </div>
        </div>

        <div class="status-row">
          <div v-if="p.isQualified" class="status-badge success">🎉 恭喜！已達成目標！</div>
          <div v-else class="status-badge warning">
            ⚠️ 距離達標尚差: 
            <span v-if="p.vpShort > 0"> {{ p.vpShort.toLocaleString() }} VP </span>
            <span v-if="p.recruitsShort > 0"> {{ p.recruitsShort }} 人</span>
          </div>
        </div>

        <div class="progress-bar-bg">
          <div class="progress-bar-fill" :style="{ width: p.progressPercent + '%' }"></div>
        </div>
        <div class="p-req">當前完成率：{{ p.progressPercent.toFixed(1) }}%</div>

      </div>
    </div>

  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
.title { font-weight: 900; font-size: 24px; color: #1e293b; margin: 0; }

.btn-export { background: white; border: 2px solid #78C257; color: #78C257; padding: 10px 16px; border-radius: 12px; font-weight: 800; font-size: 14px; cursor: pointer; transition: 0.2s; display: flex; align-items: center;}
.btn-export:active { transform: scale(0.95); background: #f0fdf4; }

.promo-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 768px) { .promo-grid { grid-template-columns: 1fr 1fr; } }

.promo-card { background: white; padding: 25px; border-radius: 20px; border: 2px solid #e2e8f0; position: relative; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.promo-card.qualified { border-color: #10b981; background: #f0fdf4; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.15); transform: translateY(-3px); }

.p-header { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.p-name { font-size: 18px; font-weight: 900; color: #1e293b; line-height: 1.3; }
.p-date { font-size: 12px; font-weight: 800; color: #6366f1; background: #eef2ff; display: inline-block; padding: 4px 10px; border-radius: 8px; width: fit-content;}
.p-desc { font-size: 13px; font-weight: 700; color: #64748b; }

.funnel-divider { border-bottom: 1px dashed #e2e8f0; margin: 15px 0; }

.input-section { display: flex; gap: 15px; margin-bottom: 20px; }
.f-item { flex: 1; }
.f-item label { display: block; font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; }
.inp-box { display: flex; align-items: center; border: 2px solid #cbd5e1; border-radius: 12px; background: #f8fafc; overflow: hidden; transition: 0.2s;}
.inp-box:focus-within { border-color: #78C257; background: white; }
.mod-inp { width: 100%; border: none; padding: 12px; font-weight: 900; outline: none; color: #1e293b; font-size: 20px; background: transparent; text-align: right; }
.unit { padding: 0 15px 0 5px; font-weight: 800; color: #94a3b8; font-size: 14px;}

.status-row { margin-bottom: 12px; }
.status-badge { display: inline-block; padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 900; width: 100%; text-align: center;}
.success { background: #10b981; color: white; }
.warning { background: #fffbeb; color: #b45309; border: 1px dashed #fcd34d; }

.progress-bar-bg { background: #e2e8f0; height: 14px; border-radius: 7px; overflow: hidden; margin-bottom: 8px; }
.progress-bar-fill { background: #78C257; height: 100%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 7px; }
.qualified .progress-bar-fill { background: #10b981; }

.p-req { font-size: 12px; color: #94a3b8; font-weight: 800; text-align: right; }
</style>