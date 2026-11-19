import test from 'node:test'
import assert from 'node:assert/strict'
import { monitorAccessAllowed } from '../netlify/lib/monitor-access.mjs'
import { monitorEmailAllowed } from '../shared/monitor-eligibility.mjs'

test('monitor entry only appears for the specified signed-in email', () => {
  assert.equal(monitorEmailAllowed('yimwingkwan0907@gmail.com'), true)
  assert.equal(monitorEmailAllowed(' YimWingKwan0907@Gmail.Com '), true)
  assert.equal(monitorEmailAllowed('winter@example.com'), false)
  assert.equal(monitorEmailAllowed(''), false)
})

test('monitor API requires both the specified email and an allowed auth user ID', () => {
  const kwan = { id: 'kwan-id', email: 'yimwingkwan0907@gmail.com' }
  assert.equal(monitorAccessAllowed(kwan, ''), false)
  assert.equal(monitorAccessAllowed(null, 'kwan-id'), false)
  assert.equal(monitorAccessAllowed({ id: 'kwan-id', email: 'winter@example.com' }, 'kwan-id'), false)
  assert.equal(monitorAccessAllowed({ id: 'winter-id', email: kwan.email }, 'kwan-id'), false)
  assert.equal(monitorAccessAllowed(kwan, 'kwan-id,cat-id'), true)
  assert.equal(monitorAccessAllowed({ id: 'kwan-id-extra', email: kwan.email }, 'kwan-id'), false)
})
