const REFERRAL_ITEM_PATTERNS = [
  '推薦朋友送運動2格',
  '推介朋友送運動2格',
  '介紹朋友送運動2格',
  '推薦朋友送2格',
  '推介朋友送2格',
  '介紹朋友送2格'
]

const normalize = (value = '') => String(value).replace(/\s+/g, '').toLowerCase()

const isReferralGiftItem = (value = '') => {
  const text = normalize(value)
  return REFERRAL_ITEM_PATTERNS.some(pattern => text.includes(normalize(pattern)))
}

export function installPurchaseImportReferralCompat() {
  const handledRows = new Set()
  let scheduled = false

  const applyMappings = () => {
    scheduled = false
    const modal = document.getElementById('purchase-import-modal')
    if (!modal) return

    modal.querySelectorAll('.purchase-import-row').forEach(row => {
      const sourceText = row.querySelector('.purchase-import-source b')?.textContent || ''
      if (!isReferralGiftItem(sourceText)) return

      const select = row.querySelector('[data-import-package]')
      const rowId = select?.dataset?.importPackage
      if (!select || !rowId || handledRows.has(rowId)) return

      handledRows.add(rowId)
      if (!select.value) {
        select.value = 'referral_free'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(applyMappings)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  schedule()

  return () => observer.disconnect()
}
