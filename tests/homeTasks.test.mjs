import test from 'node:test'
import assert from 'node:assert/strict'
import { getHomeTasks, getOverdueHomeTasks, hkCalendarDate } from '../src/homeTasks.js'

const now = new Date('2026-11-16T09:00:00Z') // 17:00 in Hong Kong

test('home shows only actionable recent trials and upcoming renewals', () => {
  const clients = [
    { id: 1, name: '待跟進', status: 'prospect', trial_date: '2026-11-16T14:00', branch: '佐敦' },
    { id: 2, name: '稍後試堂', status: 'prospect', trial_date: '2026-11-16T18:00' },
    { id: 3, name: '已有結果', status: 'prospect', trial_date: '2026-11-16T10:00', remark: '[TRIAL_RESULT]|2026-11-16|no_open' },
    { id: 4, name: '太舊', status: 'prospect', trial_date: '2026-10-30T10:00' },
    { id: 5, name: '快到期', status: 'active', expiry_date: '2026-11-20' },
    { id: 6, name: '已過期', status: 'active', expiry_date: '2026-11-15' },
    { id: 7, name: '很久後到期', status: 'active', expiry_date: '2026-12-01' }
  ]
  assert.deepEqual(getHomeTasks(clients, now).map(task => [task.id, task.action]), [
    [1, 'trial'], [2, 'client'], [5, 'renewal']
  ])
})

test('invalid transaction dates do not create malformed month labels', () => {
  assert.equal(hkCalendarDate('bad date'), '')
  assert.equal(hkCalendarDate('0225-01-01'), '')
  assert.equal(hkCalendarDate('2026-11-16T00:30:00Z'), '2026-11-16')
})

test('older trial and expired card records stay visible for review without auto renewal', () => {
  const clients = [
    { id: 1, name: '舊試堂', status: 'prospect', trial_date: '2026-10-30T10:00' },
    { id: 2, name: '已過期', status: 'active', expiry_date: '2026-11-15' },
    { id: 3, name: '結果已填', status: 'prospect', trial_date: '2026-10-29T10:00', remark: '[TRIAL_RESULT]|2026-10-30|no_open_normal' },
    { id: 4, name: '冇日期', status: 'active' }
  ]
  assert.deepEqual(getOverdueHomeTasks(clients, now).map(task => [task.id, task.action]), [
    [2, 'client'], [1, 'client']
  ])
  assert.deepEqual(getOverdueHomeTasks(clients, now).map(task => [task.kind, task.detail]), [
    ['expiry', '2026-11-15'], ['trial', '2026-10-30']
  ])
})
