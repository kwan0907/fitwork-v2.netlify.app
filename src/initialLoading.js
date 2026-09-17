// Initial authenticated-data loading presentation.
// Does not cache or persist any customer / transaction data.
export function installInitialLoading(store) {
  const content = document.querySelector('#app-main .content')
  if (!content) return () => {}

  const overlay = document.createElement('div')
  overlay.className = 'app-initial-loading'
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-live', 'polite')
  overlay.setAttribute('aria-label', '正在載入最新資料')
  overlay.innerHTML = `
    <div class="app-loading-head">
      <div class="app-loading-dot app-skeleton"></div>
      <div class="app-loading-title">
        <div class="app-skeleton app-sk-title"></div>
        <div class="app-skeleton app-sk-sub"></div>
      </div>
    </div>
    <div class="app-skeleton app-sk-card"></div>
    <div class="app-skeleton app-sk-card"></div>
    <div class="app-skeleton app-sk-row"></div>
    <div class="app-skeleton app-sk-row"></div>
    <div class="app-skeleton app-sk-row"></div>
    <div class="app-loading-note">正在載入最新資料…</div>
  `

  const render = () => {
    const shouldShow = Boolean(store.isInitialLoading)
    if (shouldShow) {
      if (!overlay.isConnected) content.prepend(overlay)
      content.classList.add('app-data-loading')
    } else {
      overlay.remove()
      content.classList.remove('app-data-loading')
    }
  }

  render()
  const unsubscribe = store.$subscribe(render)
  return () => {
    unsubscribe()
    overlay.remove()
    content.classList.remove('app-data-loading')
  }
}
