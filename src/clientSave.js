// The single-row PATCH transport is backed by a void RPC. A successful update
// therefore returns no row, even when PostgREST was asked for a representation.
// Read the owned row separately before reporting that the save is complete.
export async function updateOwnedClientAndConfirm(db, id, ownerEmail, patch) {
  let write
  try {
    write = await db.from('clients').update(patch).eq('id', id).eq('owner_email', ownerEmail)
  } catch (error) {
    throw uncertainWrite(error)
  }
  if (write.error) {
    if (/failed to fetch|network/i.test(write.error.message || '')) throw uncertainWrite(write.error)
    throw write.error
  }

  let read
  try {
    read = await db.from('clients').select(['id', ...Object.keys(patch)].join(','))
      .eq('id', id).eq('owner_email', ownerEmail).single()
  } catch (error) {
    throw uncertainWrite(error)
  }
  if (read.error || String(read.data?.id) !== String(id) ||
      Object.entries(patch).some(([field, expected]) => !sameField(field, expected, read.data[field]))) {
    throw uncertainWrite(read.error)
  }
  return read.data
}

function sameField(field, expected, actual) {
  if (expected == null || actual == null) return expected == null && actual == null
  if (field === 'trial_date') {
    const expectedTime = new Date(expected).getTime()
    const actualTime = new Date(actual).getTime()
    return (Number.isFinite(expectedTime) && expectedTime === actualTime) ||
      String(expected).slice(0, 16) === String(actual).slice(0, 16)
  }
  return String(expected) === String(actual)
}

function uncertainWrite(cause) {
  const error = new Error('更新請求已送出，但暫時讀唔返確認結果。請先重新整理核對，唔好直接再按儲存。')
  error.writeMayHaveSucceeded = true
  if (cause) error.cause = cause
  return error
}
