export function installQuickActions(store) {
  const root = document.createElement('div')
  root.className = 'qa-wrap'
  root.innerHTML = `
    <div class="qa-menu" hidden>
      <button class="qa-action" data-view="clients"><span>👤</span><b>客戶</b><small>新增／搜尋</small></button>
      <button class="qa-action" data-view="movement"><span>🏋️</span><b>運動</b><small>套票收銀</small></button>
      <button class="qa-action" data-view="retail"><span>🛒</span><b>零售</b><small>快速結帳</small></button>
      <button class="qa-action" data-view="accounting"><span>📝</span><b>記帳</b><small>收入／支出</small></button>
    </div>
    <button class="qa-main" aria-expanded="false" aria-label="開啟快速操作"><span>＋</span></button>`

  document.body.appendChild(root)
  const menu = root.querySelector('.qa-menu')
  const main = root.querySelector('.qa-main')
  const plus = main.querySelector('span')

  const setOpen = (open) => {
    menu.hidden = !open
    main.setAttribute('aria-expanded', String(open))
    plus.classList.toggle('rotate', open)
  }

  main.addEventListener('click', () => setOpen(menu.hidden))
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]')
    if (!button) return
    store.view = button.dataset.view
    setOpen(false)
    requestAnimationFrame(() => {
      document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  })

  // Only show inside the authenticated app shell.
  const updateVisibility = () => {
    root.style.display = document.querySelector('#app-main') ? 'flex' : 'none'
  }
  updateVisibility()
  const observer = new MutationObserver(updateVisibility)
  observer.observe(document.getElementById('app'), { childList: true, subtree: false })
}
