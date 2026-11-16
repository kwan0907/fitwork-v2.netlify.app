import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../netlify/functions/monitor-customers.mjs'
import attendanceHandler from '../netlify/functions/monitor-attendance.mjs'

test('customer connector rejects other methods and unauthenticated reads before contacting monitor', async () => {
  const oldFetch = globalThis.fetch
  let contacted = false
  globalThis.fetch = async () => { contacted = true; throw new Error('unexpected network call') }
  try {
    const wrongMethod = await handler(new Request('https://preview.example/.netlify/functions/monitor-customers'))
    assert.equal(wrongMethod.status, 405)
    const noAuth = await handler(new Request('https://preview.example/.netlify/functions/monitor-customers', {
      method: 'POST', body: JSON.stringify({ branch: 'XSH028', pin: '123456' })
    }))
    assert.equal(noAuth.status, 401)
    assert.equal(contacted, false)
  } finally {
    globalThis.fetch = oldFetch
  }
})

test('attendance refresh rejects non-POST and unauthenticated requests without starting a source job', async () => {
  const oldFetch = globalThis.fetch
  let contacted = false
  globalThis.fetch = async () => { contacted = true; throw new Error('unexpected network call') }
  try {
    const wrongMethod = await attendanceHandler(new Request('https://preview.example/.netlify/functions/monitor-attendance'))
    assert.equal(wrongMethod.status, 405)
    const noAuth = await attendanceHandler(new Request('https://preview.example/.netlify/functions/monitor-attendance', {
      method: 'POST', body: JSON.stringify({ pin: '123456' })
    }))
    assert.equal(noAuth.status, 401)
    assert.equal(contacted, false)
  } finally {
    globalThis.fetch = oldFetch
  }
})
