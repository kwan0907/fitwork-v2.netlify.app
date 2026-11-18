// Invented local records for the read-only preview; no owner data is used.
export function makeDemoPreviewData(now = new Date()) {
  const stamp = now.toISOString()
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const relativeDay = days => {
    const value = new Date(`${date}T00:00:00Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
  }
  const clients = [
    { id: 'demo-client-1', name: '示範客戶 A', branch: '觀塘', status: 'active', source: '朋友介紹', join_date: date, trial_date: date, package_count: 2, payment_received: 1280 },
    { id: 'demo-client-2', name: '示範客戶 B', branch: '觀塘', status: 'prospect', source: '廣告', join_date: date, trial_date: `${relativeDay(-1)}T14:00`, package_count: 0, payment_received: 0 },
    { id: 'demo-client-3', name: '示範客戶 C', branch: '中環', status: 'active', source: '朋友介紹', join_date: date, trial_date: date, expiry_date: relativeDay(4), package_count: 1, payment_received: 980 }
  ]
  const products = [
    { id: 'demo-product-1', name: '營養蛋白素', category: '內在營養', unit: '罐', retail_price: 520, price_standard: 480, cost: 285 },
    { id: 'demo-product-2', name: '蘆薈汁', category: '內在營養', unit: '樽', retail_price: 340, price_standard: 310, cost: 190 },
    { id: 'demo-product-3', name: '護膚套裝', category: '外在保養', unit: '套', retail_price: 680, price_standard: 620, cost: 365 }
  ]
  const transactions = [
    { id: 'demo-txn-1', type: 'income', amount: 1280, profit: 480, category: '產品零售', product_name: '營養蛋白素', client_id: clients[0].id, client_name: clients[0].name, branch: '觀塘', created_at: stamp },
    { id: 'demo-txn-2', type: 'income', amount: 980, profit: 390, category: '運動套票', client_id: clients[2].id, client_name: clients[2].name, branch: '中環', created_at: stamp },
    { id: 'demo-txn-3', type: 'expense', amount: 220, profit: -220, category: '廣告費用', branch: '觀塘', created_at: stamp }
  ]
  return { clients, products, transactions, stock: { '營養蛋白素_觀塘': 12, '蘆薈汁_觀塘': 4, '護膚套裝_觀塘': 6 }, stockExpiry: {}, promotions: [] }
}
