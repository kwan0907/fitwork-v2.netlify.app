import test from 'node:test'
import assert from 'node:assert/strict'
import { updateOwnedClientAndConfirm } from '../src/clientSave.js'

function dbWith(write, read) {
  let calls = 0
  const chain = response => ({
    eq() { return this },
    select() { return this },
    single() { return Promise.resolve(response) },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject) }
  })
  return {
    from(table) {
      assert.equal(table, 'clients')
      return {
        update() { calls++; return chain(write) },
        select() { calls++; return chain(read) }
      }
    },
    get calls() { return calls }
  }
}

test('void RPC update is confirmed by a separate read', async () => {
  const db = dbWith({ data: null, error: null }, {
    data: { id: 'client-1', status: 'prospect', remark: '有試堂，未開卡' }, error: null
  })
  const result = await updateOwnedClientAndConfirm(db, 'client-1', 'owner@example.com', {
    status: 'prospect', remark: '有試堂，未開卡'
  })
  assert.equal(result.id, 'client-1')
  assert.equal(db.calls, 2)
})

test('unconfirmed update is marked unsafe to repeat', async () => {
  const db = dbWith({ data: null, error: null }, {
    data: { id: 'client-1', status: 'active' }, error: null
  })
  await assert.rejects(updateOwnedClientAndConfirm(db, 'client-1', 'owner@example.com', {
    status: 'prospect'
  }), error => error.writeMayHaveSucceeded === true)
})

test('definite update error is reported without a confirmation read', async () => {
  const db = dbWith({ data: null, error: new Error('invalid value') }, null)
  await assert.rejects(updateOwnedClientAndConfirm(db, 'client-1', 'owner@example.com', {
    status: 'prospect'
  }), /invalid value/)
  assert.equal(db.calls, 1)
})
