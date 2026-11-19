export function monitorAccessAllowed(userId, configuredIds) {
  if (!userId || !configuredIds) return false
  return String(configuredIds).split(',').map(id => id.trim()).filter(Boolean).includes(String(userId))
}

export function configuredMonitorUserIds() {
  return globalThis.Netlify?.env?.get?.('BZ_MONITOR_ALLOWED_USER_IDS') || process.env.BZ_MONITOR_ALLOWED_USER_IDS || ''
}
