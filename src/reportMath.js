const hkFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit'
})

export function hkDay(value) {
  if (!value) return ''
  const raw = String(value).trim()
  // Historical backfills without an offset are Hong Kong wall-clock dates.
  if (/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(raw) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return raw.slice(0, 10)
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : hkFormatter.format(date)
}

export function reportPeriod(kind, now = new Date(), customStart = '', customEnd = '') {
  const today = hkFormatter.format(now)
  const month = today.slice(0, 7)
  if (kind === 'today') return { start: today, end: today, label: '今日' }
  if (kind === 'week') {
    const day = new Date(`${today}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() - 6)
    return { start: day.toISOString().slice(0, 10), end: today, label: '最近 7 日' }
  }
  if (kind === 'last_month') {
    const first = new Date(`${month}-01T00:00:00Z`)
    first.setUTCDate(0)
    return { start: first.toISOString().slice(0, 7) + '-01', end: first.toISOString().slice(0, 10), label: '上月' }
  }
  if (kind === 'custom') return { start: customStart, end: customEnd, label: '自訂日期' }
  if (kind === 'all') return { start: '', end: '', label: '全部紀錄' }
  const firstNext = new Date(`${month}-01T00:00:00Z`)
  firstNext.setUTCMonth(firstNext.getUTCMonth() + 1)
  firstNext.setUTCDate(0)
  return { start: `${month}-01`, end: firstNext.toISOString().slice(0, 10), label: '本月' }
}

const money = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null
const round = value => Math.round((value + Number.EPSILON) * 100) / 100
const excludedExpense = new Set(['產品採購', '支付30%'])
export const inPeriod = (value, period) => {
  const day = hkDay(value)
  return Boolean(day) && (!period.start || day >= period.start) && (!period.end || day <= period.end)
}

export function calculateReport(transactions, period, branch = '全部分店') {
  const unique = new Map()
  for (const transaction of transactions || []) unique.set(String(transaction.id), transaction)
  const allRows = [...unique.values()]
  const paidTrials = allRows.filter(t => t.type === 'income' && t.category === '試堂' && (money(t.amount) ?? 0) > 0)
  const rows = allRows
    .filter(t => inPeriod(t.created_at, period) && (branch === '全部分店' || t.branch === branch))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  let income = 0, cashExpense = 0, operatingExpense = 0, recordedGross = 0
  let missingProfit = 0, missingCost = 0, profitReview = 0, trialOverlapReview = 0, dateReview = 0, incomeCount = 0, expenseCount = 0
  const packages = { new: 0, renewal: 0, unknown: 0 }
  const categories = new Map()
  const details = rows.map(t => {
    const amount = money(t.amount)
    const category = t.category || '未分類'
    const kind = t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : 'other'
    const dateNeedsReview = Number(hkDay(t.created_at).slice(0, 4)) < 2024
    if (dateNeedsReview) dateReview++
    const bucketKey = `${kind}:${category}`
    if (!categories.has(bucketKey)) categories.set(bucketKey, { kind, category, count: 0, amount: 0 })
    const bucket = categories.get(bucketKey)
    bucket.count++
    bucket.amount += amount ?? 0
    let profit = null
    let profitNeedsReview = false
    let trialOverlap = false
    if (kind === 'income') {
      incomeCount++
      income += amount ?? 0
      const savedProfit = money(t.profit)
      const savedCost = money(t.cost)
      profit = savedProfit ?? (amount !== null && savedCost !== null ? amount - savedCost : null)
      if (profit === null) missingProfit++
      else recordedGross += profit
      if (savedCost === null && amount !== null && amount > 0) missingCost++
      const noteProfit = String(t.note || '').match(/\[淨利:\s*\$\s*(-?\d+(?:\.\d+)?)\]/)
      const noteMismatch = category === '零售收入' && noteProfit && savedProfit !== null &&
        Math.abs(savedProfit - Number(noteProfit[1])) > 0.51
      const intentionalVipMargin = category === '運動套票' && /VIP點數30點/i.test(String(t.note || '')) && savedProfit === 0
      const formulaMismatch = category !== '試堂調整' && !intentionalVipMargin && savedProfit !== null && savedCost !== null && amount !== null &&
        Math.abs(savedProfit - (amount - savedCost)) > 0.01
      // A no-open adjustment represents the entire trial margin. A prior paid trial
      // can therefore make the saved ledger count the same trial twice. Names alone
      // are only evidence for review; never rewrite or silently net these old rows.
      const relatedPaidTrials = category === '試堂調整' && String(t.note || '').includes('[TRIAL_PROFIT:') ? paidTrials.filter(p => {
        const sameClient = t.client_id && p.client_id && String(t.client_id) === String(p.client_id)
        const unlinkedPaidName = !p.client_id && String(t.client_name || '').trim().toLowerCase() &&
          String(t.client_name || '').trim().toLowerCase() === String(p.client_name || '').trim().toLowerCase()
        const days = (Date.parse(`${hkDay(t.created_at)}T00:00:00Z`) - Date.parse(`${hkDay(p.created_at)}T00:00:00Z`)) / 86400000
        return (sameClient || unlinkedPaidName) && Number.isFinite(days) && days >= 0 && days <= 60
      }) : []
      if (relatedPaidTrials.length) {
        const expectedTotal = /MyGift/i.test(String(t.note || '')) ? -53.4 : 44.6
        trialOverlap = relatedPaidTrials.length !== 1 || savedProfit === null ||
          money(relatedPaidTrials[0].profit) === null ||
          Math.abs(savedProfit + money(relatedPaidTrials[0].profit) - expectedTotal) > 0.01
      }
      if (trialOverlap) trialOverlapReview++
      profitNeedsReview = Boolean(noteMismatch || formulaMismatch || trialOverlap)
      if (profitNeedsReview) profitReview++
      if (category === '運動套票' || category === '運動') {
        if (t.is_renewal === true) packages.renewal++
        else if (t.is_new_client === true) packages.new++
        else packages.unknown++
      }
    } else if (kind === 'expense') {
      expenseCount++
      cashExpense += amount ?? 0
      if (!excludedExpense.has(category)) operatingExpense += amount ?? 0
    }
    return { ...t, day: hkDay(t.created_at), kind, amount, profit, profitNeedsReview, trialOverlap, dateNeedsReview,
      excluded: kind === 'expense' && excludedExpense.has(category) }
  })
  return {
    rows: details, categories: [...categories.values()].map(x => ({ ...x, amount: round(x.amount) })),
    income: round(income), cashExpense: round(cashExpense), operatingExpense: round(operatingExpense),
    recordedGross: round(recordedGross), net: missingProfit ? null : round(recordedGross - operatingExpense),
    partialNet: round(recordedGross - operatingExpense), missingProfit, missingCost, profitReview, trialOverlapReview, dateReview, incomeCount, expenseCount,
    excludedExpense: round(cashExpense - operatingExpense), packages
  }
}

export function calculateTrialFunnel(clients, period, branch = '全部分店') {
  const rows = (clients || []).filter(c =>
    inPeriod(c.trial_date, period) && (branch === '全部分店' || c.branch === branch)
  )
  let attended = 0, opened = 0, noShow = 0, pending = 0
  for (const client of rows) {
    const results = [...String(client.remark || '').matchAll(/\[TRIAL_RESULT\]\|([^|\n]+)\|([^|\n]+)/g)]
    const outcome = results.at(-1)?.[2] || ''
    if (outcome.startsWith('opened_')) { attended++; opened++ }
    else if (outcome.startsWith('no_open')) attended++
    else if (outcome === 'no_show') noShow++
    else pending++
  }
  return { booked: rows.length, attended, opened, noShow, pending,
    conversion: attended ? round(opened / attended * 100) : null }
}
