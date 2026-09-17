// Compatibility fixes for legacy sales-export branch labels.
// Runs before the purchase-import analyzer reads the pasted spreadsheet text.
const CENTRAL_ALIASES = [
  /\bFitZion\s*Bc\b/gi,
  /\bFit\s*Zion\s*Bc\b/gi
]

export function installPurchaseImportCompat() {
  const onClickCapture = (event) => {
    const analyzeButton = event.target?.closest?.('#purchase-import-analyze')
    if (!analyzeButton) return

    const textarea = document.querySelector('#purchase-import-text')
    if (!textarea?.value) return

    let nextValue = textarea.value
    for (const alias of CENTRAL_ALIASES) {
      nextValue = nextValue.replace(alias, '中環')
    }
    textarea.value = nextValue
  }

  document.addEventListener('click', onClickCapture, true)
  return () => document.removeEventListener('click', onClickCapture, true)
}
