import test from 'node:test'
import assert from 'node:assert/strict'
import { hongKongCheckoutTimestamp, retailCheckoutAmounts } from '../src/retailLedger.js'

test('retail checkout stores the cost and profit shown at checkout, including a combo', () => {
  const totals = retailCheckoutAmounts([
    { name: '產品', qty: 2, active_price: 358.75, price_50: 252 },
    { name: '套裝', isCombo: true, qty: 1, active_price: 1369, fixedPrice: 1369, fixedProfit: 553.5 }
  ])
  assert.deepEqual(totals, { amount: 2086.5, cost: 1319.5, profit: 767, missingCostItems: [] })
})

test('missing wholesale cost leaves profit unknown instead of recording a false zero or full sale', () => {
  const totals = retailCheckoutAmounts([{ name: '成本待補', qty: 1, active_price: 98, price_50: 0 }])
  assert.deepEqual(totals, { amount: 98, cost: null, profit: null, missingCostItems: ['成本待補'] })
})

test('backdated checkout keeps the selected Hong Kong day and current Hong Kong time', () => {
  assert.equal(hongKongCheckoutTimestamp('2026-11-18', new Date('2026-11-18T18:30:00Z')),
    '2026-11-18T02:30:00+08:00')
  assert.throws(() => hongKongCheckoutTimestamp('2026-02-30'), /日期無效/)
})
