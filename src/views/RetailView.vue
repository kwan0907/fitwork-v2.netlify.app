<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useMainStore } from '../stores/mainStore'
import { supabase } from '../supabase'
import BaseModal from '../components/BaseModal.vue'
import { hongKongCheckoutTimestamp, retailCheckoutAmounts } from '../retailLedger'
import { matchRetailProducts, normalizeProductAlias, parseRetailOrderPaste, productSku, readProductAliases, rememberProductAliases } from '../retailPaste'

const props = defineProps({ accountId: { type: String, default: '' } })
const store = useMainStore()

const searchClient = ref('')
const selectedClient = ref(null)
const selectedBranch = ref('觀塘店')
const selectedTier = ref('無折扣')
const showDropdown = ref(false)

// 🟢 終極防護：鎖死香港時區
const getLocalHKDate = () => {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Hong_Kong', 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  }).format(new Date());
}

const checkoutDate = ref(getLocalHKDate())

const showClearConfirm = ref(false)
const lastCartChange = ref(null)
const quickProductQuery = ref('')
const editingPriceIndex = ref(null)
const priceDraft = ref('')
const priceError = ref('')

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
const showPasteModal = ref(false)
const pasteText = ref('')
const pasteMonth = ref(getLocalHKDate().slice(0, 7))
const pasteBranch = ref(selectedBranch.value)
const pasteOrders = ref([])
const pasteIssues = ref([])
const pasteError = ref('')
const activePasteOrderId = ref(null)
const activePastedOrder = computed(() => pasteOrders.value.find(order => order.id === activePasteOrderId.value))
const productAliases = ref(readProductAliases(globalThis.localStorage, props.accountId))
watch(() => props.accountId, id => { productAliases.value = readProductAliases(globalThis.localStorage, id) })

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
      
      // 🚀 智能大腦：如果備註的格式是 "產品-口味"，先嘗試拆開
      if (item.name.includes('-')) {
        const parts = item.name.split('-')
        baseName = parts[0].trim()
        flavor = parts.slice(1).join('-').trim()
      }
      
      // 1. 嘗試完全匹配
      let product = store.products.find(p => p.name === baseName)
      
      // 2. 🛡️ 終極防護：如果找不到，直接無視所有空格、橫線進行配對！
      if (!product) {
         const simplify = str => (str||'').replace(/[\s\-]/g, '').toLowerCase()
         const simpleBase = simplify(baseName)
         // 嘗試找完整名稱 (例如備註寫 "蘆薈汁-柑橘味"，但庫存叫 "蘆薈汁 - 柑橘味")
         let fuzzyProduct = store.products.find(p => simplify(p.name) === simplify(item.name))
         
         if (fuzzyProduct) {
             product = fuzzyProduct
             flavor = '' // 庫存名稱已經自帶口味，所以清空額外的 flavor
         } else {
             // 嘗試找 Base Name
             fuzzyProduct = store.products.find(p => simplify(p.name) === simpleBase)
             if (fuzzyProduct) product = fuzzyProduct
         }
      }

      // 3. 如果真的還是找不到，我們「強制」將它塞進購物車，不讓它消失！
      if (!product) {
          product = {
             id: 'unknown_' + Math.random(),
             name: item.name,
             price_standard: 0, retail_price: 0 // 預設 0 元
          }
          alert(`⚠️ 注意：在購物車中無法識別「${item.name}」的正確庫存項目，已強制加入，但可能無法正確扣除庫存。`)
      }

      cart.value.push({
         ...product, 
         qty: item.qty,
         selectedFlavor: flavor || (product.flavors ? product.flavors[0] : ''),
         isCombo: false
      })
    })

    store.pendingRepeatOrder = null
    if (cart.value.length > 0) showCheckoutModal.value = true
  }
})

// 🟢 支援套裝的價格計算
const cartWithPrices = computed(() => {
  return cart.value.map(item => {
    if (item.isCombo) return { ...item, active_price: item.fixedPrice }
    const activePrice = item.customUnitPrice === null || item.customUnitPrice === undefined
      ? listedPrice(item)
      : Number(item.customUnitPrice)
    return { ...item, active_price: activePrice }
  })
})

function listedPrice(product) {
  const tierPrice = product[tierMapping[selectedTier.value]]
  const value = tierPrice === null || tierPrice === undefined || tierPrice === ''
    ? (product.price_standard ?? product.retail_price ?? product.price ?? 0)
    : tierPrice
  return Number(value)
}

const payees = computed(() => store.settings?.payees?.length ? store.settings.payees : ['Kwan', 'Cat'])

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

const matchName = value => String(value || '').trim().toLowerCase().replace(/[\s\-–—_]+/g, '')

function pastedTier(raw, client) {
  const value = String(raw || client?.vip_tier || '').trim()
  if (tierMapping[value]) return value
  if (value.includes('銅')) return '銅級(88折)'
  if (value.includes('銀')) return '銀級(75折)'
  if (value.includes('金')) return '金級(65折)'
  if (value.includes('58')) return '直接58折'
  if (value.includes('半')) return '直接半折'
  return '無折扣'
}

function previewPastedOrders() {
  pasteError.value = ''
  try {
    const result = parseRetailOrderPaste(pasteText.value, pasteMonth.value)
    pasteIssues.value = result.issues
    pasteOrders.value = result.orders.map(order => {
      const clients = store.clients.filter(client => matchName(client.name) === matchName(order.clientName))
      const client = clients.length === 1 ? clients[0] : null
      return {
        ...order,
        clientId: client ? String(client.id) : '',
        tierChoice: pastedTier(order.tier, client),
        status: 'pending',
        items: order.items.map(item => {
          const rememberedId = productAliases.value[normalizeProductAlias(item.sourceName)]
          const remembered = store.products.find(product => String(product.id) === rememberedId)
          const exact = matchRetailProducts(store.products, item.sourceName)
          return { ...item, productId: remembered ? String(remembered.id) : exact.length === 1 ? String(exact[0].id) : '', remembered: Boolean(remembered) }
        })
      }
    })
    if (!pasteOrders.value.length) pasteError.value = '未搵到可載入嘅訂單；請睇下面跳過原因。'
  } catch (error) {
    pasteOrders.value = []
    pasteIssues.value = []
    pasteError.value = error.message || '未能讀取表格。'
  }
}

