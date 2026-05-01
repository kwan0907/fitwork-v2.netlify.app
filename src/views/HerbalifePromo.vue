<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '../supabase'

// 💡 管理員權限設定
const currentUserEmail = ref('')
const isAdmin = computed(() => currentUserEmail.value === 'yimwingkwan0907@gmail.com')

// 全螢幕看圖狀態與縮放控制
const viewingImage = ref(null)
const imgScale = ref(1)

const openImage = (imgStr) => {
  viewingImage.value = imgStr
  imgScale.value = 1 
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

const monthlyStats = ref({})
const isSyncing = ref(false)
// 🟢 身份切換 (績優組/卓越組 vs 非績優組)
const isTopTeam = ref(JSON.parse(localStorage.getItem('fitwork_isTopTeam')) || false)
const toggleTopTeam = () => {
  isTopTeam.value = !isTopTeam.value
  localStorage.setItem('fitwork_isTopTeam', JSON.stringify(isTopTeam.value))
}

// 💯 10000% 保留所有活動條件、金額與圖片
const promos = ref([
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
    // 👇 啟動二月雙倍引擎，最高加成 2500 分
    doubleVpMonth: '2026-02', doubleVpMaxExtra: 2500, 
    defaultImage: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null],
    targetVp: 60000, targetVip: 0, targetGold: 0, targetSup: 0, // 👈 基礎目標改為第一級的 60000
    details: [
      '【非卓越組限定】最低門檻累積 40,000 總銷售量點數',
      '【級別要求】第一級: 6萬點 / 第二級: 8萬點 / 第三級: 10萬點',
      '📌 2月加碼：最多可雙倍計算 2,500 個人點數 (系統將自動加乘)'
      
    ]
  },
  { 
    id: 3, name: '🎓 香港世界組大學訓練', date: '2026/1/1 ~ 2026/6/30', 
    startMonth: '2026-01', endMonth: '2026-06',
    defaultImage: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
    customImages: [null, null],
    targetVp: 25000, targetVip: 0, targetGold: 0, targetSup: 0,
    details: [
      '【基本資格】累計達 25,000 點 或 連續四個月均達 2,500 點',
      '【VIP 派對資格】必須累計達 25,000 點，並達成以下領班條件：',
      '👑 白金級: 3位新領班 / 🥇 金級: 2位新領班 / 🥈 銀級: 1位新領班',
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
      '【條件1】確保 10 名新推薦直銷商或優惠客戶 (系統追蹤 VIP/PC)',
      '【條件2】每位需在登記月或下個月累計至少 250 VP',
      '【條件3】擁有兩位頭線新領班 (系統追蹤 領班)'
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

// --- 💡 隱私雙重鎖：前端強制過濾本人資料 ---
const loadCloudStats = async () => {
  isSyncing.value = true
  
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user?.email) {
    currentUserEmail.value = session.user.email
  }

 // 💡 修正：強制將所有預設值設定為絕對乾淨的空字串 (加入 PC)
  availableMonths.value.forEach(m => {
    if (!monthlyStats.value[m]) monthlyStats.value[m] = { vp: '', vip: '', pc: '', gold: '', sup: '' }
  })

  if (currentUserEmail.value) {
    const { data: statsData } = await supabase
      .from('herbalife_stats')
      .select('*')
      .eq('user_email', currentUserEmail.value) 
      
    if (statsData) {
      statsData.forEach(row => {
        if (monthlyStats.value[row.month]) {
          // 💡 修正：確保從資料庫抓下來的值，如果為 0，就顯示為空字串，保持畫面乾淨
          monthlyStats.value[row.month].vp = row.vp === 0 || row.vp === null ? '' : row.vp
          monthlyStats.value[row.month].vip = row.recruits_vip === 0 || row.recruits_vip === null ? '' : row.recruits_vip
          monthlyStats.value[row.month].pc = row.recruits_pc === 0 || row.recruits_pc === null ? '' : row.recruits_pc // 🟢 新增讀取 PC
          monthlyStats.value[row.month].gold = row.recruits_gold === 0 || row.recruits_gold === null ? '' : row.recruits_gold
          monthlyStats.value[row.month].sup = row.recruits_sup === 0 || row.recruits_sup === null ? '' : row.recruits_sup
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
  
  isSyncing.value = false
}

onMounted(() => { loadCloudStats() })

// 💡 優化儲存機制：加入狀態防呆與失敗重試，徹底解決靜默失敗導致資料遺失的問題
const saveMonthToCloud = async (month) => {
  // 防呆：如果沒有抓到Email，嘗試重新抓取，抓不到則阻擋並提示
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
    recruits_pc: Number(stats.pc) || 0, // 🟢 新增寫入 PC
    recruits_gold: Number(stats.gold) || 0,
    recruits_sup: Number(stats.sup) || 0
  }

  const { error } = await supabase.from('herbalife_stats').upsert(payload, { onConflict: 'user_email,month' }) 
  
  // 💡 自動修復：如果指定約束條件失敗，嘗試直接 Upsert（防止資料庫結構定義落差導致靜默報錯）
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
        calculatedPc += Number(stats.pc) || 0 // 🟢 加總 PC
        calculatedGold += Number(stats.gold) || 0
        calculatedSup += Number(stats.sup) || 0
      }
    }

    // 取得 targetPc，如果活動沒有設定 targetPc 就預設為 0
    let targetPc = promo.targetPc || 0 

    let vpShort = Math.max(0, promo.targetVp - calculatedVp)
    let vipShort = Math.max(0, promo.targetVip - calculatedVip)
    let pcShort = Math.max(0, targetPc - calculatedPc) // 🟢 計算 PC 尚差
    let goldShort = Math.max(0, promo.targetGold - calculatedGold)
    let supShort = Math.max(0, promo.targetSup - calculatedSup)
    
    let isQualified = vpShort === 0 && vipShort === 0 && pcShort === 0 && goldShort === 0 && supShort === 0 && 
                        (promo.targetVp > 0 || promo.targetVip > 0 || targetPc > 0 || promo.targetGold > 0 || promo.targetSup > 0)
    
    let progressPercent = 0

    if (promo.id === 5) {
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
      let percents = []
      if (promo.targetVip > 0) percents.push(Math.min(100, (calculatedVip / promo.targetVip) * 100))
      if (promo.targetSup > 0) percents.push(Math.min(100, (calculatedSup / promo.targetSup) * 100))
      progressPercent = percents.length > 0 ? percents.reduce((a,b)=>a+b,0) / percents.length : 0

      if (isQualified) {
        specialStatusText = "🎉 人數已達標！⚠️ 系統提醒：請務必自行核實這 10 位 VIP/PC【每位皆已達 250 VP】！"
      } else {
        specialStatusText = `⚠️ 尚差: ${vipShort > 0 ? vipShort + ' VIP/PC ' : ''}${supShort > 0 ? '| ' + supShort + ' 領班 ' : ''} (📌 提醒: 報名的 VIP 必須確保滿 250 VP)`
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
             specialStatusText = `🎉 已達成4個月2500點！爭取 VIP 尚差 ${vpDiff.toLocaleString()} VP 及 1位新領班`
          }
      } else {
          isQualified = false
          progressPercent = Math.min(100, (calculatedVp / 25000) * 100)
          let vpDiff = 25000 - calculatedVp
          specialStatusText = `⚠️ 尚差: ${vpDiff.toLocaleString()} VP 或 需達成連續 4 個月 2500 VP`
      }
    }
    else if (promo.id === 2) {
      // 🏖️ 馬爾代夫雙軌邏輯 (卓越組 vs 非卓越組)
      let vp = calculatedVp
      if (isTopTeam.value) {
        // 👑 卓越組 (4萬特別賞起跳)
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
        // 👤 非卓越組 (6萬第一級起跳)
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
      // 🌴 沖繩雙軌邏輯 (績優組 vs 非績優組)
      let vp = calculatedVp
      if (isTopTeam.value) {
        // 👑 績優組
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
        // 👤 非績優組
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
      if (targetPc > 0) percents.push(Math.min(100, (calculatedPc / targetPc) * 100)) // 🟢 加入 PC 百分比
      if (promo.targetGold > 0) percents.push(Math.min(100, (calculatedGold / promo.targetGold) * 100))
      if (promo.targetSup > 0) percents.push(Math.min(100, (calculatedSup / promo.targetSup) * 100))
      progressPercent = percents.length > 0 ? percents.reduce((a,b)=>a+b,0) / percents.length : 0
    }

return { ...promo, calculatedVp, calculatedVip, calculatedPc, calculatedGold, calculatedSup, vpShort, vipShort, pcShort, goldShort, supShort, isQualified, progressPercent, totalDoubleBonus, specialStatusText }
  })
})
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
        <!-- 👇 新增：績優/卓越組切換按鈕 -->
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
        <div class="month-card" v-for="month in displayedMonths" :key="month">
          <div class="m-title">📅 {{ formatMonthLabel(month) }}</div>
          
          <div class="m-inp-group">
            <label>VP</label>
            <input type="number" v-model="monthlyStats[month].vp" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>VIP</label>
            <input type="number" v-model="monthlyStats[month].vip" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>PC</label>
            <input type="number" v-model="monthlyStats[month].pc" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>金級</label>
            <input type="number" v-model="monthlyStats[month].gold" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
          </div>
          <div class="m-inp-group mt-2">
            <label>領班</label>
            <input type="number" v-model="monthlyStats[month].sup" @change="saveMonthToCloud(month)" class="m-inp" placeholder="0">
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
                <button class="btn-view-img" @click="openImage(p.customImages[0] || p.defaultImage)">🔍 圖1</button>
                <button v-if="p.customImages[1]" class="btn-view-img" @click="openImage(p.customImages[1])">🔍 圖2</button>
                
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
              <div v-if="p.targetVp > 0 || p.calculatedVp > 0" class="cr-stat">
                <span class="cr-num">{{ p.calculatedVp.toLocaleString() }}</span>
                <span class="cr-lbl">VP</span>
                <div v-if="p.totalDoubleBonus > 0" class="double-tag">⚡️ 已含雙倍加乘 <br>(+{{ p.totalDoubleBonus.toLocaleString() }} VP)</div>
              </div>
              
              <div v-if="p.targetVip > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedVip }}</span><span class="cr-lbl">VIP</span></div>
              <div v-if="p.targetPc > 0 || p.calculatedPc > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedPc }}</span><span class="cr-lbl">PC</span></div>
              <div v-if="p.targetGold > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedGold }}</span><span class="cr-lbl">金級</span></div>
              <div v-if="p.targetSup > 0" class="cr-stat"><span class="cr-num">{{ p.calculatedSup }}</span><span class="cr-lbl">領班</span></div>
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

          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: p.progressPercent + '%' }"></div>
          </div>
          <div class="p-req">綜合完成率：<span style="color:#4f46e2; font-weight:900;">{{ p.progressPercent.toFixed(1) }}%</span></div>

        </div>
      </div>
    </div>

    <div v-if="viewingImage" class="image-modal-overlay" @click="viewingImage = null">
      
      <!-- 圖片顯示區：加上 @click.stop，點圖片本身不會關閉 -->
      <div class="img-scroll-container">
        <img :src="viewingImage" class="full-size-img" :style="{ transform: `scale(${imgScale})` }" @click.stop />
      </div>

      <!-- 控制列移到底部：同樣加上 @click.stop -->
      <div class="zoom-controls" @click.stop>
        <button class="z-btn" @click="imgScale += 0.4">➕ 放大</button>
        <button class="z-btn" @click="imgScale = Math.max(0.4, imgScale - 0.4)">➖ 縮小</button>
        <button class="z-btn" @click="imgScale = 1">↺ 還原</button>
        <button class="z-btn c-btn" @click="viewingImage = null">✕ 關閉</button>
      </div>

    </div>

  </div>
</template>

<style scoped>
/* 💡 優化：徹底解決手機版「下拉拉動整個螢幕」的干擾 */
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

/* 💡 優化：防止年份按鈕被擠扁 (flex-shrink: 0) */
.year-tabs { display: flex; gap: 8px; margin-bottom: 15px; overflow-x: auto; padding-bottom: 4px; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
.year-tabs::-webkit-scrollbar { display: none; }
.year-btn { flex-shrink: 0; background: rgba(255,255,255,0.05); border: 1px solid #475569; color: #cbd5e1; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 800; cursor: pointer; transition: 0.2s; white-space: nowrap;}
.year-btn.active { background: #10b981; border-color: #10b981; color: white; box-shadow: 0 4px 10px rgba(16,185,129,0.25); }

/* 身份切換按鈕樣式 */
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

/* 💡 優化：防止月份卡片被擠扁 */
.months-scroll-container { display: flex; overflow-x: auto; gap: 12px; padding-bottom: 10px; scroll-behavior: smooth; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
.months-scroll-container::-webkit-scrollbar { height: 6px; }
.months-scroll-container::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }

.month-card { flex-shrink: 0; width: 140px; background: rgba(255,255,255,0.08); border: 1px solid #475569; border-radius: 16px; padding: 12px; }
.m-title { font-size: 15px; font-weight: 900; color: #10b981; margin-bottom: 10px; text-align: center;}
.m-inp-group { display: flex; align-items: center; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 4px 8px;}
.m-inp-group label { font-size: 11px; font-weight: 800; color: #cbd5e1; width: 35px; white-space: nowrap;}

/* 💡 優化：隱藏數字輸入框上下箭頭，畫面更乾淨 */
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

/* 💡 優化：確保數字區塊在小螢幕也能完美分配空間 */
.cr-value-wrap { display: flex; justify-content: space-around; gap: 8px; flex-wrap: wrap; }
.cr-stat { display: flex; flex-direction: column; align-items: center; min-width: 60px;}
.cr-num { font-size: 22px; font-weight: 900; color: #4f46e2; line-height: 1;}
.cr-lbl { font-size: 11px; font-weight: 800; color: #64748b; margin-top: 4px;}

/* 💡 優化：Double 標籤防止破版，允許內部換行 */
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

.image-modal-overlay { 
  position: fixed; 
  top: 0; 
  left: 0; 
  width: 100vw; 
  height: 100vh; 
  background: rgba(0,0,0,0.85); 
  z-index: 99999; 
  display: flex; 
  flex-direction: column;
  overscroll-behavior: none; 
}
.img-scroll-container { 
  flex: 1; 
  width: 100%;
  overflow: auto; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  padding: 20px;
  /* 💡 圖片底部留白加大，確保圖片滑到最底時，唔會被升高咗嘅按鈕遮住 */
  padding-bottom: 180px; 
}
.full-size-img { 
  max-width: 95%; 
  max-height: 85vh; 
  border-radius: 8px; 
  object-fit: contain; 
  transition: transform 0.25s cubic-bezier(0.2, 0, 0.2, 1); 
  transform-origin: center center;
}

.zoom-controls { 
  position: absolute; 
  /* 💡 關鍵修改：大幅度拉高！110px 足夠跨過你 App 嘅底部導覽列同 iPhone 底線 */
  bottom: calc(110px + env(safe-area-inset-bottom)); 
  left: 50%; 
  transform: translateX(-50%); 
  display: flex; 
  flex-wrap: wrap; 
  justify-content: center;
  gap: 10px; 
  background: rgba(30, 41, 59, 0.85); 
  backdrop-filter: blur(10px); 
  padding: 12px 18px; 
  border-radius: 20px; 
  z-index: 100000;
  width: max-content;
  max-width: 90vw;
  box-shadow: 0 10px 25px rgba(0,0,0,0.5);
}
.z-btn { 
  background: white; 
  color: #1e293b; 
  font-size: 14px; 
  font-weight: 900; 
  padding: 10px 14px; 
  border-radius: 12px; 
  border: none; 
  cursor: pointer; 
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
  white-space: nowrap; 
}
.z-btn:active { transform: scale(0.9); }
.c-btn { background: #ef4444; color: white; }
</style>