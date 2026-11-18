import test from 'node:test'
import assert from 'node:assert/strict'
import {adaptExpandedCosts,normalizeUnifiedProfile,searchUnifiedPoliticians,searchDeputySnapshot,rankUnifiedProfiles,selectSimulationBasis,getUnifiedExpenses,getAvailableYears,getCoverageStatus} from '../src/lib/unified.js'

test('published CEAPS zero remains zero while unavailable CEAPS cannot become a simulation budget',()=>{
  const profile={role:'senator',scope:'person'}
  const missing=adaptExpandedCosts(profile,{components:[{kind:'office',value:null,status:'unavailable'}]},2025)
  assert.equal(missing.total,null)
  assert.equal(missing.simulationBudget,null)
  const zero=adaptExpandedCosts(profile,{components:[{kind:'office',value:0,status:'available',rows:[{id:'zero',value:0}]}]},2025)
  assert.equal(zero.total,0)
  assert.equal(zero.simulationBudget,0)
  assert.equal(zero.data[0].netValue,0)
})

test('administration simulation uses only finite contract sample amounts and never payroll or office expenses',()=>{
  const adapted=adaptExpandedCosts({role:'mayor',scope:'person'},{components:[
    {kind:'remuneration',value:2000,rows:[{id:'salary',value:2000}]},
    {kind:'office',value:500,rows:[{id:'office',value:500}]},
    {kind:'administration',value:999999,status:'partial',rows:[{id:'a',value:100.10},{id:'a',value:100.10},{id:'b',value:20.05},{id:'unknown',value:null},{id:'infinite',value:Infinity}]},
  ]},2025)
  assert.equal(adapted.selectedSimulationBasis,'combined')
  assert.equal(adapted.simulationBudget,2500)
  const result=selectSimulationBasis(adapted,'administration')
  assert.equal(result.simulationBudget,120.15)
  assert.equal(result.total,120.15)
  assert.equal(result.complete,false)
  assert.equal(result.unitType,'contracts')
  assert.match(result.simulationLabel,/não representa pagamentos nem gasto pessoal/)
  assert.match(result.coverageNotice,/não é total anual/)
  assert.equal(result.data.filter(r=>r.id==='a').length,1)
  assert.equal(result.data.find(r=>r.id==='unknown').netValue,null)
  assert.equal(result.data.find(r=>r.id==='infinite').netValue,null)
  assert.equal(result.byCategory.reduce((sum,r)=>sum+r.value,0),120.15)
})

test('empty contract sample has no budget and a published zero-valued sample has zero budget',()=>{
  const profile={role:'governor'}
  for (const rows of [[],[{id:'x',value:null}],[{id:'x',value:'100'}]]) {
    const result=adaptExpandedCosts(profile,{components:[{kind:'administration',rows}]},2025)
    assert.equal(result.simulationBudget,null)
    assert.equal(result.total,null)
  }
  assert.equal(adaptExpandedCosts(profile,{components:[{kind:'administration',rows:[{id:'x',value:0}]}]},2025).simulationBudget,0)
})

test('CEAPS uses published aggregate and retains credit rows without adding management contracts',()=>{
  const result=adaptExpandedCosts({role:'senator'},{components:[
    {kind:'office',value:80.05,status:'available',rows:[{id:'a',value:100.10},{id:'b',value:-20.05}]},
    {kind:'administration',value:10000,rows:[{id:'c',value:10000}]},
  ]},2025)
  assert.equal(result.simulationBudget,80.05)
  assert.equal(result.data.find(r=>r.id==='b').netValue,-20.05)
  assert.equal(result.unitType,'combined')
})

test('normalization preserves elected identity, office and historical mandate metadata',()=>{
  const result=normalizeUnifiedProfile({id:'tse-123',role:'governor',name:'Nome oficial',electionYear:2022,mandateStart:2023,mandateEnd:2026,scope:'person'})
  assert.equal(result.name,'Nome oficial')
  assert.equal(result.role,'governor')
  assert.equal(result.electionYear,2022)
  assert.equal(result.mandateEnd,2026)
  assert.equal(result.scope,'person')
  assert.equal(normalizeUnifiedProfile({id:1,name:'Deputado'}).role,'deputy')
})

