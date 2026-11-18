import { supabase } from './supabase'

export async function downloadOwnedClientsBackup(user) {
  if (!user?.id || !user?.email) throw new Error('請先登入 BZ。')
  const clients = []
  let total = null
  for (let start = 0; start < 100000; start += 500) {
    const { data, count, error } = await supabase.from('clients').select('*', { count: 'exact' })
      .eq('owner_email', user.email).order('id').range(start, start + 499)
    if (error) throw error
    if (total === null) total = count
    clients.push(...(data || []))
    if ((data || []).length < 500) break
  }
  if (total !== clients.length) throw new Error('備份期間客戶數目有變，請重新嘗試。')
  const data = { format: 'bz-owned-clients-before-import-v1', exported_at: new Date().toISOString(), owner_email: user.email, count: clients.length, clients }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `BZ客戶匯入前備份-${new Date().toISOString().slice(0,10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return clients.length
}
