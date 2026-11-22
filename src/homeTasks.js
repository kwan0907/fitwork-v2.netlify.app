const hkFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

function hkParts(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = Object.fromEntries(hkFormatter.formatToParts(date).map(part => [part.type, part.value]))
  if (!/^\d{4}$/.test(parts.year)) return null
  return parts
}

export function hkCalendarDate(value) {
  const parts = hkParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

function trialKey(value) {
  const raw = String(value || '').trim()
  // trial_date is normally a Hong Kong local datetime without a timezone.
  const local = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/)
  if (local && validDay(local[1]) && Number(local[2].slice(0, 2)) < 24 && Number(local[2].slice(3)) < 60) return `${local[1]}T${local[2]}`
  const parts = hkParts(raw)
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : ''
}

function validDay(value) {
  const raw = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const date = new Date(`${raw}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : ''
}

function dayOffset(day, days) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function displayDay(day) {
  return `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`
}

export function getHomeTasks(clients, now = new Date()) {
  const parts = hkParts(now)
  if (!parts) return []
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const current = `${today}T${parts.hour}:${parts.minute}`
  const oldest = dayOffset(today, -14)
  const renewalEnd = dayOffset(today, 7)
  const tasks = []

  for (const client of clients || []) {
    if (!client?.id || !client?.name) continue
    const status = String(client.status || '').toLowerCase()
    if (status === 'prospect' && !String(client.remark || '').includes('[TRIAL_RESULT]')) {
      const key = trialKey(client.trial_date)
      if (key && key.slice(0, 10) >= oldest && key.slice(0, 10) <= today) {
        const pending = key <= current
        tasks.push({
          id: client.id, name: client.name, branch: client.branch || '',
          action: pending ? 'trial' : 'client',
          label: pending ? '待填試堂結果' : '今日試堂',
          detail: `${displayDay(key.slice(0, 10))} ${key.slice(11)}`,
          priority: pending ? 0 : 1, sort: pending ? -key.replace(/\D/g, '') : key.replace(/\D/g, '')
        })
      }
    }
    if (status === 'active') {
      const day = validDay(client.expiry_date)
      if (day && day >= today && day <= renewalEnd) {
        tasks.push({
          id: client.id, name: client.name, branch: client.branch || '',
          action: 'renewal', label: '套票快到期', detail: `${displayDay(day)} 到期`,
          priority: 2, sort: day
        })
      }
    }
  }
  return tasks.sort((a, b) => a.priority - b.priority || (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
}

// Older records need human review; they should not silently become a trial outcome or renewal.
export function getOverdueHomeTasks(clients, now = new Date()) {
  const parts = hkParts(now)
  if (!parts) return []
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const recentTrialStart = dayOffset(today, -14)
  const tasks = []
  for (const client of clients || []) {
    if (!client?.id || !client?.name) continue
    const status = String(client.status || '').toLowerCase()
    const trial = trialKey(client.trial_date)
    if (status === 'prospect' && trial && trial.slice(0, 10) < recentTrialStart &&
      !String(client.remark || '').includes('[TRIAL_RESULT]')) {
      tasks.push({ id: client.id, name: client.name, branch: client.branch || '', action: 'client', kind: 'trial',
        label: '舊試堂結果待核對', detail: trial.slice(0, 10), sort: trial })
    }
    const expiry = validDay(client.expiry_date)
    if (status === 'active' && expiry && expiry < today) {
      tasks.push({ id: client.id, name: client.name, branch: client.branch || '', action: 'client', kind: 'expiry',
        label: '舊套票到期日待核對', detail: expiry, sort: `${expiry}T00:00` })
    }
  }
  return tasks.sort((a, b) => b.sort.localeCompare(a.sort))
}
