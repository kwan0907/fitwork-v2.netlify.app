import test from 'node:test'
import assert from 'node:assert/strict'
import { parseClassSchedule } from '../netlify/lib/classScheduleParser.mjs'
import scheduleHandler from '../netlify/functions/classes.mjs'
import { findAvailableCourse } from '../src/classSchedule.js'

test('extracts only date, course, coach, time and capacity from timetable rows', () => {
  const html = `<table class="table table-striped table-hover"><tbody><tr><th>時段</th></tr>
    <tr><td><strong>2026-11-16</strong><br><strong>13:10-13:50</strong></td><td>燃脂彈床<br><strong>Cat</strong><br>FZB觀塘</td><td>1 / 11</td><td><a href="reservation_add.asp?secret=abc">預約</a></td></tr>
    <tr><td><strong>2026-11-16</strong><br><strong>14:00-14:40</strong></td><td>有氧踏板<br><strong>Yin</strong></td><td>11 / 11</td><td>額滿</td></tr></tbody></table>`
  const rows = parseClassSchedule(html, '2026-11-16', '觀塘')
  assert.deepEqual(rows, [
    { date: '2026-11-16', branch: '觀塘', start: '13:10', end: '13:50', title: '燃脂彈床', coach: 'Cat', booked: 1, capacity: 11, full: false },
    { date: '2026-11-16', branch: '觀塘', start: '14:00', end: '14:40', title: '有氧踏板', coach: 'Yin', booked: 11, capacity: 11, full: true }
  ])
  assert.equal(JSON.stringify(rows).includes('reservation_add'), false)
})

test('schedule endpoint rejects unauthenticated requests before contacting source', async () => {
  const response = await scheduleHandler(new Request('https://example.netlify.app/.netlify/functions/classes?branch=觀塘&date=2026-11-16'))
  assert.equal(response.status, 401)
})

test('a selected class must still match the live date, time, coach and availability', () => {
  const selected = { date: '2026-11-16', branch: '觀塘', start: '13:10', end: '13:50', title: '燃脂彈床', coach: 'Cat' }
  assert.ok(findAvailableCourse([{ ...selected, booked: 2, capacity: 11, full: false }], selected))
  assert.equal(findAvailableCourse([{ ...selected, start: '13:20', full: false }], selected), undefined)
  assert.equal(findAvailableCourse([{ ...selected, coach: 'Yin', full: false }], selected), undefined)
  assert.equal(findAvailableCourse([{ ...selected, full: true }], selected), undefined)
})
