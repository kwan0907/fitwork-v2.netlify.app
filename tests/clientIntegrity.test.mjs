import test from 'node:test'
import assert from 'node:assert/strict'
import { findPotentialDuplicateClient, firstOpeningJoinDate, quickSaleFlags, changedClientFields, conflictingClientFields } from '../src/clientIntegrity.js'

test('new customer check catches an old record despite phone spacing and name case', () => {
  const existing = [{ id: 'old', name: '  Chan  Tai Man ', phone: '+852 9123 4567' }]
  assert.deepEqual(findPotentialDuplicateClient({ name: 'chan tai man', phone: '91234567' }, existing),
    { kind: 'exact', client: existing[0] })
  assert.equal(findPotentialDuplicateClient({ name: 'New Person', phone: '62345678' }, existing), null)
})

test('shared phone or name requires review before creating another customer', () => {
  const existing = [{ id: 'one', name: '陳小姐', phone: '91234567' }]
  assert.equal(findPotentialDuplicateClient({ name: '另一人', phone: '9123 4567' }, existing)?.kind, 'shared_phone')
  assert.equal(findPotentialDuplicateClient({ name: '陳 小姐', phone: '62345678' }, existing)?.kind, 'shared_name')
  assert.equal(findPotentialDuplicateClient({ name: '陳小姐', phone: '' }, existing)?.kind, 'shared_name')
})

test('renewing a legacy customer never creates a false first-join date', () => {
  const legacy = { join_date: null, trial_date: '2025-11-18T10:00' }
  assert.equal(firstOpeningJoinDate(legacy, 'renewal', '', '2026-11-17'), null)
  assert.equal(firstOpeningJoinDate({ ...legacy, join_date: '2025-11-18' }, 'trial', 'opened_big', '2026-11-17'), null)
  assert.equal(firstOpeningJoinDate(legacy, 'trial', 'opened_big', '2026-11-17'), '2025-11-18')
  assert.equal(firstOpeningJoinDate({ join_date: null, trial_date: '2026-02-31' }, 'trial', 'opened_small', '2026-11-17'), '2026-11-17')
  assert.equal(firstOpeningJoinDate(legacy, 'trial', 'opened_big', '2026-02-31'), null)
})

test('quick package sale records explicit opening or renewal classification', () => {
  assert.deepEqual(quickSaleFlags('renewal', ''), { is_new_client: false, is_renewal: true })
  assert.deepEqual(quickSaleFlags('trial', 'opened_small'), { is_new_client: true, is_renewal: false })
})

test('editing one customer field preserves unrelated newer data and detects same-field conflicts', () => {
  const original = { id: 'one', name: 'Mary', phone: '91234567', join_date: '2025-11-18', remark: 'old' }
  const patch = changedClientFields(original, { ...original, phone: '62345678' })
  assert.deepEqual(patch, { phone: '62345678' })
  assert.deepEqual(conflictingClientFields(original, { ...original, remark: 'new' }, patch), [])
  assert.deepEqual(conflictingClientFields(original, { ...original, phone: '98765432' }, patch), ['phone'])
})
