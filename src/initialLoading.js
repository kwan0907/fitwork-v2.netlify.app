// Initial authenticated-data loading presentation.
// Does not cache or persist any customer / transaction data.
export function installInitialLoading(store) {
  let content = null
  let unsubscribe = null

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
    if (!content) return
    if (store.isInitialLoading) {
      if (!overlay.isConnected) content.prepend(overlay)
      content.classList.add('app-data-loading')
    } else {
      overlay.remove()
      content.classList.remove('app-data-loading')
    }
  }

  const attach = () => {
    if (content) return true
    content = document.querySelector('#app-main .content')
    if (!content) return false
    render()
    unsubscribe = store.$subscribe(render)
    return true
  }

  const observer = new MutationObserver(() => {
    if (attach()) observer.disconnect()
  })

  if (!attach()) observer.observe(document.getElementById('app'), { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    if (unsubscribe) unsubscribe()
    overlay.remove()
    if (content) content.classList.remove('app-data-loading')
  }
}
