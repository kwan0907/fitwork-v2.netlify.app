const branchCodes = { '觀塘': 'XSH028', '佐敦': 'XSH026', '中環': 'XSH046' }

export const MONITOR_BRANCHES = Object.keys(branchCodes)
export const monitorBranchCode = branch => branchCodes[branch] || ''

export function cleanPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (/^[456789]\d{7}$/.test(digits)) return digits
  if (/^852[456789]\d{7}$/.test(digits)) return digits.slice(3)
  return ''
}

export function cleanName(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '')
}

function cleanDate(value) {
  const match = String(value || '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) return null
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  const parsed = new Date(`${date}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date
}

export function historicalClassDate(value) {
  const date = cleanDate(value)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return date && date <= today ? date : null
}

export function historicalJoinDateCorrection(row) {
  if (row?.kind !== 'matched' || !row.client?.id || !row.firstClassAt) return null
  const firstClassAt = historicalClassDate(row.firstClassAt)
  const current = cleanDate(row.client.join_date)
  if (!firstClassAt) return null
  return !current || firstClassAt < current ? firstClassAt : null
}

export function canSaveMonitorReview({ isPreview, hasTarget, confirmedIdentity, saving }) {
  return !isPreview && hasTarget && confirmedIdentity && !saving
}

export function normalizeMonitorRows(reports) {
  const rows = []
  for (const report of reports || []) {
    const branch = report.branch
    if (!monitorBranchCode(branch) || !Array.isArray(report.customers)) continue
    for (const source of report.customers) {
      const name = String(source.name || '').trim()
      const phone = cleanPhone(source.phone)
      const memberId = String(source.memberId || '').trim()
      if (!name && !phone) continue
      rows.push({
        key: `${branch}:${memberId || phone || name}`,
        memberId,
        name,
        phone,
        branch,
        remainingPoints: source.remainingPoints !== '' && source.remainingPoints != null && Number.isFinite(Number(source.remainingPoints))
          ? Number(source.remainingPoints) : null,
        validUntil: cleanDate(source.validUntil),
        firstClassAt: cleanDate(source.firstClassAt),
        lastVisitAt: cleanDate(source.lastVisitAt),
        profileUpdatedAt: source.profileUpdatedAt || report.profileUpdatedAt || null,
        coverageStart: report.coverageStart || null,
        coverageEnd: report.coverageEnd || null
      })
    }
  }
  return rows
}

export function reconcileMonitorClients(sourceRows, bzClients) {
  const phones = new Map()
  const names = new Map()
  const sourcePhones = new Map()
  for (const client of bzClients || []) {
    const phone = cleanPhone(client.phone)
    const name = cleanName(client.name)
    if (phone) phones.set(phone, [...(phones.get(phone) || []), client])
    if (name) names.set(name, [...(names.get(name) || []), client])
  }
  for (const row of sourceRows || []) {
    if (row.phone) sourcePhones.set(row.phone, [...(sourcePhones.get(row.phone) || []), row])
  }

  const seen = new Set()
  return (sourceRows || []).map(row => {
    const byPhone = row.phone ? phones.get(row.phone) || [] : []
    const byName = cleanName(row.name) ? names.get(cleanName(row.name)) || [] : []
    const duplicateSource = row.phone && (sourcePhones.get(row.phone) || []).some(other => cleanName(other.name) !== cleanName(row.name))
    const sourceKey = row.phone ? `phone:${row.phone}` : `name:${cleanName(row.name)}`
    let kind = 'review'
    let reason = ''
    let client = null

    if (!row.phone || !row.name) reason = '來源缺少姓名或有效香港電話'
    else if (duplicateSource) reason = '監察資料內同一電話有不同姓名'
    else if (byPhone.length > 1) reason = 'BZ 有多位客戶共用同一電話'
    else if (byPhone.length === 1) {
      client = byPhone[0]
      if (cleanName(client.name) === cleanName(row.name)) {
        kind = 'matched'
        reason = '電話及姓名一致'
      } else reason = '電話相同，但姓名不同'
    } else if (byName.length) reason = '姓名相同，但電話不同或未填'
    else if (seen.has(sourceKey)) reason = '監察資料有跨店或重複紀錄'
    else {
      kind = 'missing'
      reason = 'BZ 未有同電話或同姓名客戶'
    }
    seen.add(sourceKey)
    return { ...row, kind, reason, client }
  })
}

// Only reviewed, uniquely identified records may be inserted. A verified first class supplies
// a historical start date; otherwise leave it unknown rather than calling the person new today.
export function safeMissingClientPayload(row, user) {
  if (row.kind !== 'missing' || !row.name || !cleanPhone(row.phone) || !monitorBranchCode(row.branch)) return null
  if (!user?.id || !user?.email) return null
  return {
    name: row.name,
    phone: cleanPhone(row.phone),
    branch: row.branch,
    status: 'active',
    source: '課程監察補全',
    join_date: historicalClassDate(row.firstClassAt),
    expiry_date: row.validUntil,
    remark: `由課程空位監察補全｜會員 ID ${row.memberId || '未提供'}｜${historicalClassDate(row.firstClassAt) ? `最早上堂 ${historicalClassDate(row.firstClassAt)}，用作加入日期` : '原始加入日期待核對'}`,
    owner_email: user.email,
    own_email: user.email,
    user_id: user.id
  }
}
