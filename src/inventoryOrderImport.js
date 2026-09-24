import { supabase } from './supabase'

const OCR_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
const OCR_LANG = ['chi_tra', 'eng']

const META_LINE_RE = /^(價格為|價格|銷售量點數|收入基數|您的折扣|後金額為|折扣後金額|產品收入基數|其他費用|運費|數量|數|量|HK\$|HKD|總計|小計|訂單摘要|產品|產品名稱|產品編號)\s*[:：]?/i

function normalizeDigits(value = '') {
  return String(value).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
}

function cleanLine(value = '') {
  return normalizeDigits(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function normalizeName(value = '') {
  return cleanLine(value)
    .toLowerCase()
    .replace(/[®©™@]/g, '')
    .replace(/(每盒)?\s*\d+(?:\.\d+)?\s*(?:克|g|kg|毫升|ml|包|粒|片|支|盒)\b/gi, '')
    .replace(/[\s\-–—_()（）【】\[\]{}，,。.:：;；/\\+]/g, '')
}

function productCodeCandidates(product = {}) {
  return [
    product.product_no,
    product.product_code,
    product.code,
    product.sku,
    product.item_no,
    product.stock_no,
    product.stock_number,
    product.id
  ]
    .map(v => cleanLine(v || ''))
    .filter(Boolean)
    .flatMap(v => {
      const exact = v.match(/^\d{4}$/)?.[0]
      const embedded = v.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1]
      return [exact, embedded].filter(Boolean)
    })
}

function bigrams(text) {
  const s = normalizeName(text)
  if (s.length < 2) return s ? [s] : []
  return Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2))
}

function similarity(a, b) {
  const aa = normalizeName(a)
  const bb = normalizeName(b)
  if (!aa || !bb) return 0
  if (aa === bb) return 1
  if (aa.includes(bb) || bb.includes(aa)) {
    return 0.9 + 0.09 * (Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length))
  }
  const aBi = bigrams(aa)
  const bBi = bigrams(bb)
  if (!aBi.length || !bBi.length) return 0
  const pool = [...bBi]
  let hits = 0
  for (const gram of aBi) {
    const idx = pool.indexOf(gram)
    if (idx >= 0) {
      hits++
      pool.splice(idx, 1)
    }
  }
  return (2 * hits) / (aBi.length + bBi.length)
}

function bestProductMatch(row, products = []) {
  const code = cleanLine(row.code || '')
  if (code) {
    const byCode = products.find(p => productCodeCandidates(p).includes(code))
    if (byCode) return { product: byCode, confidence: 1, method: '產品編號' }
  }

  const sourceName = row.name || ''
  let best = null
  let bestScore = 0
  for (const product of products) {
    const names = [product.name, product.name_en, product.description, product.product_name].filter(Boolean)
    for (const name of names) {
      const score = similarity(sourceName, name)
      if (score > bestScore) {
        best = product
        bestScore = score
      }
    }
  }
  if (best && bestScore >= 0.58) {
    return { product: best, confidence: bestScore, method: bestScore >= 0.86 ? '產品名稱' : '模糊名稱' }
  }
  return { product: null, confidence: bestScore, method: '未配對' }
}

function looksLikeProductStart(line) {
  const match = cleanLine(line).match(/^(\d{4})\s*[-:：]?\s*(.+)$/)
  if (!match) return null
  const tail = match[2].trim()
  if (!tail || /^\d[\d,.]*$/.test(tail) || META_LINE_RE.test(tail)) return null
  if (!/[A-Za-z\u3400-\u9fff]/.test(tail)) return null
  return { code: match[1], name: tail }
}

