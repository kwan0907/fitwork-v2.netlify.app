import { hasTimetableLoginError, isTimetableLoginAccepted, parseClassSchedule } from '../lib/classScheduleParser.mjs'

const SOURCE = 'https://system5.member-platform.com'
const SUPABASE = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_97JBmvmO_GHjxnxy7eZqUA_klkZJvSB'
const BRANCH_IDS = { '觀塘': 'XSh028', '佐敦': 'XSh026', '中環': 'XSh046' }
const scheduleCache = new Map()
let sourceSession = null
let loginInFlight = null
let sourceCooldownUntil = 0
const sourceSessionLifetime = 6 * 60 * 60 * 1000

function sourceCooldownMessage() {
  return '課表網站暫時限制登入，請約 15 分鐘後再試；可先手動揀時間。'
}

async function readStoredSession(store) {
  if (!store) return null
  try {
    const saved = await store.get('session', { type: 'json', consistency: 'strong' })
    if (!saved || Date.now() - saved.at >= sourceSessionLifetime || !Array.isArray(saved.cookies)) return null
    return { jar: new Map(saved.cookies), at: saved.at }
  } catch (error) {
    console.warn('bz-timetable-session', 'read-failed', error?.name || 'error')
    return null
  }
}

async function storeSession(store, session) {
  if (!store) return
  try {
    await store.setJSON('session', { cookies: [...session.jar], at: session.at })
  } catch (error) {
    console.warn('bz-timetable-session', 'write-failed', error?.name || 'error')
  }
}

async function storeCooldown(store) {
  if (!store || sourceCooldownUntil <= Date.now()) return
  try {
    await store.setJSON('cooldown', { until: sourceCooldownUntil })
  } catch (error) {
    console.warn('bz-timetable-session', 'cooldown-write-failed', error?.name || 'error')
  }
}

async function readStoredCooldown(store) {
  if (!store) return 0
  try {
    const saved = await store.get('cooldown', { type: 'json', consistency: 'strong' })
    return Number(saved?.until) || 0
  } catch (error) {
    console.warn('bz-timetable-session', 'cooldown-read-failed', error?.name || 'error')
    return 0
  }
}

async function invalidateSession(store) {
  sourceSession = null
  if (!store) return
  try { await store.delete('session') } catch (error) {
    console.warn('bz-timetable-session', 'delete-failed', error?.name || 'error')
  }
}

async function acquireLoginLock(store) {
  if (!store) return true
  try {
    const lock = await store.getWithMetadata('login-lock', { type: 'json', consistency: 'strong' })
    const value = { until: Date.now() + 60 * 1000 }
    const result = lock
      ? (Number(lock.data?.until) < Date.now() && await store.setJSON('login-lock', value, { onlyIfMatch: lock.etag }))
      : await store.setJSON('login-lock', value, { onlyIfNew: true })
    return Boolean(result?.modified)
  } catch (error) {
    console.warn('bz-timetable-session', 'lock-failed', error?.name || 'error')
    return true
  }
}

async function waitForLogin(store) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const session = await readStoredSession(store)
    if (session) return session
    if (Date.now() < await readStoredCooldown(store)) throw new Error(sourceCooldownMessage())
  }
  throw new Error('課表正在連線，請稍後按「重新讀取」。')
}

async function loginWithLock(account, password, store) {
  if (!await acquireLoginLock(store)) return waitForLogin(store)
  try {
    return await loginToSource(account, password, store)
  } finally {
    if (store) {
      try { await store.delete('login-lock') } catch (error) {
        console.warn('bz-timetable-session', 'unlock-failed', error?.name || 'error')
      }
    }
  }
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'private, no-store' } })
}

function addCookies(jar, response) {
  const headers = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean)
  for (const header of headers) {
    const pair = header.split(';', 1)[0]
    const key = pair.split('=', 1)[0]
    if (key && pair.includes('=')) jar.set(key, pair.slice(key.length + 1))
  }
}

function cookieHeader(jar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join('; ')
}

