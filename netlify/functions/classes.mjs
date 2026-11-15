import { hasTimetableLoginError, parseClassSchedule } from '../lib/classScheduleParser.mjs'

const SOURCE = 'https://system5.member-platform.com'
const SUPABASE = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_97JBmvmO_GHjxnxy7eZqUA_klkZJvSB'
const BRANCH_IDS = { '觀塘': 'XSh028', '佐敦': 'XSh026', '中環': 'XSh046' }
const scheduleCache = new Map()

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

async function fetchSource(path, init = {}) {
  return fetch(`${SOURCE}${path}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(12000) })
}

async function readTimetable(branch, date, account, password) {
  const jar = new Map()
  const loginPage = await fetchSource('/login.asp')
  addCookies(jar, loginPage)
  const login = await fetchSource('/loginChk.asp', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar), referer: `${SOURCE}/login.asp` },
    body: new URLSearchParams({ UserID: account, password })
  })
  addCookies(jar, login)
  if (!login.ok || hasTimetableLoginError(await login.text())) throw new Error('課表登入資料無效，請更新預覽版連線設定。')
  const result = await fetchSource('/Branch_inquiries.asp?', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader(jar), referer: `${SOURCE}/Branch_inquiries.asp` },
    body: new URLSearchParams({ qCustID: BRANCH_IDS[branch], qDay: date.replaceAll('-', '/') })
  })
  addCookies(jar, result)
  if (result.status >= 300 && result.status < 400 && /\/login\.asp/i.test(result.headers.get('location') || '')) {
    throw new Error('課表登入資料無效，請更新預覽版連線設定。')
  }
  if (!result.ok) throw new Error('課表網站暫時無法回應。')
  const html = await result.text()
  if (hasTimetableLoginError(html)) throw new Error('課表登入資料無效，請更新預覽版連線設定。')
  return parseClassSchedule(html, date, branch)
}

export default async function handler(request) {
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
    const classes = await readTimetable(branch, date, account, password)
    const updatedAt = Date.now()
    scheduleCache.set(key, { classes, at: updatedAt })
    return json({ branch, date, classes, updatedAt })
  } catch (error) {
    return json({ error: error?.message || '暫時無法讀取課表。' }, 502)
  }
}
