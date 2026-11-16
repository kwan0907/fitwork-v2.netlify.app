import { createClient } from '@supabase/supabase-js'

const SUPABASE = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_97JBmvmO_GHjxnxy7eZqUA_klkZJvSB'
const MONITOR = 'https://class-seat-monitor.yimwingkwan0907.workers.dev'
const BRANCHES = new Set(['XSH026', 'XSH028', 'XSH046'])

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'private, no-store' } })
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: '只接受讀取請求。' }, 405)

  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: '請先登入 BZ。' }, 401)
  const supabase = createClient(SUPABASE, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.id) return json({ error: 'BZ 登入已失效，請重新登入。' }, 401)

  const body = await request.json().catch(() => ({}))
  const branch = String(body.branch || '').toUpperCase()
  const pin = String(body.pin || '')
  if (!BRANCHES.has(branch) || !/^\d{6}$/.test(pin)) return json({ error: '請選擇分店並輸入監察網站 6 位管理 PIN。' }, 400)

  try {
    const response = await fetch(`${MONITOR}/customers?branch=${branch}`, {
      method: 'GET',
      headers: { 'x-access-pin': pin, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store'
    })
    if (response.status === 401) return json({ error: '監察 PIN 不正確。' }, 401)
    if (!response.ok) return json({ error: `監察網站暫時無法讀取（${response.status}）。` }, 502)
    const report = await response.json()
    if (!report.available || !Array.isArray(report.customers)) return json({ error: report.message || '此分店暫時未有客戶資料。' }, 404)
    return json({
      branch,
      source: report.source || '課程空位監察',
      profileUpdatedAt: report.profileUpdatedAt || null,
      attendanceUpdatedAt: report.attendanceUpdatedAt || null,
      coverageStart: report.coverageStart || null,
      coverageEnd: report.coverageEnd || null,
      customers: report.customers.map(row => ({
        memberId: String(row.memberId || ''),
        name: String(row.name || ''),
        phone: String(row.phone || ''),
        remainingPoints: row.remainingPoints ?? null,
        validUntil: row.validUntil || null,
        firstClassAt: row.firstClassAt || null,
        lastVisitAt: row.lastVisitAt || null,
        profileUpdatedAt: row.profileUpdatedAt || null
      }))
    })
  } catch {
    return json({ error: '連接監察網站逾時，請稍後再試。' }, 504)
  }
}
