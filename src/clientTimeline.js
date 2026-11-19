import { hkDay } from './reportMath.js'

const cleanName = value => String(value || '').trim().replace(/\s+/g, '').toLocaleLowerCase('zh-HK')
const outcomeNames = {
  opened_small: '已出席 · 開 10 點卡',
  opened_big: '已出席 · 開 35 點卡',
  no_open_normal: '已出席 · 未開卡',
  no_open_mygift: 'MyGift 試堂 · 未開卡',
  no_show: '未有出席'
}

export function clientTransactionMatchKind(client, row, clients = []) {
  if (!client?.id || !row) return ''
  if (row.client_id !== null && row.client_id !== undefined && row.client_id !== '') {
    return String(row.client_id) === String(client.id) ? 'linked' : ''
  }
  const name = cleanName(client.name)
  if (!name || cleanName(row.client_name) !== name) return ''
  return clients.filter(other => cleanName(other.name) === name).length === 1 ? 'possible' : ''
}

export function groupClientTransactions(clients = [], transactions = []) {
  const groups = new Map()
  const names = new Map()
  for (const client of clients) {
    if (!client?.id) continue
    groups.set(String(client.id), { linked: [], possible: [] })
    const name = cleanName(client.name)
    if (name) names.set(name, [...(names.get(name) || []), String(client.id)])
  }
  for (const row of transactions) {
    if (row.client_id !== null && row.client_id !== undefined && row.client_id !== '') {
      groups.get(String(row.client_id))?.linked.push(row)
      continue
    }
    const ids = names.get(cleanName(row.client_name)) || []
    if (ids.length === 1) groups.get(ids[0])?.possible.push(row)
  }
  return groups
}

export function buildClientTimeline(client, transactions = [], clients = []) {
  if (!client?.id) return { confirmed: [], possible: [] }
  const confirmed = []
  const possible = []
  const trialDay = hkDay(client.trial_date)
  if (client.join_date && hkDay(client.join_date)) confirmed.push({
    key: 'joined', day: hkDay(client.join_date), title: '加入日期', detail: '客戶檔案所記錄', source: 'BZ 客戶檔案'
  })
  if (trialDay) confirmed.push({
    key: 'trial', day: trialDay, title: '試堂預約', detail: String(client.trial_date).slice(11, 16), source: 'BZ 客戶檔案'
  })
  const result = [...String(client.remark || '').matchAll(/\[TRIAL_RESULT\]\|([^|\n]+)\|([^|\n]+)/g)].at(-1)
  if (result) confirmed.push({
    key: 'trial-result', day: hkDay(result[1]) || trialDay,
    title: '試堂結果', detail: outcomeNames[result[2]] || '已記錄，內容待核對', source: 'BZ 客戶結果'
  })

  for (const row of transactions) {
    const match = clientTransactionMatchKind(client, row, clients)
    if (!match) continue
    const linked = match === 'linked'
    const event = {
      key: `txn:${row.id}`, day: hkDay(row.created_at),
      title: row.is_renewal ? '續卡' : row.is_new_client ? '首次開卡' : row.category || '收支紀錄',
      detail: `${row.type === 'expense' ? '支出' : '收入'} HK$${Number(row.amount || 0).toLocaleString('en-HK')} · ${row.category || '未分類'}`,
      source: linked ? 'BZ 已連結帳目' : '同名帳目，未核對',
      imported: String(row.note || '').includes('[BZ_BACKFILL:CSV]')
    }
    ;(linked ? confirmed : possible).push(event)
  }
  const newestFirst = (a, b) => String(b.day).localeCompare(String(a.day)) || String(b.key).localeCompare(String(a.key))
  confirmed.sort(newestFirst)
  possible.sort(newestFirst)
  return { confirmed, possible }
}
