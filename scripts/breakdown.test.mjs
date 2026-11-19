import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBreakdownFields } from '../src/lib/breakdown.js'

const field = (fields, kind) => fields.find(item => item.kind === kind)
test('all expected deputy fields remain visible through loading, success and failure', () => {
  const pending = buildBreakdownFields({role:'deputy', loading:true})
  assert.ok(pending.length >= 8)
  assert.ok(pending.every(item => item.state === 'loading'))
  const failed = buildBreakdownFields({role:'deputy'})
  assert.deepEqual(failed.map(item => item.kind), pending.map(item => item.kind))
  assert.ok(failed.every(item => item.state === 'unavailable'))
})
test('payroll stays pending independently of published expenses and references', () => {
  const fields = buildBreakdownFields({role:'deputy', auditLoading:true, expenses:{publishedPending:false, components:[
    {kind:'office', value:500, status:'available'},
    {kind:'reference:remuneration', value:100, status:'reference'},
  ]}})
  assert.equal(field(fields,'office').state, 'available')
  assert.equal(field(fields,'reference:remuneration').state, 'available')
  assert.equal(field(fields,'remuneration').state, 'loading')
})
test('missing values and unconfirmed zero differ from a published zero and a benefit cap', () => {
  const fields = buildBreakdownFields({role:'senator', expenses:{components:[
    {kind:'remuneration', value:0, status:'unavailable'},
    {kind:'office', value:0, status:'partial', rows:[]},
    {kind:'allowances', value:0, status:'available'},
    {kind:'reference:allowances', value:null, monthlyLimit:5500, status:'reference'},
    {kind:'administration', value:null, status:'unavailable'},
  ]}})
  assert.equal(field(fields,'remuneration').state,'unavailable')
  assert.equal(field(fields,'office').state,'unavailable')
  assert.equal(field(fields,'allowances').state,'available')
  assert.equal(field(fields,'allowances').value,0)
  assert.equal(field(fields,'reference:allowances').monthlyLimit,5500)
  assert.equal(field(fields,'administration').state,'unavailable')
})
test('executive travel fields and additional source fields are preserved', () => {
  const fields = buildBreakdownFields({role:'president', expenses:{publishedPending:true, referencesPending:false, components:[{kind:'custom', label:'Outro dado', value:42, status:'available'}]}})
  assert.equal(field(fields,'extraExpenses').state,'loading')
  assert.equal(field(fields,'reference:remuneration').state,'unavailable')
  assert.equal(field(fields,'custom').value,42)
})
