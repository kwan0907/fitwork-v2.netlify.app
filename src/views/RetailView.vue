<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BaseModal from '../components/BaseModal.vue'

const store = useMainStore()

const searchClient = ref('')
const selectedClient = ref(null)
const selectedBranch = ref('觀塘店')
const selectedTier = ref('無折扣')
const showDropdown = ref(false)

const checkoutDate = ref(new Date().toISOString().split('T')[0])

// 🚀 刪除確定 Modal 狀態
const showDeleteConfirm = ref(false)
const itemToDelete = ref(null)

const tierMapping = {
  '無折扣': 'price_standard',
  '銅級(88折)': 'price_bronze',
  '銀級(75折)': 'price_silver',
  '金級(65折)': 'price_gold',
  '直接58折': 'price_58',
  '直接半折': 'price_50',
  '領班(半折)': 'price_50' 
}

const searchProduct = ref('')
const categories = ['全部', '馬拉松套裝', '內在營養', '外在保養']
const selectedCategory = ref('全部')
const cart = ref([])
const showCheckoutModal = ref(false)

// ==========================================
// 🏃 馬拉松套裝快選設定
// ==========================================
const showComboModal = ref(false)
const selectedCombo = ref(null)
const comboShakeFlavor = ref('雲呢拿')
const comboAloeFlavor = ref('原味')

const shakeFlavors = ['雲呢拿', '野草莓', '朱古力', '曲奇妙趣', '薄荷朱古力', '鮮奶咖啡', '紅豆薏仁']
const aloeFlavors = ['原味', '柑橘味', '葡萄味']

const marathonCombos = [
  {
    id: 'combo_m1', name: '慢跑計劃', fixedPrice: 1369, fixedProfit: 553.5,
    needsShake: true, needsAloe: false,
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 1 },
      { name: '佳能蛋白質粉', qty: 1 },
      { name: '即溶草本飲品50克-桃味', qty: 1 }
    ]
  },
  {
    id: 'combo_m2', name: '快跑計劃', fixedPrice: 2177, fixedProfit: 929,
    needsShake: true, needsAloe: true,
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 1 },
      { name: '佳能蛋白質粉', qty: 1 },
      { name: '即溶草本飲品50克-桃味', qty: 1 },
      { name: 'BC30 益生菌', qty: 1 },
      { name: '濃縮蘆薈汁', isAloe: true, qty: 1 }
    ]
  },
  {
    id: 'combo_m3', name: '運動vip計劃', fixedPrice: 6996, fixedProfit: 2338,
    needsShake: true, needsAloe: true,
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 5 },
      { name: '佳能蛋白質粉', qty: 5 },
      { name: '即溶草本飲品50克-桃味', qty: 1 },
      { name: 'BC30 益生菌', qty: 1 },
      { name: '濃縮蘆薈汁', isAloe: true, qty: 1 },
      { name: '消脂片', qty: 1 },
      { name: '抗脂片', qty: 1 }
    ]
  },
  {
    id: 'combo_m4', name: '運動vVip計劃', fixedPrice: 9998, fixedProfit: 3188,
    needsShake: true, needsAloe: true,
    subItems: [
      { name: '營養蛋白素', isShake: true, qty: 5 },
      { name: '佳能蛋白質粉', qty: 5 },
      { name: '即溶草本飲品50克-桃味', qty: 1 },
      { name: 'BC30 益生菌', qty: 1 },
      { name: '濃縮蘆薈汁', isAloe: true, qty: 1 },
      { name: '消脂片', qty: 1 },
      { name: '抗脂片', qty: 1 },
      { name: '夜寧新營養飲品', qty: 1 },
      { name: '莓之寶', qty: 1 },
      { name: '營養纖維粉(蘋果味)', qty: 1 },
      { name: '膠原蛋白美肌飲料', qty: 1 },
      { name: '深海魚油', qty: 1 } 
    ]
  }
]

function openCombo(c) {
  selectedCombo.value = c
  comboShakeFlavor.value = shakeFlavors[0]
  comboAloeFlavor.value = aloeFlavors[0]
  showComboModal.value = true
}

