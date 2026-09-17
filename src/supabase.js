import { createClient } from '@supabase/supabase-js'

// 這是從你原本 index.html 提取的連線資訊
const SUPABASE_URL = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzIiwicmVmIjoiYWpudW5laHh0aW9mY3BoZHlocW4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3NjEzOTgzNywiZXhwIjoyMDkxNzE1ODM3fQ.vn74xMzEm-fj7Gzhosxvn5UQWozAf_8LrDHXG3kycT4'

const nativeFetch = globalThis.fetch.bind(globalThis)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function resilientSupabaseFetch(input, init = {}) {
  const method = String(init?.method || input?.method || 'GET').toUpperCase()
  const url = typeof input === 'string' ? input : String(input?.url || '')
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