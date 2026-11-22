import { normalizeHistoryDate, parseGrid } from './historyImport.js'

const normalizeHeader = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')
export const normalizeProductAlias = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const compactMatch = value => String(value ?? '').trim().toLowerCase().replace(/[\s\-–—_]+/g, '')
export const productSku = product => product.sku || product.product_code || product.product_no || product.code || product.item_no || ''

export function matchRetailProducts(products, sourceName) {
  const source = compactMatch(sourceName)
  if (!source) return []
  return products.filter(product => [product.name, product.name_en, productSku(product)]
    .some(value => value && compactMatch(value) === source))
}

function pastedGrid(text) {
  const source = String(text ?? '').trim()
  if (!source) return []
  if (!source.startsWith('|')) return parseGrid(source)
  return source.split(/\r?\n/)
    .filter(line => !/^\s*\|?\s*:?-{2,}/.test(line))
    .map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()))
}

function productTokens(value) {
  return String(value ?? '').split(/[,，、\n]/).map(raw => raw.trim()).filter(Boolean).map(raw => {
    const match = raw.match(/^(.*?)\s*[x×]\s*(\d{1,4})$/i)
    const name = match ? match[1].trim() : raw
    const qty = match ? Number(match[2]) : 1
    return { sourceName: name, qty }
  }).filter(item => item.sourceName)
}

function dayInMonth(value, month) {
  const raw = String(value ?? '').trim()
  const full = /^\d{1,2}$/.test(raw) ? `${month}-${raw.padStart(2, '0')}` : raw
  return normalizeHistoryDate(full)
}

export function parseRetailOrderPaste(text, month) {
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error('請先選擇有效年月。')
  const grid = pastedGrid(text)
  if (!grid.length) throw new Error('請先由試算表複製「日期」至「客戶級別」欄，然後貼上。')
  if (grid.length > 101) throw new Error('每次最多貼 100 行；請分批處理。')
  const header = grid[0].map(normalizeHeader)
  const index = {
    date: header.findIndex(x => x === '日期' || x === 'date'),
    payee: header.findIndex(x => ['收錢', '收款人', '經手人', 'staff'].includes(x)),
    client: header.findIndex(x => ['客戶名稱', '客戶', '姓名', 'client'].includes(x)),
    products: header.findIndex(x => x.includes('產品') || x === '商品'),
    tier: header.findIndex(x => ['客戶級別', '級別', '折扣'].includes(x))
  }
  if (index.date < 0 || index.client < 0 || index.products < 0) {
    throw new Error('表格第一行需要「日期、客戶名稱、產品」標題；請連標題一齊複製。')
  }
  const orders = [], issues = []
  let current = null
  grid.slice(1).forEach((cells, offset) => {
    const line = offset + 2
    const pick = key => index[key] < 0 ? '' : String(cells[index[key]] ?? '').trim()
    const dateRaw = pick('date'), payee = pick('payee'), clientName = pick('client')
    const tier = pick('tier'), items = productTokens(pick('products'))
    if (!dateRaw && !payee && !clientName && !tier && !items.length) { current = null; return }
    if (!dateRaw && !payee && !clientName && items.length && current) {
      current.items.push(...items)
      current.sourceLines.push(line)
      if (tier && current.tier && tier !== current.tier) issues.push({ line, message: '續行級別唔同，請核對上一張單。' })
      else if (tier && !current.tier) current.tier = tier
      return
    }
    current = null
    const date = dayInMonth(dateRaw, month)
    if (!date) { issues.push({ line, message: '冇有效日期；呢行未載入。' }); return }
    if (!clientName) { issues.push({ line, message: '冇客戶名稱；呢行未載入。' }); return }
    if (!items.length) { issues.push({ line, message: '冇產品；呢行未載入。' }); return }
    if (items.some(item => !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 9999)) {
      issues.push({ line, message: '產品數量無效；呢行未載入。' }); return
    }
    current = { id: `paste-${line}`, date, payee, clientName, tier, items, sourceLines: [line] }
    orders.push(current)
  })
  return { orders, issues }
}

const aliasStorageKey = accountId => `bz-retail-product-aliases:v1:${accountId}`

export function readProductAliases(storage, accountId) {
  if (!storage || !accountId) return {}
  try {
    const parsed = JSON.parse(storage.getItem(aliasStorageKey(accountId)) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([alias, id]) => alias && typeof id === 'string'))
  } catch { return {} }
}

export function rememberProductAliases(storage, accountId, pairs) {
  if (!storage || !accountId) return {}
  const aliases = readProductAliases(storage, accountId)
  for (const [sourceName, productId] of pairs) {
    const key = normalizeProductAlias(sourceName)
    if (key && productId) aliases[key] = String(productId)
  }
  const limited = Object.fromEntries(Object.entries(aliases).slice(-200))
  try { storage.setItem(aliasStorageKey(accountId), JSON.stringify(limited)) } catch { /* Private browsing can block storage. */ }
  return limited
}