function addComboToCart() {
  const c = selectedCombo.value
  const uniqueId = `${c.id}_${c.needsShake ? comboShakeFlavor.value : 'none'}_${c.needsAloe ? comboAloeFlavor.value : 'none'}`
  
  const existing = cart.value.find(item => item.id === uniqueId)

  if (existing) {
    existing.qty++
  } else {
    cart.value.push({
      isCombo: true,
      id: uniqueId,
      name: c.name,
      fixedPrice: c.fixedPrice,
      fixedProfit: c.fixedProfit,
      shakeFlavor: c.needsShake ? comboShakeFlavor.value : null,
      aloeFlavor: c.needsAloe ? comboAloeFlavor.value : null,
      subItems: c.subItems,
      qty: 1
    })
  }
  showComboModal.value = false
}
// ==========================================

// 🚀 核心邏輯：自動載入歷史訂單 與 🟢 快捷選單帶入客戶
onMounted(() => {
  if (store.quickActionClient) {
    const targetName = store.quickActionClient
    store.quickActionClient = null 
    const foundClient = store.clients.find(c => c.name === targetName)
    if (foundClient) selectClient(foundClient) 
    else searchClient.value = targetName 
  }

  if (store.pendingRepeatOrder) {
    const data = store.pendingRepeatOrder
    const client = store.clients.find(c => c.name === data.clientName)
    if (client) selectClient(client)
    if (data.branch) selectedBranch.value = data.branch.includes('店') ? data.branch : data.branch + '店'

    data.items.forEach(item => {
      let flavor = ''
      let baseName = item.name
      if (item.name.includes('-')) {
        const parts = item.name.split('-')
        baseName = parts[0].trim()
        flavor = parts.slice(1).join('-').trim()
      }
      
      const product = store.products.find(p => p.name === baseName)
      if (product) {
        cart.value.push({
           ...product, 
           qty: item.qty,
           selectedFlavor: flavor || (product.flavors ? product.flavors[0] : ''),
           isCombo: false
        })
      }
    })

    store.pendingRepeatOrder = null
    if (cart.value.length > 0) showCheckoutModal.value = true
  }
})

// 🟢 支援套裝的價格計算
const cartWithPrices = computed(() => {
  const priceCol = tierMapping[selectedTier.value]
  return cart.value.map(item => {
    if (item.isCombo) return { ...item, active_price: item.fixedPrice }
    const finalPrice = Number(item[priceCol]) || Number(item.retail_price) || 0
    return { ...item, active_price: finalPrice }
  })
})

const payees = computed(() => store.settings?.payees || ['kwan', 'Cat'])

const clientOptions = computed(() => {
  const q = searchClient.value.toLowerCase()
  if (!q) return []
  return store.clients.filter(c => (c.name?.toLowerCase().includes(q) || c.phone?.includes(q))).slice(0, 5)
})

function selectClient(c) {
  selectedClient.value = c
  searchClient.value = c.name
  showDropdown.value = false
  if(c.vip_tier && tierMapping[c.vip_tier]) selectedTier.value = c.vip_tier
  else if (c.vip_tier === '銀級') selectedTier.value = '銀級(75折)'
  else selectedTier.value = '無折扣'
}

const sortedProducts = computed(() => {
  return [...store.products].sort((a, b) => {
    const getW = (p) => {
      const n = (p.name || '').toLowerCase()
      if (n.includes('shake') || n.includes('蛋白素')) return 1
      if (n.includes('佳能')) return 2
      if (n.includes('蘆薈汁')) return 3
      if (n.includes('茶')) return 4
      return 999 
    }
    return getW(a) - getW(b) || (a.name || '').localeCompare(b.name || '')
  })
})

