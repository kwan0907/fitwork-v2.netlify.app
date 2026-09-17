import { createClient } from '@supabase/supabase-js'

// 這是從你原本 index.html 提取的連線資訊
const SUPABASE_URL = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzIiwicmVmIjoiYWpudW5laHh0aW9mY3BoZHlocW4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3NjEzOTgzNywiZXhwIjoyMDkxNzE1ODM3fQ.vn74xMzEm-fj7Gzhosxvn5UQWozAf_8LrDHXG3kycT4'

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: resilientSupabaseFetch }
})