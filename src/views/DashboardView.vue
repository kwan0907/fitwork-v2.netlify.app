<script setup>
import { ref, computed } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'

import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const store = useMainStore()

const getLocalHKDate = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().split('T')[0]
}

const filterTime = ref('month')
const customStart = ref('')
const customEnd = ref('')
const filterBranch = ref('全部分店')

const showEditModal = ref(false)
const showNewClientsModal = ref(false) 
const showPackageSalesModal = ref(false)
const showFunnelModal = ref(false) 
const showMyGiftModal = ref(false) 
const funnelViewType = ref('booked') 
const editingClient = ref(null)

const getMonthStr = (dateStr) => {
  if (!dateStr || dateStr === '無紀錄') return '';
  const m = String(dateStr).slice(5, 7);
  return `${parseInt(m)}月`;
}
const getDayStr = (dateStr) => {
  if (!dateStr || dateStr === '無紀錄') return '';
  return String(dateStr).slice(8, 10);
}
const getTimeStr = (dateStr) => {
  if (!dateStr || dateStr === '無紀錄') return '';
  return String(dateStr).slice(11, 16);
}

const formatTrialDateDisplay = (dateStr) => {
  if (!dateStr || dateStr === '無紀錄') return '無紀錄';
  const str = String(dateStr).slice(0, 16);
  if (str.length < 16) return dateStr;
  const [d, t] = str.split('T');
  const [y, m, day] = d.split('-');
  return `${parseInt(m)}/${parseInt(day)} ${t}`;
}

const isDateInRange = (dateStr) => {
  if (!dateStr) return false;
  const tDateStr = String(dateStr).slice(0, 10); 
  if (tDateStr.length < 10) return false;

  const [ty, tm, td] = tDateStr.split('-').map(Number);
  const hkToday = getLocalHKDate();
  const [ny, nm, nd] = hkToday.split('-').map(Number);

  if (filterTime.value === 'all') return true;
  if (filterTime.value === 'today') return tDateStr === hkToday;
  if (filterTime.value === 'month') return ty === ny && tm === nm;
  if (filterTime.value === 'half_1') return ty === ny && tm === nm && td >= 1 && td <= 14;
  if (filterTime.value === 'half_2') return ty === ny && tm === nm && td >= 15;
  if (filterTime.value === 'week') {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    now.setDate(now.getDate() - 7);
    const weekAgoStr = now.toISOString().split('T')[0];
    return tDateStr >= weekAgoStr && tDateStr <= hkToday;
  }
  if (filterTime.value === 'custom') {
    if (!customStart.value || !customEnd.value) return true;
    return tDateStr >= customStart.value && tDateStr <= customEnd.value;
  }
  return true;
}

const prospectClients = computed(() => store.clients.filter(c => c?.status === 'prospect'))
const activeClients = computed(() => store.clients.filter(c => c?.status === 'active'))

const branchCounts = computed(() => {
  return {
    kwunTong: activeClients.value.filter(c => c?.branch === '觀塘').length,
    central: activeClients.value.filter(c => c?.branch === '中環').length,
    jordan: activeClients.value.filter(c => c?.branch === '佐敦').length
  }
})

const upcomingTrials = computed(() => {
  const todayYMD = getLocalHKDate();
  return prospectClients.value
    .filter(c => c?.trial_date)
    .filter(c => { 
       const tDateStr = String(c?.trial_date || '').slice(0, 10);
       return tDateStr >= todayYMD; 
    })
    .filter(c => filterBranch.value === '全部分店' ? true : c?.branch === filterBranch.value)
    .sort((a,b) => String(a?.trial_date || '').localeCompare(String(b?.trial_date || '')))
    .slice(0, 5)
})

const financialStats = computed(() => {
  let revenue = 0, cost = 0, profit = 0;
  let shopOwed1 = 0, shopOwed2 = 0, shopPaid = 0; 
  let inventoryCost = 0; 

  store.transactions.filter(t => isDateInRange(t?.created_at)).forEach(t => {
    if (filterBranch.value !== '全部分店' && t?.branch !== filterBranch.value) return;
    const amt = Number(t?.amount) || 0;
    const noteStr = t?.note || '';
    
    const txDate = parseInt(String(t?.created_at || '').slice(8, 10));
    
    if (t?.type === 'income') { 
      revenue += amt; 
      profit += Number(t?.profit ?? amt); 
      
      let owed = 0;
      if (t?.category === '運動套票' || t?.category === '試堂' || t?.category === '運動') {
        if (noteStr.includes('35點') || amt === 2550 || amt === 2452) owed = 800;
        else if (noteStr.includes('10點') || amt === 850 || amt === 752) owed = 250;
        else if (noteStr.includes('體驗卡30人次')) owed = 750;
        else if ((noteStr.includes('試堂') || amt === 98) && !noteStr.includes('贈堂')) owed = 25;
      }
      
      if (txDate <= 14) shopOwed1 += owed;
      else shopOwed2 += owed;
    } 
    else if (t?.type === 'expense') { 
      if (t?.category === '支付30%') {
        cost += amt;
        shopPaid += amt; 
      } else if (t?.category === '自用消耗') {
        inventoryCost += amt; 
      } else {
        cost += amt;
        profit -= amt; 
      }
    }
  })
  
  let p1 = shopOwed1;
  let p2 = shopOwed2;
  let paid = shopPaid;
  
  if (paid >= p1) { paid -= p1; p1 = 0; p2 -= paid; } else { p1 -= paid; }
  
  return { 
      revenue, cost, profit, inventoryCost, 
      shopPending: shopOwed1 + shopOwed2 - shopPaid,
      pending1: p1,
      pending2: p2
  };
})

