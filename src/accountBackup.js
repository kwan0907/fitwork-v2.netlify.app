import { supabase } from './supabase'

// Read-only, account-scoped export. Supabase Auth credentials and other users' rows are never queried.
const sources = [
  { table: 'clients', owner: 'user_id', order: ['id'] },
  { table: 'transactions', owner: 'user_id', order: ['created_at', 'id'] },
  { table: 'stock', owner: 'user_id', order: ['prod_name', 'branch'] },
  { table: 'inventory', owner: 'user_id', order: ['product_id', 'branch'] },
  { table: 'promotions', owner: 'owner_email', order: ['id'] },
  { table: 'finances', owner: 'user_id', order: ['id'] },
  { table: 'trials', owner: 'user_id', order: ['id'] },
  { table: 'monthly_metrics', owner: 'user_id', order: ['id'] },
  { table: 'monthly_analytics', owner: 'user_id', order: ['id'] },
  { table: 'herbalife_stats', owner: null, order: ['month'] },
  { table: 'movement_package_settings', owner: 'owner_email', order: ['id'] },
  { table: 'products', owner: null, order: ['id'] },
  { table: 'herbalife_images', owner: null, order: ['promo_id'] }
]

async function readAll({ table, owner, order }, user) {
  const rows = []
  let expected = null
  for (let start = 0; start < 100000; start += 500) {
    let query = supabase.from(table).select('*', { count: 'exact' }).range(start, start + 499)
    if (owner) query = query.eq(owner, owner === 'user_id' ? user.id : user.email)
    for (const column of order) query = query.order(column)
    const { data, error, count } = await query
    if (error) throw new Error(`${table} 匯出失敗：${error.message}`)
    if (expected === null) expected = count
    rows.push(...(data || []))
    if ((data || []).length < 500) break
  }
  if (rows.length !== expected) throw new Error(`${table} 筆數喺匯出期間變動，請重新匯出。`)
  return rows
}

export async function downloadAccountBackup() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user?.id || !user?.email) throw new Error('請重新登入後再匯出。')

  const tables = {}
  for (const source of sources) tables[source.table] = await readAll(source, user)
  const backup = {
    format: 'bz-account-backup-v1',
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    scope: 'Current account business rows and shared product catalogue. Supabase Auth credentials, Storage objects, and server audit logs require a project-level backup.',
    tables
  }

  const date = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `BZ記錄器-帳戶資料-${date}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return backup.counts
}