const displayProducts = computed(() => {
  // 🟢 如果選了「馬拉松套裝」，下方就不顯示一般商品
  if (selectedCategory.value === '馬拉松套裝') return []

  let list = sortedProducts.value.map(p => {
    const branchKey = selectedBranch.value.replace('店', '')
    const stockKey = `${p.name}_${branchKey}`
    const currentQty = store.stock[stockKey] || 0
    const currentPriceCol = tierMapping[selectedTier.value]
    const finalPrice = Number(p[currentPriceCol]) || Number(p.retail_price) || 0
    
    return { ...p, current_stock: currentQty, active_price: finalPrice }
  })
  
  // 🟢 智能分類判斷：如果資料庫沒有 category 欄位，自動利用關鍵字分辨外在保養品
  const isOuter = (n) => {
     const name = n || '';
     return ['洗面', '爽膚水', '霜', '眼膠', '精華', '角質', '面膜', '沐浴', '潤膚', '髮', '護膚'].some(k => name.includes(k));
  }

  if (selectedCategory.value === '內在營養') {
    list = list.filter(p => (p.category && p.category.includes('內')) || (!p.category && !isOuter(p.name)))
  } else if (selectedCategory.value === '外在保養') {
    list = list.filter(p => (p.category && p.category.includes('外')) || (!p.category && isOuter(p.name)))
  }

  if (searchProduct.value) {
    const q = searchProduct.value.toLowerCase()
    list = list.filter(p => (p.name?.toLowerCase().includes(q)) || (p.name_en?.toLowerCase().includes(q)) || (p.id?.toLowerCase().includes(q)))
  }
  
  return list
})

const addToCart = (product) => {
  const flavor = product.flavors ? product.flavors[0] : ''
  const existing = cart.value.find(item => !item.isCombo && item.id === product.id && item.selectedFlavor === flavor)
  if (existing) existing.qty++ 
  else cart.value.push({ ...product, qty: 1, selectedFlavor: flavor, isCombo: false })
}

const decreaseQty = (item) => {
  const found = cart.value.find(i => i.id === item.id && (item.isCombo ? i.id === item.id : i.selectedFlavor === item.selectedFlavor))
  if (!found) return
  if (found.qty > 1) found.qty--
  else confirmDelete(item)
}

function updateFlavor(item, index, event) {
  const newFlavor = event.target.value
  const existingIndex = cart.value.findIndex((c, i) => i !== index && !c.isCombo && c.id === item.id && c.selectedFlavor === newFlavor)
  if (existingIndex !== -1) {
    cart.value[existingIndex].qty += item.qty
    cart.value.splice(index, 1)
  } else {
    item.selectedFlavor = newFlavor
  }
}

function confirmDelete(item) {
  itemToDelete.value = item
  showDeleteConfirm.value = true
}

function executeDelete() {
  cart.value = cart.value.filter(i => {
    if (i.isCombo) return i.id !== itemToDelete.value.id
    return !(i.id === itemToDelete.value.id && i.selectedFlavor === itemToDelete.value.selectedFlavor)
  })
  showDeleteConfirm.value = false
  itemToDelete.value = null
  if (cart.value.length === 0) showCheckoutModal.value = false
}

// 🟢 支援套裝的利潤計算
const totalItems = computed(() => cart.value.reduce((s, i) => s + i.qty, 0))
const totalRevenue = computed(() => cartWithPrices.value.reduce((sum, item) => sum + (item.active_price * item.qty), 0))
const totalCost = computed(() => cart.value.reduce((sum, item) => {
  if (item.isCombo) return sum + ((item.fixedPrice - item.fixedProfit) * item.qty)
  return sum + ((Number(item.price_50) || 0) * item.qty)
}, 0))
const netProfit = computed(() => totalRevenue.value - totalCost.value)

