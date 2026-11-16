const headers = {
  date: ['日期', '交易日期', '收支日期', 'date'],
  time: ['時間', 'time'],
  type: ['收支', '類型', 'type'],
  category: ['分類', '類別', 'category'],
  amount: ['金額', 'amount'],
  cost: ['成本', 'cost'],
  client: ['客戶', '客戶名稱', '姓名', 'client'],
  branch: ['分店', '店別', 'branch'],
  staff: ['經手人', '處理人', '收款人', 'staff'],
  note: ['備註', '說明', 'note']
}
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')

function parseGrid(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  const delimiter = source.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ','
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(cell)
      if (row.some(value => String(value).trim())) rows.push(row)
      row = []; cell = ''
    } else cell += char
  }
  if (quoted) throw new Error('有儲存格嘅引號未關閉，請檢查 CSV 檔。')
  row.push(cell)
  if (row.some(value => String(value).trim())) rows.push(row)
  return rows
}

export function normalizeHistoryDate(value) {
  const raw = String(value ?? '').trim()
  const serial = Number(raw)
  if (/^\d{5}$/.test(raw) && serial >= 36526 && serial < 73050) {
    const day = new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
    return day.startsWith('20') ? day : ''
  }
  const match = raw.match(/^(20\d{2})(?:[\/-]|年)(\d{1,2})(?:[\/-]|月)(\d{1,2})(?:日)?$/)
  if (!match) return ''
  const day = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : ''
}

function normalizeTime(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '12:00'
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function positiveAmount(value, optional = false) {
  const raw = String(value ?? '').trim().replace(/(?:HKD|HK\$|\$|,|\s)/gi, '')
  if (!raw && optional) return 0
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null
  const amount = Number(raw)
  return Number.isFinite(amount) && (optional ? amount >= 0 : amount > 0) ? amount : null
}

function normalizeType(value) {
  const raw = normalize(value)
  if (['income', '收入', '收', '入'].includes(raw)) return 'income'
  if (['expense', '支出', '支', '出'].includes(raw)) return 'expense'
  return ''
}

function normalizeBranch(value, fallback) {
  const raw = normalize(value)
  if (!raw) return fallback
  if (raw.includes('觀塘') || raw === 'kwt') return '觀塘'
  if (raw.includes('中環') || raw === 'central') return '中環'
  if (raw.includes('佐敦') || raw === 'jordan') return '佐敦'
  return ''
}

export function parseHistoryImport(text, { branch = '觀塘', staff = '', today = new Date().toISOString().slice(0, 10) } = {}) {
  const grid = parseGrid(text)
  if (!grid.length) throw new Error('請先貼上 Excel 表格，或者揀 CSV 檔。')
  const title = grid[0].map(normalize)
  const index = Object.fromEntries(Object.entries(headers).map(([key, aliases]) =>
    [key, title.findIndex(value => aliases.some(alias => normalize(alias) === value))]))
  if (index.date < 0 || index.type < 0 || index.amount < 0) {
    throw new Error('第一行要有「日期、收支、金額」標題；可以先下載範本。')
  }
  if (grid.length > 5001) throw new Error('每次最多處理 5,000 筆；請按年份或月份分開貼上。')
  const rows = [], errors = []
  grid.slice(1).forEach((cells, offset) => {
    const pick = key => index[key] < 0 ? '' : String(cells[index[key]] ?? '').trim()
    const line = offset + 2
    const date = normalizeHistoryDate(pick('date'))
    const time = normalizeTime(pick('time'))
    const type = normalizeType(pick('type'))
    const amount = positiveAmount(pick('amount'))
    const cost = positiveAmount(pick('cost'), true)
    const rowBranch = normalizeBranch(pick('branch'), branch)
    let reason = ''
    if (!date) reason = '日期格式錯誤，請用 YYYY-MM-DD'
    else if (date > today) reason = '補錄日期唔可以係未來'
    else if (!time) reason = '時間格式錯誤，請用 HH:MM 或留空'
    else if (!type) reason = '收支只可填「收入」或「支出」'
    else if (amount === null) reason = '金額要係大過 0 嘅數字'
    else if (cost === null) reason = '成本要係 0 或正數，最多兩位小數'
    else if (!rowBranch) reason = '分店只可填觀塘、中環或佐敦'
    if (reason) { errors.push({ line, reason }); return }
    rows.push({
      id: `row-${line}`, line, date, time, type,
      category: pick('category') || (type === 'income' ? '其他收入' : '其他支出'),
      amount, cost, client_name: pick('client'), branch: rowBranch,
      staff: pick('staff') || staff, note: pick('note')
    })
  })
  return { rows, errors }
}

const hkStamp = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

function existingStamp(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = Object.fromEntries(hkStamp.formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function rowFields(row) {
  const stamp = row.date ? `${row.date}T${row.time}` : existingStamp(row.created_at)
  return {
    stamp, day: stamp.slice(0, 10), type: row.type,
    category: normalize(row.category), amount: Number(row.amount),
    client: normalize(row.client_name), branch: normalize(row.branch)
  }
}

function exactKey(row) {
  const f = rowFields(row)
  return [f.stamp, f.type, f.category, f.amount, f.client, f.branch].join('|')
}

function possibleKey(row) {
  const f = rowFields(row)
  return [f.day, f.type, f.amount, f.client].join('|')
}

export function classifyHistoryImport(rows, existing) {
  const exact = new Set((existing || []).map(exactKey))
  const possible = new Set((existing || []).map(possibleKey))
  const seen = new Set()
  const seenPossible = new Set()
  return rows.map(row => {
    const e = exactKey(row), p = possibleKey(row)
    const duplicate = seen.has(e) || exact.has(e) ? 'exact' : possible.has(p) || seenPossible.has(p) ? 'possible' : 'none'
    seen.add(e)
    seenPossible.add(p)
    return { ...row, duplicate, selected: row.selected ?? duplicate === 'none' }
  })
}

export function historyImportPayload(row, user, clients = []) {
  const names = clients.filter(client => normalize(client.name) === normalize(row.client_name))
  return {
    created_at: `${row.date}T${row.time}:00+08:00`,
    type: row.type, category: row.category, amount: row.amount,
    cost: row.cost, profit: row.type === 'income' ? row.amount - row.cost : -row.amount,
    client_name: row.client_name || null,
    client_id: names.length === 1 ? names[0].id : null,
    branch: row.branch, staff: row.staff || null, handled_by: row.staff || null,
    note: row.note || null, owner_email: user.email, own_email: user.email, user_id: user.id
  }
}
