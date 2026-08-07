<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '../supabase'
import VueEasyLightbox from 'vue-easy-lightbox' 
import confetti from 'canvas-confetti' 

// 💡 管理員權限設定
const currentUserEmail = ref('')
const isAdmin = computed(() => currentUserEmail.value === 'yimwingkwan0907@gmail.com')

// 🟢 全新順滑全螢幕看圖狀態 (支援雙指縮放與左右滑動)
const visibleRef = ref(false)
const imgsRef = ref([])
const indexRef = ref(0)

const openLightbox = (promo, startIndex = 0) => {
  const images = []
  images.push(promo.customImages[0] || promo.defaultImage)
  if (promo.customImages[1]) {
    images.push(promo.customImages[1])
  }
  
  imgsRef.value = images
  indexRef.value = startIndex
  visibleRef.value = true
}

const onHide = () => {
  visibleRef.value = false
}

const availableMonths = computed(() => {
  const months = []
  let curr = new Date('2025-01-01')
  const end = new Date()
  end.setFullYear(end.getFullYear() + 3) 
  while (curr <= end) {
    const y = curr.getFullYear()
    const m = String(curr.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
    curr.setMonth(curr.getMonth() + 1)
  }
  return months
})

const availableYears = computed(() => {
  return [...new Set(availableMonths.value.map(m => m.split('-')[0]))]
})
const selectedYear = ref(new Date().getFullYear().toString())

const displayedMonths = computed(() => {
  return availableMonths.value.filter(m => m.startsWith(selectedYear.value))
})

// 🟢 狀態結構更新：加入 gv (組積分)
const monthlyStats = ref(
  Object.fromEntries(
    availableMonths.value.map(m => [m, { vp: '', vip: '', pc: '', gold: '', sup: '', gv: '', firstLine250: '', newSup3Gen: '' }])
  )
)
const isSyncing = ref(false)
const qualifiedMemory = ref(new Set()) 

// 🟢 身份切換 (績優組/卓越組 vs 非績優組)
const isTopTeam = ref(JSON.parse(localStorage.getItem('fitwork_isTopTeam')) || false)
const toggleTopTeam = () => {
  isTopTeam.value = !isTopTeam.value
  localStorage.setItem('fitwork_isTopTeam', JSON.stringify(isTopTeam.value))
}

// 💯 10000% 保留所有活動條件、金額與圖片
const promos = ref([
  { 
    id: 6, name: '✈️ 12個月推廣資格旅行 Promotion', date: '自訂 12 個月集中衝刺', 
    startMonth: '2026-01', endMonth: '2026-12', 
    doubleVpMonth: null, doubleVpMaxExtra: 0, 
    defaultImage: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null], 
    targetTravelCash: 6000, targetVp: 0, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【入場資格】累積滿 $6,000 旅行現金',
      '【1. 個人分】每完成 500 個人分 = $50 旅行現金',
      '【2. RO 提升】以基準起算，每提升 50 RO = $150 旅行現金',
      '【3. 頭線會員】首次完成 250 分 = 每位 $50 旅行現金',
      '【4. 領班獎賞】頭三代非卓越組新升領班 = 每位 $100 旅行現金',
      '📌 旅行現金不設上限，只限團隊旅行使用，不可兌換現金'
    ]
  },
  { 
    id: 1, name: '🌴 BZ 閒情浪漫遊 - 沖繩', date: '2025/12/1 ~ 2026/9/30', 
    startMonth: '2025-12', endMonth: '2026-09',
    doubleVpMonth: '2025-12', doubleVpMaxExtra: 2500, 
    defaultImage: 'https://images.unsplash.com/photo-1590559899731-a382839cecd5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null], 
    targetVp: 30000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【非績優組】特別賞: 30,000點 / 第一重: 40,000點 / 第二重: 50,000點',
      '【績優組】特別賞: 40,000點 / 第一重: 60,000點 / 第二重: 80,000點',
      '📌 12月加碼：最多可雙重計算 5,000 個人點數 (系統將自動雙倍加乘)'
    ]
  },
  { 
    id: 2, name: '🏖️ 2027 馬爾代夫閒情浪漫遊', date: '2026/1/1 ~ 2026/12/31', 
    startMonth: '2026-01', endMonth: '2026-12',
    doubleVpMonth: '2026-02', doubleVpMaxExtra: 2500, 
    defaultImage: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null],
    targetVp: 60000, targetVip: 0, targetGold: 0, targetSup: 0, 
    details: [
      '【非卓越組限定】最低門檻累積 40,000 總銷售量點數',
      '【級別要求】第一級: 6萬點 / 第二級: 8萬點 / 第三級: 10萬點',
      '📌 2月加碼：最多可雙倍計算 2,500 個人點數 (系統將自動加乘)'
    ]
  },
 { 
    id: 3, name: '🎓 香港世界組大學訓練', date: '2026/1/1 ~ 2026/6/30', 
    startMonth: '2026-01', endMonth: '2026-06',
    doubleVpMonth: '2026-02', doubleVpMaxExtra: 3500, 
    defaultImage: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null],
    targetVp: 25000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【基本資格】累計達 25,000 點 或 連續四個月均達 2,500 點',
      '【VIP 派對資格】必須累計達 25,000 點，並達成以下領班條件：',
      '👑 白金級: 3位新領班 / 🥇 金級: 2位新領班 / 🥈 銀級: 1位新領班',
      '📌 2月加碼：最多可雙倍計算 3,500 個人點數 (系統自動加乘)',
      '📌 會議日期：2026年9月12日'
    ]
  },
 { 
    id: 4, name: '🏆 2026 Herbalife Premier League', date: '2026/1/1 ~ 2026/12/31', 
    startMonth: '2026-01', endMonth: '2026-12',
    defaultImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null],
    targetVp: 0, targetVip: 10, targetGold: 0, targetSup: 2, 
    details: [
      '【條件1】確保 10 名新推薦直銷商(VIP)或優惠客戶(PC)',
      '【條件2】當中必須包含最少 5 名 VIP',
      '【條件3】擁有兩位頭線新領班',
      '📌 系統提醒：每位報名者需在指定月內累計滿 250 VP'
    ]
  },
  { 
    id: 5, name: '🦁 BLUE ZONE 團隊新加坡旅遊', date: '2026/4/1 ~ 2026/5/31', 
    startMonth: '2026-04', endMonth: '2026-05',
    defaultImage: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null],
    targetVp: 5000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【基本賞】非績優組限定連續二個月 2,500 點 (補貼HKD2000)',
      '【升級賞】連續二個月 4,000 點 (補助HKD3000)',
      '【最高賞】連續二個月 6,000 點 (補助HKD4500)'
    ]
  },
])

