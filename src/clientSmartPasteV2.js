const normalizeDigits = (value = '') => String(value).replace(/[０-９]/g, d => String(d.charCodeAt(0) - 0xFEE0))

function pad2(n) { return String(n).padStart(2, '0') }

function validYMD(y, m, d) {
  const dt = new Date(Number(y), Number(m) - 1, Number(d))
  return dt.getFullYear() === Number(y) && dt.getMonth() === Number(m) - 1 && dt.getDate() === Number(d)
}

function parseDate(text) {
  let m = text.match(/\b(20\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?\b/)
  if (m && validYMD(m[1], m[2], m[3])) return { raw: m[0], value: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` }

  m = text.match(/(?:^|\s)(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?(?=\s|$)/)
  if (m) {
    const year = new Date().getFullYear()
    if (validYMD(year, m[1], m[2])) return { raw: m[0].trim(), value: `${year}-${pad2(m[1])}-${pad2(m[2])}` }
  }
  return null
}

function parseTime(text) {
  const m = text.match(/(?:^|\s)([01]?\d|2[0-3])\s*[:：時點]\s*([0-5]\d)?\s*分?(?=\s|$)/)
  if (!m) return null
  return { raw: m[0].trim(), value: `${pad2(m[1])}:${pad2(m[2] || 0)}` }
}

function parsePhone(text) {
  const candidates = [...text.matchAll(/(?:\+?852[\s-]?)?(?:\d[\s-]?){8,11}/g)]
    .map(m => ({ raw: m[0], digits: m[0].replace(/\D/g, '') }))
    .map(x => ({ ...x, phone: x.digits.startsWith('852') && x.digits.length === 11 ? x.digits.slice(3) : x.digits }))
    .filter(x => x.phone.length >= 8 && x.phone.length <= 11)
  const hk = candidates.find(x => x.phone.length === 8)
  return hk || candidates[0] || null
}

function parseName(text, parsed) {
  let s = text
  ;[parsed.phone?.raw, parsed.date?.raw, parsed.time?.raw].filter(Boolean).forEach(raw => { s = s.replace(raw, ' ') })
  s = s
    .replace(/(?:試堂|預約|booking|trial|日期|時間|電話|tel|phone|姓名|name|分店|觀塘|中環|佐敦)/gi, ' ')
    .replace(/[|,，、;；]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const chunks = s.split(' ').filter(Boolean).filter(x => !/^\d+$/.test(x))
  if (!chunks.length) return ''
  const chinese = chunks.find(x => /^[\u3400-\u9fff·]{2,8}$/.test(x))
  if (chinese) return chinese
  return chunks.slice(0, 3).join(' ').replace(/[^A-Za-z\u3400-\u9fff·' -]/g, '').trim()
}

function parseSmart(text) {
  const clean = normalizeDigits(text).replace(/\r/g, ' ').trim()
  const parsed = { phone: parsePhone(clean), date: parseDate(clean), time: parseTime(clean) }
  parsed.name = parseName(clean, parsed)
  return parsed
}

function setVueInput(el, value) {
  if (!el || value == null || value === '') return
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function findField(modal, labelText) {
  const items = [...modal.querySelectorAll('.f-item')]
  const item = items.find(x => (x.querySelector('label')?.textContent || '').includes(labelText))
  return item?.querySelector('input, textarea, select') || null
}

function installBox(modal, oldBox) {
  if (oldBox.dataset.smartV2 === '1') return
  oldBox.dataset.smartV2 = '1'
  oldBox.innerHTML = `
    <label style="color:#4f46e2;font-size:13px;font-weight:900;display:block;margin-bottom:8px">🪄 Smart 試堂快捷輸入</label>
    <textarea class="smart-v2-text modern-inp" rows="2" placeholder="例如：25/9 19:30 陳大文 98765432\n亦可只輸入：陳大文 98765432" style="resize:none;min-height:72px;line-height:1.45"></textarea>
    <div class="smart-v2-preview" style="display:none;margin-top:9px;padding:9px 10px;border-radius:10px;background:#fff;color:#475569;font-size:12px;font-weight:800;line-height:1.65"></div>
    <button type="button" class="smart-v2-apply" style="width:100%;margin-top:9px;border:0;border-radius:12px;padding:12px;background:#4f46e2;color:white;font-weight:900;font-size:14px">✨ 自動辨識並套用</button>
    <div style="font-size:11px;color:#64748b;margin-top:7px;line-height:1.45">日期／時間可留空。電話會優先辨識；有日期及時間時會一併填入試堂預約。</div>`

  const textarea = oldBox.querySelector('.smart-v2-text')
  const preview = oldBox.querySelector('.smart-v2-preview')
  const apply = oldBox.querySelector('.smart-v2-apply')

  const render = () => {
    const p = parseSmart(textarea.value)
    const bits = []
    if (p.name) bits.push(`✓ 姓名：${p.name}`)
    if (p.phone) bits.push(`✓ 電話：${p.phone.phone}`)
    if (p.date) bits.push(`✓ 日期：${p.date.value}`)
    if (p.time) bits.push(`✓ 時間：${p.time.value}`)
    preview.style.display = textarea.value.trim() ? 'block' : 'none'
    preview.innerHTML = bits.length ? bits.join('<br>') : '⚠️ 暫時未辨識到姓名或電話'
  }

  const applyParsed = () => {
    const p = parseSmart(textarea.value)
    if (!p.name && !p.phone) {
      preview.style.display = 'block'
      preview.textContent = '⚠️ 請至少輸入姓名或電話'
      return
    }
    const nameEl = findField(modal, '姓名')
    const phoneEl = findField(modal, '電話')
    if (p.name) setVueInput(nameEl, p.name)
    if (p.phone) setVueInput(phoneEl, p.phone.phone)

    if (p.date) {
      const dateTime = modal.querySelector('input[type="datetime-local"]')
      if (dateTime) setVueInput(dateTime, `${p.date.value}T${p.time?.value || '10:00'}`)
    }

    preview.style.display = 'block'
    const missing = []
    if (!p.date) missing.push('日期')
    if (!p.time) missing.push('時間')
    preview.innerHTML = `✅ 已套用${p.name ? `「${p.name}」` : ''}${p.phone ? ` ${p.phone.phone}` : ''}${missing.length ? `<br><span style="color:#d97706">${missing.join('／')}未輸入，可稍後再填</span>` : '<br>日期及時間已一併辨識'}`
  }

  textarea.addEventListener('input', render)
  textarea.addEventListener('paste', () => setTimeout(render, 0))
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyParsed() }
  })
  apply.addEventListener('click', applyParsed)
}

export function installClientSmartPasteV2() {
  const scan = () => {
    document.querySelectorAll('.center-modal').forEach(modal => {
      const label = [...modal.querySelectorAll('label')].find(x => (x.textContent || '').includes('智能快捷貼上'))
      const box = label?.closest('.f-item')
      if (box) installBox(modal, box)
    })
  }
  scan()
  const observer = new MutationObserver(scan)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
