import { hkDay } from './reportMath.js'

const TARGET_PROFIT = { normal: 44.6, mygift: -53.4 }
const round = value => Math.round(value * 100) / 100

export function trialAdjustmentProfit(client, kind, paidRows = []) {
  const target = TARGET_PROFIT[kind]
  if (target === undefined) throw new Error('試堂結果類型不正確。')
  const trialDay = hkDay(client?.trial_date)
  const name = String(client?.name || '').trim().toLowerCase()
  const ambiguousBranch = paidRows.some(row => {
    const paidDay = hkDay(row.created_at)
    const days = (Date.parse(`${trialDay}T00:00:00Z`) - Date.parse(`${paidDay}T00:00:00Z`)) / 86400000
    return !row.client_id && name && String(row.client_name || '').trim().toLowerCase() === name &&
      Number.isFinite(days) && days >= 0 && days <= 60 && row.branch && client?.branch && row.branch !== client.branch
  })
  if (ambiguousBranch) throw new Error('同名收費試堂喺另一分店，請先核對係咪同一人。')
  const matched = paidRows.filter(row => {
    const sameId = client?.id && row.client_id && String(client.id) === String(row.client_id)
    const unlinkedName = !row.client_id && name && String(row.client_name || '').trim().toLowerCase() === name &&
      (!row.branch || !client?.branch || row.branch === client.branch)
    const paidDay = hkDay(row.created_at)
    const days = (Date.parse(`${trialDay}T00:00:00Z`) - Date.parse(`${paidDay}T00:00:00Z`)) / 86400000
    return (sameId || unlinkedName) && Number.isFinite(days) && days >= 0 && days <= (sameId ? 180 : 60)
  })
  if (matched.length > 1) throw new Error('找到多筆可能相同嘅收費試堂，請先到帳目核對，未有再寫入利潤。')
  if (!matched.length) return target
  const paid = matched[0]
  const amount = Number(paid.amount)
  const cost = Number(paid.cost)
  const profit = Number(paid.profit)
  if (paid.amount == null || paid.cost == null || paid.profit == null ||
    ![amount, cost, profit].every(Number.isFinite) || Math.abs(profit - (amount - cost)) > 0.01) {
    throw new Error('原有收費試堂嘅利潤或成本未核對，未有再寫入調整。')
  }
  return round(target - profit)
}

export function trialAdjustmentRecord(client, profit, note, user, now = new Date()) {
  if (!user?.id || !user?.email) throw new Error('登入已失效，未能記錄試堂帳目。')
  return {
    user_id: user.id,
    owner_email: user.email,
    own_email: user.email,
    type: 'income', category: '試堂調整', amount: 0, cost: 0, profit, note,
    client_id: client?.id || null, client_name: client?.name || '', branch: client?.branch || '',
    created_at: client?.trial_date || now.toISOString()
  }
}