function extractProductRows(rawText = '', products = []) {
  const lines = String(rawText).split(/\r?\n/).map(cleanLine).filter(Boolean)
  const rows = []

  for (let i = 0; i < lines.length; i++) {
    const start = looksLikeProductStart(lines[i])
    if (!start) continue

    let name = start.name
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const next = lines[j]
      if (looksLikeProductStart(next) || META_LINE_RE.test(next) || /^HK\$?/i.test(next) || /^\d[\d,.]*$/.test(next)) break
      if (next.length <= 24 && /[A-Za-z\u3400-\u9fff]/.test(next)) name += ` ${next}`
    }

    const inlineQty = name.match(/(?:數量|qty|x|×)\s*[:：]?\s*(\d{1,3})\b/i)?.[1]
    name = name.replace(/(?:數量|qty|x|×)\s*[:：]?\s*\d{1,3}\b/ig, '').trim()
    rows.push({ code: start.code, name, qty: inlineQty ? Number(inlineQty) : null })
  }

  if (!rows.length && products.length) {
    const compactText = normalizeName(rawText)
    for (const product of products) {
      const candidate = normalizeName(product.name)
      if (candidate.length >= 4 && compactText.includes(candidate)) {
        rows.push({ code: productCodeCandidates(product)[0] || '', name: product.name, qty: null })
      }
    }
  }

  const quantityAnchor = lines.findIndex((line, idx) =>
    /數量/.test(line) || (line === '數' && lines[idx + 1] === '量')
  )
  if (quantityAnchor >= 0) {
    const quantityPool = []
    for (let i = quantityAnchor + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^\d{1,3}$/.test(line)) {
        const n = Number(line)
        if (n > 0 && n <= 999) quantityPool.push(n)
      }
    }
    let qIndex = 0
    rows.forEach(row => {
      if (!row.qty && quantityPool[qIndex] != null) row.qty = quantityPool[qIndex++]
    })
  }

  return rows.map((row, index) => {
    const match = bestProductMatch(row, products)
    return {
      key: `${row.code || 'row'}-${index}-${Date.now()}`,
      code: row.code,
      sourceName: row.name,
      qty: Number(row.qty) || 1,
      product: match.product,
      confidence: match.confidence,
      method: match.method
    }
  })
}

function ensureTesseract() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-fitwork-tesseract]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Tesseract), { once: true })
      existing.addEventListener('error', () => reject(new Error('OCR 載入失敗')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = OCR_SCRIPT
    script.async = true
    script.dataset.fitworkTesseract = '1'
    script.onload = () => resolve(window.Tesseract)
    script.onerror = () => reject(new Error('OCR 元件載入失敗，請檢查網絡後再試'))
    document.head.appendChild(script)
  })
}

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function injectStyles() {
  if (document.getElementById('fitwork-inventory-import-style')) return
  const style = document.createElement('style')
  style.id = 'fitwork-inventory-import-style'
  style.textContent = `
    .inv-import-launch{width:100%;margin:8px 0 12px;padding:12px 14px;border:1px solid #c7d2fe;border-radius:14px;background:linear-gradient(135deg,#eef2ff,#fff);color:#4338ca;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(79,70,229,.08)}
    .inv-import-overlay{position:fixed;inset:0;z-index:12050;background:rgba(15,23,42,.58);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:max(14px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom))}
    .inv-import-modal{width:min(680px,100%);max-height:min(88vh,820px);background:#fff;border-radius:24px;box-shadow:0 30px 80px rgba(15,23,42,.28);display:flex;flex-direction:column;overflow:hidden}
    .inv-import-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #e2e8f0;color:#1e293b}.inv-import-head b{font-size:18px}.inv-import-close{width:36px;height:36px;border:0;border-radius:12px;background:#f1f5f9;font-weight:900;font-size:18px}
    .inv-import-body{padding:16px 18px;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}.inv-import-note{font-size:12px;line-height:1.5;color:#64748b;background:#f8fafc;border-radius:12px;padding:10px 12px;margin-bottom:12px}
    .inv-import-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.inv-import-file,.inv-import-parse{min-height:46px;border:0;border-radius:13px;font-weight:900;font-size:14px}.inv-import-file{background:#4f46e2;color:#fff;display:flex;align-items:center;justify-content:center}.inv-import-file input{display:none}.inv-import-parse{background:#0f172a;color:#fff}
    .inv-import-progress{display:none;margin:8px 0 12px;padding:10px;border-radius:12px;background:#ecfeff;color:#0f766e;font-size:12px;font-weight:800}.inv-import-progress.show{display:block}
    .inv-import-text{width:100%;min-height:150px;box-sizing:border-box;border:2px solid #e2e8f0;border-radius:14px;padding:12px;font-size:13px;line-height:1.5;resize:vertical;color:#1e293b;background:#fff}.inv-import-text:focus{outline:none;border-color:#6366f1}
    .inv-import-preview{margin-top:14px}.inv-import-empty{padding:18px;text-align:center;color:#94a3b8;font-size:13px;border:1px dashed #cbd5e1;border-radius:14px}.inv-import-row{display:grid;grid-template-columns:1fr 82px;gap:10px;padding:12px 0;border-bottom:1px solid #eef2f7}.inv-import-row:last-child{border-bottom:0}.inv-import-name{font-size:13px;font-weight:900;color:#1e293b;line-height:1.35}.inv-import-source{font-size:11px;color:#64748b;margin-top:4px}.inv-import-status{display:inline-flex;margin-top:5px;padding:3px 7px;border-radius:99px;font-size:10px;font-weight:900;background:#dcfce7;color:#15803d}.inv-import-status.warn{background:#fee2e2;color:#b91c1c}.inv-import-qty{width:100%;height:42px;box-sizing:border-box;border:2px solid #cbd5e1;border-radius:10px;text-align:center;font-size:18px;font-weight:900;color:#4338ca}
    .inv-import-footer{padding:14px 18px calc(14px + env(safe-area-inset-bottom));border-top:1px solid #e2e8f0;background:#fff}.inv-import-branch{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.inv-import-branch button{border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:9px 5px;font-weight:900;color:#64748b}.inv-import-branch button.active{background:#eef2ff;border-color:#6366f1;color:#4338ca}.inv-import-confirm{width:100%;min-height:50px;border:0;border-radius:14px;background:#10b981;color:#fff;font-size:16px;font-weight:900}.inv-import-confirm:disabled{opacity:.45}.inv-import-summary{font-size:11px;color:#64748b;text-align:center;margin-bottom:9px}
    @media(max-width:430px){.inv-import-overlay{align-items:flex-end;padding:0}.inv-import-modal{max-height:92dvh;border-radius:24px 24px 0 0}.inv-import-body{padding:14px}.inv-import-head{padding:14px}.inv-import-actions{grid-template-columns:1fr}.inv-import-text{min-height:130px}.inv-import-footer{padding:12px 14px calc(12px + env(safe-area-inset-bottom))}}
  `
  document.head.appendChild(style)
}

