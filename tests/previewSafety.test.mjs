import test from 'node:test'
import assert from 'node:assert/strict'
import { isReadOnlyPreviewHost, shouldBlockDemoRequest, shouldBlockPreviewRequest } from '../src/previewSafety.js'

const origin = 'https://ajnunehxtiofcphdyhqn.supabase.co'
const preview = 'deploy-preview-46--dynamic-gumption-005003.netlify.app'

test('only Netlify deploy preview hosts are read only', () => {
  assert.equal(isReadOnlyPreviewHost(preview), true)
  assert.equal(isReadOnlyPreviewHost('fitwork-v2-netlify-app-git-codex-bz-m-3fee72-kwan0907s-projects.vercel.app'), true)
  assert.equal(isReadOnlyPreviewHost('dynamic-gumption-005003.netlify.app'), false)
  assert.equal(isReadOnlyPreviewHost('localhost'), false)
})

test('preview allows reads and account registration or recovery', () => {
  assert.equal(shouldBlockPreviewRequest(`${origin}/rest/v1/clients`, 'GET', preview, origin), false)
  assert.equal(shouldBlockPreviewRequest(`${origin}/auth/v1/token?grant_type=password`, 'POST', preview, origin), false)
  assert.equal(shouldBlockPreviewRequest(`${origin}/auth/v1/logout`, 'POST', preview, origin), false)
  for (const path of ['/auth/v1/signup', '/auth/v1/verify', '/auth/v1/recover', '/auth/v1/resend']) {
    assert.equal(shouldBlockPreviewRequest(`${origin}${path}`, 'POST', preview, origin), false)
  }
  assert.equal(shouldBlockPreviewRequest(`${origin}/auth/v1/user`, 'PUT', preview, origin, JSON.stringify({ password: 'new-secret', code_challenge: null, code_challenge_method: null })), false)
})

test('preview blocks database, RPC, storage and account changes', () => {
  for (const [path, method] of [
    ['/rest/v1/transactions', 'POST'],
    ['/rest/v1/clients?id=eq.123', 'PATCH'],
    ['/rest/v1/rpc/adjust_stock', 'POST'],
    ['/storage/v1/object/receipts/a', 'PUT'],
    ['/auth/v1/user', 'PUT']
  ]) assert.equal(shouldBlockPreviewRequest(`${origin}${path}`, method, preview, origin), true)
  for (const body of [
    JSON.stringify({ email: 'somebody@example.com' }),
    JSON.stringify({ password: 'short' }),
    JSON.stringify({ password: 'new-secret', email: 'somebody@example.com' })
  ]) assert.equal(shouldBlockPreviewRequest(`${origin}/auth/v1/user`, 'PUT', preview, origin, body), true)
  assert.equal(shouldBlockPreviewRequest(`${origin}/rest/v1/clients`, 'POST', 'localhost', origin), false)
})

test('demo preview blocks every Supabase request, including reads and auth', () => {
  for (const path of ['/rest/v1/clients', '/auth/v1/token?grant_type=password', '/storage/v1/object/public/demo']) {
    assert.equal(shouldBlockDemoRequest(`${origin}${path}`, preview, '?demo=1', origin), true)
  }
  assert.equal(shouldBlockDemoRequest(`${origin}/rest/v1/clients`, preview, '', origin), false)
  assert.equal(shouldBlockDemoRequest(`${origin}/rest/v1/clients`, 'localhost', '?demo=1', origin), false)
  assert.equal(shouldBlockDemoRequest('https://example.com/', preview, '?demo=1', origin), false)
})
