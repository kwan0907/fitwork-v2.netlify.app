import { monitorEmailAllowed } from '../../shared/monitor-eligibility.mjs'

export function monitorAccessAllowed(user, configuredIds) {
  if (!user?.id || !monitorEmailAllowed(user.email) || !configuredIds) return false
  return String(configuredIds).split(',').map(id => id.trim()).filter(Boolean).includes(String(user.id))
}

export function configuredMonitorUserIds() {
  return globalThis.Netlify?.env?.get?.('BZ_MONITOR_ALLOWED_USER_IDS') || process.env.BZ_MONITOR_ALLOWED_USER_IDS || ''
}
