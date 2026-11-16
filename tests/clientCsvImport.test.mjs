import test from 'node:test'
import assert from 'node:assert/strict'
import { parseClientCsv, classifyClientCsv } from '../src/clientCsvImport.js'

test('CSV 匯入保留引號內逗號和換行，拒絕無電話及無效日期', () => {
  const csv = '\uFEFF姓名,電話,分店,狀態,加入日期,來源,到期日,備註\n'
    + '舊客甲,91234567,觀塘,active,2024-05-03,朋友介紹,,"曾上堂,\n舊記錄"\n'
    + '缺電話,,,,,,,\n'
    + '日期錯,98765432,中環,active,2026-02-30,,,\n'
  const result = parseClientCsv(csv)
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].remark, '曾上堂,\n舊記錄')
  assert.equal(result.rows[0].join_date, '2024-05-03')
  assert.equal(result.skipped.length, 2)
})

test('已有電話、同名異電話及檔內重複均跳過，不產生更新候選', () => {
  const rows = parseClientCsv('姓名,電話\n現有客,91234567\n同名客,93456789\n新客,95678901\n新客,97890123\n').rows
  const result = classifyClientCsv(rows, [
    { name: '現有客', phone: '+852 9123 4567' },
    { name: '同名客', phone: '99990000' }
  ])
  assert.deepEqual(result.candidates.map(row => row.name), ['新客'])
  assert.equal(result.skipped.length, 3)
})
