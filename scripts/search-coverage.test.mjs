import test from 'node:test'
import assert from 'node:assert/strict'
import {hasSearchableCosts} from '../worker/search-coverage.js'
import {searchExpansion} from '../worker/expansion.js'

test('search rejects empty, reference-only and below-floor personal totals', () => {
  for (const components of [[], [{kind:'remuneration',value:null}],
    [{kind:'remuneration',value:0}], [{kind:'remuneration',value:42521.76}],
    [{kind:'remuneration',value:Infinity}], [{kind:'remuneration',value:500000,status:'unavailable'}],
    [{kind:'reference:remuneration',value:500000,status:'reference'}],
    [{kind:'administration',value:10000000}]]) {
    assert.equal(hasSearchableCosts({components},371216.4),false)
  }
  assert.equal(hasSearchableCosts(null,371216.4),false)
  assert.equal(hasSearchableCosts({components:[{kind:'remuneration',value:371216.4}]},371216.4),true)
  assert.equal(hasSearchableCosts({components:[{kind:'remuneration',value:371216.39}]},371216.4),false)
})

test('search removes Temer and empty profiles while retaining published historical years', async () => {
  assert.equal((await searchExpansion(new URLSearchParams({role:'president',name:'Temer'}))).total,0)
  assert.equal((await searchExpansion(new URLSearchParams({role:'minister',name:'Miriam'}))).total,0)
  const presidents=await searchExpansion(new URLSearchParams({role:'president'}))
  assert.ok(presidents.data.some(p=>p.name.includes('Jair')&&p.costYears.includes(2022)))
  assert.ok(presidents.data.some(p=>p.name.includes('Dilma')&&p.costYears.includes(2015)))
  assert.ok(!presidents.data.some(p=>p.name.includes('Temer')))
  for(const role of ['president','minister','justice']) {
    const result=await searchExpansion(new URLSearchParams({role}))
    assert.ok(result.data.length)
    assert.ok(result.data.every(p=>p.costYears.length>0))
  }
})
