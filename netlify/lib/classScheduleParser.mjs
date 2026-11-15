const cleanText = value => String(value || '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .trim()

export function hasTimetableLoginError(html) {
  return /無此帳號|密碼錯誤|帳號或密碼|登入失敗|認證失敗|id=["']loginForm["']/i.test(String(html || ''))
}

export function parseClassSchedule(html, requestedDate, branch) {
  const source = String(html || '').replace(/<!--[\s\S]*?-->/g, '')
  const table = source.match(/<table\b[^>]*class=["'][^"']*table-striped[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] || ''
  if (!table) throw new Error('課表格式暫時無法辨認。')
  const rows = []
  for (const [, rowHtml] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1])
    if (cells.length < 3) continue
    const [date, range] = cleanText(cells[0]).split(/\n+/).map(s => s.trim())
    const [title, coach] = cleanText(cells[1]).split(/\n+/).map(s => s.trim())
    const time = range?.match(/^([01]\d|2[0-3]):[0-5]\d\s*-\s*([01]\d|2[0-3]):[0-5]\d$/)
    if (date !== requestedDate || !time || !title) continue
    const occupancy = cleanText(cells[2]).match(/(\d+)\s*\/\s*(\d+)/)
    rows.push({
      date, branch, start: time[0].slice(0, 5), end: time[0].slice(-5),
      title, coach: coach || '',
      booked: occupancy ? Number(occupancy[1]) : null,
      capacity: occupancy ? Number(occupancy[2]) : null,
      full: /額滿/.test(cleanText(cells[3])) || Boolean(occupancy && Number(occupancy[1]) >= Number(occupancy[2]))
    })
  }
  return rows
}
