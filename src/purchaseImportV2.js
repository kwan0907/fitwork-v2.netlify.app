import { supabase } from './supabase'

const PACKAGE_OPTIONS = {
  trial: { label: '試堂', price: 98, baseCost: 52, category: '試堂' },
  pkg_10: { label: '10點套票', price: 880, baseCost: 399, category: '運動套票' },
  pkg_35: { label: '35點套票', price: 2640, baseCost: 1316.5, category: '運動套票' },
  pkg_vip30: { label: 'VIP點數30點', price: 0, baseCost: 1155, category: '運動套票', forceProfit: 0 },
  referral_free: { label: '介紹朋友贈堂', price: 0, baseCost: 53, category: '贈堂' },
  exp_30: { label: '體驗卡30人次', price: 0, baseCost: 750, category: '運動套票' },
  pkg_1_free: { label: '新增1格', price: 0, baseCost: 25.5, category: '贈堂' },
  redeem_50: { label: '50積分兌換', price: 0, baseCost: 399, category: '積分兌換' },
  redeem_100: { label: '100積分兌換', price: 0, baseCost: 1197, category: '積分兌換' }
}

const IMPORT_BUTTON_ID = 'purchase-import-launcher'
const MODAL_ID = 'purchase-import-modal'

const esc = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

const normalizePhone = (value = '') => {
  let digits = String(value).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('852')) digits = digits.slice(3)
  return digits
}

const normalizeName = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, '')
const normalizeText = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, '')

