import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHistoryImport, classifyHistoryImport, historyImportPayload } from '../src/historyImport.js'

test('two years of pasted TSV can be parsed without losing quoted notes or blank optional fields', () => {
  const text = '日期\t收支\t金額\t客戶\t備註\n2024/01/15\t收入\t880\t陳大文\t"續卡, 10點"\n2025-11-02\t支出\t500\t\tIG 廣告'
  const { rows, errors } = parseHistoryImport(text, { branch: '佐敦', staff: 'Cat', today: '2026-11-16' })
  assert.equal(errors.length, 0)
  assert.deepEqual(rows.map(row => [row.date, row.type, row.amount, row.branch, row.staff]), [
    ['2024-01-15', 'income', 880, '佐敦', 'Cat'],
    ['2025-11-02', 'expense', 500, '佐敦', 'Cat']
  ])
  assert.equal(rows[0].note, '續卡, 10點')
})

test('invalid dates and amounts are reported by row instead of silently imported', () => {
  const text = '日期,收支,金額\n2025-02-30,收入,880\n2025-03-02,支出,-50\n2027-01-01,收入,50'
  const { rows, errors } = parseHistoryImport(text, { today: '2026-11-16' })
  assert.equal(rows.length, 0)
  assert.deepEqual(errors.map(error => error.line), [2, 3, 4])
})

test('same record is blocked and same-day same-amount record is flagged for review', () => {
  const { rows } = parseHistoryImport('日期,時間,收支,分類,金額,客戶,分店\n2025-05-01,14:30,收入,運動套票,880,阿明,觀塘\n2025-05-01,15:30,收入,運動套票,880,阿明,觀塘', { today: '2026-11-16' })
  const existing = [{ created_at: '2025-05-01T06:30:00Z', type: 'income', category: '運動套票', amount: 880, client_name: '阿明', branch: '觀塘' }]
  assert.deepEqual(classifyHistoryImport(rows, existing).map(row => row.duplicate), ['exact', 'possible'])
})

test('payload appends a dated ledger entry and links only an unambiguous existing client', () => {
  const { rows } = parseHistoryImport('日期,收支,金額,客戶\n2024-04-02,收入,98,阿明', { today: '2026-11-16' })
  const payload = historyImportPayload(rows[0], { id: 'user-1', email: 'owner@example.com' }, [{ id: 'client-1', name: '阿明' }])
  assert.equal(payload.created_at, '2024-04-02T12:00:00+08:00')
  assert.equal(payload.client_id, 'client-1')
  assert.equal(payload.owner_email, 'owner@example.com')
  assert.equal(payload.profit, 98)
})

test('common Excel date formats work and same-day repeats inside one paste need review', () => {
  const { rows, errors } = parseHistoryImport('日期,時間,收支,金額,客戶\n2024年6月3日,14:30,收入,880,阿明\n45446,15:30,收入,880,阿明', { today: '2026-11-16' })
  assert.equal(errors.length, 0)
  assert.equal(rows[0].date, '2024-06-03')
  assert.equal(rows[1].date, '2024-06-03')
  assert.deepEqual(classifyHistoryImport(rows, []).map(row => row.duplicate), ['none', 'possible'])
})
