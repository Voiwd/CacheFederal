import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeCeaps, expansionCosts, expansionResponse,searchExpansion,reconcileSenateResources} from '../worker/expansion.js'
import {NAMED_DIRECTORY} from '../worker/political-profiles.js'

test('nominal official directory finds each executive office and retains temporal provenance',async()=>{
  for(const [role,name] of [['president','Lula'],['minister','Luiz Marinho']]) {
    const result=await searchExpansion(new URLSearchParams({role,name}))
    assert.ok(result.data.length,`${role}: ${name}`)
    assert.ok(result.data.every(p=>p.role===role&&p.sourceMode==='official'&&p.sourceNotice&&p.sourceDate&&p.officialUrl.startsWith('https://')))
  }
  for(const [role,count] of Object.entries(NAMED_DIRECTORY.counts)) assert.equal(NAMED_DIRECTORY.profiles.filter(p=>p.role===role).length,count)
  assert.equal(NAMED_DIRECTORY.counts.governor,27)
  assert.equal(NAMED_DIRECTORY.counts.president,1)
  assert.ok(NAMED_DIRECTORY.counts.mayor>5000)
  for(const p of NAMED_DIRECTORY.profiles.filter(p=>p.electionYear)) {
    assert.equal(p.electionYear,p.role==='mayor'?2024:2022)
    assert.ok(p.termStart&&p.termEnd)
    assert.match(p.sourceNotice,/histórico/)
  }
})

test('mayor contracts outside the elected mandate remain unavailable without upstream requests',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async()=>{throw new Error('Must not fetch another administration')}
  try {
    const profile=NAMED_DIRECTORY.profiles.find(p=>p.role==='mayor'&&p.name.includes('RICARDO NUNES'))
    assert.ok(profile)
    const result=await expansionCosts(profile,2024)
    assert.ok(result.components.every(c=>c.value===null&&c.rows.length===0))
    assert.match(result.notice,/fora do mandato/)
  } finally {globalThis.fetch=original}
})

test('CEAPS distinguishes unavailable values from zero and retains credits',()=>{
  for (const value of [null,undefined,'','  ',true,{},'invalid']) assert.equal(normalizeCeaps({valorReembolsado:value}).value,null)
  assert.equal(normalizeCeaps({valorReembolsado:0}).value,0)
  assert.equal(normalizeCeaps({valorReembolsado:-12.35}).value,-12.35)
})

test('CEAPS only includes the selected senator and reconciles credits to cents',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async()=>Response.json([
    {id:1,codSenador:999999,ano:2024,valorReembolsado:100.10},
    {id:2,codSenador:999999,ano:2024,valorReembolsado:-20.05},
    {id:3,codSenador:111111,ano:2024,valorReembolsado:10000},
  ])
  try {
    const result=await expansionCosts({role:'senator',externalId:'999999'},2024)
    const office=result.components.find(c=>c.kind==='office')
    assert.equal(office.value,80.05)
    assert.equal(office.rows.length,2)
    assert.equal(result.components.find(c=>c.kind==='remuneration').value,null)
  } finally {globalThis.fetch=original}
})

test('PNCP rejects other territories and spheres and never totals a contract sample as personal expense',async()=>{
  const original=globalThis.fetch
  const contract=(id,sphere,uf,ibge)=>({numeroControlePNCP:id,orgaoEntidade:{esferaId:sphere,poderId:'E',cnpj:'123'},unidadeOrgao:{ufSigla:uf,codigoIbge:ibge},valorInicial:1000,anoContrato:2023,sequencialContrato:1})
  globalThis.fetch=async()=>Response.json({totalPaginas:3,data:[
    contract('right','M','SP','3509502'),contract('other-city','M','SP','3550308'),
    contract('other-state','M','RJ','3509502'),contract('state','E','SP','3509502'),
    {...contract('legislative','M','SP','3509502'),orgaoEntidade:{esferaId:'M',poderId:'L',cnpj:'999'}},
  ]})
  try {
    const result=await expansionCosts({role:'mayor',ibgeId:'3509502',state:'SP'},2023)
    const administration=result.components.find(c=>c.kind==='administration')
    assert.deepEqual(administration.rows.map(r=>r.id),['right'])
    assert.equal(administration.value,null)
    assert.equal(administration.status,'partial')
    assert.match(administration.notice,/contratados, não pagamentos/)
    assert.equal(result.components.find(c=>c.kind==='office').value,null)
    assert.equal(result.components.find(c=>c.kind==='remuneration').value,null)
  } finally {globalThis.fetch=original}
})

