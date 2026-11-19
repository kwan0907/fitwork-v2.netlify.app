import test from 'node:test'
import assert from 'node:assert/strict'
import { incomeAccountingValues } from '../src/accountingEntry.js'

test('editing only the note preserves an old sale margin even when it differs from formula', () => {
  const previous = { type: 'income', amount: 880, cost: 399, profit: 880 }
  assert.deepEqual(incomeAccountingValues('880', '399', previous),
    { amount: 880, cost: 399, profit: 880 })
})

test('correcting an income cost recalculates profit, while unknown cost stays unknown', () => {
  const previous = { type: 'income', amount: 880, cost: 399, profit: 880 }
  assert.deepEqual(incomeAccountingValues('880', '400', previous),
    { amount: 880, cost: 400, profit: 480 })
  assert.deepEqual(incomeAccountingValues('98', ''),
    { amount: 98, cost: null, profit: null })
  assert.deepEqual(incomeAccountingValues('98', '0'),
    { amount: 98, cost: 0, profit: 98 })
})