async function finalizeCheckout(payeeName) {
  if (!selectedClient.value && !searchClient.value) return alert('請在上方先選擇紀錄對象！')
  
  // 🟢 智能轉換購物車文字
  const itemsStr = cart.value.map(i => {
    if (i.isCombo) {
      let f = []
      if (i.shakeFlavor) f.push(`Shake:${i.shakeFlavor}`)
      if (i.aloeFlavor) f.push(`蘆薈:${i.aloeFlavor}`)
      const fStr = f.length > 0 ? ` (${f.join(', ')})` : ''
      return `${i.name}${fStr} x${i.qty}`
    }
    const flavorText = i.selectedFlavor ? `-${i.selectedFlavor}` : ''
    return `${i.name}${flavorText} x${i.qty}`
  }).join(', ')

  const branchKey = selectedBranch.value.replace('店','')
  const clientNameStr = selectedClient.value ? selectedClient.value.name : searchClient.value

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  const [yyyy, mm, dd] = checkoutDate.value.split('-')
  const now = new Date()
  const txnDate = new Date(yyyy, mm - 1, dd, now.getHours(), now.getMinutes(), now.getSeconds())
  const fullIsoCreatedAt = txnDate.toISOString()

  // 1. 寫入流水帳
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', category: '零售收入', amount: totalRevenue.value, profit: netProfit.value, cost: totalCost.value,
    branch: branchKey, client_id: selectedClient.value?.id || null, client_name: clientNameStr, 
    handled_by: payeeName, staff: payeeName, created_at: fullIsoCreatedAt,
    own_email: user.email, note: `${clientNameStr} (${itemsStr})`
  }])

  if (txnError) return alert('結帳失敗: ' + txnError.message)

  // 2. 🟢 精準扣庫存
  let stockDeductions = []
  cart.value.forEach(item => {
    if (item.isCombo) {
      item.subItems.forEach(sub => {
        let sName = sub.name;
        if (sub.isShake) sName = `${sName}-${item.shakeFlavor}`
        if (sub.isAloe) sName = `${sName}-${item.aloeFlavor}`
        
        const existing = stockDeductions.find(x => x.name === sName)
        if (existing) existing.qty += sub.qty * item.qty
        else stockDeductions.push({ name: sName, qty: sub.qty * item.qty })
      })
    } else {
      const sName = item.selectedFlavor ? `${item.name}-${item.selectedFlavor}` : item.name
      const existing = stockDeductions.find(x => x.name === sName)
      if (existing) existing.qty += item.qty
      else stockDeductions.push({ name: sName, qty: item.qty })
    }
  })

  // 3. 執行庫存扣除
  let stockUpdateFailed = false;
  for (const d of stockDeductions) {
    const { data: stockData, error: selectError } = await supabase.from('stock')
      .select('quantity').eq('prod_name', d.name).eq('branch', branchKey).eq('user_id', user.id).maybeSingle()
      
    if (selectError) {
      stockUpdateFailed = true; continue;
    }

    const currentDbQty = stockData ? stockData.quantity : 0;
    const newQty = currentDbQty - d.qty;

    if (stockData) {
      const { error: updateError } = await supabase.from('stock')
        .update({ quantity: newQty, own_email: user.email })
        .eq('prod_name', d.name).eq('branch', branchKey).eq('user_id', user.id)
      if (updateError) stockUpdateFailed = true;
    } else {
      const { error: insertError } = await supabase.from('stock')
        .insert({ prod_name: d.name, branch: branchKey, quantity: newQty, user_id: user.id, own_email: user.email })
      if (insertError) stockUpdateFailed = true;
    }
  }

  if (stockUpdateFailed) {
      alert(`⚠️ 結帳成功，但部分私人庫存扣減失敗！請手動至「庫存管理」確認。\n(可能是因為部分組合品項您尚未建立庫存紀錄)\n日期: ${checkoutDate.value}\n收現金 $${totalRevenue.value}`)
  } else {
      alert(`✅ 結帳成功！(您的私人庫存及套裝內含物已自動扣除)\n日期: ${checkoutDate.value}\n由 ${payeeName} 收取實收現金 $${totalRevenue.value}`)
  }
  
  cart.value = []; selectedClient.value = null; searchClient.value = ''; showCheckoutModal.value = false; 
  await store.syncAll() 
}
</script>