const clientStats = computed(() => {
  let newClientsList = [];
  const sourceCount = { '廣告': 0, '廣告+朋友介紹': 0, '朋友介紹': 0, '傳單': 0, '朋友': 0, 'IG': 0, '其他': 0 };

  const firstTxnMap = {};
  store.transactions.forEach(t => {
    if (t?.type === 'income' && t?.client_id) {
      if (!firstTxnMap[t.client_id] || t.created_at < firstTxnMap[t.client_id]) {
        firstTxnMap[t.client_id] = String(t.created_at); 
      }
    }
  });

  store.clients.forEach(c => {
    if (c?.status !== 'active') return;

    let isNewByJoinDate = c?.join_date && isDateInRange(c?.join_date);
    let isNewByFirstTxn = false;
    if (firstTxnMap[c?.id]) {
        isNewByFirstTxn = isDateInRange(firstTxnMap[c.id]);
    }

    if (isNewByJoinDate || isNewByFirstTxn) {
        if (filterBranch.value === '全部分店' || c?.branch === filterBranch.value) {
            if (!newClientsList.find(x => x?.id === c?.id)) {
                const displayDate = (isNewByJoinDate && c?.join_date) 
                                  ? c.join_date 
                                  : (firstTxnMap[c?.id] ? firstTxnMap[c.id].slice(0, 10) : '無紀錄');
                
                newClientsList.push({ ...c, display_join_date: displayDate });

                const src = c?.source || '其他';
                if (sourceCount[src] !== undefined) sourceCount[src]++;
                else sourceCount['其他']++;
            }
        }
    }
  })

  newClientsList.sort((a,b) => String(b?.display_join_date || '').localeCompare(String(a?.display_join_date || '')));

  return { total: newClientsList.length, list: newClientsList, sources: sourceCount }
})

const trialFunnelStats = computed(() => {
  let bookedList = [];
  let completedList = [];
  let convertedList = [];
  let notConvertedList = [];

  const todayYMD = getLocalHKDate();
  const firstTxnMap = {};
  store.transactions.forEach(t => {
    if (t?.type === 'income' && t?.client_id) {
      if (!firstTxnMap[t.client_id] || t.created_at < firstTxnMap[t.client_id]) {
        firstTxnMap[t.client_id] = String(t.created_at);
      }
    }
  });

  store.clients.forEach(c => {
    if (filterBranch.value !== '全部分店' && c?.branch !== filterBranch.value) return;

    let hasTrialInDate = c?.trial_date && isDateInRange(c?.trial_date);
    let isDirectConvert = false;
    let displayTrialDate = c?.trial_date;

    if (!hasTrialInDate && c?.status === 'active') {
        let isNewByJoinDate = c?.join_date && isDateInRange(c?.join_date);
        let isNewByFirstTxn = false;
        let firstTxnDateStr = null;
        if (firstTxnMap[c?.id]) {
            firstTxnDateStr = firstTxnMap[c.id].slice(0, 19);
            isNewByFirstTxn = isDateInRange(firstTxnMap[c.id]);
        }

        if (isNewByJoinDate || isNewByFirstTxn) {
            isDirectConvert = true;
            displayTrialDate = isNewByFirstTxn ? firstTxnDateStr : (c?.join_date ? c.join_date + 'T12:00:00' : null);
        }
    }

    if (hasTrialInDate || isDirectConvert) {
      const clientData = { ...c, virtual_trial_date: displayTrialDate, is_direct: isDirectConvert };
      
      bookedList.push(clientData);

      let hasRealTransaction = false;
      store.transactions.forEach(t => {
        if ((t?.category === '運動套票' || t?.category === '運動' || t?.category === '零售收入') && t?.note && c?.name && t.note.includes(c.name)) {
          hasRealTransaction = true;
        }
      });

      if (isDirectConvert || c?.status === 'active' || hasRealTransaction || c?.expiry_date) {
        completedList.push(clientData);
        convertedList.push(clientData);     
      } 
      else {
        const tDateStr = String(c?.trial_date || '').slice(0, 10);
        if (tDateStr <= todayYMD) {
          completedList.push(clientData);
          notConvertedList.push(clientData);
        }
      }
    }
  });

  const sortByTrial = (a, b) => String(b?.virtual_trial_date || '').localeCompare(String(a?.virtual_trial_date || ''));
  bookedList.sort(sortByTrial);
  completedList.sort(sortByTrial);
  convertedList.sort(sortByTrial);
  notConvertedList.sort(sortByTrial);

  const conversionRate = completedList.length > 0 ? ((convertedList.length / completedList.length) * 100).toFixed(1) : "0.0";

  return { 
    totalBooked: bookedList.length, 
    completedTrials: completedList.length, 
    converted: convertedList.length, 
    notConverted: notConvertedList.length, 
    conversionRate,
    bookedList,
    completedList,
    convertedList,
    notConvertedList
  };
})

function openFunnelModal(type) {
  funnelViewType.value = type
  showFunnelModal.value = true
}

const funnelModalData = computed(() => {
  if (funnelViewType.value === 'booked') return { title: '📅 總預約 / 加入名單', list: trialFunnelStats.value.bookedList }
  if (funnelViewType.value === 'completed') return { title: '🏃 已出席名單', list: trialFunnelStats.value.completedList }
  if (funnelViewType.value === 'converted') return { title: '👑 成功開卡名單', list: trialFunnelStats.value.convertedList }
  if (funnelViewType.value === 'notConverted') return { title: '👀 僅預約 (未買) 名單', list: trialFunnelStats.value.notConvertedList }
  return { title: '', list: [] }
})

