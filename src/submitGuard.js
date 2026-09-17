// Prevent accidental double-submit on high-impact action buttons.
// This is presentation/event safety only; business logic remains inside the existing views.
const LOCK_MS = 3000
const guardedLabels = new Set([
  '立即新增客戶',
  '確認修改',
  '✅ 儲存'
])

const normalizeLabel = (button) => String(button?.textContent || '').replace(/\s+/g, ' ').trim()

export function installSubmitGuard() {
  const lockedUntil = new WeakMap()

  const onClickCapture = (event) => {
    const button = event.target?.closest?.('button')
    if (!button) return

    const label = normalizeLabel(button)
    if (!guardedLabels.has(label)) return

    const now = Date.now()
    const until = lockedUntil.get(button) || 0
    if (now < until) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      return
    }

    lockedUntil.set(button, now + LOCK_MS)
    button.dataset.submitGuardLocked = '1'
    const originalOpacity = button.style.opacity
    const originalPointerEvents = button.style.pointerEvents
    button.style.opacity = '0.72'
    button.style.pointerEvents = 'none'

    window.setTimeout(() => {
      lockedUntil.delete(button)
      delete button.dataset.submitGuardLocked
      button.style.opacity = originalOpacity
      button.style.pointerEvents = originalPointerEvents
    }, LOCK_MS)
  }

  document.addEventListener('click', onClickCapture, true)
  return () => document.removeEventListener('click', onClickCapture, true)
}
