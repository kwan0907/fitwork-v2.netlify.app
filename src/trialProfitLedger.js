import { supabase } from './supabase'
import { trialAdjustmentProfit } from './trialProfitMath'

export async function writeTrialProfitAdjustment(store, client, kind, { updateExisting = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const ownerEmail = session?.user?.email
  if (!ownerEmail) throw new Error('登入已失效，未能記錄試堂帳目。')
  const tag = `[TRIAL_PROFIT:${String(client?.id || 'unknown')}:${String(client?.trial_date || '').slice(0, 16)}]`
  const note = `${tag} ${kind === 'mygift' ? 'MyGift 試堂未開卡' : '普通試堂未開卡'}`
  const { data: existing, error: existingError } = await supabase.from('transactions')
    .select('id,profit,note').eq('owner_email', ownerEmail).eq('category', '試堂調整').ilike('note', `%${tag}%`).limit(2)
  if (existingError) throw existingError
  if (existing.length > 1) throw new Error('同一次試堂有多筆調整，請先核對帳目。')
  if (existing.length && !updateExisting) return
  const { data: paidRows, error: paidError } = await supabase.from('transactions')
    .select('id,client_id,client_name,branch,amount,cost,profit,created_at').eq('owner_email', ownerEmail)
    .eq('type', 'income').eq('category', '試堂').gt('amount', 0)
  if (paidError) throw paidError
  const profit = trialAdjustmentProfit(client, kind, paidRows || [])
  if (existing.length) {
    if (Number(existing[0].profit) === profit && existing[0].note === note) return
    const { error } = await supabase.from('transactions').update({ profit, note, client_name: client?.name || '', branch: client?.branch || '' })
      .eq('id', existing[0].id).eq('owner_email', ownerEmail)
    if (error) throw error
    const local = store.transactions.find(t => t.id === existing[0].id)
    if (local) Object.assign(local, { profit, note, client_name: client?.name || '', branch: client?.branch || '' })
    return
  }
  const row = {
    owner_email: ownerEmail, type: 'income', category: '試堂調整', amount: 0, cost: 0, profit, note,
    client_id: client?.id || null, client_name: client?.name || '', branch: client?.branch || '',
    created_at: client?.trial_date || new Date().toISOString()
  }
  const { data, error } = await supabase.from('transactions').insert(row).select().single()
  if (error) throw error
  if (data) store.transactions.unshift(data)
}