const normalizeDate = (value = '') => {
  const raw = String(value).trim()
  if (!raw) return ''
  const m = raw.match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})/)
  if (!m) return ''
  return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`
}

const addOneYear = (dateStr = '') => {
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const year = Number(m[1]) + 1
  const month = Number(m[2])
  const day = Number(m[3])
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

const detectBranch = (raw = '', fallback = '觀塘') => {
  const s = String(raw).toLowerCase()
  if (s.includes('中環') || s.includes('bluezone central') || s.includes('bzc')) return '中環'
  if (s.includes('佐敦') || s.includes('bluezone studio') || s.includes('bzs')) return '佐敦'
  if (s.includes('觀塘') || s.includes('fitzion base') || s.includes('fzb')) return '觀塘'
  return fallback || '觀塘'
}

const detectPackage = (raw = '') => {
  const s = normalizeText(raw)
  if (!s) return ''
  if (s.includes('試堂')) return 'trial'
  if (s.includes('vip') && s.includes('30')) return 'pkg_vip30'
  if ((s.includes('30') && s.includes('5')) || s.includes('35點') || s.includes('35')) return 'pkg_35'
  if (s.includes('10點') || /(^|\D)10(\D|$)/.test(s)) return 'pkg_10'
  if (s.includes('體驗卡') && s.includes('30')) return 'exp_30'
  if (s.includes('100積分')) return 'redeem_100'
  if (s.includes('50積分')) return 'redeem_50'
  if (s.includes('新增1格') || s.includes('加1格')) return 'pkg_1_free'
  if (s.includes('贈堂')) return 'referral_free'
  return ''
}

const isInternCoach = (coach = '') => String(coach).includes('實習教練')

const packageCalc = (packageKey, intern = false) => {
  const pkg = PACKAGE_OPTIONS[packageKey]
  if (!pkg) return null
  let cost = Number(pkg.baseCost || 0)
  let profit = pkg.forceProfit ?? (Number(pkg.price || 0) - cost)
  if (intern && Number(pkg.price || 0) > 0) {
    profit = Number((Number(pkg.price) * 0.3).toFixed(2))
    cost = Number((Number(pkg.price) - profit).toFixed(2))
  }
  let type = 'income'
  let amount = Number(pkg.price || 0)
  if (amount === 0 && cost > 0 && packageKey !== 'pkg_vip30') {
    type = 'expense'
    amount = cost
  }
  return { ...pkg, cost, profit, type, amount }
}

const isRealPackagePurchase = (row) => {
  const calc = row.packageKey ? packageCalc(row.packageKey, isInternCoach(row.coach)) : null
  return Boolean(calc && calc.category === '運動套票' && calc.type === 'income')
}

const configuredPayees = (store) => {
  const candidates = [
    ...(Array.isArray(store.settings?.payees) ? store.settings.payees : []),
    ...(Array.isArray(store.deviceUsers) ? store.deviceUsers : []),
    store.currentUser
  ]
  return [...new Set(candidates.map(v => String(v || '').trim()).filter(Boolean))]
}

const detectPayee = (coach, payees) => {
  const text = normalizeText(coach)
  if (!text) return ''
  const matches = payees.filter(name => text.includes(normalizeText(name)))
  return matches.length === 1 ? matches[0] : ''
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else current += ch
  }
  cells.push(current)
  return cells
}

function parseGrid(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\r?\n/).filter(line => line.trim() !== '')
  if (!lines.length) return []
  const isTsv = lines[0].includes('\t')
  return lines.map(line => isTsv ? line.split('\t') : parseCsvLine(line))
}

const headerIndex = (headers, aliases) => {
  const normalized = headers.map(h => normalizeText(h))
  for (const alias of aliases) {
    const idx = normalized.indexOf(normalizeText(alias))
    if (idx >= 0) return idx
  }
  return -1
}

function rowsFromGrid(grid) {
  if (grid.length < 2) return []
  const headers = grid[0]
  const idx = {
    phone: headerIndex(headers, ['行動電話', '電話', '手機', 'mobile']),
    name: headerIndex(headers, ['客戶名稱', '姓名', '客戶']),
    coach: headerIndex(headers, ['教練', '處理人', 'staff']),
    date: headerIndex(headers, ['銷售日期', '購買日期', '日期']),
    item: headerIndex(headers, ['名稱', '商品名稱', '項目', '產品名稱']),
    branchA: headerIndex(headers, ['店別', '分店']),
    branchB: headerIndex(headers, ['銷售門市', '門市']),
    referrer: headerIndex(headers, ['介紹人'])
  }
  if (idx.date < 0 || (idx.phone < 0 && idx.name < 0)) return []

  return grid.slice(1).map((cells, rowIndex) => {
    const pick = i => i >= 0 ? String(cells[i] ?? '').trim() : ''
    const date = normalizeDate(pick(idx.date))
    const name = pick(idx.name)
    const phone = normalizePhone(pick(idx.phone))
    const rawItem = pick(idx.item)
    const coach = pick(idx.coach)
    const rawBranch = `${pick(idx.branchA)} ${pick(idx.branchB)}`.trim()
    return {
      id: `import-${Date.now()}-${rowIndex}`,
      rowNumber: rowIndex + 2,
      name,
      phone,
      date,
      coach,
      rawItem,
      rawBranch,
      referrer: pick(idx.referrer),
      packageKey: detectPackage(rawItem),
      branch: detectBranch(rawBranch),
      payee: '',
      selected: true,
      duplicate: 'none',
      duplicateMessage: '',
      matchedClient: null,
      isNewCustomer: false
    }
  }).filter(row => row.date && (row.name || row.phone))
}

function getClientMatcher(clients = []) {
  const byPhone = new Map()
  const byName = new Map()
  for (const client of clients) {
    const phone = normalizePhone(client.phone)
    const name = normalizeName(client.name)
    if (phone) byPhone.set(phone, client)
    if (name && !byName.has(name)) byName.set(name, client)
  }
  return row => {
    if (row.phone && byPhone.has(row.phone)) return byPhone.get(row.phone)
    const name = normalizeName(row.name)
    return name ? byName.get(name) || null : null
  }
}

const rowIdentityKey = row => {
  if (row.matchedClient?.id) return `id:${row.matchedClient.id}`
  if (row.phone) return `phone:${row.phone}`
  return `name:${normalizeName(row.name)}`
}

const txnIdentityMatches = (txn, row) => {
  if (row.matchedClient?.id && txn.client_id) return txn.client_id === row.matchedClient.id
  return normalizeName(txn.client_name) === normalizeName(row.name)
}

const sameDate = (txn, row) => String(txn.created_at || '').slice(0, 10) === row.date

function exactPackageMatch(txn, packageKey) {
  const pkg = PACKAGE_OPTIONS[packageKey]
  if (!pkg) return false
  const note = normalizeText(txn.note)
  const label = normalizeText(pkg.label)
  return note.includes(label) || normalizeText(txn.product_name) === label
}

export function installPurchaseImportV2(store) {
  let currentRows = []
  let existingTxns = []
  let authUser = null
  let observer = null
  let unsubscribe = null

  const getPayees = () => configuredPayees(store)

  const ensureButton = () => {
    if (store.view !== 'clients') return
    if (document.getElementById(IMPORT_BUTTON_ID)) return
    const csvInput = document.querySelector('#csvFileInput')
    const toolbar = csvInput?.parentElement
    if (!toolbar) return
    const btn = document.createElement('button')
    btn.id = IMPORT_BUTTON_ID
    btn.type = 'button'
    btn.className = 'btn-outline purchase-import-launcher'
    btn.textContent = '🧾 快速匯入購買紀錄'
    btn.addEventListener('click', openModal)
    toolbar.insertBefore(btn, csvInput)
  }

  const closeModal = () => document.getElementById(MODAL_ID)?.remove()

  const openModal = () => {
    closeModal()
    currentRows = []
    existingTxns = []
    const root = document.createElement('div')
    root.id = MODAL_ID
    root.className = 'purchase-import-overlay'
    root.innerHTML = `
      <div class="purchase-import-panel" role="dialog" aria-modal="true" aria-label="快速匯入購買紀錄">
        <div class="purchase-import-head">
          <div><strong>🧾 快速匯入購買紀錄</strong><small>Excel 直接複製整個表格貼上最快；金額欄會忽略。</small></div>
          <button type="button" class="purchase-import-close" aria-label="關閉">×</button>
        </div>
        <div class="purchase-import-body">
          <div id="purchase-import-input-step">
            <div class="purchase-import-tip">系統會讀取客戶、電話、銷售日期、教練、項目、店別；收款人會按「設定 → 收款人名單」自動辨識，辨識不到時可在下一步選擇或手動輸入。</div>
            <textarea id="purchase-import-text" class="purchase-import-textarea" placeholder="在 Excel 選取包含標題的一整段資料 → 複製 → 在這裡貼上"></textarea>
            <div class="purchase-import-actions">
              <label class="purchase-import-file-btn">讀取 CSV / TSV<input id="purchase-import-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" hidden></label>
              <button type="button" class="purchase-import-primary" id="purchase-import-analyze">分析及檢查重複</button>
            </div>
          </div>
          <div id="purchase-import-review-step" hidden></div>
        </div>
      </div>`
    document.body.appendChild(root)
    root.querySelector('.purchase-import-close').addEventListener('click', closeModal)
    root.addEventListener('click', e => { if (e.target === root) closeModal() })
    root.querySelector('#purchase-import-analyze').addEventListener('click', analyzeInput)
    root.querySelector('#purchase-import-file').addEventListener('change', async e => {
      const file = e.target.files?.[0]
      if (file) root.querySelector('#purchase-import-text').value = await file.text()
    })
  }

  async function analyzeInput() {
    const root = document.getElementById(MODAL_ID)
    if (!root) return
    const button = root.querySelector('#purchase-import-analyze')
    const rows = rowsFromGrid(parseGrid(root.querySelector('#purchase-import-text')?.value || ''))
    if (!rows.length) return alert('讀不到可匯入資料。請連同 Excel 標題列一起複製；至少要有「銷售日期」及「客戶名稱／行動電話」。')

    button.disabled = true
    button.textContent = '正在比對客戶及重複紀錄…'
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('無法取得登入帳號')
      authUser = user

      const payees = getPayees()
      const matchClient = getClientMatcher(store.clients)
      rows.forEach(row => {
        row.matchedClient = matchClient(row)
        row.branch = detectBranch(row.rawBranch, row.matchedClient?.branch || '觀塘')
        row.payee = detectPayee(row.coach, payees)
      })

      const maxDate = rows.reduce((max, r) => !max || r.date > max ? r.date : max, '')
      const { data: txns, error } = await supabase.from('transactions')
        .select('id,client_id,client_name,category,note,product_name,created_at,type')
        .eq('owner_email', user.email)
        .lte('created_at', `${maxDate}T23:59:59+08:00`)
        .order('created_at', { ascending: true })
        .limit(5000)
      if (error) throw error
      existingTxns = txns || []
      currentRows = rows
      reclassifyRows()
      renderReview()
    } catch (err) {
      console.error('Purchase import analysis failed:', err)
      alert('分析失敗：' + (err?.message || '未知錯誤'))
    } finally {
      button.disabled = false
      button.textContent = '分析及檢查重複'
    }
  }

  function reclassifyRows() {
    const ordered = [...currentRows].sort((a, b) => a.date.localeCompare(b.date) || a.rowNumber - b.rowNumber)
    const seenFilePurchase = new Set()
    const seenExactFile = new Set()

    for (const row of ordered) {
      const identity = rowIdentityKey(row)
      const pkg = PACKAGE_OPTIONS[row.packageKey]
      const realPurchase = isRealPackagePurchase(row)
      const priorDbPurchase = realPurchase && existingTxns.some(txn => {
        if (!txnIdentityMatches(txn, row)) return false
        const date = String(txn.created_at || '').slice(0, 10)
        return date < row.date && txn.type === 'income' && ['運動套票', '運動'].includes(txn.category)
      })
      row.isNewCustomer = realPurchase && !priorDbPurchase && !seenFilePurchase.has(identity)
      if (realPurchase) seenFilePurchase.add(identity)

      row.duplicate = 'none'
      row.duplicateMessage = ''
      if (pkg) {
        const sameDay = existingTxns.filter(txn => txnIdentityMatches(txn, row) && sameDate(txn, row) && txn.category === pkg.category)
        if (sameDay.some(txn => exactPackageMatch(txn, row.packageKey))) {
          row.duplicate = 'exact'
          row.duplicateMessage = '資料庫已有同客戶、同日期、同項目'
        } else if (sameDay.length) {
          row.duplicate = 'possible'
          row.duplicateMessage = '資料庫已有同客戶、同日期、同類型紀錄'
        }
        const fileKey = `${identity}|${row.date}|${row.packageKey}`
        if (seenExactFile.has(fileKey)) {
          row.duplicate = 'exact'
          row.duplicateMessage = '今次匯入檔內出現重複紀錄'
        }
        seenExactFile.add(fileKey)
      }
      row.selected = row.duplicate === 'none'
    }
  }

  const packageOptionsHtml = (selected = '') => '<option value="">請選擇項目</option>' + Object.entries(PACKAGE_OPTIONS)
    .map(([key, pkg]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${esc(pkg.label)}</option>`).join('')

  const payeeDatalistHtml = () => getPayees().map(name => `<option value="${esc(name)}"></option>`).join('')

  function renderReview() {
    const root = document.getElementById(MODAL_ID)
    if (!root) return
    const inputStep = root.querySelector('#purchase-import-input-step')
    const review = root.querySelector('#purchase-import-review-step')
    inputStep.hidden = true
    review.hidden = false

    const duplicates = currentRows.filter(r => r.duplicate !== 'none').length
    const interns = currentRows.filter(r => isInternCoach(r.coach)).length
    const newClients = currentRows.filter(r => r.isNewCustomer).length

    review.innerHTML = `
      <datalist id="purchase-import-payees">${payeeDatalistHtml()}</datalist>
      <div class="purchase-import-summary">
        <span>共 <b>${currentRows.length}</b> 筆</span>
        <span class="ok">新客／首次購買 <b>${newClients}</b></span>
        <span class="warn">疑似重複 <b>${duplicates}</b></span>
        <span class="intern">實習教練30% <b>${interns}</b></span>
      </div>
      <div class="purchase-import-bulk">
        <label>全部設定項目</label>
        <select id="purchase-import-bulk-package">${packageOptionsHtml('')}</select>
        <label>收款人</label>
        <input id="purchase-import-bulk-payee" class="purchase-import-payee-input" list="purchase-import-payees" placeholder="選擇或手動輸入">
        <button type="button" class="purchase-import-secondary" id="purchase-import-apply-payee">一鍵套用全部</button>
        <span>來源預設「廣告」；套票有效期＝購買日期 + 1 年。</span>
      </div>
      <div class="purchase-import-list">${currentRows.map(row => renderRow(row)).join('')}</div>
      <div class="purchase-import-footer">
        <button type="button" class="purchase-import-secondary" id="purchase-import-back">返回修改</button>
        <div class="purchase-import-footer-right">
          <span id="purchase-import-selection-count"></span>
          <button type="button" class="purchase-import-primary" id="purchase-import-confirm">確認匯入已勾選紀錄</button>
        </div>
      </div>`

    review.querySelector('#purchase-import-back').addEventListener('click', () => {
      review.hidden = true
      inputStep.hidden = false
    })
    review.querySelector('#purchase-import-bulk-package').addEventListener('change', e => {
      if (!e.target.value) return
      currentRows.forEach(row => { row.packageKey = e.target.value })
      reclassifyRows()
      renderReview()
    })
    review.querySelector('#purchase-import-apply-payee').addEventListener('click', () => {
      const value = String(review.querySelector('#purchase-import-bulk-payee')?.value || '').trim()
      if (!value) return alert('請先選擇或輸入收款人名稱。')
      currentRows.forEach(row => { row.payee = value })
      renderReview()
    })
    review.querySelectorAll('[data-import-select]').forEach(input => input.addEventListener('change', e => {
      const row = currentRows.find(r => r.id === e.target.dataset.importSelect)
      if (row) row.selected = e.target.checked
      updateSelectionCount()
    }))
    review.querySelectorAll('[data-import-package]').forEach(select => select.addEventListener('change', e => {
      const row = currentRows.find(r => r.id === e.target.dataset.importPackage)
      if (!row) return
      row.packageKey = e.target.value
      reclassifyRows()
      renderReview()
    }))
    review.querySelectorAll('[data-import-payee]').forEach(input => input.addEventListener('input', e => {
      const row = currentRows.find(r => r.id === e.target.dataset.importPayee)
      if (row) row.payee = e.target.value.trim()
      updateSelectionCount()
    }))
    review.querySelector('#purchase-import-confirm').addEventListener('click', commitImport)
    updateSelectionCount()
  }

  function renderRow(row) {
    const calc = row.packageKey ? packageCalc(row.packageKey, isInternCoach(row.coach)) : null
    const duplicateClass = row.duplicate === 'exact' ? 'dup-exact' : row.duplicate === 'possible' ? 'dup-possible' : ''
    const duplicateBadge = row.duplicate === 'exact'
      ? '<span class="purchase-import-badge danger">重複</span>'
      : row.duplicate === 'possible'
        ? '<span class="purchase-import-badge warn">疑似重複</span>'
        : '<span class="purchase-import-badge ok">可匯入</span>'
    const clientBadge = row.matchedClient
      ? (row.isNewCustomer ? '<span class="purchase-import-badge new">首次購買・當新客</span>' : '<span class="purchase-import-badge muted">已配對客戶</span>')
      : '<span class="purchase-import-badge new">會建立新客戶</span>'
    const internBadge = isInternCoach(row.coach) ? '<span class="purchase-import-badge intern">實習教練・利潤30%</span>' : ''
    const payeeBadge = row.payee ? `<span class="purchase-import-badge ok">收款：${esc(row.payee)}</span>` : '<span class="purchase-import-badge warn">未識別收款人</span>'
    const profitText = calc ? `系統項目：$${calc.price}｜利潤：$${calc.profit}` : '請先選擇項目'
    const expiryText = isRealPackagePurchase(row) ? `有效期：${addOneYear(row.date)}` : ''

    return `
      <div class="purchase-import-row ${duplicateClass}">
        <div class="purchase-import-check"><input type="checkbox" data-import-select="${row.id}" ${row.selected ? 'checked' : ''}></div>
        <div class="purchase-import-person">
          <b>${esc(row.name || '未填姓名')}</b>
          <small>${esc(row.phone || '無電話')} · ${esc(row.date)} · ${esc(row.branch)}</small>
          <div class="purchase-import-badges">${duplicateBadge}${clientBadge}${internBadge}${payeeBadge}</div>
          ${row.duplicateMessage ? `<em>${esc(row.duplicateMessage)}，預設不勾選；你可人工重新勾選。</em>` : ''}
        </div>
        <div class="purchase-import-source">
          <small>Excel 項目</small><b>${esc(row.rawItem || '—')}</b>
          <small>教練：${esc(row.coach || '—')}</small>
        </div>
        <div class="purchase-import-item">
          <select data-import-package="${row.id}">${packageOptionsHtml(row.packageKey)}</select>
          <input class="purchase-import-payee-input" data-import-payee="${row.id}" list="purchase-import-payees" value="${esc(row.payee)}" placeholder="收款人：選擇或手動輸入">
          <small>${esc(profitText)}${expiryText ? `｜${esc(expiryText)}` : ''}</small>
        </div>
      </div>`
  }

  function updateSelectionCount() {
    const root = document.getElementById(MODAL_ID)
    const target = root?.querySelector('#purchase-import-selection-count')
    if (!target) return
    const selected = currentRows.filter(r => r.selected)
    const noPackage = selected.filter(r => !r.packageKey).length
    const noPayee = selected.filter(r => !String(r.payee || '').trim()).length
    target.textContent = `已選 ${selected.length} 筆${noPackage ? ` · ${noPackage} 筆未選項目` : ''}${noPayee ? ` · ${noPayee} 筆未填收款人` : ''}`
    const confirm = root.querySelector('#purchase-import-confirm')
    if (confirm) confirm.disabled = selected.length === 0 || noPackage > 0 || noPayee > 0
  }

  async function commitImport() {
    const selectedRows = currentRows.filter(r => r.selected)
    if (!selectedRows.length) return
    if (selectedRows.some(r => !r.packageKey)) return alert('仍有已勾選紀錄未選擇項目。')
    if (selectedRows.some(r => !String(r.payee || '').trim())) return alert('仍有已勾選紀錄未填收款人。')
    const duplicateSelected = selectedRows.filter(r => r.duplicate !== 'none').length
    if (duplicateSelected > 0 && !confirm(`你重新勾選了 ${duplicateSelected} 筆疑似重複紀錄。\n\n仍然要匯入嗎？`)) return

    const root = document.getElementById(MODAL_ID)
    const confirmBtn = root?.querySelector('#purchase-import-confirm')
    if (confirmBtn) {
      confirmBtn.disabled = true
      confirmBtn.textContent = '正在匯入…'
    }

    const createdClients = new Map()
    const packageIncrements = new Map()
    const earliestDates = new Map()
    const expiryDates = new Map()
    let inserted = 0
    let newClientCount = 0
    const errors = []

    try {
      if (!authUser?.email) {
        const { data: { user } } = await supabase.auth.getUser()
        authUser = user
      }
      if (!authUser?.email) throw new Error('登入資料已失效，請重新登入')

      const matchClient = getClientMatcher(store.clients)
      const ordered = [...selectedRows].sort((a, b) => a.date.localeCompare(b.date) || a.rowNumber - b.rowNumber)

      for (const row of ordered) {
        const virtualKey = row.phone ? `phone:${row.phone}` : `name:${normalizeName(row.name)}`
        let client = row.matchedClient || createdClients.get(virtualKey) || matchClient(row)
        const rowExpiry = isRealPackagePurchase(row) ? addOneYear(row.date) : ''

        if (!client) {
          const payload = {
            name: row.name || row.phone || '未命名客戶',
            phone: row.phone || null,
            branch: row.branch || '觀塘',
            source: '廣告',
            status: 'active',
            join_date: row.date,
            expiry_date: rowExpiry || null,
            handled_by: row.payee,
            owner_email: authUser.email,
            own_email: authUser.email,
            user_id: authUser.id
          }
          const { data, error } = await supabase.from('clients').insert([payload]).select().single()
          if (error) {
            errors.push(`第${row.rowNumber}行 ${row.name || row.phone}：建立客戶失敗 ${error.message}`)
            continue
          }
          client = data
          createdClients.set(virtualKey, client)
          row.matchedClient = client
          newClientCount++
        }

        const calc = packageCalc(row.packageKey, isInternCoach(row.coach))
        if (!calc) {
          errors.push(`第${row.rowNumber}行 ${row.name || row.phone}：未選項目`)
          continue
        }

        const duplicateNote = row.duplicate !== 'none' ? ' (重複覆核後匯入)' : ''
        const newNote = row.isNewCustomer ? ' (新客/首次購買)' : ''
        const internNote = isInternCoach(row.coach) ? ' (實習教練利潤30%)' : ''
        const sourceNote = row.rawItem ? `｜Excel:${String(row.rawItem).slice(0, 60)}` : ''
        const txnPayload = {
          type: calc.type,
          category: calc.category,
          amount: calc.amount,
          cost: calc.cost,
          profit: calc.profit,
          branch: row.branch || client.branch || '觀塘',
          client_id: client.id,
          client_name: client.name || row.name,
          staff: row.payee,
          handled_by: row.payee,
          created_at: `${row.date}T12:00:00+08:00`,
          owner_email: authUser.email,
          own_email: authUser.email,
          user_id: authUser.id,
          is_new_client: Boolean(row.isNewCustomer),
          is_renewal: !row.isNewCustomer,
          is_trial: row.packageKey === 'trial',
          note: `[批量匯入] 售出 ${calc.label}${newNote}${internNote}${duplicateNote}${sourceNote}`
        }
        const { error: txnError } = await supabase.from('transactions').insert([txnPayload])
        if (txnError) {
          errors.push(`第${row.rowNumber}行 ${client.name}：交易匯入失敗 ${txnError.message}`)
          continue
        }
        inserted++

        const noPackageCount = ['trial', 'referral_free', 'pkg_1_free', 'redeem_50', 'redeem_100']
        if (!noPackageCount.includes(row.packageKey)) {
          packageIncrements.set(client.id, (packageIncrements.get(client.id) || 0) + 1)
        }
        const knownEarliest = earliestDates.get(client.id) || client.join_date || ''
        if (!knownEarliest || row.date < knownEarliest) earliestDates.set(client.id, row.date)
        if (rowExpiry) {
          const knownExpiry = expiryDates.get(client.id) || ''
          if (!knownExpiry || rowExpiry > knownExpiry) expiryDates.set(client.id, rowExpiry)
        }
      }

      const clientById = new Map([...store.clients, ...createdClients.values()].map(c => [c.id, c]))
      const ids = new Set([...earliestDates.keys(), ...expiryDates.keys(), ...packageIncrements.keys()])
      for (const clientId of ids) {
        const client = clientById.get(clientId)
        if (!client) continue
        const update = { status: 'active' }
        const earliest = earliestDates.get(clientId)
        if (earliest) update.join_date = earliest
        if (!client.source) update.source = '廣告'
        const nextExpiry = expiryDates.get(clientId)
        const currentExpiry = String(client.expiry_date || '').slice(0, 10)
        if (nextExpiry && (!currentExpiry || nextExpiry > currentExpiry)) update.expiry_date = nextExpiry
        const increment = packageIncrements.get(clientId) || 0
        if (increment > 0) update.pkg_count = Number(client.pkg_count || 0) + increment
        const { error } = await supabase.from('clients').update(update).eq('id', clientId)
        if (error) errors.push(`${client.name || clientId}：客戶資料更新失敗 ${error.message}`)
      }

      await store.syncAll()
      closeModal()
      const errorText = errors.length ? `\n\n⚠️ ${errors.length} 個問題：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n…' : ''}` : ''
      alert(`✅ 匯入完成！\n\n成功購買紀錄：${inserted} 筆\n建立新客戶：${newClientCount} 位${errorText}`)
    } catch (err) {
      console.error('Purchase import failed:', err)
      alert('匯入失敗：' + (err?.message || '未知錯誤'))
      if (confirmBtn) {
        confirmBtn.disabled = false
        confirmBtn.textContent = '確認匯入已勾選紀錄'
      }
    }
  }

  observer = new MutationObserver(ensureButton)
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true })
  unsubscribe = store.$subscribe(ensureButton)
  ensureButton()

  return () => {
    observer?.disconnect()
    unsubscribe?.()
    closeModal()
    document.getElementById(IMPORT_BUTTON_ID)?.remove()
  }
}
