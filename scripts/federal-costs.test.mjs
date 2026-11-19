import test from 'node:test'
import assert from 'node:assert/strict'
import {FEDERAL_COSTS} from '../worker/federal-costs.js'
import {expansionCosts,expansionResponse,searchExpansion} from '../worker/expansion.js'
import {getRoleReferenceCosts} from '../worker/reference-costs.js'
import {adaptExpandedCosts,getAvailableYears} from '../src/lib/unified.js'
import {NAMED_DIRECTORY} from '../worker/political-profiles.js'
import {ADDITIONAL_PROFILES} from '../worker/additional-profiles.js'

test('federal published payroll replaces the table and reconciles annual totals',async()=>{
 const profile=(await searchExpansion(new URLSearchParams({role:'president',name:'Lula'}))).data.find(p=>p.id==='tse-2022-280001607829')
 const paid=await expansionCosts(profile,2025)
 assert.deepEqual(paid.verifiedMonths,Array.from({length:12},(_,i)=>i+1))
 const mixed=adaptExpandedCosts(profile,{...paid,components:[...getRoleReferenceCosts(profile,2025).components,...paid.components]},2025)
 assert.equal(mixed.simulationBases.find(b=>b.id==='combined').budget,626590.54)
 assert.ok(getAvailableYears(profile).includes(2025))
 assert.equal(paid.components.find(c=>c.kind==='extraExpenses').rows.length,2)
})

test('all federal components reconcile in cents and never contain personal tax identifiers',()=>{
 for(const annual of Object.values(FEDERAL_COSTS.years))for(const profile of Object.values(annual.profiles)){
  assert.equal(profile.officeMonths.length,12)
  for(const c of profile.components){
   assert.equal(Math.round(c.value*100),c.rows.reduce((sum,r)=>sum+Math.round(r.value*100),0))
   assert.equal(new Set(c.rows.map(r=>r.id)).size,c.rows.length)
   assert.ok(c.rows.every(r=>new URL(r.sourceUrl).hostname==='portaldatransparencia.gov.br'))
   if(c.kind==='remuneration')assert.equal(c.rows.length,12)
  }
  assert.doesNotMatch(JSON.stringify(profile),/"(?:CPF|MATRICULA)"|\*\*\*\.\d/)
 }
})

test('current minister names cannot receive an annual salary for a different historical job',async()=>{
 assert.equal((await searchExpansion(new URLSearchParams({role:'minister',name:'Miriam'}))).data.length,0)
 const profile=NAMED_DIRECTORY.profiles.find(p=>p.role==='minister'&&p.name.includes('Miriam'))
 for(const route of ['references','costs']){
  const params=new URLSearchParams({year:'2025',profile:JSON.stringify(profile)})
  const response=await expansionResponse(new Request(`https://local/api/expansion/${route}?${params}`))
  const data=await response.json()
  assert.equal(response.status,200)
  assert.ok(data.components.every(c=>c.value===null))
  assert.match(data.notice,/cadastro mensal não confirma/)
 }
})

test('future or unimported annual federal data is never backfilled from another year',async()=>{
 const profile=(await searchExpansion(new URLSearchParams({role:'president',name:'Lula'}))).data.find(p=>p.id==='tse-2022-280001607829')
 const result=await expansionCosts(profile,2026)
 assert.ok(result.components.every(c=>c.value===null))
})

test('Bolsonaro uses the verified 2022 payroll and missing travel does not become zero expenses',async()=>{
 const profile=(await searchExpansion(new URLSearchParams({role:'president',name:'Jair Bolsonaro'}))).data[0]
 assert.deepEqual(getAvailableYears(profile),[2022])
 const data=await expansionCosts(profile,2022)
 assert.equal(data.components.find(c=>c.kind==='remuneration').value,417618.45)
 assert.equal(data.components.some(c=>c.kind==='extraExpenses'),false)
 assert.match(data.notice,/Nenhuma viagem individual/)
})

test('source failures remain explicit without partial historical payroll',async()=>{
 const profile=ADDITIONAL_PROFILES.find(p=>p.id==='president-historical-michel-temer')
 FEDERAL_COSTS.sourceFailures ||= {}
 const previous=FEDERAL_COSTS.sourceFailures[2017]
 FEDERAL_COSTS.sourceFailures[2017]={notice:'Download exige verificação humana; ano não importado.',sourceUrl:'https://portaldatransparencia.gov.br/download-de-dados/servidores'}
 try{
  const data=await expansionCosts(profile,2017)
  assert.ok(data.components.every(c=>c.value===null))
  assert.match(data.notice,/verificação humana/)
 }finally{if(previous)FEDERAL_COSTS.sourceFailures[2017]=previous;else delete FEDERAL_COSTS.sourceFailures[2017]}
})

test('historical presidents retain their own closed year and published salary-cap deductions',async()=>{
 for(const [name,year,expected] of [['Temer',2018,42521.76],['Dilma',2015,417618.45]]){
  const matches=(await searchExpansion(new URLSearchParams({role:'president',name}))).data
  if(name==='Temer')assert.equal(matches.length,0)
  else assert.deepEqual(getAvailableYears(matches[0]),[year])
  const profile=ADDITIONAL_PROFILES.find(p=>p.role==='president'&&p.name.includes(name))
  const paid=await expansionCosts(profile,year)
  assert.equal(paid.verifiedMonths.length,12)
  assert.equal(paid.components.find(c=>c.kind==='remuneration').value,expected)
  assert.equal(FEDERAL_COSTS.sourceFailures?.[year],undefined)
 }
})
