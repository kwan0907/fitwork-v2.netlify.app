import test from 'node:test'
import assert from 'node:assert/strict'
import { matchRetailProducts, normalizeProductAlias, parseRetailOrderPaste, productSku, readProductAliases, rememberProductAliases } from '../src/retailPaste.js'

test('pasted order rows keep continuation products together and skip rows without dates', () => {
  const input = '日期\t收錢\t客戶名稱\t產品最多一行選四個\t客戶級別\n\t\t公司票\t\t\n3\tCat\tTim\t消脂片, 抗脂片, shake, 即溶草本飲品102克\t銀級\n\t\t\tshake, 蘆薈汁, BC30 益生菌, 夜寧新營養飲品\t銀級\n1\tCat\tCindy Lee\t關捷寶\t\n\t\t\t關捷寶\t'
  const { orders, issues } = parseRetailOrderPaste(input, '2026-11')
  assert.equal(orders.length, 2)
  assert.equal(issues.length, 1)
  assert.equal(orders[0].date, '2026-11-03')
  assert.equal(orders[0].items.length, 8)
  assert.deepEqual(orders[1].items.map(item => item.sourceName), ['關捷寶', '關捷寶'])
})

test('quoted spreadsheet cells and explicit quantities remain one order', () => {
  const input = '日期\t收錢\t客戶名稱\t產品\t客戶級別\n14\tCat\tGrace\t"shake, Liftoff能量飲品 - 香橙味, 醒腦靈 x2"\t銀級'
  const { orders } = parseRetailOrderPaste(input, '2026-11')
  assert.equal(orders[0].items[2].qty, 2)
  assert.equal(orders[0].items[1].sourceName, 'Liftoff能量飲品 - 香橙味')
})

test('product alias memory is scoped to one account and remains editable', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  rememberProductAliases(storage, 'kwan-id', [['  PPP  ', 'product-1']])
  assert.equal(readProductAliases(storage, 'kwan-id')[normalizeProductAlias('ppp')], 'product-1')
  assert.deepEqual(readProductAliases(storage, 'winter-id'), {})
  rememberProductAliases(storage, 'kwan-id', [['PPP', 'product-2']])
  assert.equal(readProductAliases(storage, 'kwan-id').ppp, 'product-2')
})

test('a pasted SKU resolves one exact product without guessing between similar names', () => {
  const products = [
    { id: 'one', name: 'Shake 朱古力', sku: 'SHAKE-CHOC' },
    { id: 'two', name: 'Shake 香草', sku: 'SHAKE-VAN' }
  ]
  assert.equal(productSku(products[1]), 'SHAKE-VAN')
  assert.deepEqual(matchRetailProducts(products, 'shake van'), [products[1]])
  assert.deepEqual(matchRetailProducts(products, 'Shake'), [])
})
