import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClientTimeline, clientTransactionMatchKind, groupClientTransactions } from '../src/clientTimeline.js'

test('client timeline separates linked transactions from uniquely named old ledger rows', () => {
  const client = { id: 'one', name: '阿明', join_date: '2025-11-18', trial_date: '2025-11-18T18:30' }
  const clients = [client, { id: 'two', name: '阿芳' }]
  const linked = { id: 1, client_id: 'one', client_name: '阿明', type: 'income', amount: 850, category: '運動套票', created_at: '2026-01-02T10:00:00+08:00' }
  const possible = { id: 2, client_id: null, client_name: '阿明', type: 'income', amount: 850, category: '運動套票', created_at: '2025-12-02T10:00:00+08:00' }
  const other = { id: 3, client_id: 'two', client_name: '阿明', type: 'income', amount: 850, created_at: '2026-02-02T10:00:00+08:00' }
  const timeline = buildClientTimeline(client, [linked, possible, other], clients)
  assert.equal(clientTransactionMatchKind(client, linked, clients), 'linked')
  assert.equal(clientTransactionMatchKind(client, possible, clients), 'possible')
  assert.equal(clientTransactionMatchKind(client, other, clients), '')
  assert.deepEqual(timeline.confirmed.filter(event => event.key.startsWith('txn:')).map(event => event.key), ['txn:1'])
  assert.deepEqual(timeline.possible.map(event => event.key), ['txn:2'])
  const groups = groupClientTransactions(clients, [linked, possible, other])
  assert.deepEqual(groups.get('one').linked.map(row => row.id), [1])
  assert.deepEqual(groups.get('one').possible.map(row => row.id), [2])
  assert.deepEqual(groups.get('two').linked.map(row => row.id), [3])
})

test('duplicate names and note mentions never assign an unlinked transaction to a client', () => {
  const client = { id: 'one', name: '阿明' }
  const clients = [client, { id: 'two', name: '阿明' }]
  assert.equal(clientTransactionMatchKind(client, { client_id: null, client_name: '阿明' }, clients), '')
  assert.equal(clientTransactionMatchKind(client, { client_id: null, client_name: '阿芳', note: '阿明 續卡' }, [client]), '')
})