export function installInventoryOrderImport(store) {
  injectStyles()
  let launchButton = null
  let overlay = null
  let rows = []
  let branch = '觀塘'
  let busy = false

  const updateSummary = () => {
    if (!overlay) return
    const matched = rows.filter(r => r.product)
    const unmatched = rows.length - matched.length
    const qty = matched.reduce((sum, row) => sum + Number(row.qty || 0), 0)
    overlay.querySelector('.inv-import-summary').textContent = `已配對 ${matched.length} 款／${qty} 件${unmatched ? ` · ${unmatched} 款未配對不會寫入` : ''}`
    overlay.querySelector('.inv-import-confirm').disabled = busy || matched.length === 0
  }

  const renderPreview = () => {
    if (!overlay) return
    const box = overlay.querySelector('.inv-import-preview')
    const summary = overlay.querySelector('.inv-import-summary')
    const confirm = overlay.querySelector('.inv-import-confirm')
    if (!rows.length) {
      box.innerHTML = '<div class="inv-import-empty">貼上訂單文字，或者上傳訂單截圖後，這裡會先顯示辨識結果。</div>'
      summary.textContent = '尚未有可入庫項目'
      confirm.disabled = true
      return
    }
    box.innerHTML = rows.map((row, index) => `
      <div class="inv-import-row" data-index="${index}">
        <div>
          <div class="inv-import-name">${row.product ? esc(row.product.name) : '⚠️ 未找到對應產品'}</div>
          <div class="inv-import-source">${row.code ? `#${esc(row.code)} · ` : ''}${esc(row.sourceName)}</div>
          <span class="inv-import-status ${row.product ? '' : 'warn'}">${row.product ? `✓ ${esc(row.method)}` : '需要手動處理'}</span>
        </div>
        <input class="inv-import-qty" type="number" inputmode="numeric" min="1" max="999" value="${row.qty}" aria-label="數量">
      </div>`).join('')

    box.querySelectorAll('.inv-import-qty').forEach(input => {
      input.addEventListener('input', () => {
        const idx = Number(input.closest('.inv-import-row')?.dataset.index)
        if (!Number.isInteger(idx) || !rows[idx]) return
        rows[idx].qty = Math.max(1, Math.min(999, Number(input.value) || 1))
        updateSummary()
      })
    })
    updateSummary()
  }

  const setProgress = (message = '') => {
    if (!overlay) return
    const el = overlay.querySelector('.inv-import-progress')
    el.textContent = message
    el.classList.toggle('show', Boolean(message))
  }

  const parseCurrentText = () => {
    if (!overlay) return
    const text = overlay.querySelector('.inv-import-text').value
    rows = extractProductRows(text, store.products || [])
    renderPreview()
    if (!rows.length) setProgress('⚠️ 暫時找不到產品列。可保留產品編號／產品名稱／數量再試。')
    else setProgress('')
  }

  const recognizeImage = async (file) => {
    if (!file || !overlay || busy) return
    busy = true
    updateSummary()
    setProgress('📷 正在載入本機 OCR…')
    try {
      const Tesseract = await ensureTesseract()
      const worker = await Tesseract.createWorker(OCR_LANG, 1, {
        logger: msg => {
          if (!overlay || !msg) return
          if (msg.status === 'recognizing text') {
            setProgress(`🔎 正在辨識圖片… ${Math.round((msg.progress || 0) * 100)}%`)
          } else if (msg.status) {
            setProgress(`🔎 ${msg.status}`)
          }
        }
      })
      const result = await worker.recognize(file, { rotateAuto: true })
      await worker.terminate()
      overlay.querySelector('.inv-import-text').value = result?.data?.text || ''
      rows = extractProductRows(result?.data?.text || '', store.products || [])
      renderPreview()
      setProgress(rows.length ? '✅ 圖片辨識完成，請先核對產品及數量，再確認入庫。' : '⚠️ 圖片已讀取，但未找到產品；可在文字框修正後再按「重新配對文字」。')
    } catch (err) {
      console.error('Inventory OCR failed', err)
      setProgress(`❌ 圖片辨識失敗：${err?.message || '未知錯誤'}。你仍可直接貼上複製文字。`)
    } finally {
      busy = false
      updateSummary()
    }
  }

  const closeModal = () => {
    overlay?.remove()
    overlay = null
    rows = []
    busy = false
    document.documentElement.style.removeProperty('overflow')
  }

  const confirmImport = async () => {
    if (busy) return
    const matched = rows.filter(r => r.product && Number(r.qty) > 0)
    if (!matched.length) return alert('暫時沒有已配對的產品可以入庫。')
    if (!confirm(`確認將 ${matched.length} 款／${matched.reduce((s, r) => s + Number(r.qty), 0)} 件加入「${branch}」庫存？`)) return

    busy = true
    updateSummary()
    setProgress('📦 正在寫入庫存…')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('登入狀態已失效，請重新登入')

      const failures = []
      for (const row of matched) {
        const name = row.product.name
        const qty = Number(row.qty)
        const { data: stockData, error: selectError } = await supabase.from('stock')
          .select('quantity')
          .eq('prod_name', name)
          .eq('branch', branch)
          .eq('user_id', user.id)
          .maybeSingle()

        if (selectError) {
          failures.push(`${name}: ${selectError.message}`)
          continue
        }

        const newQty = Number(stockData?.quantity || 0) + qty
        let error = null
        if (stockData) {
          const result = await supabase.from('stock')
            .update({ quantity: newQty, own_email: user.email })
            .eq('prod_name', name)
            .eq('branch', branch)
            .eq('user_id', user.id)
          error = result.error
        } else {
          const result = await supabase.from('stock').insert({
            prod_name: name,
            branch,
            quantity: newQty,
            user_id: user.id,
            own_email: user.email
          })
          error = result.error
        }
        if (error) failures.push(`${name}: ${error.message}`)
      }

      await store.syncAll()
      if (failures.length) {
        setProgress(`⚠️ 已完成部分入庫；${failures.length} 款失敗。請檢查庫存後再補入。`)
        alert(`⚠️ 部分產品入庫失敗：\n${failures.slice(0, 5).join('\n')}`)
      } else {
        alert(`✅ 快速入庫完成！\n${matched.length} 款產品已加入「${branch}」庫存。`)
        closeModal()
      }
    } catch (err) {
      console.error('Inventory import failed', err)
      setProgress(`❌ 入庫失敗：${err?.message || '未知錯誤'}`)
      alert('❌ 入庫失敗：' + (err?.message || '未知錯誤'))
    } finally {
      busy = false
      updateSummary()
    }
  }

  const openModal = () => {
    if (overlay) return
    branch = document.querySelector('.branch-tabs button.active')?.textContent?.includes('中環') ? '中環'
      : document.querySelector('.branch-tabs button.active')?.textContent?.includes('佐敦') ? '佐敦'
      : '觀塘'

    overlay = document.createElement('div')
    overlay.className = 'inv-import-overlay'
    overlay.innerHTML = `
      <div class="inv-import-modal" role="dialog" aria-modal="true" aria-label="訂單快速入庫">
        <div class="inv-import-head"><b>📷 訂單圖片／文字快速入庫</b><button class="inv-import-close" type="button">✕</button></div>
        <div class="inv-import-body">
          <div class="inv-import-note">主要讀取「產品編號／產品名稱＋數量」。價格、VP、收入基數即使排版亂掉都可以忽略。圖片只在你的瀏覽器內做 OCR；辨識後一定先預覽，不會直接改庫存。</div>
          <div class="inv-import-actions">
            <label class="inv-import-file">📷 上傳訂單截圖<input type="file" accept="image/*" capture="environment"></label>
            <button type="button" class="inv-import-parse">✨ 重新配對文字</button>
          </div>
          <div class="inv-import-progress"></div>
          <textarea class="inv-import-text" placeholder="亦可直接貼上從訂單圖片複製出來的文字…"></textarea>
          <div class="inv-import-preview"><div class="inv-import-empty">貼上訂單文字，或者上傳訂單截圖後，這裡會先顯示辨識結果。</div></div>
        </div>
        <div class="inv-import-footer">
          <div class="inv-import-branch">
            <button type="button" data-branch="觀塘">觀塘</button>
            <button type="button" data-branch="中環">中環</button>
            <button type="button" data-branch="佐敦">佐敦</button>
          </div>
          <div class="inv-import-summary">尚未有可入庫項目</div>
          <button type="button" class="inv-import-confirm" disabled>✅ 確認加入庫存</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    document.documentElement.style.overflow = 'hidden'

    const refreshBranch = () => overlay?.querySelectorAll('[data-branch]').forEach(btn => btn.classList.toggle('active', btn.dataset.branch === branch))
    refreshBranch()
    overlay.querySelector('.inv-import-close').addEventListener('click', closeModal)
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal() })
    overlay.querySelector('.inv-import-parse').addEventListener('click', parseCurrentText)
    overlay.querySelector('.inv-import-text').addEventListener('paste', () => setTimeout(parseCurrentText, 0))
    overlay.querySelector('.inv-import-file input').addEventListener('change', e => recognizeImage(e.target.files?.[0]))
    overlay.querySelectorAll('[data-branch]').forEach(btn => btn.addEventListener('click', () => { branch = btn.dataset.branch; refreshBranch() }))
    overlay.querySelector('.inv-import-confirm').addEventListener('click', confirmImport)
  }

  const mountButton = () => {
    const authenticated = Boolean(document.querySelector('#app-main'))
    const inventoryPage = authenticated && store.view === 'inventory'
    if (!inventoryPage) {
      launchButton?.remove()
      launchButton = null
      return
    }
    if (launchButton?.isConnected) return
    const filterBar = document.querySelector('.content .filter-bar')
    if (!filterBar) return
    launchButton = document.createElement('button')
    launchButton.type = 'button'
    launchButton.className = 'inv-import-launch'
    launchButton.innerHTML = '<span>📷</span><span>訂單圖片／文字快速入庫</span>'
    launchButton.addEventListener('click', openModal)
    filterBar.insertAdjacentElement('beforebegin', launchButton)
  }

  store.$subscribe(() => requestAnimationFrame(mountButton))
  const observer = new MutationObserver(() => requestAnimationFrame(mountButton))
  observer.observe(document.getElementById('app'), { childList: true, subtree: true })
  requestAnimationFrame(mountButton)
}
