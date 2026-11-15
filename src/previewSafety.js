export function isReadOnlyPreviewHost(hostname) {
  const host = String(hostname || '')
  return /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/i.test(host)
    || /^[a-z0-9-]+-git-[a-z0-9-]+\.vercel\.app$/i.test(host)
}

export function shouldBlockDemoRequest(url, hostname, search, supabaseOrigin) {
  if (!isReadOnlyPreviewHost(hostname) || !new URLSearchParams(search || '').has('demo')) return false
  try { return new URL(url).origin === supabaseOrigin } catch { return false }
}

export function shouldBlockPreviewRequest(url, method, hostname, supabaseOrigin) {
  if (!isReadOnlyPreviewHost(hostname)) return false
  const action = String(method || 'GET').toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(action)) return false
  let target
  try { target = new URL(url) } catch { return false }
  if (target.origin !== supabaseOrigin) return false
  // Existing users may sign in, refresh a session and sign out to inspect records.
  if (action === 'POST' && ['/auth/v1/token', '/auth/v1/logout'].includes(target.pathname)) return false
  return true
}