const packageStats = computed(() => {
  let pkg850 = 0, pkg2550 = 0;
  let list = [];
  
  store.transactions.filter(t => isDateInRange(t?.created_at)).forEach(t => {
    if (filterBranch.value !== '全部分店' && t?.branch !== filterBranch.value) return; 
    if (t?.category === '運動套票' || t?.category === '運動') {
      let isPkg = false;
      let typeStr = '';
      
      if (t.amount === 850 || (t.note && t.note.includes('pkg_10'))) { pkg850++; isPkg = true; typeStr = '10點套票'; }
      if (t.amount === 2550 || t.amount === 2800 || (t.note && t.note.includes('pkg_35'))) { pkg2550++; isPkg = true; typeStr = '35點套票'; }
      
      if (isPkg) {
        let cName = t.client_name;
        if (!cName && t.note) {
           const match = t.note.match(/^【(.*?)】/);
           if (match) cName = match[1];
        }
        
        list.push({
          ...t,
          display_client_name: cName || '未記錄',
          pkg_type: typeStr,
          display_date: String(t.created_at).slice(0, 10)
        });
      }
    }
  })
  
  list.sort((a,b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  
  return { pkg850, pkg2550, total: pkg850 + pkg2550, list }
})

const parseLocal = (dateStr) => {
  if (!dateStr) return new Date(NaN);
  let str = String(dateStr).split('.')[0].replace(' ', 'T');
  str = str.replace(/Z$/i, '').replace(/[+-]\d{2}:\d{2}$/, '');
  return new Date(str); 
}

const getMyGiftStats = (client) => {
  if (!client || !client.name) return { available: 0, closestExpiry: null };
  let earnedTickets = [];
  let consumedCount = 0;
  
  store.transactions.forEach(t => {
    const isMatch = t.client_name === client.name || (t.note && t.note.includes(client.name));
    if (!isMatch) return;

    if (t.category === 'MyGift消耗') {
      consumedCount++;
    } 
    else if ((t.category === '運動套票' || t.category === '運動') && t.type === 'income') {
      let earn = 0;
      if (t.amount === 850 || (t.note && t.note.includes('10點'))) earn = 2;
      if (t.amount === 2550 || t.amount === 2800 || (t.note && t.note.includes('35點'))) earn = 5;
      
      if (earn > 0) {
        const expDate = parseLocal(t.created_at);
        if (!isNaN(expDate)) {
          expDate.setMonth(expDate.getMonth() + 3);
          for(let i=0; i<earn; i++) {
            earnedTickets.push(expDate);
          }
        }
      }
    }
  });
  
  earnedTickets.sort((a, b) => a - b);
  if (consumedCount > 0) earnedTickets.splice(0, consumedCount);
  
  const todayYMD = getLocalHKDate();
  const [ty, tm, td] = todayYMD.split('-').map(Number);
  const todayObj = new Date(ty, tm - 1, td);
  
  const validTickets = earnedTickets.filter(exp => {
    const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
    return expDay >= todayObj;
  });
  
  if (validTickets.length === 0) return { available: 0, closestExpiry: null };
  const closest = validTickets[0];
  const cYMD = `${closest.getFullYear()}-${String(closest.getMonth()+1).padStart(2,'0')}-${String(closest.getDate()).padStart(2,'0')}`;
  return { available: validTickets.length, closestExpiry: cYMD };
}

const clientsWithMyGift = computed(() => {
  let list = [];
  store.clients.forEach(c => {
    if (filterBranch.value !== '全部分店' && c?.branch !== filterBranch.value) return;
    const stats = getMyGiftStats(c);
    if (stats.available > 0) {
      list.push({ ...c, mygift_available: stats.available, mygift_expiry: stats.closestExpiry });
    }
  });
  list.sort((a,b) => String(a.mygift_expiry).localeCompare(String(b.mygift_expiry)));
  return list;
});

const myGiftConsumedTotal = computed(() => {
  let consumed = 0;
  store.transactions.filter(t => isDateInRange(t?.created_at)).forEach(t => {
    if (t?.category === 'MyGift消耗') consumed++;
  });
  return consumed;
});

const marathonRate = computed(() => {
  if (activeClients.value.length === 0) return "0.0"
  const runners = activeClients.value.filter(c => c?.is_marathon).length
  return ((runners / activeClients.value.length) * 100).toFixed(1)
})

const cashSummary = computed(() => {
  const summary = {}
  store.transactions.filter(t => isDateInRange(t?.created_at)).forEach(t => {
    if (!t?.handled_by && !t?.staff) return
    let person = t.handled_by || t.staff
    if (person.toLowerCase() === 'kwan') person = 'kwan'

    if (!summary[person]) summary[person] = { in: 0, out: 0 }
    if (t.type === 'income') summary[person].in += Number(t.amount)
    if (t.type === 'expense') summary[person].out += Number(t.amount)
  })
  return summary
})

const marketingStats = computed(() => {
  let adSpend = 0, inquiries = 0
  store.transactions.filter(t => isDateInRange(t?.created_at)).forEach(t => {
    if(t?.type === 'expense' && t?.category === '廣告費用') { adSpend += Number(t.amount); inquiries += (t.ad_inquiries || 0) }
  })
  const adClients = store.clients.filter(c => c?.source === '廣告')
  return { adSpend, inquiries, adCount: adClients.length, adActive: adClients.filter(c => c?.status === 'active').length }
})

function openTrialEdit(client) {
  editingClient.value = { ...client }
  if (editingClient.value.trial_date) {
    editingClient.value.trial_date = String(editingClient.value.trial_date).slice(0, 16);
  }
  showEditModal.value = true
}

async function updateTrial() {
  let finalTrialDate = editingClient.value.trial_date;
  if (finalTrialDate) {
    finalTrialDate = finalTrialDate.slice(0, 16);
  } else {
    finalTrialDate = null;
  }

  const { error } = await supabase.from('clients').update({
    name: editingClient.value.name, 
    phone: editingClient.value.phone,
    trial_date: finalTrialDate, 
    status: editingClient.value.status,
    branch: editingClient.value.branch 
  }).eq('id', editingClient.value.id)

  if (error) alert('更新失敗: ' + error.message)
  else { 
    alert('✅ 預約資料已更新'); 
    showEditModal.value = false; 
    store.syncAll() 
  }
}

const trendChartData = computed(() => {
  const labels = [], revData = [], profData = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    d.setDate(d.getDate() - i)
    
    const targetStr = d.toISOString().split('T')[0] 
    const [ty, tm, td] = targetStr.split('-')
    labels.push(`${parseInt(tm)}/${parseInt(td)}`)
    
    const dailyTxns = store.transactions.filter(t => {
      const tStr = String(t?.created_at || '').slice(0, 10)
      const isSameDay = tStr === targetStr
      const isBranchMatch = filterBranch.value === '全部分店' || t?.branch === filterBranch.value
      return isSameDay && isBranchMatch
    })

    let dailyRev = 0, dailyProf = 0
    dailyTxns.forEach(t => {
      const amt = Number(t?.amount) || 0
      if (t?.type === 'income') { dailyRev += amt; dailyProf += Number(t.profit ?? amt); } 
      else if (t?.type === 'expense') { 
        if (t.category !== '支付30%' && t.category !== '自用消耗') dailyProf -= amt; 
      }
    })
    revData.push(dailyRev); profData.push(dailyProf)
  }
  return {
    labels,
    datasets: [
      { label: '營業額', borderColor: '#4f46e2', backgroundColor: 'rgba(79, 70, 226, 0.15)', data: revData, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#4f46e2' },
      { label: '利潤', borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)', data: profData, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#10b981' }
    ]
  }
})

const chartOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'top', labels: { usePointStyle: true, font: { weight: 'bold' } } } },
  scales: {
    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { weight: 'bold' } } },
    x: { grid: { display: false }, ticks: { font: { weight: 'bold', color: '#64748b' } } }
  },
  interaction: { mode: 'nearest', axis: 'x', intersect: false }
}
</script>

