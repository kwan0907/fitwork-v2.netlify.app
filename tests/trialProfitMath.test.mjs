import test from 'node:test'
import assert from 'node:assert/strict'
import { trialAdjustmentProfit } from '../src/trialProfitMath.js'

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
