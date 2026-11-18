import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,statSync} from 'node:fs'
import {expansionResponse,searchExpansion} from '../worker/expansion.js'

const request=(profile,year)=>new Request(`https://app.test/api/expansion/references?${new URLSearchParams({profile:JSON.stringify(profile),year:String(year)})}`)
test('Lula, Jair, Moraes and Flávio have canonical offline references and local official portraits',async()=>{
  const original=globalThis.fetch
  let externalCalls=0
  globalThis.fetch=async()=>{externalCalls++;throw new Error('Reference endpoint must work offline')}
  try {
    const profiles={}
    for(const [key,role,name] of [['lula','president','Lula'],['jair','president','Jair Bolsonaro'],['moraes','justice','Alexandre de Moraes'],['flavio','senator','Flavio Bolsonaro']]) {
      const result=await searchExpansion(new URLSearchParams({role,name}))
      const profile=result.data[0]
      assert.ok(profile,`${role}: ${name}`)
      profiles[key]=profile
      assert.ok(profile.photoLocal?.startsWith('/portraits/'),`${name} local portrait`)
      const file=new URL(`../public${profile.photoLocal}`,import.meta.url)
      assert.ok(existsSync(file))
      assert.ok(statSync(file).size>1000)
      const source=new URL(profile.photoSource)
      assert.equal(source.protocol,'https:')
      if(key==='lula') {
        assert.equal(source.hostname,'live.staticflickr.com')
        assert.match(profile.photoCredit,/Presidência da República/)
      } else assert.match(source.hostname,/(\.gov\.br|\.leg\.br|\.jus\.br)$/)
      const response=await expansionResponse(request({...profile,name:'Caller supplied impostor',photoSource:'https://evil.test'},key==='jair'?2022:2025))
      assert.equal(response.status,200,await response.clone().text())
      const reference=await response.json()
      assert.equal(reference.referenceTotal,key==='jair'?371216.4:554036.61)
      assert.ok(reference.components.every(component=>component.isEstimate===true&&component.includeInPersonalTotal===false))
      assert.doesNotMatch(JSON.stringify(reference),/evil\.test|Caller supplied/)
      if(key==='flavio') {
        const housing=reference.components.find(component=>component.kind==='reference:allowances')
        assert.equal(housing.monthlyLimit,5500)
        assert.equal(housing.value,null)
      }
    }
    const outside=await expansionResponse(request(profiles.jair,2025))
    assert.equal((await outside.json()).referenceTotal,null)
    const justices=await searchExpansion(new URLSearchParams({role:'justice'}))
    assert.equal(justices.data.length,10)
    assert.equal(externalCalls,0)
  }finally{globalThis.fetch=original}
})

 test('all governor portraits are local and mayor photos use their exact TSE identity',async()=>{
 const {NAMED_DIRECTORY}=await import('../worker/political-profiles.js')
 const governors=NAMED_DIRECTORY.profiles.filter(p=>p.role==='governor')
 assert.equal(governors.length,27)
 for(const p of governors){
   assert.ok(p.photo.startsWith('/portraits/'))
   assert.ok(statSync(new URL('../public'+p.photo,import.meta.url)).size>1000)
 }
 const mayors=NAMED_DIRECTORY.profiles.filter(p=>p.role==='mayor')
 assert.ok(mayors.length>5500)
 for(const p of mayors){
   const seq=p.id.split('-').at(-1)
   assert.equal(p.photo,`https://resultados.tse.jus.br/oficial/ele2024/619/fotos/${p.state.toLowerCase()}/${seq}.jpeg`)
 }
 })
