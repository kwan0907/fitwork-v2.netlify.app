// Mobile client-modal helper.
// Presentation / interaction only: no client data or business values are changed.
export function installClientModalMobileFix() {
  const media = window.matchMedia('(max-width: 600px)')
  let locked = false
  let savedScrollY = 0
  let previousBodyStyle = null

  const getClientModal = () => document.querySelector('#app-main .modal-overlay .scrollable-modal')

  const renameReferralOptions = () => {
    document.querySelectorAll('#app-main .modal-overlay select option').forEach(option => {
      if (option.value === '朋友介紹' && option.textContent !== '介紹朋友') {
        option.textContent = '介紹朋友'
      }
      if (option.value === '廣告+朋友介紹' && option.textContent !== '廣告 + 介紹朋友') {
        option.textContent = '廣告 + 介紹朋友'
      }
    })
  }

  const lockBackground = () => {
    if (locked) return
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0
    previousBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    }
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    locked = true
  }

  const unlockBackground = () => {
    if (!locked) return
    const old = previousBodyStyle || {}
    document.body.style.position = old.position || ''
    document.body.style.top = old.top || ''
    document.body.style.left = old.left || ''
    document.body.style.right = old.right || ''
    document.body.style.width = old.width || ''
    document.body.style.overflow = old.overflow || ''
    locked = false
    previousBodyStyle = null
    requestAnimationFrame(() => window.scrollTo(0, savedScrollY))
  }

  const sync = () => {
    const modalOpen = Boolean(getClientModal())
    if (modalOpen) renameReferralOptions()
    if (modalOpen && media.matches) lockBackground()
    else unlockBackground()
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
  media.addEventListener?.('change', sync)
  sync()

  return () => {
    observer.disconnect()
    media.removeEventListener?.('change', sync)
    unlockBackground()
  }
}
