import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanPhone, normalizeMonitorRows, reconcileMonitorClients, safeMissingClientPayload } from '../src/monitorReconcile.js'
import { verifiedConversionDate, classifyPackageSale } from '../src/clientHistory.js'

test('normalizes Hong Kong phone and source points without turning blanks into zero', () => {
  assert.equal(cleanPhone('+852 9123 4567'), '91234567')
  assert.equal(cleanPhone('1234'), '')
  const rows = normalizeMonitorRows([{ branch: '觀塘', customers: [
    { memberId: 'M1', name: '陳小姐', phone: '+852 9123 4567', remainingPoints: 0, validUntil: '2026/12/1' },
    { memberId: 'M2', name: '李先生', phone: '63456789', remainingPoints: null }
  ] }])
  assert.equal(rows[0].remainingPoints, 0)
  assert.equal(rows[0].validUntil, '2026-12-01')
  assert.equal(rows[1].remainingPoints, null)
})

test('only exact unique phone and name are matched automatically', () => {
  const source = normalizeMonitorRows([{ branch: '觀塘', customers: [
    { memberId: 'M1', name: '陳 小姐', phone: '91234567', remainingPoints: 3 },
    { memberId: 'M2', name: '李先生', phone: '63456789' },
    { memberId: 'M3', name: '王小姐', phone: '69998888' }
  ] }])
  const result = reconcileMonitorClients(source, [
    { id: 'a', name: '陳小姐', phone: '+852 9123 4567' },
    { id: 'b', name: '李生', phone: '63456789' }
  ])
  assert.deepEqual(result.map(row => row.kind), ['matched', 'review', 'missing'])
  assert.equal(result[0].client.id, 'a')
})

test('duplicate phones and name-only candidates stay in manual review', () => {
  const source = normalizeMonitorRows([{ branch: '中環', customers: [
    { memberId: 'M1', name: '黃先生', phone: '91234567' },
    { memberId: 'M2', name: '張先生', phone: '91234567' },
    { memberId: 'M3', name: '林小姐', phone: '61112222' }
  ] }])
  const result = reconcileMonitorClients(source, [{ id: 'x', name: '林小姐', phone: '' }])
  assert.deepEqual(result.map(row => row.kind), ['review', 'review', 'review'])
})

test('missing client payload leaves original joining date unknown', () => {
  const row = { kind: 'missing', name: '舊卡友', phone: '91234567', branch: '佐敦', memberId: 'M1', validUntil: '2026-12-01' }
  const payload = safeMissingClientPayload(row, { id: 'u1', email: 'owner@example.com' })
  assert.equal(payload.join_date, null)
  assert.equal(payload.expiry_date, '2026-12-01')
  assert.equal(safeMissingClientPayload({ ...row, kind: 'review' }, { id: 'u1', email: 'owner@example.com' }), null)
})

test('historical class before first recorded purchase prevents false new customer date', () => {
  assert.equal(verifiedConversionDate({ remark: '' }, '2026-11-15T12:00:00', '2024-04-19'), null)
  assert.equal(verifiedConversionDate({ remark: '' }, '2026-11-15T12:00:00', null), '2026-11-15T12:00:00')
  assert.equal(verifiedConversionDate({ remark: '', join_date: '2026-11-15' }, null), null)
  assert.equal(classifyPackageSale({}), 'unknown')
  assert.equal(classifyPackageSale({ is_new_client: true }), 'new')
})
