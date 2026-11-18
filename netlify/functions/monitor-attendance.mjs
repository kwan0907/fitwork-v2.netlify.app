import { createClient } from '@supabase/supabase-js'

const SUPABASE = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_97JBmvmO_GHjxnxy7eZqUA_klkZJvSB'
const MONITOR = 'https://class-seat-monitor.yimwingkwan0907.workers.dev'

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'private, no-store' } })
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: '只接受同步請求。' }, 405)

  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: '請先登入 BZ。' }, 401)
  const supabase = createClient(SUPABASE, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user?.id) return json({ error: 'BZ 登入已失效，請重新登入。' }, 401)

  const body = await request.json().catch(() => ({}))
  const pin = String(body.pin || '')
  if (!/^\d{6}$/.test(pin)) return json({ error: '請輸入監察網站 6 位管理 PIN。' }, 400)

  try {
    const response = await fetch(`${MONITOR}/customers/attendance-refresh`, {
      method: 'POST',
      headers: { 'x-access-pin': pin, 'content-type': 'application/json', accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20000),
      cache: 'no-store'
    })
    if (response.status === 401) return json({ error: '監察 PIN 不正確。' }, 401)
    if (response.status !== 202) return json({ error: `監察網站無法啟動上堂同步（${response.status}）。` }, 502)
    return json({ started: true, message: '最近 7 日上堂及到訪資料正在背景更新。' }, 202)
  } catch {
    return json({ error: '連接監察網站逾時，請稍後再試。' }, 504)
  }
}
