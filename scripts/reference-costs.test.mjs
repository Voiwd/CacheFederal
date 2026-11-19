import test from 'node:test'
import assert from 'node:assert/strict'
import {getRoleReferenceCosts} from '../worker/reference-costs.js'

test('2025 applies January and February legal rates, without annualizing February over January',()=>{
  for(const role of ['president','minister','senator','deputy','stf']) {
    const result=getRoleReferenceCosts({role},2025)
    assert.equal(result.referenceTotal,554036.61)
    assert.equal(result.components[0].rows[0].value,44008.52)
    assert.equal(result.components[0].rows[1].value,46366.19)
    assert.equal(result.components[0].rows.length,12)
    assert.equal(result.isPaid,false)
    assert.equal(result.components[0].includeInPersonalTotal,false)
  }
})
test('2023 and 2024 preserve historical transition dates',()=>{
  assert.equal(getRoleReferenceCosts({role:'president'},2023).referenceTotal,492738.24)
  const r=getRoleReferenceCosts({role:'stf'},2024)
  assert.equal(r.components[0].rows[0].value,41650.92)
  assert.equal(r.components[0].rows[1].value,44008.52)
})
test('Bolsonaro years use historic executive rate rather than the modern federal ceiling',()=>{
  for(const year of [2019,2020,2021,2022]) {
    const result=getRoleReferenceCosts({role:'president',termStart:'2019-01-01',termEnd:'2022-12-31'},year)
    assert.equal(result.monthlyReference,30934.70)
    assert.equal(result.referenceTotal,371216.40)
  }
  assert.equal(getRoleReferenceCosts({role:'president',termEnd:'2022-12-31'},2026).referenceTotal,null)
})
test('benefit eligibility limits never enter a total or assert payment',()=>{
  const r=getRoleReferenceCosts({role:'senator'},2026)
  assert.equal(r.referenceTotal,556394.28)
  const housing=r.components[1]
  assert.equal(housing.monthlyLimit,5500)
  assert.equal(housing.value,null)
  assert.equal(housing.rows[0].value,null)
  assert.equal(housing.includeInReferenceTotal,false)
  assert.equal(getRoleReferenceCosts({role:'deputy'},2026).components[1].monthlyLimit,4253)
})
test('territorial laws are restricted to their verified jurisdiction and periods',()=>{
  const sp=getRoleReferenceCosts({role:'governor',state:'SP'},2025)
  assert.equal(sp.components[0].rows[5].value,34572.89)
  assert.equal(sp.components[0].rows[6].value,36301.53)
  assert.equal(getRoleReferenceCosts({role:'governor',state:'RJ'},2025).referenceTotal,null)
  assert.equal(getRoleReferenceCosts({role:'mayor',ibgeId:'3509502'},2025).monthlyReference,37082.36)
  assert.equal(getRoleReferenceCosts({role:'mayor',ibgeId:'3550308'},2025).referenceTotal,null)
})
test('unverified years and unknown roles produce missing values rather than zero',()=>{
  for(const year of [2000,2027,NaN]) assert.equal(getRoleReferenceCosts({role:'president'},year).referenceTotal,null)
  assert.equal(getRoleReferenceCosts({role:'other'},2026).referenceTotal,null)
})
