import test from 'node:test'
import assert from 'node:assert/strict'
import { monitorAccessAllowed } from '../netlify/lib/monitor-access.mjs'

test('monitor data defaults to denied and cannot be opened by another BZ account', () => {
  assert.equal(monitorAccessAllowed('kwan-id', ''), false)
  assert.equal(monitorAccessAllowed('', 'kwan-id'), false)
  assert.equal(monitorAccessAllowed('winter-id', 'kwan-id,cat-id'), false)
  assert.equal(monitorAccessAllowed('kwan-id', 'kwan-id,cat-id'), true)
  assert.equal(monitorAccessAllowed('kwan-id-extra', 'kwan-id'), false)
})
