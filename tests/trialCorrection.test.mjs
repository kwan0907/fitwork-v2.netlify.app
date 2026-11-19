import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatePaidTrials, planTrialCorrection, trialCorrectionRecord, sameTrialSource } from '../src/trialCorrection.js'
import { calculateReport } from '../src/reportMath.js'

const paid = { id: '11111111-1111-4111-8111-111111111111', type: 'income', category: '試堂',
  client_id: null, client_name: 'Susana', branch: null, amount: 98, cost: 52, profit: 46,
  created_at: '2026-11-06T10:00:00+08:00' }
const adjustment = { id: '22222222-2222-4222-8222-222222222222', type: 'income', category: '試堂調整',
  client_id: '33333333-3333-4333-8333-333333333333', client_name: 'Susana', branch: '中環',
  amount: 0, cost: 0, profit: 44.6, note: '[TRIAL_PROFIT:client-1:2026-11-19T02:30] 普通試堂未開卡',
  created_at: '2026-11-19T02:30:00+08:00' }
const period = { start: '2026-11-01', end: '2026-11-30' }

test('manual correction appends one owned entry and preserves the two source transactions', async () => {
  const originals = [paid, adjustment]
  assert.deepEqual(candidatePaidTrials(adjustment, originals), [paid])
  const plan = planTrialCorrection(adjustment, paid, originals)
  assert.equal(plan.currentTotal, 90.6)
  assert.equal(plan.correction, -46)
  const user = { id: '44444444-4444-4444-8444-444444444444', email: 'owner@example.com' }
  const entry = await trialCorrectionRecord(adjustment, paid, plan, user, new Date('2026-11-20T00:00:00Z'))
  const repeated = await trialCorrectionRecord(adjustment, paid, plan, user)
  assert.equal(entry.id, repeated.id)
  assert.equal(entry.user_id, user.id)
  assert.equal(entry.owner_email, user.email)
  assert.equal(entry.amount, 0)
  assert.equal(entry.profit, -46)
  assert.equal(entry.branch, null)
  assert.equal(entry.created_at, adjustment.created_at)
  assert.deepEqual(originals, [paid, adjustment])
  const report = calculateReport([...originals, entry], period)
  assert.equal(report.net, 44.6)
  assert.equal(report.trialOverlapReview, 0)
  assert.throws(() => planTrialCorrection(adjustment, paid, [...originals, entry]), /已有更正/)
})

test('ambiguous or changed source entries cannot be corrected automatically', () => {
  const another = { ...paid, id: '55555555-5555-4555-8555-555555555555', created_at: '2026-11-07' }
  assert.throws(() => planTrialCorrection(adjustment, paid, [paid, another, adjustment]), /唯一配對/)
  assert.equal(sameTrialSource(paid, { ...paid, profit: 45 }), false)
  assert.equal(sameTrialSource(paid, { ...paid }), true)
  assert.throws(() => planTrialCorrection(adjustment, { ...paid, cost: 50 }, [{ ...paid, cost: 50 }, adjustment]), /未對數/)
})
