import test from 'node:test'
import assert from 'node:assert/strict'
import { trialAdjustmentProfit, trialAdjustmentRecord } from '../src/trialProfitMath.js'

const client = { id: 'client-1', name: 'Susana', trial_date: '2026-11-19T02:30:00+08:00' }
const paid = { client_id: null, client_name: 'Susana', amount: 98, cost: 52, profit: 46,
  created_at: '2026-11-06T10:00:00+08:00' }

test('a paid trial plus no-open adjustment totals the agreed whole-trial profit', () => {
  assert.equal(trialAdjustmentProfit(client, 'normal', [paid]), -1.4)
  assert.equal(46 + trialAdjustmentProfit(client, 'normal', [paid]), 44.6)
  assert.equal(trialAdjustmentProfit(client, 'mygift', [paid]), -99.4)
})

test('an unpaid trial records its full margin and ambiguous paid trials stop', () => {
  assert.equal(trialAdjustmentProfit(client, 'normal', []), 44.6)
  assert.throws(() => trialAdjustmentProfit(client, 'normal', [paid, { ...paid, created_at: '2026-11-07' }]), /多筆/)
  assert.throws(() => trialAdjustmentProfit(client, 'normal', [{ ...paid, profit: 0 }]), /未核對/)
  assert.throws(() => trialAdjustmentProfit({ ...client, branch: '佐敦' }, 'normal', [{ ...paid, branch: '中環' }]), /另一分店/)
})

test('trial adjustment carries the signed-in owner required by transaction RLS', () => {
  const row = trialAdjustmentRecord(client, -1.4, '[TRIAL_PROFIT:client-1:2026-11-19T02:30]',
    { id: 'owner-1', email: 'owner@example.com' })
  assert.equal(row.user_id, 'owner-1')
  assert.equal(row.owner_email, 'owner@example.com')
  assert.equal(row.own_email, 'owner@example.com')
  assert.equal(row.profit, -1.4)
  assert.equal(row.amount, 0)
  assert.throws(() => trialAdjustmentRecord(client, 44.6, '', { email: 'owner@example.com' }), /登入已失效/)
})