function loadPastedOrder(order) {
  if (cart.value.length || checkoutSaving.value) {
    pasteError.value = '購物車仲有商品；請先完成、移除或者清空目前購物車。'
    return
  }
  const client = store.clients.find(row => String(row.id) === order.clientId)
  const products = order.items.map(item => ({ ...item, product: store.products.find(row => String(row.id) === item.productId) }))
  if (!client || products.some(item => !item.product)) {
    pasteError.value = '請先核對客戶同每款產品嘅配對。'
    return
  }
  selectClient(client)
  selectedTier.value = order.tierChoice
  selectedBranch.value = pasteBranch.value
  checkoutDate.value = order.date
  cart.value = []
  for (const item of products) {
    const existing = cart.value.find(row => row.id === item.product.id && !row.isCombo)
    if (existing) existing.qty += item.qty
    else cart.value.push({ ...item.product, qty: item.qty, selectedFlavor: item.product.flavors?.[0] || '', isCombo: false })
  }
  productAliases.value = rememberProductAliases(globalThis.localStorage, props.accountId,
    products.map(item => [item.sourceName, item.product.id]))
  order.status = 'loaded'
  activePasteOrderId.value = order.id
  lastCartChange.value = null
  pasteError.value = ''
  showPasteModal.value = false
  showCheckoutModal.value = true
}
// 🚀 極速新增專用變數
const showQuickAddModal = ref(false)
const quickNewClient = ref({ name: '', phone: '', branch: '觀塘' })

