import test from 'node:test'
import assert from 'node:assert/strict'
import { hkDay, reportPeriod, calculateReport, calculateTrialFunnel } from '../src/reportMath.js'

test('Hong Kong day places UTC evening transactions on the next calendar day', () => {
  assert.equal(hkDay('2026-11-18T18:30:00Z'), '2026-11-19')
  assert.equal(hkDay('2025-11-18T14:00'), '2025-11-18')
  assert.deepEqual(reportPeriod('month', new Date('2026-11-18T18:30:00Z')),
    { start: '2026-11-01', end: '2026-11-30', label: '本月' })
})

test('report reconciles revenue, saved gross profit, and operating expenses without double charging inventory', () => {
  const period = { start: '2026-11-19', end: '2026-11-19' }
  const transactions = [
    { id: 1, type: 'income', category: '運動套票', amount: 880, cost: 399, profit: 481, is_renewal: true, branch: '觀塘', created_at: '2026-11-18T18:30:00Z' },
    { id: 2, type: 'income', category: '試堂調整', amount: 0, profit: 44.6, branch: '觀塘', created_at: '2026-11-19T02:00:00Z' },
    { id: 3, type: 'expense', category: '廣告費用', amount: 100, branch: '觀塘', created_at: '2026-11-19T03:00:00Z' },
    { id: 4, type: 'expense', category: '產品採購', amount: 200, branch: '觀塘', created_at: '2026-11-19T04:00:00Z' },
    { id: 5, type: 'expense', category: '支付30%', amount: 250, branch: '觀塘', created_at: '2026-11-19T05:00:00Z' },
    { id: 6, type: 'expense', category: '自用消耗', amount: 30, branch: '中環', created_at: '2026-11-19T06:00:00Z' }
  ]
  const report = calculateReport([...transactions, transactions[0]], period)
  assert.equal(report.income, 880)
  assert.equal(report.recordedGross, 525.6)
  assert.equal(report.cashExpense, 580)
  assert.equal(report.operatingExpense, 130)
  assert.equal(report.excludedExpense, 450)
  assert.equal(report.net, 395.6)
  assert.deepEqual(report.packages, { new: 0, renewal: 1, unknown: 0 })
  assert.equal(report.rows.length, 6)
  assert.equal(calculateReport(transactions, period, '觀塘').net, 425.6)
})

test('missing profit is flagged instead of silently assuming the whole sale is profit', () => {
  const period = { start: '', end: '' }
  const report = calculateReport([
    { id: 1, type: 'income', amount: 100, category: '產品零售', created_at: '2026-11-19' },
    { id: 2, type: 'income', amount: 80, cost: 30, category: '產品零售', created_at: '2026-11-19' }
  ], period)
  assert.equal(report.income, 180)
  assert.equal(report.recordedGross, 50)
  assert.equal(report.missingProfit, 1)
  assert.equal(report.net, null)
})

test('trial conversion uses only explicit results and keeps unknown bookings separate', () => {
  const period = { start: '2026-11-01', end: '2026-11-30' }
  const clients = [
    { trial_date: '2026-11-18', branch: '佐敦', remark: '[TRIAL_RESULT]|2026-11-18T12:00:00Z|opened_small' },
    { trial_date: '2026-11-18', branch: '佐敦', remark: '[TRIAL_RESULT]|2026-11-18T12:00:00Z|no_open_normal' },
    { trial_date: '2026-11-18', branch: '佐敦', remark: '[TRIAL_RESULT]|2026-11-18T12:00:00Z|no_show' },
    { trial_date: '2026-11-18', branch: '佐敦', status: 'active' }
  ]
  assert.deepEqual(calculateTrialFunnel(clients, period, '佐敦'),
    { booked: 4, attended: 2, opened: 1, noShow: 1, pending: 1, conversion: 50 })
})

test('legacy profit mismatches are flagged without changing saved accounting values', () => {
  const report = calculateReport([
    { id: 'retail', type: 'income', category: '零售收入', amount: 1369, cost: 0, profit: 0,
      note: '[淨利: $554] 套裝', created_at: '2026-05-01' },
    { id: 'trial-adjustment', type: 'income', category: '試堂調整', amount: 0, cost: 0, profit: 44.6,
      created_at: '2026-05-01' },
    { id: 'vip', type: 'income', category: '運動套票', amount: 0, cost: 1155, profit: 0,
      note: '售出 VIP點數30點', created_at: '2026-05-01' },
    { id: 'historic-date', type: 'expense', category: '其他支出', amount: 1, created_at: '0225-05-01' }
  ], { start: '', end: '' })
  assert.equal(report.profitReview, 1)
  assert.equal(report.dateReview, 1)
  assert.equal(report.rows.find(row => row.id === 'trial-adjustment').profitNeedsReview, false)
  assert.equal(report.rows.find(row => row.id === 'vip').profitNeedsReview, false)
  assert.equal(report.net, 43.6)
})

test('trial adjustment with an earlier fee is marked as possible double counting', () => {
  const report = calculateReport([
    { id: 'paid', type: 'income', category: '試堂', client_name: 'Susana', amount: 98, cost: 52, profit: 46,
      created_at: '2026-11-06T10:00:00+08:00' },
    { id: 'adjustment', type: 'income', category: '試堂調整', client_name: 'Susana', client_id: 'client-1',
      amount: 0, cost: 0, profit: 44.6, note: '[TRIAL_PROFIT:client-1:2026-11-19T02:30] 普通試堂未開卡',
      created_at: '2026-11-19T02:30:00+08:00' }
  ], { start: '2026-11-01', end: '2026-11-30' })
  assert.equal(report.trialOverlapReview, 1)
  assert.equal(report.profitReview, 1)
  assert.equal(report.net, 90.6) // retained only as the uncorrected ledger total
  assert.equal(report.rows.find(row => row.id === 'adjustment').trialOverlap, true)
})
