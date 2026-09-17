import { supabase } from './supabase'

export const DEFAULT_MOVEMENT_PACKAGES = [
  {
    package_key: 'trial', label: '試堂', emoji: '🧪', price: 98, base_cost: 52,
    category: '試堂', transaction_mode: 'auto', force_profit: null, expiry_years: 0,
    increment_pkg_count: false, apply_new_customer_discount: false, new_customer_discount: 98,
    apply_referral_cost: true, referral_cost: 53, referral_price_override: 0,
    force_income_when_zero: false, keywords: ['試堂'], is_active: true, sort_order: 10
  },
  {
    package_key: 'pkg_10', label: '10點套票', emoji: '🎟️', price: 880, base_cost: 399,
    category: '運動套票', transaction_mode: 'auto', force_profit: null, expiry_years: 1,
    increment_pkg_count: true, apply_new_customer_discount: true, new_customer_discount: 98,
    apply_referral_cost: true, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: false, keywords: ['運動10點', '10點套票', '10點'], is_active: true, sort_order: 20
  },
  {
    package_key: 'pkg_35', label: '35點套票', emoji: '👑', price: 2640, base_cost: 1316.5,
    category: '運動套票', transaction_mode: 'auto', force_profit: null, expiry_years: 1,
    increment_pkg_count: true, apply_new_customer_discount: true, new_customer_discount: 98,
    apply_referral_cost: true, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: false, keywords: ['運動30點送5點', '35點套票', '35點'], is_active: true, sort_order: 30
  },
  {
    package_key: 'pkg_vip30', label: 'VIP點數30點', emoji: '🌟', price: 0, base_cost: 1155,
    category: '運動套票', transaction_mode: 'auto', force_profit: 0, expiry_years: 1,
    increment_pkg_count: true, apply_new_customer_discount: true, new_customer_discount: 98,
    apply_referral_cost: true, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: true, keywords: ['VIP點數30點', 'VIP30'], is_active: true, sort_order: 40
  },
  {
    package_key: 'referral_free', label: '介紹朋友贈堂', emoji: '🤝', price: 0, base_cost: 53,
    category: '贈堂', transaction_mode: 'auto', force_profit: null, expiry_years: 0,
    increment_pkg_count: false, apply_new_customer_discount: false, new_customer_discount: 98,
    apply_referral_cost: false, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: false,
    keywords: ['推薦朋友送運動2格', '推介朋友送運動2格', '介紹朋友送運動2格', '介紹朋友贈堂'],
    is_active: true, sort_order: 50
  },
  {
    package_key: 'exp_30', label: '體驗卡30人次', emoji: '🎟️', price: 0, base_cost: 750,
    category: '運動套票', transaction_mode: 'auto', force_profit: null, expiry_years: 1,
    increment_pkg_count: true, apply_new_customer_discount: true, new_customer_discount: 98,
    apply_referral_cost: true, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: false, keywords: ['體驗卡30人次', '體驗卡30'], is_active: true, sort_order: 60
  },
  {
    package_key: 'pkg_1_free', label: '新增1格', emoji: '🆓', price: 0, base_cost: 25.5,
    category: '贈堂', transaction_mode: 'auto', force_profit: null, expiry_years: 0,
    increment_pkg_count: false, apply_new_customer_discount: false, new_customer_discount: 98,
    apply_referral_cost: false, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: false, keywords: ['新增1格', '加1格'], is_active: true, sort_order: 70
  },
  {
    package_key: 'redeem_50', label: '50積分兌換', emoji: '🎁', price: 0, base_cost: 399,
    category: '積分兌換', transaction_mode: 'auto', force_profit: null, expiry_years: 0,
    increment_pkg_count: false, apply_new_customer_discount: false, new_customer_discount: 98,
    apply_referral_cost: false, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: false, keywords: ['50積分兌換', '50積分'], is_active: true, sort_order: 80
  },
  {
    package_key: 'redeem_100', label: '100積分兌換', emoji: '🎁', price: 0, base_cost: 1197,
    category: '積分兌換', transaction_mode: 'auto', force_profit: null, expiry_years: 0,
    increment_pkg_count: false, apply_new_customer_discount: false, new_customer_discount: 98,
    apply_referral_cost: false, referral_cost: 53, referral_price_override: null,
    force_income_when_zero: false, keywords: ['100積分兌換', '100積分'], is_active: true, sort_order: 90
  }
]

const toNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function normalizeMovementPackage(row) {
  return {
    id: row.id || null,
    owner_email: row.owner_email || '',
    package_key: row.package_key || '',
    label: row.label || '未命名套票',
    emoji: row.emoji || '🎟️',
    price: toNumber(row.price),
    base_cost: toNumber(row.base_cost),
    category: row.category || '運動套票',
    transaction_mode: row.transaction_mode || 'auto',
    force_profit: row.force_profit === null || row.force_profit === '' || row.force_profit === undefined ? null : toNumber(row.force_profit),
    expiry_years: Math.max(0, parseInt(row.expiry_years || 0, 10) || 0),
    increment_pkg_count: Boolean(row.increment_pkg_count),
    apply_new_customer_discount: Boolean(row.apply_new_customer_discount),
    new_customer_discount: toNumber(row.new_customer_discount, 98),
    apply_referral_cost: Boolean(row.apply_referral_cost),
    referral_cost: toNumber(row.referral_cost, 53),
    referral_price_override: row.referral_price_override === null || row.referral_price_override === '' || row.referral_price_override === undefined ? null : toNumber(row.referral_price_override),
    force_income_when_zero: Boolean(row.force_income_when_zero),
    keywords: Array.isArray(row.keywords) ? row.keywords.filter(Boolean) : [],
    is_active: row.is_active !== false,
    sort_order: parseInt(row.sort_order || 100, 10) || 100
  }
}

export function packageDisplayName(pkg) {
  const p = normalizeMovementPackage(pkg)
  const money = Number.isFinite(p.price) ? ` ($${Number(p.price).toLocaleString('en-HK', { maximumFractionDigits: 2 })})` : ''
  return `${p.emoji} ${p.label}${money}`
}

export function calculateMovementPackage(pkg, { isNewCustomer = false, isReferral = false } = {}) {
  const p = normalizeMovementPackage(pkg)
  let price = p.price
  let cost = p.base_cost

  if (isReferral && p.apply_referral_cost) {
    cost += p.referral_cost
    if (p.referral_price_override !== null) price = p.referral_price_override
  }

  if (isNewCustomer && p.apply_new_customer_discount) {
    price -= p.new_customer_discount
  }

  const profit = p.force_profit !== null ? p.force_profit : price - cost

  let type = p.transaction_mode
  if (type === 'auto') {
    type = price === 0 && cost > 0 && !p.force_income_when_zero ? 'expense' : 'income'
  }

  return {
    price,
    cost,
    profit,
    type,
    amount: type === 'expense' ? cost : price
  }
}

export async function loadMovementPackages({ includeInactive = false, ensureDefaults = true } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('尚未登入')

  let query = supabase
    .from('movement_package_settings')
    .select('*')
    .eq('owner_email', user.email)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  let { data, error } = await query
  if (error) throw error

  if (ensureDefaults && (!data || data.length === 0)) {
    const rows = DEFAULT_MOVEMENT_PACKAGES.map(pkg => ({ ...pkg, owner_email: user.email }))
    const { error: insertError } = await supabase.from('movement_package_settings').insert(rows)
    if (insertError) throw insertError

    const retry = await supabase
      .from('movement_package_settings')
      .select('*')
      .eq('owner_email', user.email)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (retry.error) throw retry.error
    data = retry.data || []
  }

  return (data || []).map(normalizeMovementPackage)
}

export async function saveMovementPackage(pkg) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('尚未登入')

  const p = normalizeMovementPackage(pkg)
  const payload = {
    owner_email: user.email,
    package_key: p.package_key || `custom_${Date.now()}`,
    label: p.label,
    emoji: p.emoji,
    price: p.price,
    base_cost: p.base_cost,
    category: p.category,
    transaction_mode: p.transaction_mode,
    force_profit: p.force_profit,
    expiry_years: p.expiry_years,
    increment_pkg_count: p.increment_pkg_count,
    apply_new_customer_discount: p.apply_new_customer_discount,
    new_customer_discount: p.new_customer_discount,
    apply_referral_cost: p.apply_referral_cost,
    referral_cost: p.referral_cost,
    referral_price_override: p.referral_price_override,
    force_income_when_zero: p.force_income_when_zero,
    keywords: p.keywords,
    is_active: p.is_active,
    sort_order: p.sort_order
  }

  if (p.id) {
    const { data, error } = await supabase.from('movement_package_settings').update(payload).eq('id', p.id).select().single()
    if (error) throw error
    return normalizeMovementPackage(data)
  }

  const { data, error } = await supabase.from('movement_package_settings').insert([payload]).select().single()
  if (error) throw error
  return normalizeMovementPackage(data)
}

export async function setMovementPackageActive(id, isActive) {
  const { error } = await supabase.from('movement_package_settings').update({ is_active: Boolean(isActive) }).eq('id', id)
  if (error) throw error
}

export function findPackageByKeywords(packages, rawText = '') {
  const text = String(rawText).trim().toLowerCase().replace(/\s+/g, '')
  if (!text) return null

  return (packages || []).find(pkg => {
    const candidates = [pkg.label, ...(pkg.keywords || [])]
    return candidates.some(keyword => {
      const normalized = String(keyword || '').toLowerCase().replace(/\s+/g, '')
      return normalized && (text.includes(normalized) || normalized.includes(text))
    })
  }) || null
}
