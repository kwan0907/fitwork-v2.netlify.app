export function isReadOnlyPreviewHost(hostname) {
  return /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/i.test(String(hostname || ''))
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
