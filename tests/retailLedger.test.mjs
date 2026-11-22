import test from 'node:test'
import assert from 'node:assert/strict'
import { hongKongCheckoutTimestamp, retailCheckoutAmounts } from '../src/retailLedger.js'

test('retail checkout stores the cost and profit shown at checkout, including a combo', () => {
  const totals = retailCheckoutAmounts([
    { name: '產品', qty: 2, active_price: 358.75, price_50: 252, cost: 232 },
    { name: '套裝', isCombo: true, qty: 1, active_price: 1369, fixedPrice: 1369, fixedProfit: 553.5 }
  ])
  assert.deepEqual(totals, { amount: 2086.5, cost: 1279.5, profit: 807, missingCostItems: [] })
})

test('missing product cost leaves profit unknown even when a half-price amount exists', () => {
  const totals = retailCheckoutAmounts([{ name: '成本待補', qty: 1, active_price: 98, price_50: 52, cost: null }])
  assert.deepEqual(totals, { amount: 98, cost: null, profit: null, missingCostItems: ['成本待補'] })
})

test('the four pictured products use their recorded costs, not half prices', () => {
  const totals = retailCheckoutAmounts([
    { name: '消脂片', qty: 1, active_price: 278, price_50: 151, cost: 139 },
    { name: '美纖片', qty: 1, active_price: 543, price_50: 295, cost: 271.5 },
    { name: '抗脂片', qty: 1, active_price: 366, price_50: 198.5, cost: 183 },
    { name: '即溶草本飲品102克', qty: 1, active_price: 670, price_50: 364, cost: 335 }
  ])
  assert.deepEqual(totals, { amount: 1857, cost: 928.5, profit: 928.5, missingCostItems: [] })
})

test('backdated checkout keeps the selected Hong Kong day and current Hong Kong time', () => {
  assert.equal(hongKongCheckoutTimestamp('2026-11-18', new Date('2026-11-18T18:30:00Z')),
    '2026-11-18T02:30:00+08:00')
  assert.throws(() => hongKongCheckoutTimestamp('2026-02-30'), /日期無效/)
})