<template>
  <div class="page" style="padding-bottom: 180px;">
    <h2 class="page-title">零售商品收銀</h2>

    <div class="glass-card top-card">
      <div class="form-item">
        <label>1. 搜尋紀錄對象 <span style="color:#ef4444">*</span></label>
        <div style="position:relative;">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="showDropdown = true" @input="showDropdown = true">
          <div v-if="showDropdown && clientOptions.length > 0" class="drop-menu">
            <div style="padding:8px; text-align:center; font-size:12px; color:#ef4444; border-bottom:1px solid #eee; cursor:pointer;" @click="showDropdown = false">✕ 關閉</div>
            <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
              {{ c.name }} <span class="tier-tag">{{ c.vip_tier || '普通' }}</span>
            </div>
          </div>
        </div>
        <div v-if="selectedClient" class="selected-badge">✔ 已選擇: {{ selectedClient.name }}</div>
      </div>
      
      <div class="grid-2" style="margin-top:15px;">
        <div class="form-item"><label>2. 庫存分店</label>
          <select v-model="selectedBranch" class="modern-select"><option value="觀塘店">觀塘店</option><option value="中環店">中環店</option><option value="佐敦店">佐敦店</option></select>
        </div>
        <div class="form-item"><label>3. 客戶折扣</label>
          <select v-model="selectedTier" class="modern-select highlight-sel">
            <option v-for="(col, key) in tierMapping" :key="key" :value="key">{{ key }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="search-box"><span class="s-icon">🔍</span><input v-model="searchProduct" placeholder="支援中/英文搜尋..." class="s-inp"></div>
      <div class="tags-row" style="margin-top:15px;">
        <button v-for="cat in categories" :key="cat" class="cat-btn" :class="{active: selectedCategory === cat}" @click="selectedCategory = cat">{{ cat }}</button>
      </div>
    </div>

    <div v-if="selectedCategory === '馬拉松套裝'" class="combo-grid" style="margin-bottom: 20px;">
       <div v-for="c in marathonCombos" :key="c.id" class="combo-card" @click="openCombo(c)">
          <div class="c-name">{{ c.name }}</div>
          <div class="c-price">${{ c.fixedPrice }}</div>
          <div class="c-profit">利潤: ${{ c.fixedProfit }}</div>
       </div>
    </div>

    <div v-for="p in displayProducts" :key="p.id" class="p-card" @click="addToCart(p)">
      <div class="p-info"><div class="p-title">{{ p.name }}</div><div class="p-qty">庫存剩餘: <span style="font-weight:900;" :style="{color: p.current_stock < 5 ? '#ef4444' : '#10b981'}">{{ p.current_stock }}</span> 件</div></div>
      <div class="p-price-box"><div class="new-p">$ {{ p.active_price }}</div></div>
      <div class="btn-gorgeous">+</div>
    </div>

    <div v-if="cart.length > 0" class="float-bar" @click="showCheckoutModal = true">
      <div class="badge-num">{{ totalItems }}</div>
      <div style="flex:1; margin-left:15px; font-weight:800; color:white;">件商品</div>
      <div class="float-total">$ {{ totalRevenue }}</div>
      <div class="float-btn">結帳 ➔</div>
    </div>

    <BaseModal :show="showComboModal" title="挑選套裝口味" @close="showComboModal = false">
        <div v-if="selectedCombo">
          <h3 style="margin-bottom: 5px; color: #1e293b; font-weight: 900;">{{ selectedCombo.name }}</h3>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 20px; line-height: 1.5; font-weight: 700;">
             📦 包含：{{ selectedCombo.subItems.map(i => i.name + ' x' + i.qty).join(', ') }}
          </p>
          <div v-if="selectedCombo.needsShake" class="form-item">
            <label>🥤 選擇 Shake 味道</label>
            <select class="modern-select highlight-sel" v-model="comboShakeFlavor">
              <option v-for="f in shakeFlavors" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>
          <div v-if="selectedCombo.needsAloe" class="form-item" style="margin-top: 15px;">
            <label>💧 選擇 蘆薈汁 味道</label>
            <select class="modern-select highlight-sel" v-model="comboAloeFlavor">
              <option v-for="f in aloeFlavors" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>
          <button class="payee-btn style-0" style="width: 100%; margin-top: 25px; padding: 15px; border-radius: 12px;" @click="addComboToCart">➕ 加入購物車</button>
        </div>
    </BaseModal>

    <BaseModal :show="showCheckoutModal" title="結帳確認" @close="showCheckoutModal = false">
        <div class="summary-box" style="margin-bottom: 20px; border-color: #4f46e2; background: #f5f3ff;">
          <div class="s-row">
            <span style="color:#4f46e2; font-weight:800;">📅 購買日期</span>
            <input type="date" v-model="checkoutDate" class="modern-select" style="width: 150px; padding: 5px 10px; background: white; border: 2px solid #4f46e2;">
          </div>
        </div>

        <div class="cart-header-row">
          <span class="cart-header-title">🛍️ 已選商品（{{ totalItems }} 件）</span>
          <button class="clear-all-btn" @click="cart = []">🗑️ 清空</button>
        </div>

        <div class="cart-items">
          <div v-for="(item, index) in cartWithPrices" :key="index" class="c-item">
            <button class="c-delete" @click="confirmDelete(item)">✕</button>
            <div style="flex:1;">
              <div class="c-name">
                {{ item.name }}
                <span v-if="item.isCombo && item.shakeFlavor" class="flavor-tag">Shake: {{ item.shakeFlavor }}</span>
                <span v-if="item.isCombo && item.aloeFlavor" class="flavor-tag">蘆薈: {{ item.aloeFlavor }}</span>
              </div>
              <div class="c-sub" v-if="!item.isCombo && item.flavors">
                 <select :value="item.selectedFlavor" @change="updateFlavor(item, index, $event)" class="modern-select" style="padding: 4px; font-size: 11px; margin-top: 5px;">
                   <option v-for="f in item.flavors" :key="f" :value="f">{{ f }}</option>
                 </select>
              </div>
            </div>
            <div class="c-price">$ {{ item.active_price * item.qty }}</div>
            <div class="qty-control">
              <button @click="decreaseQty(item)">−</button>
              <span>{{ item.qty }}</span>
              <button @click="item.isCombo ? item.qty++ : addToCart(item)">＋</button>
            </div>
          </div>
        </div>

        <div class="summary-box">
          <div class="s-row"><span style="color:#1e293b; font-weight:800;">總營業額</span> <span style="font-weight:900; font-size:18px;">$ {{ totalRevenue }}</span></div>
          <div class="s-row"><span style="color:#ef4444; font-weight:800;">總產品成本 (預估)</span> <span style="color:#ef4444; font-weight:900;">- $ {{ Math.round(totalCost) }}</span></div>
          <div class="divider-dash"></div>
          <div class="s-row" style="margin-top:10px;"><span style="color:#4f46e2; font-weight:900; font-size:16px;">🚀 實收淨利潤</span> <span style="color:#4f46e2; font-weight:900; font-size:26px;">$ {{ Math.round(netProfit) }}</span></div>
        </div>

        <div class="confirm-section">
          <p class="confirm-label">💳 選擇收款人完成結帳</p>
          <div class="payee-buttons">
            <button v-for="(payee, index) in payees" :key="payee" class="payee-btn" :class="'style-' + (index % 2)" @click="finalizeCheckout(payee)">
              ✅ {{ payee }} 收款
            </button>
          </div>
          <button class="btn-back" @click="showCheckoutModal = false">← 返回繼續選購</button>
        </div>
    </BaseModal>

    <div v-if="showDeleteConfirm" class="modal-overlay" style="z-index: 1000;" @click.self="showDeleteConfirm = false">
      <div class="confirm-modal">
        <div class="cm-icon">⚠️</div>
        <div class="cm-title">確定移除產品？</div>
        <div class="cm-text">您正要從購物車中移除<br><b>{{ itemToDelete?.name }}</b></div>
        <div class="cm-actions">
          <button class="cm-btn cm-cancel" @click="showDeleteConfirm = false">取消</button>
          <button class="cm-btn cm-ok" @click="executeDelete">確定移除</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.page { padding: 20px; background: #f8fafc; min-height: 100vh; }
.page-title { font-weight: 900; font-size: 24px; margin-bottom: 20px; color: #1e293b; }
.glass-card { background: white; padding: 20px; border-radius: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.top-card { box-shadow: 0 8px 25px rgba(0,0,0,0.03); }
.form-item label { display: block; margin-bottom: 8px; font-weight: 800; font-size: 13px; color: #1e293b; }
.modern-inp, .modern-select { width: 100%; border: 1px solid #cbd5e1; padding: 12px; border-radius: 10px; font-weight: 700; color: #1e293b; outline: none; background: #f8fafc;}
.modern-inp:focus { border-color: #4f46e2; background: white;}
.highlight-sel { border: 2px solid #4f46e2; color: #4f46e2; font-weight: 900; background: #eef2ff; }

.search-rel { position: relative; }
.drop-menu { position: absolute; top: 100%; left: 0; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 12px; z-index: 100; box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; }
.drop-item { padding: 14px 15px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-weight: 700; color: #333; }
.drop-item:hover { background: #f8fafc; }
.tier-tag { font-size: 10px; background: #eef2ff; color: #4f46e2; padding: 2px 6px; border-radius: 4px; float: right; }
.selected-badge { background: #eef2ff; color: #4f46e2; padding: 10px 14px; border-radius: 10px; margin-top: 12px; font-weight: 800; font-size: 14px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* 🟢 馬拉松套裝樣式 */
.combo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.combo-card { background: linear-gradient(135deg, #eef2ff, #e0e7ff); border: 1px solid #c7d2fe; border-radius: 14px; padding: 15px 10px; cursor: pointer; transition: 0.2s; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.combo-card:active { transform: scale(0.96); }
.c-name { font-weight: 900; color: #4338ca; font-size: 14px; margin-bottom: 4px; }
.c-price { font-weight: 900; color: #1e293b; font-size: 16px; margin-bottom: 4px; }
.c-profit { font-size: 10px; color: #059669; font-weight: 800; background: #d1fae5; padding: 2px 6px; border-radius: 6px; }
.flavor-tag { background: #c7d2fe; color: #4338ca; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 5px; font-weight: 800; }

.search-box { background: white; display: flex; align-items: center; padding: 12px 15px; border-radius: 99px; border: 1px solid #e2e8f0; }
.s-inp { border: none; outline: none; flex: 1; margin-left: 10px; font-weight: 700; }
.tags-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 5px; }
.cat-btn { padding: 8px 16px; border-radius: 99px; background: #e2e8f0; border: none; font-weight: 800; font-size: 13px; color: #64748b; white-space: nowrap; }
.cat-btn.active { background: #4f46e2; color: white; }

.p-card { background: white; padding: 18px; border-radius: 20px; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
.p-card:active { transform: scale(0.98); border-color: #4f46e2; }
.p-info { flex: 1; }
.p-title { font-weight: 800; font-size: 16px; color: #1e293b; }
.p-qty { font-size: 12px; font-weight: 700; color: #64748b; margin-top: 4px; }
.p-price-box { text-align: right; margin-right: 5px; }
.new-p { font-size: 20px; font-weight: 900; color: #4f46e2; }
.btn-gorgeous { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #4f46e2); color: white; font-weight: 900; font-size: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(79,70,229,0.3); }

.float-bar { position: fixed; bottom: 85px; left: 5%; width: 90%; background: #1e293b; border-radius: 99px; padding: 14px 20px; display: flex; align-items: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 90; cursor: pointer; }
.badge-num { background: #4f46e2; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 900; font-size: 16px; }
.float-total { font-size: 22px; font-weight: 900; color: white; margin-right: 15px; }
.float-btn { font-size: 14px; font-weight: 800; color: #cbd5e1; }

.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.checkout-modal { background: white; width: 100%; max-width: 600px; border-radius: 28px 28px 0 0; padding: 30px; box-shadow: 0 -10px 40px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out; max-height: 88vh; overflow-y: auto; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.m-header { font-weight: 900; font-size: 20px; margin-bottom: 20px; display: flex; justify-content: space-between; }
.close-x { background: #f1f5f9; border-radius: 50%; width: 32px; height: 32px; border: none; font-size: 16px; font-weight: 900; color: #475569; cursor: pointer; }

.cart-items { max-height: 250px; overflow-y: auto; margin-bottom: 20px; padding-right: 10px; }
.c-item { display: flex; align-items: center; margin-bottom: 15px; background: #f8fafc; padding: 12px; border-radius: 16px; border: 1px solid #e2e8f0; }
.c-name { font-weight: 800; font-size: 15px; color: #1e293b; display: flex; flex-wrap: wrap; align-items: center; }
.c-sub { font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 700; }
.c-price { font-weight: 900; font-size: 18px; color: #4f46e2; margin-right: 15px; }
.qty-control { display: flex; align-items: center; background: white; border-radius: 10px; border: 1px solid #cbd5e1; }
.qty-control button { border: none; background: transparent; padding: 8px 14px; font-weight: 900; cursor: pointer; color: #1e293b; font-size: 16px; }
.qty-control span { font-weight: 900; font-size: 15px; width: 24px; text-align: center; color: #4f46e2; }

.summary-box { background: #f8fafc; border-radius: 20px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0; }
.s-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.divider-dash { border-bottom: 1px dashed #cbd5e1; margin: 15px 0; }

.payee-buttons { display: flex; gap: 12px; }
.payee-btn { flex: 1; padding: 20px; border-radius: 18px; border: none; font-weight: 900; color: white; font-size: 18px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
.payee-btn:active { transform: scale(0.96); }
.style-0 { background: linear-gradient(135deg, #3b82f6, #2563eb); } 
.style-1 { background: linear-gradient(135deg, #ec4899, #db2777); } 

.cart-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.cart-header-title { font-weight: 900; font-size: 15px; color: #1e293b; }
.clear-all-btn { background: #fee2e2; color: #ef4444; border: none; border-radius: 8px; padding: 6px 12px; font-weight: 800; font-size: 13px; cursor: pointer; }

.c-delete { background: #f1f5f9; border: none; border-radius: 8px; width: 28px; height: 28px; color: #94a3b8; font-size: 13px; font-weight: 900; cursor: pointer; margin-right: 10px; flex-shrink: 0; }
.c-delete:active { background: #fee2e2; color: #ef4444; }

.confirm-section { display: flex; flex-direction: column; gap: 12px; }
.confirm-label { text-align: center; font-weight: 800; font-size: 14px; color: #64748b; margin: 0; padding: 0; }
.btn-back { width: 100%; padding: 14px; border-radius: 14px; border: 2px solid #e2e8f0; background: white; color: #64748b; font-size: 15px; font-weight: 800; cursor: pointer; }
.btn-back:active { background: #f8fafc; }

/* 🚀 二次確定彈窗樣式 */
.confirm-modal { background: white; width: 280px; padding: 25px; border-radius: 20px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2); animation: pop 0.2s cubic-bezier(0.16, 1, 0.3, 1); margin-bottom: 20vh; }
@keyframes pop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.cm-icon { font-size: 45px; margin-bottom: 10px; }
.cm-title { font-weight: 900; font-size: 18px; color: #1e293b; margin-bottom: 8px; }
.cm-text { font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 20px; }
.cm-actions { display: flex; gap: 10px; }
.cm-btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 800; font-size: 14px; border: none; cursor: pointer; transition: 0.2s;}
.cm-btn:active { transform: scale(0.95); }
.cm-cancel { background: #f1f5f9; color: #64748b; }
.cm-ok { background: #ef4444; color: white; box-shadow: 0 4px 10px rgba(239,68,68,0.2);}
</style>