async function handleQuickAdd() {
  if (!quickNewClient.value.name || !quickNewClient.value.phone) return alert('請填寫姓名及電話！')
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return alert('⚠️ 無法讀取登入帳號資訊，請重新登入！')

  // 取得香港日期 (確保你的 RetailView 有 getLocalHKDate 函數，如果無，可以用 new Date().toISOString().slice(0, 10))
  const joinDate = typeof getLocalHKDate === 'function' ? getLocalHKDate() : new Date().toISOString().slice(0, 10)

  const dataToInsert = { 
    name: quickNewClient.value.name,
    phone: quickNewClient.value.phone,
    branch: quickNewClient.value.branch,
    source: '其他', 
    status: 'prospect', // 預設試堂/散客
    join_date: joinDate,
    own_email: user.email,
    user_id: user.id 
  }

  // 加上 .select() 才能拿回剛新增的資料
  const { data, error } = await supabase.from('clients').insert([dataToInsert]).select()
  
  if (error) return alert('新增失敗: ' + error.message)
  
  await store.syncAll() 

  // 自動選取剛剛極速新增的客人
  if (data && data.length > 0) {
    selectClient(data[0]) 
  }

  showQuickAddModal.value = false
  quickNewClient.value = { name: '', phone: '', branch: '觀塘' }
  setTimeout(() => alert('✅ 極速新增成功，已自動為你選取客戶！'), 100)
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

const quickProductResults = computed(() => {
  const query = quickProductQuery.value.trim().toLowerCase()
  const matches = query
    ? sortedProducts.value.filter(product => [product.name, product.name_en, product.id]
      .some(value => String(value || '').toLowerCase().includes(query)))
    : sortedProducts.value
  return matches.slice(0, 6)
})

function quickAddProduct(product) {
  if (checkoutSaving.value) return
  addToCart(product)
  quickProductQuery.value = ''
}

function quickAddFirstProduct() {
  if (quickProductResults.value.length) quickAddProduct(quickProductResults.value[0])
}

const displayProducts = computed(() => {
  // 🟢 1. 如果選了「馬拉松套裝」，下方就不顯示一般商品
  if (selectedCategory.value === '馬拉松套裝') return []

  let list = sortedProducts.value.map(p => {
    const branchKey = selectedBranch.value.replace('店', '')
    const stockKey = `${p.name}_${branchKey}`
    const currentQty = store.stock[stockKey] || 0
    const finalPrice = listedPrice(p)
    
    // 🛡️ 強制轉字串並去空白
    const safeCategory = typeof p.category === 'string' ? p.category.trim() : ''
    
    return { ...p, current_stock: currentQty, active_price: finalPrice, _safeCategory: safeCategory }
  })
  
  const isOuter = (n) => {
     const name = n || '';
     return ['洗面', '爽膚水', '霜', '眼膠', '精華', '角質', '面膜', '沐浴', '潤膚', '髮', '護膚'].some(k => name.includes(k));
  }

  // 🟢 2. 繁簡通吃的分類過濾
  if (selectedCategory.value === '內在營養') {
    list = list.filter(p => {
      // 同時支援繁體「內/營養」與簡體「内/营养」
      if (p._safeCategory && (
          p._safeCategory.includes('內') || 
          p._safeCategory.includes('内') || 
          p._safeCategory.includes('營養') || 
          p._safeCategory.includes('营养')
      )) return true;
      
      // 沒填分類的防線：只要不是外在保養品名字，就當作內在
      if (!p._safeCategory && !isOuter(p.name)) return true;
      return false;
    })
  } else if (selectedCategory.value === '外在保養') {
    list = list.filter(p => {
      // 同時支援繁體「保養」與簡體「保养」 (「外」字繁簡長一樣)
      if (p._safeCategory && (
          p._safeCategory.includes('外') || 
          p._safeCategory.includes('保養') || 
          p._safeCategory.includes('保养')
      )) return true;
      
      if (!p._safeCategory && isOuter(p.name)) return true;
      return false;
    })
  }

  if (searchProduct.value) {
    const q = searchProduct.value.toLowerCase()
    list = list.filter(p => (p.name?.toLowerCase().includes(q)) || (p.name_en?.toLowerCase().includes(q)) || (p.id?.toLowerCase().includes(q)))
  }
  
  return list
})

const addToCart = (product) => {
  if (checkoutSaving.value) return
  const flavor = product.flavors ? product.flavors[0] : ''
  const existing = cart.value.find(item => !item.isCombo && item.id === product.id && item.selectedFlavor === flavor)
  if (existing) existing.qty++ 
  else cart.value.push({ ...product, qty: 1, selectedFlavor: flavor, isCombo: false })
}

function changeCartQty(index, amount) {
  if (checkoutSaving.value) return
  const item = cart.value[index]
  if (!item) return
  if (item.qty + amount < 1) removeCartItem(index)
  else if (item.qty + amount <= 9999) item.qty += amount
}

function setCartQty(index, event) {
  const item = cart.value[index]
  if (!item) return
  const quantity = Number(event.target.value)
  if (!checkoutSaving.value && Number.isInteger(quantity) && quantity >= 1 && quantity <= 9999) item.qty = quantity
  else event.target.value = String(item.qty)
}

function updateFlavor(index, event) {
  if (checkoutSaving.value) return
  const source = cart.value[index]
  if (!source) return
  const newFlavor = event.target.value
  const existingIndex = cart.value.findIndex((c, i) => i !== index && !c.isCombo && c.id === source.id && c.selectedFlavor === newFlavor)
  if (existingIndex !== -1) {
    cart.value[existingIndex].qty += source.qty
    cart.value.splice(index, 1)
  } else {
    source.selectedFlavor = newFlavor
  }
}

function removeCartItem(index) {
  if (checkoutSaving.value) return
  const [removed] = cart.value.splice(index, 1)
  if (!removed) return
  lastCartChange.value = { items: [removed], index, message: `已移除「${removed.name}」` }
  showClearConfirm.value = false
  editingPriceIndex.value = null
  if (!cart.value.length && activePasteOrderId.value) {
    const draft = pasteOrders.value.find(order => order.id === activePasteOrderId.value)
    if (draft) draft.status = 'pending'
    activePasteOrderId.value = null
  }
}

function clearCart() {
  if (checkoutSaving.value || !cart.value.length) return
  lastCartChange.value = { items: [...cart.value], index: 0, message: `已清空 ${cart.value.length} 款商品` }
  cart.value = []
  showClearConfirm.value = false
  editingPriceIndex.value = null
  if (activePasteOrderId.value) {
    const draft = pasteOrders.value.find(order => order.id === activePasteOrderId.value)
    if (draft) draft.status = 'pending'
    activePasteOrderId.value = null
  }
}

function undoCartChange() {
  if (checkoutSaving.value || !lastCartChange.value) return
  const { items, index } = lastCartChange.value
  cart.value.splice(Math.min(index, cart.value.length), 0, ...items)
  lastCartChange.value = null
}

function startPriceEdit(index) {
  if (checkoutSaving.value) return
  editingPriceIndex.value = index
  priceDraft.value = String(cartWithPrices.value[index]?.active_price ?? '')
  priceError.value = ''
}

function savePriceEdit(index) {
  if (checkoutSaving.value || !cart.value[index]) return
  const value = Number(priceDraft.value)
  if (String(priceDraft.value).trim() === '' || !Number.isFinite(value) || value < 0 || value > 1000000) {
    priceError.value = '請輸入有效嘅單件售價。'
    return
  }
  cart.value[index].customUnitPrice = Math.round((value + Number.EPSILON) * 100) / 100
  editingPriceIndex.value = null
  priceError.value = ''
}

// 🟢 支援套裝的利潤計算
const totalItems = computed(() => cart.value.reduce((s, i) => s + i.qty, 0))
const ledgerAmounts = computed(() => retailCheckoutAmounts(cartWithPrices.value))
const totalRevenue = computed(() => ledgerAmounts.value.amount)
const totalCost = computed(() => ledgerAmounts.value.cost)
const netProfit = computed(() => ledgerAmounts.value.profit)
const missingTierPriceItems = computed(() => cart.value.filter(item => !item.isCombo &&
  item.customUnitPrice == null &&
  (item[tierMapping[selectedTier.value]] === null || item[tierMapping[selectedTier.value]] === undefined || item[tierMapping[selectedTier.value]] === '')
).map(item => item.name))
const checkoutSaving = ref(false)

async function finalizeCheckout(payeeName) {
  if (checkoutSaving.value) return
  checkoutSaving.value = true
  try {
    await commitCheckout(payeeName)
  } catch (error) {
    alert(`未能核實結帳結果：${error?.message || error}。請先到帳目同庫存核對，避免重複入帳。`)
  } finally {
    checkoutSaving.value = false
  }
}

async function commitCheckout(payeeName) {
  if (!selectedClient.value && !searchClient.value) return alert('請在上方先選擇紀錄對象！')
  if (!cart.value.length) return alert('請先選擇產品。')
  if (missingTierPriceItems.value.length) return alert(`以下產品未填「${selectedTier.value}」售價：${missingTierPriceItems.value.join('、')}。請先逐件按「改價」輸入實收價，或者喺產品管理補價。`)
  if (ledgerAmounts.value.missingCostItems.length) return alert(`以下產品未填成本：${ledgerAmounts.value.missingCostItems.join('、')}。請先喺產品管理補成本，再結帳，避免利潤入錯帳。`)
  
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

  const correctIsoString = hongKongCheckoutTimestamp(checkoutDate.value)
  const checkoutAmounts = ledgerAmounts.value
  if (checkoutAmounts.amount <= 0) return alert('售價必須大於 0，請核對購物車。')

  // 1. 寫入流水帳
  const { error: txnError } = await supabase.from('transactions').insert([{
    type: 'income', 
    category: '零售收入', 
    amount: checkoutAmounts.amount,
    cost: checkoutAmounts.cost,
    profit: checkoutAmounts.profit,
    branch: branchKey, 
    client_id: selectedClient.value?.id || null, 
    client_name: clientNameStr, 
    handled_by: payeeName, 
    staff: payeeName, 
    created_at: correctIsoString,
    owner_email: user.email,
    own_email: user.email,
    user_id: user.id,
    note: `[交易毛利: $${checkoutAmounts.profit}] ${clientNameStr} (${itemsStr})`
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

  // 3. 執行庫存扣除 (🛡️ 修正：呼叫後端 RPC 絕對防止併發衝突！)
  let stockUpdateFailed = false;
  for (const d of stockDeductions) {
    const { error: rpcError } = await supabase.rpc('adjust_stock', {
      p_prod_name: d.name,
      p_branch: branchKey,
      p_qty_change: -d.qty, // 賣出扣除庫存，所以係負數
      p_user_id: user.id,
      p_email: user.email
    });
    
    if (rpcError) {
      console.error("庫存扣除失敗:", rpcError);
      stockUpdateFailed = true;
    }
  }

  if (stockUpdateFailed) {
      alert(`⚠️ 結帳成功，但部分私人庫存扣減失敗！請手動至「庫存管理」確認。\n(可能是因為部分組合品項您尚未建立庫存紀錄)\n日期: ${checkoutDate.value}\n收現金 $${totalRevenue.value}`)
  } else {
      alert(`✅ 結帳成功！(您的私人庫存及套裝內含物已自動扣除)\n日期: ${checkoutDate.value}\n由 ${payeeName} 收取實收現金 $${totalRevenue.value}`)
  }
  
  const completedDraft = pasteOrders.value.find(order => order.id === activePasteOrderId.value)
  if (completedDraft) completedDraft.status = 'saved'
  activePasteOrderId.value = null
  cart.value = []; selectedClient.value = null; searchClient.value = ''; showCheckoutModal.value = false; lastCartChange.value = null
  await store.syncAll() 
  if (completedDraft) showPasteModal.value = true
}
</script>

<template>
  <div class="page" style="padding-bottom: 240px;">
    <h2 class="page-title">零售商品收銀</h2>

    <div class="glass-card top-card">
      <div class="form-item">
        <label>1. 搜尋紀錄對象 <span style="color:#ef4444">*</span></label>
        <div style="position:relative;">
          <input class="modern-inp" v-model="searchClient" placeholder="🔍 搜尋客戶姓名或電話..." @focus="showDropdown = true" @input="showDropdown = true">
          <!-- 🚀 改為只要有打字就顯示 Menu -->
          <div v-if="showDropdown && searchClient" class="drop-menu">
            <div style="padding:8px; text-align:center; font-size:12px; color:#ef4444; border-bottom:1px solid #eee; cursor:pointer;" @click="showDropdown = false">✕ 關閉</div>
            
            <!-- 有結果時顯示客戶列表 (保留咗你嘅 VIP 標籤) -->
            <div v-if="clientOptions.length > 0">
              <div v-for="c in clientOptions" :key="c.id" class="drop-item" @click="selectClient(c)">
                {{ c.name }} <span class="tier-tag">{{ c.vip_tier || '普通' }}</span>
              </div>
            </div>

            <!-- 🚀 無結果時顯示極速新增按鈕 -->
            <div v-else style="padding: 15px; text-align: center;">
              <div style="color: #64748b; font-size: 13px; font-weight: 800; margin-bottom: 10px;">找不到此客戶</div>
              <button @click="showQuickAddModal = true; showDropdown = false; quickNewClient.name = isNaN(searchClient) ? searchClient : ''; quickNewClient.phone = !isNaN(searchClient) ? searchClient : ''" style="background: #4f46e2; color: white; border: none; padding: 10px 15px; border-radius: 10px; font-weight: 900; width: 100%; cursor: pointer; transition: 0.2s;">
                ➕ 查無此人，立即新增
              </button>
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

    <button type="button" class="paste-entry-trigger" @click="showPasteModal = true">
      <span>📋 <b>由 Excel／Google Sheets 貼入訂單</b></span>
      <small>多張單先配對，再逐張核對結帳；同名產品配對會記住</small>
    </button>

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

    <button v-if="cart.length > 0" type="button" class="float-bar retail-cart-float" aria-label="開啟購物車結帳" @click="showCheckoutModal = true">
      <div class="badge-num">{{ totalItems }}</div>
      <div style="flex:1; margin-left:15px; font-weight:800; color:white;">件商品</div>
      <div class="float-total">$ {{ totalRevenue }}</div>
      <div class="float-btn">結帳 ➔</div>
    </button>

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
      <div class="checkout-scroll-area">
        <div class="summary-box" style="margin-bottom: 20px; border-color: #4f46e2; background: #f5f3ff;">
          <div class="s-row">
            <span style="color:#4f46e2; font-weight:800;">📅 購買日期</span>
            <input type="date" v-model="checkoutDate" class="modern-select" style="width: 150px; padding: 5px 10px; background: white; border: 2px solid #4f46e2;">
          </div>
        </div>

        <section class="checkout-quick-add" aria-label="快速加入商品">
          <div class="checkout-quick-head"><strong>⚡ 快速加貨</strong><small>唔使離開結帳畫面</small></div>
          <input v-model="quickProductQuery" type="search" placeholder="搜尋產品名稱或編號，按 Enter 加入" aria-label="搜尋產品快速加入" :disabled="checkoutSaving" @keydown.enter.prevent="quickAddFirstProduct">
          <div v-if="quickProductResults.length" class="checkout-quick-results">
            <button v-for="product in quickProductResults" :key="product.id" type="button" :disabled="checkoutSaving" @click="quickAddProduct(product)">
              <span>{{ product.name }}</span><small>HK$ {{ listedPrice(product) }}</small><b>＋</b>
            </button>
          </div>
          <p v-else class="checkout-quick-empty">搵唔到產品，試吓其他名稱。</p>
        </section>

        <div class="cart-header-row">
          <span class="cart-header-title">🛍️ 已選商品（{{ totalItems }} 件）</span>
          <button v-if="cart.length" type="button" class="clear-all-btn" :disabled="checkoutSaving" @click="showClearConfirm = true">🗑️ 清空</button>
        </div>

        <div v-if="showClearConfirm" class="cart-clear-confirm" role="group" aria-label="確認清空購物車">
          <span>確定清空購物車全部 {{ cart.length }} 款商品？</span>
          <div><button type="button" @click="showClearConfirm = false">取消</button><button type="button" class="cart-clear-danger" @click="clearCart">確定清空</button></div>
        </div>
        <div v-if="lastCartChange" class="cart-undo" role="status"><span>{{ lastCartChange.message }}</span><button type="button" :disabled="checkoutSaving" @click="undoCartChange">復原</button></div>
        <p v-if="!cart.length" class="cart-empty">購物車暫時冇商品。喺上面搜尋，一按就可以加返。</p>

        <div class="cart-items">
          <div v-for="(item, index) in cartWithPrices" :key="`${item.id}:${item.selectedFlavor || ''}:${index}`" class="c-item">
            <div class="cart-line-main">
              <div class="c-name">
                {{ item.name }}
                <span v-if="item.isCombo && item.shakeFlavor" class="flavor-tag">Shake: {{ item.shakeFlavor }}</span>
                <span v-if="item.isCombo && item.aloeFlavor" class="flavor-tag">蘆薈: {{ item.aloeFlavor }}</span>
              </div>
              <div class="c-sub" v-if="!item.isCombo && item.flavors">
                 <select :value="item.selectedFlavor" :disabled="checkoutSaving" @change="updateFlavor(index, $event)" class="modern-select" style="padding: 4px; font-size: 11px; margin-top: 5px;">
                   <option v-for="f in item.flavors" :key="f" :value="f">{{ f }}</option>
                 </select>
              </div>
              <div class="cart-line-price">單價 HK$ {{ item.active_price }} <span>· 小計 HK$ {{ Math.round(item.active_price * item.qty * 100) / 100 }}</span></div>
            </div>
            <div class="cart-line-actions">
              <div class="qty-control">
                <button type="button" :aria-label="`減少${item.name}數量`" :disabled="checkoutSaving" @click="changeCartQty(index, -1)">−</button>
                <input type="number" inputmode="numeric" min="1" max="9999" step="1" :value="item.qty" :aria-label="`${item.name}數量`" :disabled="checkoutSaving" @change="setCartQty(index, $event)">
                <button type="button" :aria-label="`增加${item.name}數量`" :disabled="checkoutSaving" @click="changeCartQty(index, 1)">＋</button>
              </div>
              <button v-if="!item.isCombo" type="button" class="cart-edit-price" :disabled="checkoutSaving" @click="startPriceEdit(index)">改價</button>
              <button type="button" class="c-delete" :aria-label="`移除${item.name}`" :disabled="checkoutSaving" @click="removeCartItem(index)">移除</button>
            </div>
            <div v-if="editingPriceIndex === index" class="cart-price-editor">
              <label>單件實收價（HK$）<input v-model="priceDraft" type="number" inputmode="decimal" min="0" step="0.01" @keydown.enter.prevent="savePriceEdit(index)"></label>
              <button type="button" @click="savePriceEdit(index)">確定</button><button type="button" @click="editingPriceIndex = null">取消</button>
              <small v-if="priceError" role="alert">{{ priceError }}</small>
            </div>
          </div>
        </div>

        <div v-if="cart.length" class="summary-box">
          <div class="s-row"><span style="color:#1e293b; font-weight:800;">總營業額</span> <span style="font-weight:900; font-size:18px;">$ {{ Math.round(totalRevenue * 100) / 100 }}</span></div>
          <div class="s-row"><span style="color:#ef4444; font-weight:800;">產品／套裝成本</span> <span style="color:#ef4444; font-weight:900;">{{ totalCost === null ? '待補成本' : '- $ ' + totalCost }}</span></div>
          <div class="divider-dash"></div>
          <div class="s-row" style="margin-top:10px;"><span style="color:#4f46e2; font-weight:900; font-size:16px;">🚀 交易毛利</span> <span style="color:#4f46e2; font-weight:900; font-size:26px;">{{ netProfit === null ? '待補成本' : '$ ' + netProfit }}</span></div>
          <p class="cart-profit-note">一般產品用「產品管理」成本；套裝沿用你設定嘅固定利潤。以上未扣其他營運支出。</p>
          <p v-if="missingTierPriceItems.length" class="cart-price-warning" role="alert">{{ selectedTier }} 售價待核對：{{ missingTierPriceItems.join('、') }}。請逐件按「改價」輸入實收價，先可以結帳。</p>
          <p v-if="ledgerAmounts.missingCostItems.length" class="cart-price-warning" role="alert">產品成本待補：{{ ledgerAmounts.missingCostItems.join('、') }}。請先到產品管理補成本，避免利潤入錯帳。</p>
        </div>

        <div v-if="cart.length" class="confirm-section">
          <p v-if="activePastedOrder" class="pasted-payee-note">表格標示由「{{ activePastedOrder.payee || '未填' }}」收錢；請核對後揀啱收款人。</p>
          <p class="confirm-label">💳 選擇收款人完成結帳</p>
          <div class="payee-buttons">
            <button v-for="(payee, index) in payees" :key="payee" class="payee-btn" :class="'style-' + (index % 2)" :disabled="checkoutSaving || missingTierPriceItems.length > 0 || ledgerAmounts.missingCostItems.length > 0" @click="finalizeCheckout(payee)">
              ✅ {{ payee }} 收款
            </button>
          </div>
          <button class="btn-back" @click="showCheckoutModal = false">← 返回繼續選購</button>
        </div>
      </div>
    </BaseModal>

    <div v-if="showPasteModal" class="paste-order-overlay" @click.self="showPasteModal = false">
      <section class="paste-order-dialog" role="dialog" aria-modal="true" aria-labelledby="paste-order-title">
        <header class="paste-order-header"><div><small>快捷落單</small><h2 id="paste-order-title">貼入表格訂單</h2></div><button type="button" aria-label="關閉貼表視窗" @click="showPasteModal = false">×</button></header>
        <div class="paste-order-body">
          <p class="paste-order-help">由試算表複製「日期、收錢、客戶名稱、產品、客戶級別」五欄。下一行留空日期同姓名，會接續上一張單；唔會自動入帳。</p>
          <div class="paste-order-settings">
            <label>訂單年月<input v-model="pasteMonth" type="month"></label>
            <label>扣貨分店<select v-model="pasteBranch"><option value="觀塘店">觀塘店</option><option value="中環店">中環店</option><option value="佐敦店">佐敦店</option></select></label>
          </div>
          <label class="paste-order-input">貼上表格<textarea v-model="pasteText" rows="6" placeholder="日期　收錢　客戶名稱　產品　客戶級別&#10;3　Cat　Tim　消脂片, 抗脂片　銀級"></textarea></label>
          <button type="button" class="paste-order-preview" @click="previewPastedOrders">讀取並核對訂單</button>
          <p class="paste-order-privacy">產品名稱配對只記喺呢部裝置，並按 BZ 登入帳戶分開。每張單仍要由你親自按收款人結帳。</p>
          <p v-if="pasteError" class="paste-order-error" role="alert">{{ pasteError }}</p>
          <p v-if="cart.length && pasteOrders.length" class="paste-order-error">目前購物車仲有 {{ totalItems }} 件商品；請先處理，先可以載入下一張單。</p>
          <div v-if="pasteIssues.length" class="paste-order-issues"><strong>以下 {{ pasteIssues.length }} 行未載入／需核對</strong><p v-for="(issue, index) in pasteIssues" :key="index">第 {{ issue.line }} 行：{{ issue.message }}</p></div>
          <div v-if="pasteOrders.length" class="paste-order-review-head">{{ pasteOrders.length }} 張訂單待核對 <small>揀啱客戶同產品，先載入購物車</small></div>
          <article v-for="order in pasteOrders" :key="order.id" class="paste-order-card">
            <div class="paste-order-card-title"><strong>{{ order.date }} · {{ order.clientName }}</strong><small>{{ order.payee || '未填收款人' }} · {{ order.items.length }} 款 · {{ order.status === 'saved' ? '已入帳' : order.status === 'loaded' ? '已載入' : '待核對' }}</small></div>
            <label>對應 BZ 客戶<select v-model="order.clientId"><option value="">請揀現有客戶</option><option v-for="client in store.clients" :key="client.id" :value="String(client.id)">{{ client.name }}{{ client.phone ? ` · ${client.phone}` : '' }}{{ client.branch ? ` · ${client.branch}` : '' }}</option></select></label>
            <label>本單折扣<select v-model="order.tierChoice"><option v-for="tier in Object.keys(tierMapping)" :key="tier" :value="tier">{{ tier }}</option></select></label>
            <div v-for="(item, index) in order.items" :key="index" class="paste-product-match">
              <div><b>原表：{{ item.sourceName }}</b><small>× {{ item.qty }} <em v-if="item.remembered">上次配對</em></small></div>
              <select v-model="item.productId" :aria-label="`${item.sourceName}對應產品`"><option value="">請揀對應產品</option><option v-for="product in store.products" :key="product.id" :value="String(product.id)">{{ product.name }}{{ productSku(product) ? ` · SKU ${productSku(product)}` : product.name_en ? ` · ${product.name_en}` : '' }}</option></select>
            </div>
            <button type="button" class="paste-order-load" :disabled="Boolean(cart.length) || order.status === 'saved' || order.status === 'loaded' || !order.clientId || order.items.some(item => !item.productId)" @click="loadPastedOrder(order)">{{ order.status === 'saved' ? '已入帳' : order.status === 'loaded' ? '已載入購物車' : '載入購物車，核對價錢' }}</button>
          </article>
        </div>
      </section>
    </div>

  </div>

  <!-- 🚀 極速新增客戶 Modal -->
    <div v-if="showQuickAddModal" class="modal-overlay" @click.self="showQuickAddModal = false">
      <div class="center-modal action-modal" style="max-width: 350px;">
        <div class="m-header">
          ⚡ 極速新增客戶
          <button class="close-x" @click="showQuickAddModal = false">✕</button>
        </div>
        
        <div style="margin-bottom: 15px; font-size: 12px; color: #475569; font-weight: 700; background: #f8fafc; padding: 10px; border-radius: 8px; border-left: 3px solid #4f46e2;">
          💡 極速通道：加完會自動為你選取這個新客！
        </div>

        <div class="form-item">
          <label style="font-weight: 800; font-size: 13px; margin-bottom: 5px; display: block;">姓名 <span style="color:#ef4444">*</span></label>
          <input v-model="quickNewClient.name" class="modern-inp" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; margin-bottom: 12px;" placeholder="請輸入姓名">
        </div>
        
        <div class="form-item">
          <label style="font-weight: 800; font-size: 13px; margin-bottom: 5px; display: block;">電話 <span style="color:#ef4444">*</span></label>
          <input v-model="quickNewClient.phone" type="tel" inputmode="tel" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; margin-bottom: 12px;" placeholder="請輸入電話">
        </div>
        
        <div class="form-item">
          <label style="font-weight: 800; font-size: 13px; margin-bottom: 5px; display: block;">所屬分店</label>
          <select v-model="quickNewClient.branch" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none;">
            <option value="觀塘">觀塘</option>
            <option value="中環">中環</option>
            <option value="佐敦">佐敦</option>
          </select>
        </div>

        <button style="width: 100%; margin-top: 20px; background: #4f46e2; color: white; border: none; padding: 15px; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; transition: 0.2s;" @click="handleQuickAdd">
          ✅ 確認新增並選取
        </button>
      </div>
    </div>
</template>

<style scoped>
/* 🟢 頂部空白消除術：砍掉四周贅肉，讓標題與搜尋框向上貼齊 */
.page { 
  padding: 10px 15px !important; 
  padding-bottom: calc(120px + env(safe-area-inset-bottom)); 
  background: #f8fafc; 
  min-height: 100vh; 
}
.page-title { 
  font-weight: 900; 
  font-size: 22px; 
  color: #1e293b; 
  margin-top: 0 !important; 
  margin-bottom: 10px !important; /* 原本是 20px，砍半 */
}
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
.paste-entry-trigger { display: grid; gap: 4px; width: 100%; margin: 0 0 18px; padding: 14px 16px; border: 1px solid #dfc5b4; border-radius: 16px; background: #fffaf4; color: #7b4c36; text-align: left; cursor: pointer; }
.paste-entry-trigger span { font-size: 15px; }
.paste-entry-trigger small { color: #8e7869; font-size: 12px; line-height: 1.35; }
.paste-order-overlay { position: fixed; inset: 0; z-index: 10060; display: flex; align-items: center; justify-content: center; padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); background: rgba(58,43,33,.55); backdrop-filter: blur(3px); }
.paste-order-dialog { display: flex; flex-direction: column; width: min(660px, 100%); max-height: 100%; overflow: hidden; border-radius: 22px; background: #fffaf5; box-shadow: 0 25px 70px rgba(39,28,21,.28); }
.paste-order-header { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 17px 18px; border-bottom: 1px solid #ead9ca; }
.paste-order-header small { color: #b26a48; font-size: 11px; font-weight: 800; }
.paste-order-header h2 { margin: 2px 0 0; color: #342922; font-size: 20px; }
.paste-order-header button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: #f2e7df; color: #6b5547; font-size: 25px; cursor: pointer; }
.paste-order-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 16px 18px 22px; }
.paste-order-help,.paste-order-privacy { margin: 0 0 15px; color: #806d5f; font-size: 12px; line-height: 1.5; }
.paste-order-privacy { margin: 11px 0 0; }
.paste-order-settings { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.paste-order-body label { display: grid; gap: 5px; color: #665346; font-size: 12px; font-weight: 800; }
.paste-order-body input,.paste-order-body select,.paste-order-body textarea { width: 100%; min-width: 0; min-height: 42px; box-sizing: border-box; padding: 9px 10px; border: 1px solid #dfcabc; border-radius: 10px; background: #fff; color: #342922; font-size: 16px; }
.paste-order-input { margin-top: 13px; }
.paste-order-body textarea { resize: vertical; line-height: 1.4; }
.paste-order-preview,.paste-order-load { width: 100%; min-height: 44px; margin-top: 12px; border: 0; border-radius: 11px; background: #b96e4b; color: #fff; font-weight: 900; cursor: pointer; }
.paste-order-load { margin-top: 3px; }
.paste-order-load:disabled { background: #d6beb0; cursor: not-allowed; }
.paste-order-error { margin: 12px 0 0; padding: 11px; border-radius: 10px; background: #fff0e8; color: #9e4b35; font-size: 12px; font-weight: 800; }
.paste-order-issues { margin-top: 14px; padding: 12px; border: 1px solid #edcbb9; border-radius: 12px; background: #fff5ef; color: #79523f; font-size: 12px; }
.paste-order-issues p { margin: 7px 0 0; }
.paste-order-review-head { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; margin: 18px 0 9px; color: #5d4536; font-weight: 900; }
.paste-order-review-head small { color: #907967; font-size: 11px; font-weight: 700; }
.paste-order-card { display: grid; gap: 12px; margin-bottom: 12px; padding: 15px; border: 1px solid #e8d7c9; border-radius: 15px; background: #fff; }
.paste-order-card-title { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px; color: #3b2d25; }
.paste-order-card-title small { color: #977b68; }
.paste-product-match { display: grid; gap: 5px; padding-top: 9px; border-top: 1px solid #f0e7e1; }
.paste-product-match > div { display: flex; align-items: baseline; justify-content: space-between; gap: 7px; color: #544235; font-size: 12px; }
.paste-product-match small { white-space: nowrap; color: #967d6a; }
.paste-product-match em { margin-left: 6px; color: #627c4e; font-style: normal; }
.pasted-payee-note { margin: 0; padding: 11px; border-radius: 10px; background: #f4efe5; color: #74543d; font-size: 12px; font-weight: 800; line-height: 1.4; }

/* 🟢 解決結帳視窗無法滾動、背景跟著滑動的問題 */
.checkout-scroll-area {
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

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

.float-bar { 
  position: fixed; 
  /* 💡 將原本的 85px 改成 100px，並加上 iPhone 底部安全區的高度 */
  bottom: calc(100px + env(safe-area-inset-bottom)); 
  left: 5%; 
  width: 90%; 
  background: #1e293b; 
  border-radius: 99px; 
  padding: 14px 20px; 
  display: flex; 
  align-items: center; 
  box-shadow: 0 10px 25px rgba(0,0,0,0.2); 
  z-index: 90; 
  cursor: pointer; 
}
.badge-num { background: #4f46e2; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 900; font-size: 16px; }
.float-total { font-size: clamp(18px, 5vw, 24px); font-weight: 900; color: white; margin-right: 15px; }
.float-btn { font-size: clamp(13px, 3.5vw, 16px); font-weight: 800; color: #cbd5e1; }
@media (max-width: 600px) {
  #app-main .retail-cart-float { left: 12px !important; right: 82px !important; width: auto !important; max-width: none; margin: 0; bottom: calc(88px + env(safe-area-inset-bottom)) !important; padding: 10px 13px !important; border: 0; text-align: left; }
  #app-main .retail-cart-float > div:nth-child(2) { display: none !important; }
  .float-total { margin-left: auto; margin-right: 8px; white-space: nowrap; }
  .float-btn { white-space: nowrap; }
}

.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: flex-end; justify-content: center; }
.checkout-modal { background: white; width: 100%; max-width: 600px; border-radius: 28px 28px 0 0; padding: 30px; box-shadow: 0 -10px 40px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out; max-height: 88vh; overflow-y: auto; }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.m-header { font-weight: 900; font-size: 20px; margin-bottom: 20px; display: flex; justify-content: space-between; }
.close-x { background: #f1f5f9; border-radius: 50%; width: 32px; height: 32px; border: none; font-size: 16px; font-weight: 900; color: #475569; cursor: pointer; }

.cart-items { margin-bottom: 20px; }
.c-item { display: grid; gap: 12px; margin-bottom: 12px; background: #f8fafc; padding: 14px; border-radius: 16px; border: 1px solid #e2e8f0; }
.cart-line-main { min-width: 0; }
.cart-line-price { margin-top: 7px; color: #685346; font-weight: 800; font-size: 13px; }
.cart-line-price span { color: #7b6d62; font-weight: 700; }
.cart-line-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.cart-edit-price, .c-delete { min-height: 40px; padding: 0 11px; border: 1px solid #e6d6cb; border-radius: 10px; background: #fff; color: #97573c; font-weight: 800; cursor: pointer; }
.c-delete { margin-left: auto; color: #a84436; background: #fff4f0; }
.cart-price-editor { display: flex; align-items: end; flex-wrap: wrap; gap: 7px; padding-top: 8px; border-top: 1px solid #e9dfd8; }
.cart-price-editor label { flex: 1; min-width: 145px; margin: 0; }
.cart-price-editor input { width: 100%; min-height: 40px; padding: 8px; border: 1px solid #d5c2b4; border-radius: 9px; background: #fff; font-size: 16px; }
.cart-price-editor button { min-height: 40px; padding: 0 11px; border: 1px solid #cfae9c; border-radius: 9px; background: #fff; color: #97573c; font-weight: 800; }
.cart-price-editor small { flex-basis: 100%; color: #a84436; }
.c-name { font-weight: 800; font-size: clamp(14px, 4vw, 18px); color: #1e293b; display: flex; flex-wrap: wrap; align-items: center; }
.c-sub { font-size: clamp(11px, 3vw, 14px); color: #64748b; margin-top: 4px; font-weight: 700; }
.c-price { font-weight: 900; font-size: clamp(16px, 4.5vw, 20px); color: #4f46e2; margin-right: 15px; }
.qty-control { display: flex; align-items: center; background: white; border-radius: 10px; border: 1px solid #cbd5e1; }
.qty-control button { border: none; background: transparent; padding: 8px 14px; font-weight: 900; cursor: pointer; color: #1e293b; font-size: 16px; }
.qty-control input { width: 44px; min-height: 38px; padding: 0; border: 0; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; background: #fff; text-align: center; color: #97573c; font-size: 16px; font-weight: 900; appearance: textfield; }
.qty-control input::-webkit-inner-spin-button,.qty-control input::-webkit-outer-spin-button { appearance: none; margin: 0; }

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
.cart-clear-confirm { margin: 0 0 12px; padding: 12px; border: 1px solid #edc5b6; border-radius: 12px; background: #fff5ef; color: #6a4435; font-size: 13px; font-weight: 800; }
.cart-clear-confirm > div { display: flex; gap: 8px; margin-top: 10px; }
.cart-clear-confirm button { min-height: 40px; flex: 1; border: 1px solid #ddbdac; border-radius: 9px; background: #fff; color: #6a4435; font-weight: 800; }
.cart-clear-confirm .cart-clear-danger { border-color: #a84436; background: #a84436; color: #fff; }
.cart-undo { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; padding: 10px 12px; border-radius: 11px; background: #eef3e7; color: #586c42; font-size: 13px; font-weight: 800; }
.cart-undo button { min-height: 38px; padding: 0 11px; border: 1px solid #98ad82; border-radius: 9px; background: #fff; color: #4b6538; font-weight: 900; }
.cart-empty { margin: 0 0 16px; padding: 14px; border: 1px dashed #d9c9be; border-radius: 12px; color: #7b6d62; font-size: 13px; }
.cart-profit-note { margin: 12px 0 0; color: #7b6d62; font-size: 11px; line-height: 1.45; }
.cart-price-warning { margin: 12px 0 0; padding: 10px; border-radius: 10px; background: #fff0e8; color: #a34831; font-size: 12px; line-height: 1.45; font-weight: 800; }
.checkout-quick-add { margin-bottom: 18px; padding: 14px; border: 1px solid #e9d8c9; border-radius: 16px; background: #fffcf7; }
.checkout-quick-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 9px; color: #714b38; }
.checkout-quick-head small { color: #938173; font-size: 11px; }
.checkout-quick-add > input { width: 100%; min-height: 44px; padding: 9px 12px; border: 1px solid #d9c5b6; border-radius: 11px; background: #fff; color: #3c2f27; font-size: 16px; }
.checkout-quick-results { display: grid; gap: 6px; max-height: 186px; overflow-y: auto; margin-top: 9px; }
.checkout-quick-results button { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 7px 9px; border: 1px solid #f0e4da; border-radius: 10px; background: #fff; color: #3c2f27; text-align: left; font-size: 13px; font-weight: 800; }
.checkout-quick-results button span { flex: 1; min-width: 0; }
.checkout-quick-results button small { flex: none; color: #9d6146; }
.checkout-quick-results button b { color: #b46c48; font-size: 20px; }
.checkout-quick-empty { margin: 9px 0 0; color: #938173; font-size: 12px; }

.confirm-section { display: flex; flex-direction: column; gap: 12px; }
.confirm-label { text-align: center; font-weight: 800; font-size: 14px; color: #64748b; margin: 0; padding: 0; }
.btn-back { width: 100%; padding: 14px; border-radius: 14px; border: 2px solid #e2e8f0; background: white; color: #64748b; font-size: 15px; font-weight: 800; cursor: pointer; }
.btn-back:active { background: #f8fafc; }

@media (max-width: 430px) {
  .checkout-quick-head small { display: none; }
  .qty-control button { padding: 7px 9px; }
  .cart-line-actions { gap: 6px; }
}
</style>
