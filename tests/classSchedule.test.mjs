import test from 'node:test'
import assert from 'node:assert/strict'
import { hasTimetableLoginError, isTimetableLoginAccepted, parseClassSchedule } from '../netlify/lib/classScheduleParser.mjs'
import scheduleHandler from '../netlify/functions/classes.mjs'
import edgeScheduleHandler, { config as edgeScheduleConfig } from '../netlify/edge-functions/classes.mjs'
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
  assert.equal(edgeScheduleConfig.path, '/api/classes')
  assert.equal((await edgeScheduleHandler(new Request('https://example.netlify.app/api/classes?branch=觀塘&date=2026-11-16'))).status, 401)
})

test('source rate limit is reported as a cooldown without repeating the login', async () => {
  const originalFetch = globalThis.fetch
  const originalNetlify = globalThis.Netlify
  let sourceLogins = 0
  globalThis.Netlify = { env: { get: () => 'test-only' } }
  globalThis.fetch = async url => {
    const path = new URL(url).pathname
    if (path === '/auth/v1/user') return new Response('{}', { status: 200 })
    if (path === '/login.asp') return new Response('', { status: 200 })
    if (path === '/loginChk.asp') {
      sourceLogins++
      return new Response('', { status: 429 })
    }
    throw new Error(`Unexpected request: ${path}`)
  }
  try {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const request = () => new Request(`https://example.netlify.app/api/classes?branch=觀塘&date=${date}`, { headers: { authorization: 'Bearer test-only' } })
    const first = await scheduleHandler(request())
    assert.equal(first.status, 502)
    assert.match((await first.json()).error, /15 分鐘/)
    const second = await scheduleHandler(request())
    assert.equal(second.status, 502)
    assert.equal(sourceLogins, 1)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Netlify = originalNetlify
  }
})

test('a preview deployment reuses its source session across edge isolates', async () => {
  const originalFetch = globalThis.fetch
  const originalNetlify = globalThis.Netlify
  const saved = new Map()
  const store = {
    get: async key => saved.get(key) || null,
    getWithMetadata: async key => saved.has(key) ? { data: saved.get(key), etag: 'test-etag' } : null,
    setJSON: async (key, value, options = {}) => {
      if (options.onlyIfNew && saved.has(key)) return { modified: false }
      saved.set(key, value)
      return { modified: true }
    },
    delete: async key => { saved.delete(key) }
  }
  let sourceLogins = 0
  let sourceQueries = 0
  globalThis.Netlify = { env: { get: () => 'test-only' } }
  try {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    globalThis.fetch = async url => {
      const path = new URL(url).pathname
      if (path === '/auth/v1/user') return new Response('{}', { status: 200 })
      if (path === '/login.asp') return new Response('', { status: 200, headers: { 'set-cookie': 'ASPSESSIONID=test-session; Path=/' } })
      if (path === '/loginChk.asp') {
        sourceLogins++
        await new Promise(resolve => setTimeout(resolve, 50))
        return new Response('', { status: 302, headers: { location: '/Branch_inquiries.asp?CustID=XSH028' } })
      }
      if (path === '/Branch_inquiries.asp') {
        sourceQueries++
        return new Response(`<table class="table-striped"><tr><td>${date}<br>13:10-13:50</td><td>燃脂彈床<br>Cat</td><td>1 / 11</td></tr></table>`)
      }
      throw new Error(`Unexpected request: ${path}`)
    }
    const request = () => new Request(`https://example.netlify.app/api/classes?branch=觀塘&date=${date}&fresh=1`, { headers: { authorization: 'Bearer test-only' } })
    const firstHandler = (await import('../netlify/functions/classes.mjs?session-test-first')).default
    const secondHandler = (await import('../netlify/functions/classes.mjs?session-test-second')).default
    const [first, second] = await Promise.all([
      firstHandler(request(), null, () => store),
      secondHandler(request(), null, () => store)
    ])
    assert.equal((await first.json()).classes.length, 1)
    assert.equal((await second.json()).classes.length, 1)
    const thirdHandler = (await import('../netlify/functions/classes.mjs?session-test-third')).default
    assert.equal((await (await thirdHandler(request(), null, () => store)).json()).classes.length, 1)
    assert.equal(sourceLogins, 1)
    assert.equal(sourceQueries, 3)
    assert.ok(saved.has('session'))
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Netlify = originalNetlify
  }
})

test('recognizes the timetable provider account error without exposing credentials', () => {
  assert.equal(hasTimetableLoginError("<script>Swal.fire({title:'無此帳號，請到該店申請帳號'})</script>"), true)
  assert.equal(hasTimetableLoginError('<form id="loginForm" action="loginChk.asp"></form>'), true)
  assert.equal(hasTimetableLoginError('<table class="table-striped"></table>'), false)
})

test('accepts the providers successful login redirect to the timetable', () => {
  assert.equal(isTimetableLoginAccepted(302, '/Branch_inquiries.asp?CustID=XSH028&regGcm_flag=Y', ''), true)
  assert.equal(isTimetableLoginAccepted(302, '/login.asp', ''), false)
  assert.equal(isTimetableLoginAccepted(200, null, "Swal.fire({title:'無此帳號'})"), false)
})

test('a selected class must still match the live date, time, coach and availability', () => {
  const selected = { date: '2026-11-16', branch: '觀塘', start: '13:10', end: '13:50', title: '燃脂彈床', coach: 'Cat' }
  assert.ok(findAvailableCourse([{ ...selected, booked: 2, capacity: 11, full: false }], selected))
  assert.equal(findAvailableCourse([{ ...selected, start: '13:20', full: false }], selected), undefined)
  assert.equal(findAvailableCourse([{ ...selected, coach: 'Yin', full: false }], selected), undefined)
  assert.equal(findAvailableCourse([{ ...selected, full: true }], selected), undefined)
})