test('one nominal query spans all offices and retains available sources when one source fails',async()=>{
  const original=globalThis.fetch,requested=[]
  globalThis.fetch=async address=>{
    const url=new URL(String(address),'https://app.test')
    if(url.pathname==='/deputados.json') return Response.json({})
    if(url.hostname==='dadosabertos.camara.leg.br') {
      assert.equal(url.searchParams.get('nome'),'Ana')
      requested.push('deputy')
      return Response.json({dados:[{id:123,nome:'Ana Deputada',siglaPartido:'P',siglaUf:'SP'}]})
    }
    const role=url.searchParams.get('role');requested.push(role)
    assert.equal(url.searchParams.get('name'),'Ana')
    if(role==='minister') return Response.json({error:'Fonte temporariamente indisponível'},{status:503})
    return Response.json({data:[{id:`${role}-1`,name:`Ana ${role}`,role,party:'P',scope:'person'},{id:`${role}-2`,name:'Outro nome',role}]})
  }
  try {
    const result=await searchUnifiedPoliticians({name:'Ana',role:'all'})
    assert.deepEqual(requested.sort(),['deputy','justice','minister','president','senator'])
    assert.equal(result.data.length,4)
    assert.equal(result.partial,true)
    assert.equal(result.sourceMode,'official')
    assert.ok(result.data.every(profile=>profile.name.startsWith('Ana')))
    assert.match(result.notice,/temporariamente indisponíveis/)
  } finally {globalThis.fetch=original}
})

test('default combines salary and CEAPS while contracts and isolated bases remain selectable',()=>{
  const result=adaptExpandedCosts({role:'senator'},{components:[
    {kind:'office',value:100,status:'available',rows:[{id:'ceaps',value:100}]},
    {kind:'reference:remuneration',value:1200,status:'reference',rows:[{id:'salary-reference',value:1200}]},
    {kind:'reference:allowances',value:null,status:'reference',rows:[{id:'allowance-limit',value:null,monthlyLimit:100}]},
    {kind:'administration',value:null,rows:[{id:'contract',value:5000}]},
  ]},2025)
  assert.equal(result.selectedSimulationBasis,'combined')
  assert.equal(result.simulationBudget,1300)
  assert.equal(result.unitType,'combined')
  assert.equal(result.data.find(r=>r.id==='salary-reference').sourceMode,'reference')
  assert.equal(result.data.find(r=>r.id==='salary-reference').basisId,'reference')
  assert.equal(result.byCategory.reduce((s,r)=>s+r.value,0),1300)
  assert.equal(selectSimulationBasis(result,'personalPublished').simulationBudget,100)
  assert.equal(selectSimulationBasis(result,'administration').simulationBudget,5000)
  assert.equal(selectSimulationBasis(result,'missing'),result)
})

test('references reach the dashboard before slow published data and survive its failure',async()=>{
  const original=globalThis.fetch,progress=[]
  let releasePublished
  const pending=new Promise(resolve=>{releasePublished=resolve})
  globalThis.fetch=async address=>{
    const url=new URL(String(address),'https://app.test')
    if(url.pathname.endsWith('/references'))return Response.json({components:[{kind:'reference:remuneration',value:1200,status:'reference',rows:[{id:'r',value:1200}]}]})
    await pending
    return Response.json({error:'Fonte publicada indisponível'},{status:502})
  }
  try {
    const resultPromise=getUnifiedExpenses({id:'senate-1',role:'senator'},2025,{onProgress:result=>progress.push(result)})
    await new Promise(resolve=>setTimeout(resolve,0))
    assert.ok(progress.length)
    assert.equal(progress[0].simulationBudget,1200)
    releasePublished()
    const result=await resultPromise
    assert.equal(result.simulationBudget,1200)
    assert.match(result.notice,/Dados publicados indisponíveis/)
  } finally {releasePublished();globalThis.fetch=original}
})

test('deputy progress adds CEAP to salary and preserves isolated bases',async()=>{
  const original=globalThis.fetch,progress=[]
  globalThis.fetch=async address=>{
    const url=new URL(String(address),'https://app.test')
    if(url.pathname.endsWith('/references'))return Response.json({components:[{kind:'reference:remuneration',value:1200,status:'reference',rows:[{id:'r',value:1200}]}]})
    return Response.json({columns:['category','supplier','netValue'],rows:Array.from({length:67},()=>['CEAP','Fornecedor',1]),complete:true,sourceUrl:'https://www.camara.leg.br/cotas/'})
  }
  try {
    const result=await getUnifiedExpenses({id:123,role:'deputy'},2025,{onProgress:value=>progress.push(value)})
    assert.equal(result.simulationBudget,1267)
    assert.equal(selectSimulationBasis(result,'personalPublished').simulationBudget,67)
    assert.ok(progress.length)
    assert.ok(progress.every(value=>value.simulationBudget>=1200&&value.simulationBases.some(b=>b.id==='reference')))
    assert.equal(result.data.filter(row=>row.basisId==='personalPublished').length,67)
    assert.equal(result.data.filter(row=>row.basisId==='reference').length,1)
  }finally{globalThis.fetch=original}
})

