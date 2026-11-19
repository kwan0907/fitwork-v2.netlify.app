import { hkDay } from './reportMath.js'

const round = value => Math.round((value + Number.EPSILON) * 100) / 100
const number = value => value === null || value === undefined || value === '' ? null : Number(value)
const name = value => String(value || '').trim().toLowerCase()

export function trialCorrectionTag(adjustmentId, paidId) {
  return `[TRIAL_CORRECTION:${adjustmentId}:${paidId}]`
}

export function candidatePaidTrials(adjustment, transactions = []) {
  if (adjustment?.type !== 'income' || adjustment?.category !== '試堂調整' ||
    !String(adjustment.note || '').includes('[TRIAL_PROFIT:')) return []
  const adjustmentDay = hkDay(adjustment.created_at)
  return transactions.filter(paid => {
    if (paid.type !== 'income' || paid.category !== '試堂' || !(Number(paid.amount) > 0)) return false
    const sameClient = adjustment.client_id && paid.client_id && String(adjustment.client_id) === String(paid.client_id)
    const unlinkedName = !paid.client_id && name(adjustment.client_name) &&
      name(adjustment.client_name) === name(paid.client_name)
    if (!sameClient && !unlinkedName) return false
    if (adjustment.branch && paid.branch && adjustment.branch !== paid.branch) return false
    const days = (Date.parse(`${adjustmentDay}T00:00:00Z`) - Date.parse(`${hkDay(paid.created_at)}T00:00:00Z`)) / 86400000
    return Number.isFinite(days) && days >= 0 && days <= (sameClient ? 180 : 60)
  })
}

export function planTrialCorrection(adjustment, paid, transactions = []) {
  const candidates = candidatePaidTrials(adjustment, transactions)
  if (candidates.length !== 1 || String(candidates[0].id) !== String(paid?.id)) {
    throw new Error('未能唯一配對收費試堂；請先人手核對帳目。')
  }
  const tag = trialCorrectionTag(adjustment.id, paid.id)
  if (transactions.some(row => row.category === '試堂利潤更正' && String(row.note || '').includes(tag))) {
    throw new Error('呢次試堂已有更正紀錄，毋須重複入帳。')
  }
  const paidAmount = number(paid.amount)
  const paidCost = number(paid.cost)
  const paidProfit = number(paid.profit)
  const adjustmentProfit = number(adjustment.profit)
  if ([paidAmount, paidCost, paidProfit, adjustmentProfit].some(value => value === null || !Number.isFinite(value)) ||
    Math.abs(paidAmount - paidCost - paidProfit) > 0.01) {
    throw new Error('收費或調整利潤資料未齊／未對數，暫停更正。')
  }
  const target = /MyGift/i.test(String(adjustment.note || '')) ? -53.4 : 44.6
  const correction = round(target - paidProfit - adjustmentProfit)
  if (Math.abs(correction) < 0.01) throw new Error('整次試堂利潤已經正確，毋須更正。')
  return { tag, target, paidProfit, adjustmentProfit, currentTotal: round(paidProfit + adjustmentProfit), correction }
}

export async function trialCorrectionRecord(adjustment, paid, plan, user, now = new Date()) {
  if (!user?.id || !user?.email) throw new Error('登入已失效，未能更正試堂帳目。')
  const source = new TextEncoder().encode(`BZ trial correction v1:${adjustment.id}:${paid.id}`)
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', source)).slice(0, 16)
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('')
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return {
    id, user_id: user.id, owner_email: user.email, own_email: user.email,
    type: 'income', category: '試堂利潤更正', amount: 0, cost: null, profit: plan.correction,
    client_id: adjustment.client_id || paid.client_id || null,
    client_name: adjustment.client_name || paid.client_name || '', branch: paid.branch || null,
    created_at: adjustment.created_at,
    note: `${plan.tag} 人手核對同一次試堂；目標總利潤 HK$${plan.target.toFixed(2)}；原帳 HK$${plan.currentTotal.toFixed(2)}；更正於 ${now.toISOString()}`
  }
}

export function sameTrialSource(left, right) {
  const fields = ['id', 'type', 'category', 'amount', 'cost', 'profit', 'client_id', 'client_name', 'branch', 'created_at', 'note']
  return Boolean(left && right && fields.every(field => String(left[field] ?? '') === String(right[field] ?? '')))
}
