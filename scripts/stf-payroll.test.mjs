import test from 'node:test'
import assert from 'node:assert/strict'
import {STF_PAYROLL} from '../worker/stf-payroll.js'
import {expansionCosts} from '../worker/expansion.js'
import {adaptExpandedCosts} from '../src/lib/unified.js'
import {getRoleReferenceCosts} from '../worker/reference-costs.js'

test('every imported STF bundle has twelve matching months and reconciles to cents',async()=>{
 assert.equal(STF_PAYROLL.year,2025)
 assert.equal(Object.keys(STF_PAYROLL.profiles).length,8)
 for(const [id,payroll] of Object.entries(STF_PAYROLL.profiles)){
  assert.deepEqual(payroll.verifiedMonths,[1,2,3,4,5,6,7,8,9,10,11,12])
  assert.deepEqual(payroll.components.map(c=>c.kind),['remuneration','cabinet'])
  for(const c of payroll.components){
   assert.equal(c.status,'available')
   assert.deepEqual(c.rows.map(r=>r.month),payroll.verifiedMonths)
   assert.equal(c.rows.reduce((s,r)=>s+Math.round(r.value*100),0),Math.round(c.value*100))
   for(const row of c.rows){const source=new URL(row.sourceUrl);assert.equal(source.hostname,'egesp-portal.stf.jus.br');assert.equal(source.searchParams.get('q[ano_eq]'),'2025');assert.equal(Number(source.searchParams.get('q[mes_eq]')),row.month)}
  }
  const profile={id,role:'justice'}
  const costs=await expansionCosts(profile,2025)
  const result=adaptExpandedCosts(profile,{...costs,components:[...costs.components,...getRoleReferenceCosts(profile,2025).components]},2025)
  const expected=costs.components.reduce((s,c)=>s+Math.round(c.value*100),0)
  assert.equal(Math.round(result.simulationBudget*100),expected)
  assert.equal(result.complete,true)
  assert.equal(result.byCategory.reduce((s,c)=>s+Math.round(c.value*100),0),expected)
 }
})
test('unreconciled STF profiles and years never receive partial payroll bundles',async()=>{
 for(const id of STF_PAYROLL.excludedProfiles){const result=await expansionCosts({id,role:'justice'},2025);assert.ok(result.components.every(c=>c.value===null));assert.match(result.notice,/não foi possível validar/)}
 const future=await expansionCosts({id:'stf-alexandre-de-moraes',role:'justice'},2026)
 assert.ok(future.components.every(c=>c.value===null))
})