// ==========================================
// 🔥 新增：全自動 RO 計算引擎 🔥
// ==========================================
// 根據 VP 換算 RO 百分比 (每 500VP = 1%，最高 5%)
const getROPercent = (vp) => {
  const v = Number(vp) || 0
  if (v < 500) return 0
  const level = Math.floor(v / 500)
  return Math.min(5, level) * 0.01
}

// 取得該月實際產生的 RO (組積分 x 百分比)
const getMonthRO = (monthStr) => {
  const stats = monthlyStats.value[monthStr]
  if (!stats) return 0
  const percent = getROPercent(stats.vp)
  return Math.floor((Number(stats.gv) || 0) * percent)
}

// 取得 RO 提升 (該月 RO - 上個月 RO)
const getROIncrease = (monthStr) => {
  const currentIndex = availableMonths.value.indexOf(monthStr)
  if (currentIndex <= 0) return 0 // 沒有上個月的資料則視為 0 提升
  
  const prevMonthStr = availableMonths.value[currentIndex - 1]
  const currentRO = getMonthRO(monthStr)
  const prevRO = getMonthRO(prevMonthStr)
  
  return currentRO - prevRO
}
// ==========================================


// --- 💡 隱私雙重鎖：前端強制過濾本人資料 ---
const loadCloudStats = async () => {
  isSyncing.value = true
  
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.email) {
    currentUserEmail.value = session.user.email
  }

  if (currentUserEmail.value) {
    const { data: statsData } = await supabase
      .from('herbalife_stats')
      .select('*')
      .eq('user_email', currentUserEmail.value) 
      
    if (statsData) {
      statsData.forEach(row => {
        if (monthlyStats.value[row.month]) {
          monthlyStats.value[row.month].vp = row.vp === 0 || row.vp === null ? '' : row.vp
          monthlyStats.value[row.month].vip = row.recruits_vip === 0 || row.recruits_vip === null ? '' : row.recruits_vip
          monthlyStats.value[row.month].pc = row.recruits_pc === 0 || row.recruits_pc === null ? '' : row.recruits_pc 
          monthlyStats.value[row.month].gold = row.recruits_gold === 0 || row.recruits_gold === null ? '' : row.recruits_gold
          monthlyStats.value[row.month].sup = row.recruits_sup === 0 || row.recruits_sup === null ? '' : row.recruits_sup
          
          // 🟢 讀取組積分 (注意: 資料庫需建立 group_volume 欄位)
          monthlyStats.value[row.month].gv = row.group_volume === 0 || row.group_volume === null ? '' : row.group_volume
          
          monthlyStats.value[row.month].firstLine250 = row.first_line_250 === 0 || row.first_line_250 === null ? '' : row.first_line_250
          monthlyStats.value[row.month].newSup3Gen = row.new_sup_3gen === 0 || row.new_sup_3gen === null ? '' : row.new_sup_3gen
        }
      })
    }
  }

  const { data: imgData } = await supabase.from('herbalife_images').select('*')
  if (imgData) {
    imgData.forEach(row => {
      const match = promos.value.find(p => p.id === row.promo_id)
      if (match) {
        try {
          const arr = JSON.parse(row.image_data)
          if (Array.isArray(arr)) match.customImages = arr
          else match.customImages[0] = row.image_data
        } catch (e) {
          match.customImages[0] = row.image_data
       }
      }
    })
  }
  
  promoStatus.value.forEach(p => { if (p.isQualified) qualifiedMemory.value.add(p.id) })

  isSyncing.value = false
}

// 🟢 智能判斷是否為「本月」
const isCurrentMonth = (mStr) => {
  const today = new Date()
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  return mStr === currentMonthStr
}

// 🟢 自動滾動到本月
const scrollToCurrentMonth = () => {
  setTimeout(() => {
    const today = new Date()
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    
    if (selectedYear.value === String(today.getFullYear())) {
      const targetCard = document.getElementById('month-card-' + currentMonthStr)
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
      }
    } else {
       const container = document.querySelector('.months-scroll-container')
       if(container) container.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }, 300) 
}

