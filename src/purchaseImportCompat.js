// Compatibility fixes and review helpers for purchase-history imports.
// Keeps the main import workflow untouched while improving branch recognition / confirmation.
const CENTRAL_ALIASES = [
  /\bFitZion\s*Bc\b/gi,
  /\bFit\s*Zion\s*Bc\b/gi
]

const BRANCHES = ['觀塘', '中環', '佐敦']
const BULK_BRANCH_ID = 'purchase-import-bulk-branch'
const APPLY_BRANCH_ID = 'purchase-import-apply-branch'
const BRANCH_SUMMARY_ID = 'purchase-import-branch-summary'

const normalizeHeader = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, '')

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

function csvCell(value = '') {
  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function forceBranchInSpreadsheet(text, branch) {
  const raw = String(text || '')
  const hadBom = raw.startsWith('\uFEFF')
  const cleaned = raw.replace(/^\uFEFF/, '')
  const lines = cleaned.split(/\r?\n/)
  if (!lines.length || !lines[0].trim()) return raw

  const isTsv = lines[0].includes('\t')
  const parse = line => isTsv ? line.split('\t') : parseCsvLine(line)
  const serialize = cells => isTsv ? cells.join('\t') : cells.map(csvCell).join(',')

  const headers = parse(lines[0])
  const branchAliases = new Set(['店別', '分店', '銷售門市', '門市'].map(normalizeHeader))
  let branchIndexes = headers
    .map((header, index) => branchAliases.has(normalizeHeader(header)) ? index : -1)
    .filter(index => index >= 0)

  if (!branchIndexes.length) {
    headers.push('分店')
    branchIndexes = [headers.length - 1]
  }

  const nextLines = [serialize(headers)]
  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      nextLines.push(line)
      continue
    }
    const cells = parse(line)
    const neededLength = Math.max(...branchIndexes) + 1
    while (cells.length < neededLength) cells.push('')
    branchIndexes.forEach(index => { cells[index] = branch })
    nextLines.push(serialize(cells))
  }

  return (hadBom ? '\uFEFF' : '') + nextLines.join('\n')
}

function getVisibleBranchCounts() {
  const counts = { 觀塘: 0, 中環: 0, 佐敦: 0 }
  document.querySelectorAll('#purchase-import-review-step .purchase-import-person > small').forEach(node => {
    const parts = String(node.textContent || '').split('·').map(v => v.trim())
    const branch = parts[parts.length - 1]
    if (Object.prototype.hasOwnProperty.call(counts, branch)) counts[branch]++
  })
  return counts
}

export function installPurchaseImportCompat() {
  let activeModal = null
  let forcedBranch = ''

  const normalizeLegacyBranchLabels = () => {
    const textarea = document.querySelector('#purchase-import-text')
    if (!textarea?.value) return

    let nextValue = textarea.value
    for (const alias of CENTRAL_ALIASES) {
      nextValue = nextValue.replace(alias, '中環')
    }
    textarea.value = nextValue
  }

  const onClickCapture = (event) => {
    const analyzeButton = event.target?.closest?.('#purchase-import-analyze')
    if (!analyzeButton) return
    normalizeLegacyBranchLabels()
  }

  const updateBranchSummary = () => {
    const summary = document.getElementById(BRANCH_SUMMARY_ID)
    if (!summary) return
    const counts = getVisibleBranchCounts()
    const detected = BRANCHES.filter(branch => counts[branch] > 0)
      .map(branch => `${branch} ${counts[branch]}`)
      .join('｜') || '未識別'
    const nextText = forcedBranch
      ? `✓ 已確認整批：${forcedBranch}｜目前識別：${detected}`
      : `系統識別：${detected}｜如分地區匯入，可先一鍵確認地區。`

    // MutationObserver 監聽 body；只有內容真的改變時才寫 DOM，避免 summary 自己觸發無限 observer 迴圈。
    if (summary.textContent !== nextText) summary.textContent = nextText
  }

  const ensureBulkBranchControl = () => {
    const modal = document.getElementById('purchase-import-modal')
    if (!modal) {
      activeModal = null
      forcedBranch = ''
      return
    }
    if (modal !== activeModal) {
      activeModal = modal
      forcedBranch = ''
    }

    const bulk = modal.querySelector('#purchase-import-review-step .purchase-import-bulk')
    if (!bulk) return

    let select = bulk.querySelector(`#${BULK_BRANCH_ID}`)
    if (!select) {
      const label = document.createElement('label')
      label.textContent = '地區'

      select = document.createElement('select')
      select.id = BULK_BRANCH_ID
      select.innerHTML = `
        <option value="">系統識別</option>
        ${BRANCHES.map(branch => `<option value="${branch}">${branch}</option>`).join('')}
      `

      const apply = document.createElement('button')
      apply.type = 'button'
      apply.id = APPLY_BRANCH_ID
      apply.className = 'purchase-import-secondary'
      apply.textContent = '一鍵套用地區'

      const summary = document.createElement('span')
      summary.id = BRANCH_SUMMARY_ID

      const firstLabel = bulk.querySelector('label')
      bulk.insertBefore(label, firstLabel || bulk.firstChild)
      bulk.insertBefore(select, firstLabel || null)
      bulk.insertBefore(apply, firstLabel || null)
      bulk.insertBefore(summary, firstLabel || null)

      select.addEventListener('change', () => {
        forcedBranch = select.value
        updateBranchSummary()
      })

      apply.addEventListener('click', () => {
        const branch = String(select.value || '').trim()
        if (!branch) return alert('請先選擇「觀塘 / 中環 / 佐敦」，再一鍵套用。')

        const textarea = modal.querySelector('#purchase-import-text')
        const analyzeButton = modal.querySelector('#purchase-import-analyze')
        if (!textarea?.value || !analyzeButton) return alert('找不到原本貼入的 Excel 資料，請返回修改後再試。')

        textarea.value = forceBranchInSpreadsheet(textarea.value, branch)
        forcedBranch = branch
        apply.disabled = true
        apply.textContent = `正在套用${branch}…`

        // 重新分析同一份資料，讓真正寫入資料庫的 row.branch 也同步更新。
        // 這一步不會寫入任何交易，只是重新產生 Review 畫面。
        analyzeButton.click()
      })
    }

    select.value = forcedBranch
    updateBranchSummary()
  }

  document.addEventListener('click', onClickCapture, true)
  const observer = new MutationObserver(ensureBulkBranchControl)
  observer.observe(document.body, { childList: true, subtree: true })
  ensureBulkBranchControl()

  return () => {
    document.removeEventListener('click', onClickCapture, true)
    observer.disconnect()
  }
}
