export function isReadOnlyPreviewHost(hostname) {
  const host = String(hostname || '')
  return /^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/i.test(host)
    || /^[a-z0-9-]+-git-[a-z0-9-]+\.vercel\.app$/i.test(host)
}

export function shouldBlockDemoRequest(url, hostname, search, supabaseOrigin) {
  if (!isReadOnlyPreviewHost(hostname) || !new URLSearchParams(search || '').has('demo')) return false
  try { return new URL(url).origin === supabaseOrigin } catch { return false }
}

export function shouldBlockPreviewRequest(url, method, hostname, supabaseOrigin, body) {
  if (!isReadOnlyPreviewHost(hostname)) return false
  const action = String(method || 'GET').toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(action)) return false
  let target
  try { target = new URL(url) } catch { return false }
  if (target.origin !== supabaseOrigin) return false
  // Account creation and recovery are Auth operations. Business tables remain read only.
  if (action === 'POST' && ['/auth/v1/token', '/auth/v1/logout', '/auth/v1/signup', '/auth/v1/verify', '/auth/v1/recover', '/auth/v1/resend'].includes(target.pathname)) return false
  if (action === 'PUT' && target.pathname === '/auth/v1/user') {
    try {
      const patch = JSON.parse(String(body || ''))
      const allowed = ['password', 'code_challenge', 'code_challenge_method', 'nonce']
      if (typeof patch.password === 'string' && patch.password.length >= 6 && Object.keys(patch).every(key => allowed.includes(key))) return false
    } catch { /* block unknown account edits */ }
  }
  return true
}
