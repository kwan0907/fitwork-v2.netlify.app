export function installQuickActions(store) {
  const root = document.createElement('div')
  root.className = 'qa-wrap'
  root.innerHTML = `
    <div class="qa-backdrop" hidden></div>
    <div class="qa-menu" hidden>
      <div class="qa-menu-head"><b>快速操作</b><button type="button" class="qa-close" aria-label="收起快速操作">✕ 收起</button></div>
      <button type="button" class="qa-action" data-view="clients"><span>👤</span><b>客戶</b><small>新增／搜尋</small></button>
      <button type="button" class="qa-action" data-view="movement"><span>🏋️</span><b>運動</b><small>套票收銀</small></button>
      <button type="button" class="qa-action" data-view="retail"><span>🛒</span><b>零售</b><small>快速結帳</small></button>
      <button type="button" class="qa-action" data-view="accounting"><span>📝</span><b>記帳</b><small>收入／支出</small></button>
    </div>
    <button type="button" class="qa-main" aria-expanded="false" aria-label="開啟快速操作"><span>＋</span></button>`

  document.body.appendChild(root)
  const menu = root.querySelector('.qa-menu')
  const backdrop = root.querySelector('.qa-backdrop')
  const main = root.querySelector('.qa-main')
  const symbol = main.querySelector('span')
  const closeButton = root.querySelector('.qa-close')
  const allowedViews = ['clients', 'movement', 'retail', 'accounting']
  const preferenceKey = 'fitwork:last-quick-action'
  let isOpen = false

  const markLastAction = (view) => {
    root.querySelectorAll('.qa-action').forEach((button) => {
      const small = button.querySelector('small')
      if (!small) return
      const baseLabel = small.dataset.baseLabel || small.textContent.replace(' · 上次使用', '')
      small.dataset.baseLabel = baseLabel
      small.textContent = button.dataset.view === view ? `${baseLabel} · 上次使用` : baseLabel
    })
  }

  try {
    const savedView = localStorage.getItem(preferenceKey)
    if (allowedViews.includes(savedView)) markLastAction(savedView)
  } catch {}

  const setOpen = (next) => {
    isOpen = Boolean(next)
    menu.hidden = !isOpen
    backdrop.hidden = !isOpen
    root.classList.toggle('open', isOpen)
    main.classList.toggle('is-open', isOpen)
    main.setAttribute('aria-expanded', String(isOpen))
    main.setAttribute('aria-label', isOpen ? '收起快速操作' : '開啟快速操作')
    symbol.textContent = isOpen ? '×' : '＋'
  }

  const updateVisibility = () => {
    const authenticated = Boolean(document.querySelector('#app-main'))
    // Clients already has its own purple + button for adding a customer.
    // Hide the global + there so two different floating controls never overlap.
    const visible = authenticated && store.view !== 'clients'
    root.style.display = visible ? 'flex' : 'none'
    if (!visible) setOpen(false)
  }

  const updatePageSafePosition = () => {
    // Retail / inventory can show a bottom cart bar. Move the global + above it
    // instead of covering the cart total or checkout action on mobile.
    const pageFloatingControl = [...document.querySelectorAll('.scroll-top-btn, .float-bar')].find((button) => {
      if (button.closest('.qa-wrap')) return false
      const style = getComputedStyle(button)
      const rect = button.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    })
    root.classList.toggle('qa-avoid-page-fab', Boolean(pageFloatingControl))
  }

  main.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(!isOpen)
  })
  closeButton.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
  })
  backdrop.addEventListener('pointerdown', () => setOpen(false))

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]')
    if (!button) return
    const view = button.dataset.view
    if (!allowedViews.includes(view)) return
    try { localStorage.setItem(preferenceKey, view) } catch {}
    markLastAction(view)
    store.view = view
    setOpen(false)
    updateVisibility()
    requestAnimationFrame(() => {
      updatePageSafePosition()
      document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  })

  // Close and recalculate visibility whenever navigation changes.
  store.$subscribe(() => {
    setOpen(false)
    updateVisibility()
    requestAnimationFrame(updatePageSafePosition)
  })

  // Only show inside the authenticated app shell.
  updateVisibility()
  updatePageSafePosition()
  const observer = new MutationObserver(() => {
    updateVisibility()
    updatePageSafePosition()
  })
  observer.observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
}