test('official deputy snapshot filters name party and state and preserves collection provenance',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async address=>{
    assert.equal(address,'/deputados.json')
    return Response.json({source:'https://dadosabertos.camara.leg.br/api/v2/deputados',updatedAt:'2026-11-17T04:00:00Z',data:[
      {id:1,name:'Ána Deputada',party:'P',state:'SP'}, {id:2,name:'Ana Outro',party:'P',state:'RJ'}, {id:3,name:'Ana Terceira',party:'Q',state:'SP'},
    ]})
  }
  try {
    const result=await searchDeputySnapshot({name:'ana',party:'p',state:'sp'})
    assert.deepEqual(result.data.map(p=>p.id),[1])
    assert.equal(result.data[0].sourceMode,'official')
    assert.equal(result.data[0].sourceDate,'2026-11-17T04:00:00Z')
    assert.match(result.data[0].sourceNotice,/pode ter mudado/)
  } finally {globalThis.fetch=original}
})

test('ranking prioritizes exact names and gives different offices visibility among equal matches',()=>{
  const profiles=[{id:1,name:'Ana Clara',role:'deputy'},{id:2,name:'Ana Maria',role:'deputy'},{id:3,name:'Ana Silva',role:'mayor'},{id:4,name:'Ana',role:'senator'}]
  assert.deepEqual(rankUnifiedProfiles(profiles,'ana').map(p=>p.id),[4,1,3,2])
})

 test('published salary replaces the table, extras and credits add once, conditional caps stay out',()=>{
 const profile={role:'deputy'}
 const components=[
 {kind:'reference:remuneration',value:1200,status:'reference',rows:[{id:'table',value:1200}]},
 {kind:'reference:allowances',value:null,monthlyLimit:500,status:'reference'},
 {kind:'remuneration',value:1100,rows:[{id:'salary',value:1100}]},
 {kind:'allowances',value:50,rows:[{id:'housing',value:50}]},
 {kind:'office',value:80,rows:[{id:'expense',value:100},{id:'credit',value:-20}]},
 {kind:'cabinet',value:200,rows:[{id:'staff',value:200}]},
 {kind:'administration',value:9000,rows:[{id:'contract',value:9000}]},
 ]
 const result=adaptExpandedCosts(profile,{components},2025)
 assert.equal(result.simulationBudget,1430)
 assert.equal(result.byCategory.reduce((s,r)=>s+r.value,0),1430)
 assert.equal(selectSimulationBasis(result,'reference').simulationBudget,1200)
 assert.equal(selectSimulationBasis(result,'administration').simulationBudget,9000)
 assert.equal(adaptExpandedCosts(profile,{components:components.filter(c=>c.kind!=='remuneration')},2025).simulationBudget,1530)
 })

 test('deputy periods follow available expense files and never invent 2019-2022 coverage',()=>{
 assert.deepEqual(getAvailableYears({id:220645,role:'deputy'},{2025:['220645'],2026:['220645']}),[2026,2025])
 assert.deepEqual(getAvailableYears({id:9,role:'deputy'},{2025:[],2026:['9']}),[2026])
 assert.deepEqual(getAvailableYears({role:'mayor',termStart:'2025-01-01',termEnd:'2028-12-31'}),[2026,2025])
 })
 test('coverage distinguishes loading, table-only, zero published and completely missing data',()=>{
 const table={kind:'reference:remuneration',value:100,status:'reference'}
 assert.equal(getCoverageStatus({publishedPending:true,components:[table]}).kind,'loading')
 assert.equal(getCoverageStatus({components:[table]}).kind,'table-only')
 assert.equal(getCoverageStatus({components:[{kind:'office',value:0,status:'available'}]}).kind,'published')
 assert.equal(getCoverageStatus({components:[{kind:'remuneration',value:null,status:'unavailable'}]}).kind,'unavailable')
 assert.equal(getCoverageStatus({components:[{kind:'administration',rows:[{value:10}]}]}).kind,'contracts-only')
 })

test('local offices are excluded without contacting any upstream source',async()=>{
 const original=globalThis.fetch
 globalThis.fetch=async()=>{throw new Error('Must not fetch removed offices')}
 try{for(const role of ['governor','mayor'])assert.deepEqual((await searchUnifiedPoliticians({role})).data,[])}finally{globalThis.fetch=original}
})
