const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100
const knownCost = value => value !== '' && value !== null && value !== undefined

export function incomeAccountingValues(amountInput, costInput, previous = null) {
  const amount = Number(amountInput)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('收入金額請填 0 或正數。')
  const cost = knownCost(costInput) ? Number(costInput) : null
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('成本請填 0 或正數；未知可留空。')
  const unchanged = previous?.type === 'income' && Number(previous.amount) === amount &&
    (previous.cost === null || previous.cost === undefined ? null : Number(previous.cost)) === cost
  const profit = unchanged ? previous.profit : cost === null ? null : roundMoney(amount - cost)
  return { amount: roundMoney(amount), cost, profit }
}