async function fetchSource(path, stage, init = {}) {
  const started = Date.now()
  try {
    const response = await fetch(`${SOURCE}${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20000) })
    console.info('bz-timetable-source', stage, response.status, `${Date.now() - started}ms`)
    if (response.status === 429) {
      sourceCooldownUntil = Date.now() + 15 * 60 * 1000
      throw new Error(sourceCooldownMessage())
    }
    return response
  } catch (error) {
    if (error?.message === sourceCooldownMessage()) throw error
    console.warn('bz-timetable-source', stage, error?.name || 'fetch-error', `${Date.now() - started}ms`)
    throw new Error(`課表網站連線逾時或中斷（${stage}）。`)
  }
}

async function loginToSource(account, password, store) {
  const jar = new Map()
  const loginPage = await fetchSource('/login.asp', 'login-page')
  addCookies(jar, loginPage)
  const login = await fetchSource('/loginChk.asp', 'login-submit', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar), referer: `${SOURCE}/login.asp` },
    body: new URLSearchParams({ UserID: account, password })
  })
  addCookies(jar, login)
  if (!isTimetableLoginAccepted(login.status, login.headers.get('location'), await login.text())) {
    console.warn('bz-timetable-source', 'login-rejected', login.status)
    throw new Error('課表登入資料無效，請更新預覽版連線設定。')
  }
  sourceSession = { jar, at: Date.now() }
  await storeSession(store, sourceSession)
  return sourceSession
}

async function getSourceSession(account, password, store) {
  if (Date.now() < sourceCooldownUntil) throw new Error(sourceCooldownMessage())
  if (sourceSession && Date.now() - sourceSession.at < sourceSessionLifetime) return sourceSession
  const saved = await readStoredSession(store)
  if (saved) {
    sourceSession = saved
    return saved
  }
  if (Date.now() < await readStoredCooldown(store)) throw new Error(sourceCooldownMessage())
  if (!loginInFlight) loginInFlight = loginWithLock(account, password, store)
  try {
    return await loginInFlight
  } catch (error) {
    await storeCooldown(store)
    throw error
  } finally {
    loginInFlight = null
  }
}

async function readTimetable(branch, date, account, password, store) {
  const session = await getSourceSession(account, password, store)
  const jar = new Map(session.jar)
  let result
  try { result = await fetchSource('/Branch_inquiries.asp?', 'classes-query', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar), referer: `${SOURCE}/Branch_inquiries.asp` },
    body: new URLSearchParams({ qCustID: BRANCH_IDS[branch], qDay: date.replaceAll('-', '/') })
  }) } catch (error) {
    await storeCooldown(store)
    throw error
  }
  addCookies(jar, result)
  if (result.status >= 300 && result.status < 400 && /\/login\.asp/i.test(result.headers.get('location') || '')) {
    await invalidateSession(store)
    console.warn('bz-timetable-source', 'classes-redirect-login', result.status)
    throw new Error('課表登入狀態已過期，請按「重新讀取」再試。')
  }
  if (!result.ok) throw new Error('課表網站暫時無法回應。')
  const html = await result.text()
  if (hasTimetableLoginError(html)) {
    await invalidateSession(store)
    console.warn('bz-timetable-source', 'classes-login-error', result.status)
    throw new Error('課表登入狀態已過期，請按「重新讀取」再試。')
  }
  session.jar = jar
  await storeSession(store, session)
  return parseClassSchedule(html, date, branch)
}

export default async function handler(request, context, storeFactory) {
  if (request.method !== 'GET') return json({ error: '只支援讀取課表。' }, 405)
  const authorization = request.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+$/.test(authorization)) return json({ error: '請先登入 BZ記錄器。' }, 401)
  const auth = await fetch(`${SUPABASE}/auth/v1/user`, {
    headers: { authorization, apikey: PUBLISHABLE_KEY }, signal: AbortSignal.timeout(8000)
  }).catch(() => null)
  if (!auth?.ok) return json({ error: '登入已失效，請重新登入。' }, 401)

  const url = new URL(request.url)
  const branch = url.searchParams.get('branch') || ''
  const date = url.searchParams.get('date') || ''
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const offset = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  if (!BRANCH_IDS[branch] || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(offset) || offset < 0 || offset > 13) {
    return json({ error: '只可以查詢觀塘、佐敦或中環未來 14 日課堂。' }, 400)
  }

  const account = Netlify.env.get('BZ_TIMETABLE_USER')
  const password = Netlify.env.get('BZ_TIMETABLE_PASSWORD')
  if (!account || !password) return json({ error: '即時課表連線尚未設定；你仍可手動揀時間。' }, 503)

  const key = `${branch}:${date}`
  const cached = scheduleCache.get(key)
  const fresh = url.searchParams.get('fresh') === '1'
  if (!fresh && cached && Date.now() - cached.at < 60 * 1000) return json({ branch, date, classes: cached.classes, updatedAt: cached.at })
  try {
    console.info('bz-timetable-region', context?.server?.region || 'unknown')
    const classes = await readTimetable(branch, date, account, password, storeFactory?.())
    const updatedAt = Date.now()
    scheduleCache.set(key, { classes, at: updatedAt })
    return json({ branch, date, classes, updatedAt })
  } catch (error) {
    return json({ error: error?.message || '暫時無法讀取課表。' }, 502)
  }
}
