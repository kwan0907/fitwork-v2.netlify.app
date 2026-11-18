export function trialOpeningDate(client) {
  const entries = [...String(client?.remark || '').matchAll(/\[TRIAL_RESULT\]\|([^|\n]+)\|(opened_[^|\n]+)/g)]
  return entries.length ? entries[0][1] : null
}

export function verifiedConversionDate(client, firstPackageDate, earliestKnownClass = null) {
  const opening = trialOpeningDate(client)
  if (opening) return opening
  if (firstPackageDate && (!earliestKnownClass || earliestKnownClass >= String(firstPackageDate).slice(0, 10))) return firstPackageDate
  return null
}

// A first recorded BZ purchase does not prove a first ever purchase.
export function classifyPackageSale(transaction) {
  if (transaction?.is_renewal === true) return 'renewal'
  if (transaction?.is_new_client === true) return 'new'
  return 'unknown'
}
