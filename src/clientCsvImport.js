import { parseGrid, normalizeHistoryDate } from './historyImport.js'
import { cleanName, cleanPhone, MONITOR_BRANCHES } from './monitorReconcile.js'

export function parseClientCsv(text) {
  const grid = parseGrid(text)
  if (!grid.length) throw new Error('CSV 冇資料。')
  const header = grid[0].map(value => cleanName(value))
  const aliases = [
    ['姓名(必填)', '姓名', 'name'], ['電話', '手機', 'phone'], ['分店(觀塘/中環/佐敦)', '分店', 'branch'],
    ['狀態(active/prospect/absent)', '狀態', 'status'], ['加入日期(yyyy-mm-dd)', '加入日期', 'join_date'],
    ['來源(廣告/傳單/朋友介紹等)', '來源', 'source'], ['到期日(yyyy-mm-dd)', '到期日', 'expiry_date'], ['備註', 'remark']
  ]
  const index = aliases.map(group => header.findIndex(value => group.some(alias => cleanName(alias) === value)))
  if (index[0] < 0 || index[1] < 0) throw new Error('CSV 第一行要有「姓名」及「電話」欄。')
  const rows = [], skipped = []
  grid.slice(1).forEach((cells, offset) => {
    const pick = i => index[i] < 0 ? '' : String(cells[index[i]] || '').trim()
    const line = offset + 2
    const name = pick(0), phone = cleanPhone(pick(1))
    const branch = pick(2) || '觀塘'
    const status = pick(3) || 'active'
    const joinDate = pick(4) ? normalizeHistoryDate(pick(4)) : null
    const expiryDate = pick(6) ? normalizeHistoryDate(pick(6)) : null
    if (!name || !phone) skipped.push({ line, reason: '缺少姓名或有效香港電話' })
    else if (!MONITOR_BRANCHES.includes(branch)) skipped.push({ line, reason: '分店只可填觀塘、中環、佐敦' })
    else if (!['active', 'prospect', 'absent'].includes(status)) skipped.push({ line, reason: '狀態唔正確' })
    else if ((pick(4) && !joinDate) || (pick(6) && !expiryDate)) skipped.push({ line, reason: '日期格式唔正確' })
    else rows.push({ line, name, phone, branch, status, join_date: joinDate, source: pick(5) || null, expiry_date: expiryDate, remark: pick(7) || null })
  })
  return { rows, skipped }
}

export function classifyClientCsv(rows, existing) {
  const phones = new Set((existing || []).map(client => cleanPhone(client.phone)).filter(Boolean))
  const names = new Set((existing || []).map(client => cleanName(client.name)).filter(Boolean))
  const addedPhones = new Set(), addedNames = new Set(), candidates = [], skipped = []
  for (const row of rows || []) {
    const name = cleanName(row.name)
    if (phones.has(row.phone) || addedPhones.has(row.phone)) skipped.push({ line: row.line, reason: '電話已存在或檔案內重複' })
    else if (names.has(name) || addedNames.has(name)) skipped.push({ line: row.line, reason: '姓名相同，先人工核對電話' })
    else { candidates.push(row); addedPhones.add(row.phone); addedNames.add(name) }
  }
  return { candidates, skipped }
}
