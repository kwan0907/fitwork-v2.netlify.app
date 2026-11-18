import test from 'node:test'
import assert from 'node:assert/strict'
import { authStorage, getRememberLogin, setRememberLogin } from '../src/authStorage.js'

function fakeStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

test('remember login stores only session tokens in the chosen browser storage', () => {
  globalThis.localStorage = fakeStorage()
  globalThis.sessionStorage = fakeStorage()
  assert.equal(getRememberLogin(), true)
  authStorage.setItem('session-key', 'token-A')
  assert.equal(localStorage.getItem('session-key'), 'token-A')
  setRememberLogin(false)
  authStorage.setItem('session-key', 'token-B')
  assert.equal(localStorage.getItem('session-key'), null)
  assert.equal(sessionStorage.getItem('session-key'), 'token-B')
  assert.equal(authStorage.getItem('session-key'), 'token-B')
  authStorage.removeItem('session-key')
  assert.equal(sessionStorage.getItem('session-key'), null)
})
