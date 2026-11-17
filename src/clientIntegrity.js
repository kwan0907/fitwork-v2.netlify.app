import { cleanName, cleanPhone } from './monitorReconcile.js'

export function findPotentialDuplicateClient(candidate, existingClients) {
  const name = cleanName(candidate?.name)
  const phone = cleanPhone(candidate?.phone)
  const rows = existingClients || []
  if (phone && name) {
    const exact = rows.find(client => cleanPhone(client.phone) === phone && cleanName(client.name) === name)
    if (exact) return { kind: 'exact', client: exact }
  }
  if (phone) {
    const sharedPhone = rows.find(client => cleanPhone(client.phone) === phone)
    if (sharedPhone) return { kind: 'shared_phone', client: sharedPhone }
  }
  if (name) {
    const sharedName = rows.find(client => cleanName(client.name) === name)
    if (sharedName) return { kind: 'shared_name', client: sharedName }
  }
  return null
}

function validDate(value) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null
}

// A renewal cannot establish when an existing customer first joined.
export function firstOpeningJoinDate(client, flow, outcome, paymentDate) {
  if (flow !== 'trial' || !String(outcome || '').startsWith('opened_') || client?.join_date) return null
  const paid = validDate(paymentDate)
  if (!paid) return null
  const trial = validDate(client?.trial_date)
  return trial && trial <= paid ? trial : paid
}

export function quickSaleFlags(flow, outcome) {
  return {
    is_new_client: flow === 'trial' && String(outcome || '').startsWith('opened_'),
    is_renewal: flow === 'renewal'
  }
}

export const EDITABLE_CLIENT_FIELDS = [
  'name', 'phone', 'branch', 'source', 'referred_by_id', 'trial_date',
  'join_date', 'expiry_date', 'status', 'remark', 'is_marathon', 'is_vip', 'vip_tier'
]

export function changedClientFields(original, draft) {
  return Object.fromEntries(EDITABLE_CLIENT_FIELDS
    .filter(field => (draft[field] ?? null) !== (original[field] ?? null))
    .map(field => [field, draft[field] ?? null]))
}

export function conflictingClientFields(original, latest, patch) {
  return Object.keys(patch).filter(field => (latest[field] ?? null) !== (original[field] ?? null))
}