watch(selectedYear, () => {
  scrollToCurrentMonth()
})

onMounted(async () => { 
  await loadCloudStats() 
  scrollToCurrentMonth()
})

// 💡 優化儲存機制：同步儲存自動計算的 ro_increase 以及新增的 group_volume
const saveMonthToCloud = async (month) => {
  if (!currentUserEmail.value) {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.user?.email) {
      currentUserEmail.value = data.session.user.email
    } else {
      alert('⚠️ 系統尚未讀取到您的登入狀態，無法儲存資料！請重新整理頁面。')
      return
    }
  }
  
  const stats = monthlyStats.value[month]
  const payload = {
    user_email: currentUserEmail.value, 
    month: month,
    vp: Number(stats.vp) || 0,
    recruits_vip: Number(stats.vip) || 0,
    recruits_pc: Number(stats.pc) || 0, 
    recruits_gold: Number(stats.gold) || 0,
    recruits_sup: Number(stats.sup) || 0,
    group_volume: Number(stats.gv) || 0,                 // 🟢 新增存入組積分
    ro_increase: getROIncrease(month),                   // 🟢 自動寫入計算結果 (以防未來需要直接拉資料庫數字)
    first_line_250: Number(stats.firstLine250) || 0,    
    new_sup_3gen: Number(stats.newSup3Gen) || 0         
  }

  const { error } = await supabase.from('herbalife_stats').upsert(payload, { onConflict: 'user_email,month' }) 
  
  if (error) {
    console.warn("Primary save failed, trying fallback...", error)
    const { error: fallbackError } = await supabase.from('herbalife_stats').upsert(payload)
    if (fallbackError) {
      alert('⚠️ 儲存失敗，請檢查網路或聯繫管理員：\n' + fallbackError.message)
    }
  }
}

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

const handleImageUpload = async (event, promo, index) => {
  const file = event.target.files[0]
  if (!file) return
  
  alert('🔄 圖片壓縮與同步中，請稍候...')
  const compressedBase64 = await compressImage(file)
  
  promo.customImages[index] = compressedBase64
  const { error } = await supabase.from('herbalife_images').upsert({ 
    promo_id: promo.id, 
    image_data: JSON.stringify(promo.customImages) 
  })
  if (error) alert('上傳失敗: ' + error.message)
  else alert(`✅ 圖 ${index + 1} 已更新並同步！`)
}

const resetImage = async (promo, index) => {
  if(!confirm(`確定要刪除 圖 ${index + 1} 嗎？這將刪除雲端紀錄以節省空間。`)) return
  promo.customImages[index] = null
  await supabase.from('herbalife_images').upsert({ 
    promo_id: promo.id, 
    image_data: JSON.stringify(promo.customImages) 
  })
}

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

