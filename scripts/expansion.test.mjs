import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeCeaps, expansionCosts, expansionResponse} from '../worker/expansion.js'

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

test('federal directory preserves SIORG list/detail shapes and restricts contracts to the executive agency',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async url=>{
    const address=String(url)
    if(address.endsWith('/doc/orgao-entidade')) return Response.json({unidades:[{codigoUnidade:'https://api.siorg.gov.br/id/unidade-organizacional/777',codigoEsfera:'https://api.siorg.gov.br/id/esfera/1',codigoPoder:'https://api.siorg.gov.br/id/poder/1',nome:'Ministério de Teste',sigla:'MT'}]})
    if(address.endsWith('/777/completa')) return Response.json({unidade:{nome:'Ministério de Teste',autoridade:{denominacao:{descricao:'Ministro'}}}})
    assert.match(address,/pncp\.gov\.br/)
    const contract=(id,name,power)=>({numeroControlePNCP:id,orgaoEntidade:{razaoSocial:name,esferaId:'F',poderId:power,cnpj:'123'},valorInicial:250,anoContrato:2022,sequencialContrato:1})
    return Response.json({data:[contract('correct','Ministério de Teste','E'),contract('other-agency','Outro Ministério','E'),contract('legislative','Ministério de Teste','L')]})
  }
  try {
    const search=await expansionResponse(new Request('https://app.test/api/expansion/search?role=minister'))
    const profile=(await search.json()).data[0]
    assert.equal(profile.id,'siorg-777')
    assert.equal(profile.scope,'administration')
    const response=await expansionResponse(new Request(`https://app.test/api/expansion/costs?${new URLSearchParams({profile:JSON.stringify(profile),year:'2022'})}`))
    assert.equal(response.status,200,await response.clone().text())
    const components=(await response.json()).components
    assert.equal(components.find(c=>c.kind==='remuneration').value,null)
    const administration=components.find(c=>c.kind==='administration')
    assert.deepEqual(administration.rows.map(r=>r.id),['correct'])
    assert.equal(administration.value,null)
  } finally {globalThis.fetch=original}
})
