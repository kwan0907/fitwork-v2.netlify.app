export const MONITOR_OWNER_EMAIL = 'yimwingkwan0907@gmail.com'

export function monitorEmailAllowed(email) {
  return String(email || '').trim().toLowerCase() === MONITOR_OWNER_EMAIL
}
