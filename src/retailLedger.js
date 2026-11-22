const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100

export function retailCheckoutAmounts(items) {
  let revenue = 0
  let cost = 0
  const missingCostItems = []
  for (const item of items) {
    const quantity = Number(item.qty)
    const price = Number(item.active_price)
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) {
      throw new Error('購物車數量或售價無效，請先核對。')
    }
    revenue += price * quantity
    const unitCost = item.isCombo
      ? Number(item.fixedPrice) - Number(item.fixedProfit)
      : Number(item.cost)
    if (!Number.isFinite(unitCost) || unitCost <= 0 || (!item.isCombo && (item.cost === null || item.cost === ''))) {
      missingCostItems.push(item.name || '未命名產品')
    } else {
      cost += unitCost * quantity
    }
  }
  const amount = roundMoney(revenue)
  const verifiedCost = missingCostItems.length ? null : roundMoney(cost)
  return {
    amount,
    cost: verifiedCost,
    profit: verifiedCost === null ? null : roundMoney(amount - verifiedCost),
    missingCostItems
  }
}

export function hongKongCheckoutTimestamp(day, now = new Date()) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new Error('結帳日期無效，請重新選擇。')
  }
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(now)
  return `${day}T${time}+08:00`
}
