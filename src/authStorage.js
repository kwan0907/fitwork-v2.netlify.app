const REMEMBER_KEY = 'bz_remember_login'

export function getRememberLogin() {
  try { return localStorage.getItem(REMEMBER_KEY) !== 'false' } catch { return true }
}

export function setRememberLogin(remember) {
  try { localStorage.setItem(REMEMBER_KEY, String(Boolean(remember))) } catch { /* private browsing */ }
}

// Supabase stores tokens, never the password. The unchecked choice keeps the
// session in this tab only; the browser's own password manager handles autofill.
export const authStorage = {
  getItem(key) {
    try { return (getRememberLogin() ? localStorage : sessionStorage).getItem(key) } catch { return null }
  },
  setItem(key, value) {
    try {
      const primary = getRememberLogin() ? localStorage : sessionStorage
      const other = getRememberLogin() ? sessionStorage : localStorage
      primary.setItem(key, value)
      other.removeItem(key)
    } catch { /* private browsing */ }
  },
  removeItem(key) {
    try { localStorage.removeItem(key) } catch { /* private browsing */ }
    try { sessionStorage.removeItem(key) } catch { /* private browsing */ }
  }
}
