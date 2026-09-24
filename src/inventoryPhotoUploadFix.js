export function installInventoryPhotoUploadFix() {
  const enhance = () => {
    document.querySelectorAll('.inv-import-actions').forEach(actions => {
      if (actions.dataset.photoUploadEnhanced === '1') return
      const cameraLabel = actions.querySelector('.inv-import-file')
      const cameraInput = cameraLabel?.querySelector('input[type="file"]')
      if (!cameraLabel || !cameraInput) return

      actions.dataset.photoUploadEnhanced = '1'
      cameraLabel.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) node.textContent = '📷 拍照辨識'
      })
      cameraInput.setAttribute('capture', 'environment')

      const uploadButton = document.createElement('button')
      uploadButton.type = 'button'
      uploadButton.className = 'inv-import-file inv-import-library'
      uploadButton.textContent = '🖼️ 上傳圖片'
      uploadButton.setAttribute('aria-label', '從相簿或檔案選擇圖片')
      uploadButton.addEventListener('click', () => {
        const hadCapture = cameraInput.hasAttribute('capture')
        const captureValue = cameraInput.getAttribute('capture')
        cameraInput.removeAttribute('capture')
        cameraInput.value = ''
        cameraInput.click()
        window.setTimeout(() => {
          if (hadCapture) cameraInput.setAttribute('capture', captureValue || 'environment')
        }, 0)
      })

      cameraLabel.insertAdjacentElement('afterend', uploadButton)

      if (!document.getElementById('fitwork-inventory-photo-upload-fix-style')) {
        const style = document.createElement('style')
        style.id = 'fitwork-inventory-photo-upload-fix-style'
        style.textContent = `
          .inv-import-actions:has(.inv-import-library){grid-template-columns:repeat(3,minmax(0,1fr))}
          .inv-import-library{cursor:pointer;border:0;background:#eef2ff!important;color:#4338ca!important}
          @media(max-width:560px){
            .inv-import-actions:has(.inv-import-library){grid-template-columns:1fr 1fr}
            .inv-import-actions:has(.inv-import-library) .inv-import-parse{grid-column:1/-1}
          }
        `
        document.head.appendChild(style)
      }
    })
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhance))
  observer.observe(document.body, { childList: true, subtree: true })
  requestAnimationFrame(enhance)
}
