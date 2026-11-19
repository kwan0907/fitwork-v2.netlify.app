import { supabase } from './supabase'

export async function downloadOwnedTransactionsBackup(user) {
  if (!user?.id || !user?.email) throw new Error('請先登入 BZ。')
  const transactions = []
  let total = null
  for (let start = 0; start < 100000; start += 500) {
    const { data, count, error } = await supabase.from('transactions').select('*', { count: 'exact' })
      .eq('owner_email', user.email).eq('user_id', user.id).order('id').range(start, start + 499)
    if (error) throw error
    if (total === null) total = count
    transactions.push(...(data || []))
    if ((data || []).length < 500) break
  }
  if (total !== transactions.length) throw new Error('備份期間交易數目有變，請重新嘗試。')
  const backup = { format: 'bz-owned-transactions-before-trial-correction-v1',
    exported_at: new Date().toISOString(), owner_email: user.email, count: transactions.length, transactions }
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `BZ交易更正前備份-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return transactions
}