test('unknown routes and invalid years fail before any upstream request',async()=>{
  assert.equal((await expansionResponse(new Request('https://app.test/api/expansion/unknown'))).status,404)
  for (const year of ['abc','2000','9999']) {
    const response=await expansionResponse(new Request(`https://app.test/api/expansion/costs?year=${year}`))
    assert.equal(response.status,400)
  }
})

test('cost route resolves profiles against official identities and ignores caller URLs',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async url=>{
    assert.match(String(url),/^https:\/\/(legis|adm)\.senado/)
    if(String(url).includes('/lista/')) return Response.json({ListaParlamentarEmExercicio:{Parlamentares:{Parlamentar:[{IdentificacaoParlamentar:{CodigoParlamentar:999999,NomeParlamentar:'Oficial',SiglaPartidoParlamentar:'P',UfParlamentar:'SP',UrlPaginaParlamentar:'https://www25.senado.leg.br/oficial'}}]}}})
    return Response.json([])
  }
  const request=profile=>new Request(`https://app.test/api/expansion/costs?${new URLSearchParams({year:'2024',profile:JSON.stringify(profile)})}`)
  try {
    const response=await expansionResponse(request({id:'senate-999999',role:'senator',name:'Impostor',officialUrl:'javascript:alert(1)'}))
    assert.equal(response.status,200,await response.clone().text())
    assert.doesNotMatch(JSON.stringify(await response.json()),/javascript:|Impostor/)
    assert.equal((await expansionResponse(request({role:'senator',externalId:'888888'}))).status,400)
    assert.equal((await expansionResponse(new Request('https://app.test/api/expansion/costs?year=2024&profile=broken'))).status,400)
    assert.equal((await expansionResponse(new Request('https://app.test/api/expansion/search?role=unknown'))).status,400)
  } finally {globalThis.fetch=original}
})

test('executive profiles never substitute arbitrary contract samples for personal costs',async()=>{
 const original=globalThis.fetch
 globalThis.fetch=async()=>{throw new Error('Incomplete institutional sources must not be queried')}
 try{
 const profile=NAMED_DIRECTORY.profiles.find(p=>p.role==='minister')
 const result=await expansionCosts(profile,2025)
 assert.ok(result.components.every(c=>c.value===null&&c.rows.length===0))
 assert.match(result.notice,/cadastro mensal não confirma/)
 }finally{globalThis.fetch=original}
})

test('removed local offices never appear in public searches',async()=>{
 for(const role of ['governor','mayor']){
  const result=await searchExpansion(new URLSearchParams({role}))
  assert.deepEqual(result.data,[])
 }
})

const senateProfile={id:'senate-742',externalId:'742',name:'Marcelo Castro',state:'PI'}
const senateReport=()=>({statusCode:200,data:[{ano:2025,parlamentar:{nome:'Marcelo Castro',estado:'PI'},cotas:{despesas:[{recurso:'Cota',valor:100}],totalValor:100},gastosNaoInclusos:{despesas:[{recurso:'Correios',valor:30},{recurso:'Estorno',valor:-5}],totalValor:25}}]})
test('senate extra expenses reconcile both blocks without repeating CEAPS',()=>{
 const component=reconcileSenateResources(senateReport(),senateProfile,2025,100)
 assert.equal(component.value,25)
 assert.equal(component.rows.reduce((sum,row)=>sum+row.value,0),25)
 assert.equal(component.rows.length,2)
})
test('inconsistent or incomplete senate blocks are rejected in full',()=>{
 const mutations=[r=>r.data[0].gastosNaoInclusos.totalValor=26,r=>r.data[0].gastosNaoInclusos.despesas[0].valor=null,r=>r.data[0].ano=2024,r=>r.data[0].parlamentar.nome='Outra pessoa',r=>r.data[0].cotas.totalValor=99,r=>r.data[0].gastosNaoInclusos.despesas=[]]
 for(const mutate of mutations){const r=senateReport();mutate(r);assert.throws(()=>reconcileSenateResources(r,senateProfile,2025,100))}
 assert.throws(()=>reconcileSenateResources(senateReport(),senateProfile,2025,101))
})