// 💡 10000% 保留的超級計算大腦
const promoStatus = computed(() => {
  return promos.value.map(promo => {
    let calculatedVp = 0, calculatedVip = 0, calculatedPc = 0, calculatedGold = 0, calculatedSup = 0
    let calculatedRo = 0, calculatedFirstLine250 = 0, calculatedNewSup3Gen = 0
    let totalDoubleBonus = 0 
    let specialStatusText = null 

    for (const [month, stats] of Object.entries(monthlyStats.value)) {
      if (isMonthInRange(month, promo.startMonth, promo.endMonth)) {
        let monthVp = Number(stats.vp) || 0
        
        if (promo.doubleVpMonth === month && monthVp > 0) {
          let extraBonus = Math.min(monthVp, promo.doubleVpMaxExtra)
          monthVp += extraBonus 
          totalDoubleBonus += extraBonus
        }
        
        calculatedVp += monthVp
        calculatedVip += Number(stats.vip) || 0
        calculatedPc += Number(stats.pc) || 0 
        calculatedGold += Number(stats.gold) || 0
        calculatedSup += Number(stats.sup) || 0
        
        // 🟢 將系統自動計算的「RO提升」累加起來，達成精準的總提升額度
        calculatedRo += getROIncrease(month)
        calculatedFirstLine250 += Number(stats.firstLine250) || 0
        calculatedNewSup3Gen += Number(stats.newSup3Gen) || 0
      }
    }

    let targetPc = promo.targetPc || 0 

    let vpShort = Math.max(0, promo.targetVp - calculatedVp)
    let vipShort = Math.max(0, promo.targetVip - calculatedVip)
    let pcShort = Math.max(0, targetPc - calculatedPc) 
    let goldShort = Math.max(0, promo.targetGold - calculatedGold)
    let supShort = Math.max(0, promo.targetSup - calculatedSup)
    
    let isQualified = vpShort === 0 && vipShort === 0 && pcShort === 0 && goldShort === 0 && supShort === 0 && 
                        (promo.targetVp > 0 || promo.targetVip > 0 || targetPc > 0 || promo.targetGold > 0 || promo.targetSup > 0)
    
    let progressPercent = 0

    // 🟢 處理旅行現金 Promotion 結算邏輯
    if (promo.id === 6) {
      let totalVpCash = Math.floor(calculatedVp / 500) * 50
      // 確保即使某幾個月負增長導致總計為負，也不會倒扣現金 (最低0)
      let netRo = Math.max(0, calculatedRo)
      let totalRoCash = Math.floor(netRo / 50) * 150
      let totalFirstLineCash = calculatedFirstLine250 * 50
      let totalNewSupCash = calculatedNewSup3Gen * 100

      let totalTravelCash = totalVpCash + totalRoCash + totalFirstLineCash + totalNewSupCash
      
      isQualified = totalTravelCash >= promo.targetTravelCash
      progressPercent = Math.min(100, (totalTravelCash / promo.targetTravelCash) * 100)

      if (isQualified) {
        specialStatusText = `🎉 恭喜！已累積 $${totalTravelCash.toLocaleString()} 旅行現金，成功獲得團隊旅行入場資格！`
      } else {
        specialStatusText = `⚠️ 目前累積: $${totalTravelCash.toLocaleString()} / $${promo.targetTravelCash.toLocaleString()} 旅行現金 (尚差 $${(promo.targetTravelCash - totalTravelCash).toLocaleString()})`
      }
      
      promo.totalTravelCash = totalTravelCash
    }
    else if (promo.id === 5) {
      let aprVp = Number(monthlyStats.value['2026-04']?.vp) || 0
      let mayVp = Number(monthlyStats.value['2026-05']?.vp) || 0
      
      let isBaseMet = aprVp >= 2500 && mayVp >= 2500
      let isUpgradeMet = aprVp >= 4000 && mayVp >= 4000
      let isTopMet = aprVp >= 6000 && mayVp >= 6000

      isQualified = isBaseMet
      
      if (isTopMet) specialStatusText = "🎉 達成最高賞 (補貼HKD4500)！"
      else if (isUpgradeMet) specialStatusText = "🎉 達成升級賞 (補貼HKD3000)！"
      else if (isBaseMet) specialStatusText = "🎉 達成基本賞 (補貼HKD2000)！"
      else specialStatusText = `⚠️ 需連續兩月達標 (4月: ${aprVp}, 5月: ${mayVp})`
      
      progressPercent = Math.min(100, ((Math.min(aprVp, 2500) + Math.min(mayVp, 2500)) / 5000) * 100)
    } 
   else if (promo.id === 4) {
      let totalMembers = calculatedVip + calculatedPc
      let isTotalMet = totalMembers >= 10
      let isVipMet = calculatedVip >= 5
      let isSupMet = calculatedSup >= 2

      isQualified = isTotalMet && isVipMet && isSupMet

      let progressTotal = Math.min(100, (totalMembers / 10) * 100)
      let progressVip = Math.min(100, (calculatedVip / 5) * 100)
      let progressSup = Math.min(100, (calculatedSup / 2) * 100)
      progressPercent = (progressTotal + progressVip + progressSup) / 3

      if (isQualified) {
        specialStatusText = "🎉 恭喜！人數與領班門檻皆已達標！(📌 請自行核實這 10 人皆已滿足 250 VP)"
      } else {
        let missingText = []
        
        if (!isTotalMet) {
            missingText.push(`${10 - totalMembers} 人(VIP或PC)`)
        }
        
        if (!isVipMet) {
            if (isTotalMet) {
                missingText.push(`總人數足夠，但 VIP 尚欠 ${5 - calculatedVip} 人(需保底 5 名 VIP)`)
            } else {
                missingText.push(`其中最少需包含 ${5 - calculatedVip} 名 VIP`)
            }
        }
        
        if (!isSupMet) {
            missingText.push(`${2 - calculatedSup} 位領班`)
        }

        specialStatusText = `⚠️ 尚差: ${missingText.join(' | ')} (📌 必須滿 250 VP)`
      }
    }
    else if (promo.id === 3) {
      let m1 = Number(monthlyStats.value['2026-01']?.vp) || 0; let m2 = Number(monthlyStats.value['2026-02']?.vp) || 0
      let m3 = Number(monthlyStats.value['2026-03']?.vp) || 0; let m4 = Number(monthlyStats.value['2026-04']?.vp) || 0
      let m5 = Number(monthlyStats.value['2026-05']?.vp) || 0; let m6 = Number(monthlyStats.value['2026-06']?.vp) || 0
      
      let has4Consecutive = 
          (m1>=2500 && m2>=2500 && m3>=2500 && m4>=2500) ||
          (m2>=2500 && m3>=2500 && m4>=2500 && m5>=2500) ||
          (m3>=2500 && m4>=2500 && m5>=2500 && m6>=2500)
          
      let isBasicMet = calculatedVp >= 25000 || has4Consecutive

      if (isBasicMet) {
          isQualified = true
          vpShort = 0
          progressPercent = 100

          if (calculatedVp >= 25000) {
            if (calculatedSup >= 3) {
              specialStatusText = "💎 達成【白金級 VIP】(3位新領班)！太神啦！"
            } else if (calculatedSup === 2) {
              specialStatusText = "🥇 達成【金級 VIP】！再 1 位新領班晉升白金級！"
            } else if (calculatedSup === 1) {
              specialStatusText = "🥈 達成【銀級 VIP】！再 1 位新領班晉升金級！"
            } else {
              specialStatusText = "🎉 達成基本資格！快爭取 VIP (尚差 1 位新領班)"
            }
         } else {
             let vpDiff = 25000 - calculatedVp;
             let supNeeded = Math.max(0, 1 - calculatedSup); 
             
             if (supNeeded > 0) {
               specialStatusText = `🎉 已達成4個月2500點！爭取 VIP 尚差 ${vpDiff.toLocaleString()} VP 及 ${supNeeded}位新領班`
             } else {
               specialStatusText = `🎉 已達成4個月2500點！您已有領班，爭取 VIP 僅差 ${vpDiff.toLocaleString()} VP！`
             }
          }
      } else {
          isQualified = false
          progressPercent = Math.min(100, (calculatedVp / 25000) * 100)
          let vpDiff = 25000 - calculatedVp
          specialStatusText = `⚠️ 尚差: ${vpDiff.toLocaleString()} VP 或 需達成連續 4 個月 2500 VP`
      }
    }
    else if (promo.id === 2) {
      let vp = calculatedVp
      if (isTopTeam.value) {
        if (vp >= 100000) {
          specialStatusText = "🎉 達成【第三級】(10萬點)！太神啦！"
          isQualified = true
          progressPercent = 100
        } else if (vp >= 80000) {
          specialStatusText = `🎉 達成【第二級】(8萬點)！升級第三級尚差 ${(100000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else if (vp >= 60000) {
          specialStatusText = `🎉 達成【第一級】(6萬點)！升級第二級尚差 ${(80000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else if (vp >= 40000) {
          specialStatusText = `🎉 達成【卓越組特別賞】(4萬點)！升級第一級尚差 ${(60000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else {
          specialStatusText = `⚠️ 距離特別賞(4萬點)尚差: ${(40000 - vp).toLocaleString()} VP`
          isQualified = false
          progressPercent = Math.min(100, (vp / 40000) * 100)
        }
      } else {
        if (vp >= 100000) {
          specialStatusText = "🎉 達成【第三級】(10萬點)！太神啦！"
          isQualified = true
          progressPercent = 100
        } else if (vp >= 80000) {
          specialStatusText = `🎉 達成【第二級】(8萬點)！升級第三級尚差 ${(100000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else if (vp >= 60000) {
          specialStatusText = `🎉 達成【第一級】(6萬點)！升級第二級尚差 ${(80000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else {
          specialStatusText = `⚠️ 距離第一級(6萬點)尚差: ${(60000 - vp).toLocaleString()} VP`
          isQualified = false
          progressPercent = Math.min(100, (vp / 60000) * 100)
        }
      }
    }
    else if (promo.id === 1) {
      let vp = calculatedVp
      if (isTopTeam.value) {
        if (vp >= 80000) {
          specialStatusText = "🎉 達成【第二重資格】(8萬點)！太神啦！"
          isQualified = true
          progressPercent = 100
        } else if (vp >= 60000) {
          specialStatusText = `🎉 達成【第一重資格】(6萬點)！升級第二重尚差 ${(80000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else if (vp >= 40000) {
          specialStatusText = `🎉 達成【特別賞】(4萬點)！升級第一重尚差 ${(60000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else {
          specialStatusText = `⚠️ 距離特別賞(4萬點)尚差: ${(40000 - vp).toLocaleString()} VP`
          isQualified = false
          progressPercent = Math.min(100, (vp / 40000) * 100)
        }
      } else {
        if (vp >= 50000) {
          specialStatusText = "🎉 達成【第二重資格】(5萬點)！太神啦！"
          isQualified = true
          progressPercent = 100
        } else if (vp >= 40000) {
          specialStatusText = `🎉 達成【第一重資格】(4萬點)！升級第二重尚差 ${(50000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else if (vp >= 30000) {
          specialStatusText = `🎉 達成【特別賞】(3萬點)！升級第一重尚差 ${(40000 - vp).toLocaleString()} VP`
          isQualified = true
          progressPercent = 100
        } else {
          specialStatusText = `⚠️ 距離特別賞(3萬點)尚差: ${(30000 - vp).toLocaleString()} VP`
          isQualified = false
          progressPercent = Math.min(100, (vp / 30000) * 100)
        }
      }
    }
  else {
      let percents = []
      if (promo.targetVp > 0) percents.push(Math.min(100, (calculatedVp / promo.targetVp) * 100))
      if (promo.targetVip > 0) percents.push(Math.min(100, (calculatedVip / promo.targetVip) * 100))
      if (targetPc > 0) percents.push(Math.min(100, (calculatedPc / targetPc) * 100))
      if (promo.targetGold > 0) percents.push(Math.min(100, (calculatedGold / promo.targetGold) * 100))
      if (promo.targetSup > 0) percents.push(Math.min(100, (calculatedSup / promo.targetSup) * 100))
      progressPercent = percents.length > 0 ? percents.reduce((a,b)=>a+b,0) / percents.length : 0
    }

    let avgVpNeeded = 0
    let monthsLeft = 0
    
    if (promo.id !== 4 && promo.id !== 5 && promo.id !== 6) {
        const today = new Date()
        const currY = today.getFullYear()
        const currM = today.getMonth() + 1
        const [endY, endM] = promo.endMonth.split('-').map(Number)
        const [startY, startM] = promo.startMonth.split('-').map(Number)
        
        const currentTotal = currY * 12 + currM
        const startTotal = startY * 12 + startM
        const endTotal = endY * 12 + endM
        
        monthsLeft = endTotal - currentTotal + 1
        if (currentTotal < startTotal) monthsLeft = endTotal - startTotal + 1
        if (monthsLeft < 0) monthsLeft = 0

        let exactShort = vpShort
        if (specialStatusText) {
           const match = specialStatusText.match(/差\s*:?\s*([\d,]+)\s*VP/)
           if (match) exactShort = parseInt(match[1].replace(/,/g, ''))
        }
        
        if (exactShort > 0 && monthsLeft > 0) {
            avgVpNeeded = Math.ceil(exactShort / monthsLeft)
        }
    }

   return { ...promo, calculatedVp, calculatedVip, calculatedPc, calculatedGold, calculatedSup, calculatedRo, calculatedFirstLine250, calculatedNewSup3Gen, vpShort, vipShort, pcShort, goldShort, supShort, isQualified, progressPercent, totalDoubleBonus, specialStatusText, avgVpNeeded, monthsLeft }
  })
})

watch(() => promoStatus.value, (newStatuses) => {
  if (!newStatuses || isSyncing.value) return

  newStatuses.forEach(promo => {
    const wasQualified = qualifiedMemory.value.has(promo.id)

    if (promo.isQualified && !wasQualified) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, zIndex: 99999 })
      qualifiedMemory.value.add(promo.id)
      setTimeout(() => { alert(`🎉 狂賀！您剛剛達成了【${promo.name}】！太神啦！`) }, 500)
    } 
    else if (!promo.isQualified && wasQualified) {
      qualifiedMemory.value.delete(promo.id)
    }
  })
}, { deep: true })

function exportToExcel() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
  csvContent += "活動名稱,考核期限,該區間已累積(VP),已累積(VIP),已累積(PC),已累積(金級),已累積(領班),綜合完成率(%),達標狀態\n"

  promoStatus.value.forEach(p => {
    let statusText = p.specialStatusText || (p.isQualified ? "🎉 已達標" : `尚差: ${p.vpShort>0?p.vpShort+'VP ':''}${p.vipShort>0?p.vipShort+'VIP ':''}${p.pcShort>0?p.pcShort+'PC ':''}${p.goldShort>0?p.goldShort+'金級 ':''}${p.supShort>0?p.supShort+'領班 ':''}`)
    const row = `"${p.name}","${p.date}",${p.calculatedVp},${p.calculatedVip},${p.calculatedPc},${p.calculatedGold},${p.calculatedSup},${p.progressPercent.toFixed(1)}%,"${statusText}"`
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
        <button @click="toggleTopTeam" :class="['team-toggle-btn', isTopTeam ? 'active' : '']">
          {{ isTopTeam ? '👑 績優/卓越組' : '👤 非績優組' }}
        </button>
        <button class="btn-sync" @click="loadCloudStats">🔄 刷新</button>
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
        <div class="month-card" v-for="month in displayedMonths" :key="month" :id="'month-card-' + month" :class="{'current-month-highlight': isCurrentMonth(month)}">
          <div class="m-title">
            📅 {{ formatMonthLabel(month) }}
            <span v-if="isCurrentMonth(month)" class="now-tag">本月</span>
          </div>
          
          <!-- 💡 優化：加入 step="any" 解決小數點報錯 -->
          <div class="m-inp-group">
            <label>VP</label>
            <input type="number" step="any" v-model="monthlyStats[month].vp" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>VIP</label>
            <input type="number" step="any" v-model="monthlyStats[month].vip" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>PC</label>
            <input type="number" step="any" v-model="monthlyStats[month].pc" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>金級</label>
            <input type="number" step="any" v-model="monthlyStats[month].gold" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>領班</label>
            <input type="number" step="any" v-model="monthlyStats[month].sup" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          
          <div style="border-top: 1px dashed #475569; margin: 8px 0;"></div>
          
          <!-- 🟢 全新自動化 RO 計算區塊 -->
          <div class="m-inp-group mt-2" title="請輸入該月的下線組積分">
            <label style="color: #60a5fa; font-size: 9px;">組積分</label>
            <input type="number" step="any" v-model="monthlyStats[month].gv" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          
          <div class="m-calc-row mt-2">
            <span class="calc-label" title="系統自動 = 組積分 x (根據個人分計算的%)">該月 RO</span>
            <span class="calc-val">{{ getMonthRO(month) }}</span>
          </div>
          
          <div class="m-calc-row">
            <span class="calc-label" style="color: #fcd34d;">RO 提升</span>
            <!-- 根據正負數動態變色，正數加 + 號 -->
            <span class="calc-val" :class="{'text-green-400': getROIncrease(month) > 0, 'text-red-400': getROIncrease(month) < 0}">
              {{ getROIncrease(month) > 0 ? '+' : '' }}{{ getROIncrease(month) }}
            </span>
          </div>
          
          <div style="border-top: 1px dashed #475569; margin: 8px 0;"></div>

          <div class="m-inp-group mt-2" title="輸入該月有多少位頭線首次完成 250分">
            <label style="color: #fcd34d; font-size: 9px;">頭線250</label>
            <input type="number" step="any" v-model="monthlyStats[month].firstLine250" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2" title="輸入該月頭三代內新增的非卓越組新升領班人數">
            <label style="color: #fcd34d; font-size: 9px;">三代新領</label>
            <input type="number" step="any" v-model="monthlyStats[month].newSup3Gen" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
        </div>
      </div>
    </div>

    <div class="section-title">🎯 系統自動結算分析</div>

    <div class="promo-grid">
      <div v-for="p in promoStatus" :key="p.id" class="promo-card" :class="{'qualified': p.isQualified}">
        
        <div class="p-cover-wrap">
          <div class="p-cover" :style="{ backgroundImage: `url(${p.customImages[0] || p.defaultImage})` }">
            <div class="p-cover-overlay">
              <div class="p-date">🕒 {{ p.date }}</div>
              
              <div class="img-actions">
               <button class="btn-view-img" @click="openLightbox(p, 0)">🔍 圖1</button>
                <button v-if="p.customImages[1]" class="btn-view-img" @click="openLightbox(p, 1)">🔍 圖2</button>
                
                <template v-if="isAdmin">
                  <input type="file" :id="'img-up-0-'+p.id" accept="image/*" style="display: none;" @change="e => handleImageUpload(e, p, 0)">
                  <label :for="'img-up-0-'+p.id" class="btn-change-img">📷1</label>
                  
                  <input type="file" :id="'img-up-1-'+p.id" accept="image/*" style="display: none;" @change="e => handleImageUpload(e, p, 1)">
                  <label :for="'img-up-1-'+p.id" class="btn-change-img">📷2</label>

                  <button v-if="p.customImages[0]" class="btn-reset-img" @click="resetImage(p, 0)">✕刪圖1</button>
                  <button v-if="p.customImages[1]" class="btn-reset-img" @click="resetImage(p, 1)">✕刪圖2</button>
                </template>
              </div>
            </div>
          </div>
          <div v-if="p.customImages[1]" class="p-cover secondary-cover" :style="{ backgroundImage: `url(${p.customImages[1]})` }"></div>
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
              <template v-if="p.id === 6">
                <div class="cr-stat">
                  <span class="cr-num" style="color: #f59e0b;">${{ p.totalTravelCash ? p.totalTravelCash.toLocaleString() : 0 }}</span>
                  <span class="cr-lbl">累積旅行現金</span>
                </div>
              </template>
              <template v-else>
                <div v-if="p.targetVp > 0 || p.calculatedVp > 0" class="cr-stat">
                  <span class="cr-num">{{ p.calculatedVp.toLocaleString() }}</span>
                  <span class="cr-lbl">VP</span>
                  <div v-if="p.totalDoubleBonus > 0" class="double-tag">⚡️ 已含雙倍加乘 <br>(+{{ p.totalDoubleBonus.toLocaleString() }} VP)</div>
                </div>
                
                <div v-if="p.targetVip > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedVip }}</span><span class="cr-lbl">VIP</span></div>
                <div v-if="p.targetPc > 0 || p.calculatedPc > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedPc }}</span><span class="cr-lbl">PC</span></div>
                <div v-if="p.targetGold > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedGold }}</span><span class="cr-lbl">金級</span></div>
                <div v-if="p.targetSup > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedSup }}</span><span class="cr-lbl">領班</span></div>
              </template>
            </div>
          </div>

        <div class="status-row">
            <div v-if="p.specialStatusText" :class="['status-badge', p.isQualified ? 'success' : 'warning', p.id === 4 ? 'alert-border' : '']">
              {{ p.specialStatusText }}
            </div>
            <div v-else-if="p.isQualified" class="status-badge success">🎉 恭喜！已達成最低目標！</div>
            <div v-else class="status-badge warning">
              ⚠️ 尚差: 
              <span v-if="p.vpShort > 0"> {{ p.vpShort.toLocaleString() }} VP </span>
              <span v-if="p.vipShort > 0"> | {{ p.vipShort }} VIP </span>
              <span v-if="p.pcShort > 0"> | {{ p.pcShort }} PC </span>
              <span v-if="p.goldShort > 0"> | {{ p.goldShort }} 金級 </span>
              <span v-if="p.supShort > 0"> | {{ p.supShort }} 領班 </span>
            </div>
          </div>

          <div v-if="p.avgVpNeeded > 0" style="background: #f0f9ff; border: 1px dashed #7dd3fc; color: #0284c7; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; text-align: center; margin-bottom: 12px; display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span>🗓️ 剩餘 {{ p.monthsLeft }} 個月</span>
            <span style="color: #bae6fd;">|</span>
            <span>接下來平均每月需：<strong style="color: #0369a1; font-size: 15px;">{{ p.avgVpNeeded.toLocaleString() }}</strong> VP</span>
          </div>

          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: p.progressPercent + '%' }"></div>
          </div>
          <div class="p-req">綜合完成率：<span style="color:#4f46e2; font-weight:900;">{{ p.progressPercent.toFixed(1) }}%</span></div>

        </div>
      </div>
    </div>

    <!-- 🟢 手機原生級別：雙指縮放與左右滑動圖庫 -->
    <vue-easy-lightbox
      :visible="visibleRef"
      :imgs="imgsRef"
      :index="indexRef"
      @hide="onHide"
    ></vue-easy-lightbox>

  </div>
</template>

<style scoped>
/* 💡 本月專屬高光特效與標籤 */
.current-month-highlight {
  border: 2px solid #ef4444 !important;
  background: rgba(239, 68, 68, 0.05) !important;
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.15);
}
.now-tag {
  font-size: 10px;
  background: #ef4444;
  color: white;
  padding: 2px 6px;
  border-radius: 6px;
  margin-left: 4px;
  vertical-align: top;
  font-weight: 900;
  box-shadow: 0 2px 5px rgba(239,68,68,0.3);
}

.page { 
  padding: 20px; 
  background: #f8fafc; 
  min-height: 100vh; 
  overscroll-behavior-y: none; 
}
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

.year-tabs { display: flex; gap: 8px; margin-bottom: 15px; overflow-x: auto; padding-bottom: 4px; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
.year-tabs::-webkit-scrollbar { display: none; }
.year-btn { flex-shrink: 0; background: rgba(255,255,255,0.05); border: 1px solid #475569; color: #cbd5e1; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 800; cursor: pointer; transition: 0.2s; white-space: nowrap;}
.year-btn.active { background: #10b981; border-color: #10b981; color: white; box-shadow: 0 4px 10px rgba(16,185,129,0.25); }

.team-toggle-btn {
  background: rgba(255,255,255,0.05); 
  border: 1px solid #475569; 
  color: #94a3b8; 
  font-size: 11px; 
  font-weight: 800; 
  padding: 6px 10px; 
  border-radius: 8px; 
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.team-toggle-btn.active {
  background: rgba(245, 158, 11, 0.2);
  color: #fcd34d;
  border-color: #f59e0b;
}

.months-scroll-container { display: flex; overflow-x: auto; gap: 12px; padding-bottom: 10px; scroll-behavior: smooth; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
.months-scroll-container::-webkit-scrollbar { height: 6px; }
.months-scroll-container::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }

.month-card { flex-shrink: 0; width: 140px; background: rgba(255,255,255,0.08); border: 1px solid #475569; border-radius: 16px; padding: 12px; }
.m-title { font-size: 15px; font-weight: 900; color: #10b981; margin-bottom: 10px; text-align: center;}

/* 🟢 新增的自動計算顯示排版 */
.m-calc-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 8px; }
.calc-label { font-size: 10px; font-weight: 800; color: #94a3b8; }
.calc-val { font-size: 13px; font-weight: 900; color: white; }
.text-green-400 { color: #4ade80; }
.text-red-400 { color: #f87171; }

.m-inp-group { display: flex; align-items: center; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 4px 8px;}
.m-inp-group label { font-size: 11px; font-weight: 800; color: #cbd5e1; width: 35px; white-space: nowrap;}
.m-inp { width: 100%; border: none; background: transparent; color: white; font-size: 15px; font-weight: 900; outline: none; text-align: right; -moz-appearance: textfield; appearance: textfield;}
.m-inp::-webkit-outer-spin-button, .m-inp::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.m-inp::placeholder { color: #64748b; font-weight: 600;}
.mt-2 { margin-top: 6px; }

.promo-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 768px) { .promo-grid { grid-template-columns: 1fr 1fr; } }

.promo-card { background: white; border-radius: 20px; overflow: hidden; border: 2px solid #e2e8f0; position: relative; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.02);}
.promo-card.qualified { border-color: #10b981; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.15); transform: translateY(-3px); }

.p-cover-wrap { display: flex; height: 180px; }
.p-cover { flex: 1; background-size: cover; background-position: center; position: relative; border-right: 1px solid rgba(255,255,255,0.3);}
.secondary-cover { border-left: 1px solid rgba(0,0,0,0.2); }
.p-cover-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.6)); display: flex; justify-content: space-between; align-items: flex-start; padding: 12px; z-index: 2;}

.p-date { font-size: 11px; font-weight: 800; color: white; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 8px; height: fit-content;}

.img-actions { 
  display: flex; 
  flex-direction: row; 
  flex-wrap: wrap; 
  gap: 6px; 
  justify-content: flex-end; 
  align-content: flex-start;
  max-width: 65%; 
}
.btn-view-img { background: rgba(0,0,0,0.7); color: white; font-size: 11px; font-weight: 800; padding: 4px 8px; border-radius: 8px; border: none; cursor: pointer; backdrop-filter: blur(4px);}
.btn-change-img { background: rgba(255,255,255,0.9); color: #4f46e2; font-size: 11px; font-weight: 800; padding: 4px 8px; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2);}
.btn-reset-img { background: rgba(239,68,68,0.9); color: white; font-size: 11px; font-weight: 800; padding: 4px 8px; border-radius: 8px; border: none; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2);}

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

.cr-value-wrap { display: flex; justify-content: space-around; gap: 8px; flex-wrap: wrap; }
.cr-stat { display: flex; flex-direction: column; align-items: center; min-width: 60px;}
.cr-num { font-size: 22px; font-weight: 900; color: #4f46e2; line-height: 1;}
.cr-lbl { font-size: 11px; font-weight: 800; color: #64748b; margin-top: 4px;}

.double-tag { background: #fdf2f8; color: #ec4899; font-size: 10px; font-weight: 900; padding: 3px 6px; border-radius: 6px; margin-top: 6px; border: 1px solid #fbcfe8; text-align: center; line-height: 1.3;}

.status-row { margin-bottom: 12px; }
.status-badge { display: inline-block; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 900; width: 100%; text-align: center;}
.success { background: #10b981; color: white; }
.warning { background: #fffbeb; color: #b45309; border: 1px dashed #fcd34d; }
.alert-border { border: 2px solid #ef4444 !important; background: #fef2f2 !important; color: #b91c1c !important; }

.progress-bar-bg { background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
.progress-bar-fill { background: #78C257; height: 100%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 6px; }
.qualified .progress-bar-fill { background: #10b981; }

.p-req { font-size: 12px; color: #94a3b8; font-weight: 800; text-align: right; }

</style>