<template>
  <div class="page" style="padding-bottom: 150px;">
    <div class="d-header">
      <h2 class="title">數據中心 2.0</h2>
      <div class="filters">
        <select v-model="filterTime" class="f-sel">
          <option value="today">今日</option>
          <option value="week">本週</option>
          <option value="month">本月(全月)</option>
          <option value="half_1">本月上半 (1-14日)</option>
          <option value="half_2">本月下半 (15-月底)</option>
          <option value="custom">自訂區間</option>
          <option value="all">全部</option>
        </select>
        <select v-model="filterBranch" class="f-sel">
          <option value="全部分店">全部分店</option><option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option>
        </select>
      </div>
    </div>

    <div v-if="filterTime === 'custom'" class="custom-date-box">
      <input type="date" v-model="customStart" class="d-inp"> <span>至</span> <input type="date" v-model="customEnd" class="d-inp">
    </div>

    <div class="section-title" style="margin-top: 10px;">📅 近期試堂預約 (點擊可修改)</div>
    <div class="card p-list" style="margin-bottom: 20px; border-color: #a5b4fc; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.1);">
      <div v-if="upcomingTrials.length === 0" class="empty">目前無預約資料</div>
      <div v-for="p in upcomingTrials" :key="p.id" class="p-item clickable" @click="openTrialEdit(p)">
        <div class="p-date"><div class="m">{{ getMonthStr(p.trial_date) }}</div><div class="d">{{ getDayStr(p.trial_date) }}</div></div>
        <div class="p-info">
          <div class="name">
            {{ p.name }} <span class="time">{{ getTimeStr(p.trial_date) }}</span>
            <a v-if="p.phone" :href="'https://wa.me/852' + p.phone" target="_blank" class="wts-btn" @click.stop>💬 Wts</a>
          </div>
          <div class="meta">📍 {{ p.branch }} · 📞 {{ p.phone || '無電話' }}</div>
        </div>
      </div>
    </div>

    <div class="chart-wrapper">
      <div class="chart-header">📈 過去 7 天趨勢走勢</div>
      <div class="canvas-container"><Line :data="trendChartData" :options="chartOptions" /></div>
    </div>

    <div class="finance-grid" style="margin-top: 20px; grid-template-columns: 1fr 1fr 1fr;">
      <div class="f-card"><div class="f-val text-green">$ {{ financialStats.revenue.toLocaleString() }}</div><div class="f-label">區間營業額</div></div>
      <div class="f-card"><div class="f-val text-red">$ {{ financialStats.cost.toLocaleString() }}</div><div class="f-label">區間成本支出</div></div>
      <div class="f-card"><div class="f-val" style="color: #f59e0b; font-weight: 900; font-size: 20px;">$ {{ financialStats.inventoryCost.toLocaleString() }}</div><div class="f-label">庫存產品成本</div></div>
    </div>
    
    <div class="profit-box"><div class="p-title">💎 區間實收淨利潤</div><div class="p-val">$ {{ financialStats.profit.toLocaleString() }}</div></div>

    <div class="shop-pending-box" v-if="financialStats.shopPending !== 0">
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="sp-icon">🏠</div>
        <div>
          <div class="sp-title">預計需繳付舖頭 (30%)</div>
          <div class="sp-sub" style="margin-top:6px; line-height:1.4;">
            <div style="display:flex; justify-content:space-between; width:135px;">
              <span>上半月 (1-14):</span> <span style="color:#b45309; font-weight:900;">${{ financialStats.pending1.toLocaleString() }}</span>
            </div>
            <div style="display:flex; justify-content:space-between; width:135px;">
              <span>下半月 (15-底):</span> <span style="color:#b45309; font-weight:900;">${{ financialStats.pending2.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="sp-val" :class="{'text-green': financialStats.shopPending < 0}">
        $ {{ financialStats.shopPending.toLocaleString() }}
      </div>
    </div>

    <div class="section-title" style="margin-top: 25px; color: #4f46e2;">🎯 區間試堂轉化漏斗 (Funnel)</div>
    <div class="card" style="margin-bottom: 20px; padding: 20px; border: 2px solid #eef2ff;">
      <div class="funnel-metrics">
        <div class="fm-item hover-bg" style="cursor: pointer; padding: 10px; border-radius: 12px; transition: 0.2s;" @click="openFunnelModal('booked')">
          <div class="fm-lbl">📅 總預約數 <span style="font-size:10px; background:#eef2ff; color:#4f46e2; padding:2px 4px; border-radius:4px;">🖱️名單</span></div>
          <div class="fm-val">{{ trialFunnelStats.totalBooked }}</div>
        </div>
        <div class="fm-arrow">👉</div>
        
        <div class="fm-item hover-bg" style="cursor: pointer; padding: 10px; border-radius: 12px; transition: 0.2s;" @click="openFunnelModal('completed')">
          <div class="fm-lbl">🏃 已出席試堂 <span style="font-size:10px; background:#eef2ff; color:#4f46e2; padding:2px 4px; border-radius:4px;">🖱️名單</span></div>
          <div class="fm-val text-blue">{{ trialFunnelStats.completedTrials }}</div>
          <div class="fm-sub" @click.stop="openFunnelModal('notConverted')" style="cursor: pointer;">僅試堂(未買): {{ trialFunnelStats.notConverted }} 🖱️</div>
        </div>
        <div class="fm-arrow">👉</div>
        
        <div class="fm-item hover-bg" style="cursor: pointer; padding: 10px; border-radius: 12px; transition: 0.2s;" @click="openFunnelModal('converted')">
          <div class="fm-lbl">👑 成功開卡 <span style="font-size:10px; background:#eef2ff; color:#4f46e2; padding:2px 4px; border-radius:4px;">🖱️名單</span></div>
          <div class="fm-val text-green">{{ trialFunnelStats.converted }}</div>
        </div>
        
        <div class="fm-rate-box">
          <div class="fm-lbl text-white" style="margin-bottom: 2px;">開卡轉換率</div>
          <div class="fm-val text-white" style="font-size: 22px;">{{ trialFunnelStats.conversionRate }}%</div>
        </div>
      </div>
    </div>
    
    <div class="section-title" style="margin-top: 25px;">🌟 區間客戶增長與來源</div>
    <div class="card" style="margin-bottom: 20px; padding: 20px;">
      <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 15px;">
        
        <div @click="showNewClientsModal = true" class="hover-bg" style="cursor: pointer; padding: 10px; border-radius: 12px; margin-left: -10px; border: 1px solid transparent; transition: 0.2s;">
          <div style="font-size: 13px; color: #64748b; font-weight: 800; display: flex; align-items: center; gap: 6px;">
            新增客戶數
            <span style="background: #eef2ff; color: #4f46e2; font-size: 10px; padding: 3px 6px; border-radius: 6px;">🖱️ 點擊查看名單</span>
          </div>
          <div style="font-size: 36px; font-weight: 900; color: #4f46e2; line-height: 1.1; margin-top: 5px;">
            {{ clientStats.total }} <span style="font-size: 14px; color: #64748b;">人</span>
          </div>
        </div>

        <div @click="showPackageSalesModal = true" class="hover-bg" style="cursor: pointer; padding: 10px; border-radius: 12px; margin-right: -10px; border: 1px solid transparent; transition: 0.2s; text-align: right;">
          <div style="font-size: 13px; color: #64748b; font-weight: 800; display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
            <span style="background: #d1fae5; color: #10b981; font-size: 10px; padding: 3px 6px; border-radius: 6px;">🖱️ 點擊查看名單</span>
            售出 / 續卡數
          </div>
          <div style="font-size: 36px; font-weight: 900; color: #10b981; line-height: 1.1; margin-top: 5px;">
            {{ packageStats.total }} <span style="font-size: 14px; color: #64748b;">張</span>
          </div>
        </div>

      </div>

      <div class="divider-dash"></div>
      
      <div style="font-size: 13px; font-weight: 900; color: #1e293b; margin-bottom: 10px;">📊 新客戶來源分析</div>
      <div class="source-grid">
        <div class="src-item"><div class="src-lbl">廣告</div><div class="src-val">{{ clientStats.sources['廣告'] }}</div></div>
        <div class="src-item" style="min-width: 75px;"><div class="src-lbl">廣告+介紹</div><div class="src-val text-p">{{ clientStats.sources['廣告+朋友介紹'] }}</div></div>
        <div class="src-item"><div class="src-lbl">介紹</div><div class="src-val text-p">{{ clientStats.sources['朋友介紹'] }}</div></div>
        <div class="src-item"><div class="src-lbl">傳單</div><div class="src-val">{{ clientStats.sources['傳單'] }}</div></div>
        <div class="src-item"><div class="src-lbl">朋友</div><div class="src-val">{{ clientStats.sources['朋友'] }}</div></div>
        <div class="src-item"><div class="src-lbl">IG</div><div class="src-val">{{ clientStats.sources['IG'] }}</div></div>
        <div class="src-item"><div class="src-lbl">其他</div><div class="src-val">{{ clientStats.sources['其他'] }}</div></div>
      </div>
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
      <div class="m-foot"><span>活躍: {{ activeClients.filter(c=>c?.is_marathon).length }} 人</span><span>正式會員: {{ activeClients.length }} 人</span></div>
    </div>

    <div class="section-title" v-if="Object.keys(cashSummary).length > 0">💰 經手人資金結算</div>
    <div class="grid-2">
      <div v-for="(data, name, index) in cashSummary" :key="name" class="cash-card" :class="'border-'+(index%2)">
        <div class="c-name">{{ name }}</div>
        <div class="c-total">$ {{ (data.in - data.out).toLocaleString() }}</div>
        <div class="c-foot"><span>收: ${{ data.in }}</span><span>支: ${{ data.out }}</span></div>
      </div>
    </div>

    <div class="section-title">📈 廣告、套票與推廣數據</div>
    <div class="grid-2">
      <div class="stat-card"><div class="s-val">{{ marketingStats.adCount }} 人</div><div class="s-label">廣告來源客戶</div><div class="s-sub">成功轉正式: {{ marketingStats.adActive }}</div></div>
      <div class="stat-card"><div class="s-val">{{ packageStats.pkg850 }} / {{ packageStats.pkg2550 }}</div><div class="s-label">套票銷量</div><div class="s-sub">10點 / 35點</div></div>
      
      <div class="stat-card hover-bg" style="grid-column: span 2; border-color: #8b5cf6; background: #faf5ff; cursor: pointer; transition: 0.2s;" @click="showMyGiftModal = true">
        <div class="s-val text-purple">{{ clientsWithMyGift.length }} <span style="font-size: 14px; font-weight: 800;">人</span></div>
        <div class="s-label" style="color: #7c3aed;">🎁 擁有未消耗 MyGift 優惠</div>
        <div class="s-sub" style="color: #8b5cf6;">(區間內共消耗: {{ myGiftConsumedTotal }} 張) 🖱️ 點擊查看名單</div>
      </div>
    </div>

    <div v-if="showMyGiftModal" class="modal-overlay" @click.self="showMyGiftModal = false">
      <div class="edit-modal" style="max-width: 500px; width: 95%;">
        <div class="m-header">🎁 未消耗 MyGift 客戶名單 <button class="close-x" @click="showMyGiftModal=false">✕</button></div>

        <div style="margin-bottom: 15px; font-size: 12px; color: #7c3aed; font-weight: 700; background: #faf5ff; padding: 10px; border-radius: 8px; border-left: 3px solid #8b5cf6;">
          💡 <b>聯絡快過期客戶：</b> 點擊綠色的 WhatsApp 按鈕可以直接跳轉聯絡該客戶！
        </div>

        <div style="max-height: 50vh; overflow-y: auto; padding-right: 5px;">
          <div v-if="clientsWithMyGift.length === 0" style="text-align: center; color: #94a3b8; padding: 20px; font-weight: 800;">
            目前沒有符合條件的客戶
          </div>

          <div v-for="(c, idx) in clientsWithMyGift" :key="c.id" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; padding: 12px 15px; border-radius: 12px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
            <div>
              <div style="font-weight: 900; font-size: 16px; color: #1e293b;">
                {{ idx + 1 }}. {{ c.name }}
                <span style="font-size: 11px; color: #8b5cf6; background: #ede9fe; padding: 2px 6px; border-radius: 6px; margin-left: 6px;">{{ c.branch }}</span>
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                📞 {{ c.phone || '無' }}
                <a v-if="c.phone" :href="'https://wa.me/852' + c.phone" target="_blank" class="wts-btn">💬 WhatsApp</a>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; font-weight: 800; color: #94a3b8;">剩餘 <span style="font-size:14px; color:#ef4444; font-weight:900;">{{ c.mygift_available }}</span> 張</div>
              <div style="font-size: 13px; font-weight: 900; color: #8b5cf6;">至 {{ c.mygift_expiry }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="edit-modal">
        <div class="m-header">✏️ 編輯試堂預約 <button class="close-x" @click="showEditModal=false">✕</button></div>
        <div v-if="editingClient">
          <div class="form-item"><label>客戶姓名</label><input v-model="editingClient.name" class="mod-inp"></div>
          <div class="form-item" style="margin-top:12px;"><label>聯絡電話</label><input v-model="editingClient.phone" class="mod-inp"></div>
          <div class="form-item" style="margin-top:12px;"><label>預約日期與時間</label><input type="datetime-local" v-model="editingClient.trial_date" class="mod-inp"></div>
          <div class="form-item" style="margin-top:12px;">
            <label>📍 預約試堂地點</label>
            <select v-model="editingClient.branch" class="mod-inp"><option value="觀塘">觀塘</option><option value="中環">中環</option><option value="佐敦">佐敦</option></select>
          </div>
          <div class="form-item" style="margin-top:12px;"><label>更改狀態</label>
            <select v-model="editingClient.status" class="mod-inp"><option value="prospect">👀 維持預約狀態</option><option value="active">⭐️ 轉為正式會員</option></select>
          </div>
          <button class="btn-save" @click="updateTrial">確認儲存</button>
        </div>
      </div>
    </div>

    <div v-if="showNewClientsModal" class="modal-overlay" @click.self="showNewClientsModal = false">
      <div class="edit-modal" style="max-width: 500px; width: 95%;">
        <div class="m-header">👥 區間新增客戶名單 <button class="close-x" @click="showNewClientsModal=false">✕</button></div>
        
        <div style="margin-bottom: 15px; font-size: 12px; color: #475569; font-weight: 700; background: #f8fafc; padding: 10px; border-radius: 8px; border-left: 3px solid #4f46e2;">
          💡 <b>系統抓取邏輯：</b> 客戶目前必須是「正式會員」，且其「登記加入日期」或「系統首筆消費日期」落在目前選擇的區間內。
        </div>

        <div style="max-height: 50vh; overflow-y: auto; padding-right: 5px;">
          <div v-if="clientStats.list.length === 0" style="text-align: center; color: #94a3b8; padding: 20px; font-weight: 800;">
            區間內尚無符合條件的新增客戶
          </div>
          
          <div v-for="(c, idx) in clientStats.list" :key="c.id" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; padding: 12px 15px; border-radius: 12px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
            <div>
              <div style="font-weight: 900; font-size: 16px; color: #1e293b;">
                {{ idx + 1 }}. {{ c.name }}
                <span style="font-size: 11px; color: #10b981; background: #d1fae5; padding: 2px 6px; border-radius: 6px; margin-left: 6px;">{{ c.branch }}</span>
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                📞 {{ c.phone || '無' }}
                <a v-if="c.phone" :href="'https://wa.me/852' + c.phone" target="_blank" class="wts-btn-large" @click.stop>💬 WhatsApp</a>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; font-weight: 800; color: #94a3b8;">判定日期</div>
              <div style="font-size: 13px; font-weight: 900; color: #4f46e2;">{{ c.display_join_date }}</div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <div v-if="showPackageSalesModal" class="modal-overlay" @click.self="showPackageSalesModal = false">
      <div class="edit-modal" style="max-width: 500px; width: 95%;">
        <div class="m-header">🎟️ 區間售出 / 續卡名單 <button class="close-x" @click="showPackageSalesModal=false">✕</button></div>

        <div style="margin-bottom: 15px; font-size: 12px; color: #475569; font-weight: 700; background: #f8fafc; padding: 10px; border-radius: 8px; border-left: 3px solid #10b981;">
          💡 <b>系統抓取邏輯：</b> 顯示區間內所有購買「10點套票」與「35點套票」的交易紀錄。
        </div>

        <div style="max-height: 50vh; overflow-y: auto; padding-right: 5px;">
          <div v-if="packageStats.list.length === 0" style="text-align: center; color: #94a3b8; padding: 20px; font-weight: 800;">
            區間內尚無套票售出紀錄
          </div>

          <div v-for="(t, idx) in packageStats.list" :key="t.id" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; padding: 12px 15px; border-radius: 12px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
            <div>
              <div style="font-weight: 900; font-size: 16px; color: #1e293b;">
                {{ idx + 1 }}. {{ t.display_client_name }}
                <span style="font-size: 11px; color: #10b981; background: #d1fae5; padding: 2px 6px; border-radius: 6px; margin-left: 6px;">{{ t.pkg_type }}</span>
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600;">
                📍 分店: {{ t.branch || '無' }} · 收款: {{ t.staff || '無' }}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; font-weight: 800; color: #94a3b8;">購買日期</div>
              <div style="font-size: 13px; font-weight: 900; color: #10b981;">{{ t.display_date }}</div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <div v-if="showFunnelModal" class="modal-overlay" @click.self="showFunnelModal = false">
      <div class="edit-modal" style="max-width: 500px; width: 95%;">
        <div class="m-header">{{ funnelModalData.title }} <button class="close-x" @click="showFunnelModal=false">✕</button></div>

        <div style="max-height: 50vh; overflow-y: auto; padding-right: 5px;">
          <div v-if="funnelModalData.list.length === 0" style="text-align: center; color: #94a3b8; padding: 20px; font-weight: 800;">
            區間內尚無符合條件的紀錄
          </div>

          <div v-for="(c, idx) in funnelModalData.list" :key="c.id" style="display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; padding: 12px 15px; border-radius: 12px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
            <div>
              <div style="font-weight: 900; font-size: 16px; color: #1e293b;">
                {{ idx + 1 }}. {{ c.name }}
                <span v-if="c.is_direct" style="font-size: 10px; color: #fff; background: #ef4444; padding: 2px 6px; border-radius: 6px; margin-left: 6px; font-weight: 900;">⚡️ 直接購買</span>
                <span style="font-size: 11px; color: #10b981; background: #d1fae5; padding: 2px 6px; border-radius: 6px; margin-left: 6px;">{{ c.branch }}</span>
              </div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600;">
                📞 {{ c.phone || '無電話' }} · 狀態: {{ c.status === 'active' ? '⭐️ 正式' : '👀 預約' }}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; font-weight: 800; color: #94a3b8;">{{ c.is_direct ? '判定加入' : '預約日期' }}</div>
              <div style="font-size: 13px; font-weight: 900; color: #4f46e2;">
                {{ c.is_direct ? '免預約' : formatTrialDateDisplay(c.virtual_trial_date) }}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.d-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.title { font-weight: 900; font-size: 24px; color: #1e293b; }
.filters { display: flex; gap: 8px; }
.f-sel { border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 8px; font-weight: 700; background: white; outline: none; }
.custom-date-box { background: #eef2ff; padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border: 1px solid #c7d2fe; font-weight: 800; color: #4f46e2; }
.d-inp { border: 1px solid #cbd5e1; padding: 5px; border-radius: 6px; outline: none; font-size: 16px;}
.chart-wrapper { background: white; padding: 20px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; margin-bottom: 20px; margin-top: 10px; }
.chart-header { font-weight: 900; color: #1e293b; font-size: 15px; margin-bottom: 15px; display: flex; align-items: center; }
.canvas-container { position: relative; height: 220px; width: 100%; }
.section-title { font-size: 14px; font-weight: 900; color: #475569; margin: 25px 0 10px; }
.card { background: white; border-radius: 20px; padding: 15px; border: 1px solid #e2e8f0; }
.funnel-metrics { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
.fm-item { text-align: center; flex: 1; }
.fm-lbl { font-size: 12px; font-weight: 800; color: #64748b; margin-bottom: 5px; }
.fm-val { font-size: 26px; font-weight: 900; color: #1e293b; line-height: 1; }
.fm-sub { font-size: 11px; font-weight: 800; color: #f59e0b; margin-top: 6px; background: #fffbeb; padding: 3px 6px; border-radius: 6px; display: inline-block;}
.fm-arrow { font-size: 20px; color: #cbd5e1; }
.fm-rate-box { background: linear-gradient(135deg, #10b981, #059669); padding: 15px; border-radius: 16px; text-align: center; min-width: 90px; box-shadow: 0 10px 20px rgba(16, 185, 129, 0.2);}
.text-blue { color: #3b82f6; }
.text-green { color: #10b981; }
.text-white { color: white; }
.text-purple { color: #8b5cf6; }
.wts-btn { background: #25D366; color: white; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; text-decoration: none; box-shadow: 0 2px 5px rgba(37, 211, 102, 0.3); transition: 0.2s; }
.wts-btn:active { transform: scale(0.95); }

@media (max-width: 600px) {
  .funnel-metrics { flex-direction: row; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 10px; gap: 8px; justify-content: flex-start; }
  .funnel-metrics::-webkit-scrollbar { height: 4px; }
  .funnel-metrics::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
  .fm-item { flex: 0 0 auto; min-width: 75px; }
  .fm-lbl { font-size: 11px; margin-bottom: 2px; }
  .fm-val { font-size: 20px; }
  .fm-sub { font-size: 10px; padding: 2px 4px; }
  .fm-arrow { transform: none; font-size: 14px; }
  .fm-rate-box { width: auto; min-width: 85px; padding: 10px; margin-top: 0; flex: 0 0 auto;}
  .fm-rate-box .fm-val { font-size: 18px !important; }
}

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
.hover-bg:hover { background-color: #f1f5f9 !important; border-color: #e2e8f0 !important; }
.source-grid { display: flex; overflow-x: auto; gap: 8px; padding-bottom: 5px; }
.source-grid::-webkit-scrollbar { height: 4px; }
.source-grid::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
.src-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 5px; text-align: center; flex: 1; min-width: 50px; }
.src-lbl { font-size: 11px; color: #64748b; font-weight: 800; margin-bottom: 4px; white-space: nowrap; }
.src-val { font-size: 18px; font-weight: 900; color: #1e293b; }
.text-p { color: #4f46e2; }
.divider-dash { border-bottom: 1px dashed #cbd5e1; margin: 15px 0; }
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
.finance-grid { display: grid; gap: 12px; margin-bottom: 15px; }
.f-card { background: white; padding: 20px; border-radius: 16px; text-align: center; border: 1px solid #e2e8f0; }
.f-val { font-size: 20px; font-weight: 900; margin-bottom: 5px; }
.f-label { font-size: 12px; color: #64748b; font-weight: 700; }
.profit-box { background: #eef2ff; border: 1.5px solid #6366f1; padding: 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.p-title { font-size: 15px; font-weight: 800; color: #4f46e2; display: flex; align-items: center; gap: 8px; }
.p-val { font-size: 24px; font-weight: 900; color: #4f46e2; }
.shop-pending-box { background: #fffbeb; border: 1.5px solid #fcd34d; padding: 15px 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.sp-icon { font-size: 26px; }
.sp-title { font-size: 14px; font-weight: 900; color: #b45309; }
.sp-sub { font-size: 11px; font-weight: 700; color: #d97706; margin-top: 2px; }
.sp-val { font-size: 24px; font-weight: 900; color: #b45309; }

/* 修改 Modal 讓手機可以順滑滾動 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: flex-start; justify-content: center; padding-top: 5vh; padding-bottom: 5vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.edit-modal { background: white; width: 90%; max-width: 480px; border-radius: 24px; padding: 25px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); margin: auto; position: relative; max-height: 85vh; overflow-y: auto; overscroll-behavior: contain; }
/* WhatsApp 綠色按鈕樣式 */
.wts-btn { background: #25D366; color: white; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; text-decoration: none; margin-left: 8px; box-shadow: 0 2px 4px rgba(37,211,102,0.2); }
.wts-btn-large { background: #25D366; color: white; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800; text-decoration: none; box-shadow: 0 4px 10px rgba(37,211,102,0.2); }

@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.m-header { font-weight: 900; font-size: 18px; margin-bottom: 20px; display: flex; justify-content: space-between; color: #1e293b; }
.close-x { background: #f1f5f9; border-radius: 50%; width: 30px; height: 30px; border: none; font-size: 14px; font-weight: 900; color: #475569; cursor: pointer; display: flex; justify-content: center; align-items: center; }
.form-item label { display: block; font-size: 13px; font-weight: 800; color: #475569; margin-bottom: 6px; }
.mod-inp { width: 100%; border: 1px solid #cbd5e1; padding: 12px; border-radius: 10px; font-weight: 700; outline: none; color: #1e293b; font-size: 16px; appearance: none;}
.mod-inp:focus { border-color: #4f46e2; }
.btn-save { margin-top: 25px; width: 100%; padding: 16px; background: #4f46e2; color: white; border: none; border-radius: 12px; font-weight: 900; font-size: 16px; cursor: pointer; transition: 0.2s;}
.btn-save:active { transform: scale(0.96); }
</style>