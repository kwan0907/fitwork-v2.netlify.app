import { createClient } from '@supabase/supabase-js'

// Supabase project connection
const SUPABASE_URL = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_97JBmvmO_GHjxnxy7eZqUA_klkZJvSB'

const nativeFetch = globalThis.fetch.bind(globalThis)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const parseJsonBody = (body) => {
  if (!body) return null
  if (typeof body === 'string') {
    try { return JSON.parse(body) } catch { return null }
  }
  return null
}

const getOwnedPatchRpc = (urlString, method) => {
  if (method !== 'PATCH') return null
  let url
  try { url = new URL(urlString) } catch { return null }
  if (url.origin !== SUPABASE_URL) return null

  const path = url.pathname.replace(/\/+$/, '')
  const table = path.endsWith('/rest/v1/clients')
    ? 'client'
    : path.endsWith('/rest/v1/transactions')
      ? 'transaction'
      : null
  if (!table) return null

  const idFilter = url.searchParams.get('id') || ''
  if (!idFilter.startsWith('eq.')) return null
  const id = idFilter.slice(3)
  if (!id) return null

  return {
    id,
    rpcName: table === 'client' ? 'patch_owned_client' : 'patch_owned_transaction'
  }
}

async function postRpcWithRetry(rpcName, id, patch, init) {
  const headers = new Headers(init?.headers || {})
  headers.set('content-type', 'application/json')
  headers.set('accept', 'application/json')

  // RPC 是按 id 更新同一筆資料；即使第一次成功但回應中斷，重試仍然只會覆寫同一筆，不會新增重複紀錄。
  const retryDelays = [0, 300, 800]
  let lastError
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (retryDelays[attempt]) await sleep(retryDelays[attempt])
    try {
      return await nativeFetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
        ...init,
        method: 'POST',
        headers,
        body: JSON.stringify({ p_id: id, p_patch: patch })
      })
    } catch (err) {
      lastError = err
      const isNetworkFailure = err instanceof TypeError && /failed to fetch/i.test(String(err?.message || ''))
      if (!isNetworkFailure || attempt === retryDelays.length - 1) throw err
      console.warn(`Supabase RPC network retry ${attempt + 1}/2`, rpcName)
    }
  }
  throw lastError
}

async function resilientSupabaseFetch(input, init = {}) {
  const method = String(init?.method || input?.method || 'GET').toUpperCase()
  const url = typeof input === 'string' ? input : String(input?.url || '')

  // 部分瀏覽器/網絡環境會直接令 PATCH 出現 TypeError: Failed to fetch。
  // clients / transactions 的單筆更新改用 POST RPC，RLS 仍由資料庫照常執行。
  const ownedPatch = getOwnedPatchRpc(url, method)
  if (ownedPatch) {
    const patch = parseJsonBody(init?.body)
    if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
      return postRpcWithRetry(ownedPatch.rpcName, ownedPatch.id, patch, init)
    }
  }

  const shouldRetry = method === 'PATCH' && url.startsWith(SUPABASE_URL)
  if (!shouldRetry) return nativeFetch(input, init)

  let lastError
  const retryDelays = [0, 300, 800]
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (retryDelays[attempt]) await sleep(retryDelays[attempt])
    try {
      return await nativeFetch(input, init)
    } catch (err) {
      lastError = err
      const isNetworkFailure = err instanceof TypeError && /failed to fetch/i.test(String(err?.message || ''))
      if (!isNetworkFailure || attempt === retryDelays.length - 1) throw err
      console.warn(`Supabase PATCH network retry ${attempt + 1}/2`, url)
    }
  }
  throw lastError
}

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: { fetch: resilientSupabaseFetch }
})

// Login race guard:
// App.vue asks getSession() on mount while signInWithPassword() and auth events can complete at nearly the same time.
// On a slow browser/network, an older getSession(null) response can arrive after SIGNED_IN and incorrectly push the UI back to login,
// even though Supabase still has a valid unrevoked session. Keep a very short-lived copy of the last verified session to reject that stale null.
let recentVerifiedSession = null
let recentVerifiedAt = 0
const AUTH_GRACE_MS = 15000

const rememberVerifiedSession = (session) => {
  if (!session?.access_token || !session?.user?.id) return
  recentVerifiedSession = session
  recentVerifiedAt = Date.now()
}

const isRecentVerifiedSession = () => Boolean(
  recentVerifiedSession && (Date.now() - recentVerifiedAt) <= AUTH_GRACE_MS
)

const rawGetSession = supabaseClient.auth.getSession.bind(supabaseClient.auth)
const rawSignInWithPassword = supabaseClient.auth.signInWithPassword.bind(supabaseClient.auth)
const rawOnAuthStateChange = supabaseClient.auth.onAuthStateChange.bind(supabaseClient.auth)

supabaseClient.auth.signInWithPassword = async (...args) => {
  const result = await rawSignInWithPassword(...args)
  if (result?.data?.session) rememberVerifiedSession(result.data.session)
  return result
}

supabaseClient.auth.getSession = async (...args) => {
  const result = await rawGetSession(...args)
  const session = result?.data?.session
  if (session) {
    rememberVerifiedSession(session)
    return result
  }

  // Only cover the short login-transition window. This never creates a new session/token;
  // it simply prevents an older null result from overwriting a newer verified SIGNED_IN state.
  if (isRecentVerifiedSession()) {
    return {
      ...result,
      data: { ...(result?.data || {}), session: recentVerifiedSession }
    }
  }
  return result
}

supabaseClient.auth.onAuthStateChange = (callback) => rawOnAuthStateChange((event, session) => {
  if (session) {
    rememberVerifiedSession(session)
    callback(event, session)
    return
  }

  if (event === 'SIGNED_OUT' && isRecentVerifiedSession()) {
    // Validate after the auth event stack finishes. If the session is genuinely gone, forward SIGNED_OUT normally.
    setTimeout(async () => {
      try {
        const verified = await rawGetSession()
        if (verified?.data?.session) {
          rememberVerifiedSession(verified.data.session)
          callback('SIGNED_IN', verified.data.session)
        } else {
          recentVerifiedSession = null
          recentVerifiedAt = 0
          callback(event, session)
        }
      } catch {
        recentVerifiedSession = null
        recentVerifiedAt = 0
        callback(event, session)
      }
    }, 150)
    return
  }

  if (event === 'SIGNED_OUT') {
    recentVerifiedSession = null
    recentVerifiedAt = 0
  }
  callback(event, session)
})

export const supabase = supabaseClient