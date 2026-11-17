import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {parsePayroll,parseOffice} from '../worker/audit.js'
import {summarizeExpenses,auditedTotal,getExpenses} from '../src/lib/api.js'

const row=(label,value)=>`<tr><td>${label}</td><td>${value}</td></tr>`
test('all sheets in the same month count, including 13th; taxes are not subtracted from gross cost',()=>{
 const html='<table>'+row('a - Remuneração Fixa','46.366,19')+row('b - Gratificação Natalina','0,00')+row('d - Outras Remunerações Eventuais/Provisórias(*)','-100,00')+row('c - Imposto de Renda','-10.000,00')+row('b - Auxílios','300,00')+'</table><table>'+row('a - Remuneração Fixa','0,00')+row('b - Gratificação Natalina','23.183,10')+row('b - Auxílios','0,00')+'</table>'
 const result=parsePayroll(html)
 assert.equal(result.salary,69449.29);assert.equal(result.thirteenth,23183.10);assert.equal(result.allowances,300)
 assert.equal(parsePayroll('<html>Fonte indisponível</html>'),null)
})
test('office is the spent amount, never the unused allowance or spending limit',()=>{
 assert.equal(parseOffice('<table id="percentualgastoverbagabinete">'+row('Gasto','1.579.455,80')+row('Não utilizado','10.898,83')+'</table>'),1579455.8)
 assert.equal(parseOffice('<html>Sem dados</html>'),null)
})
test('credits subtract from CEAP and all components reconcile to cents',()=>{
 const result=summarizeExpenses([{netValue:100.10,category:'A',supplier:'X'},{netValue:-20.05,category:'A',supplier:'X'},{netValue:0,category:'B',supplier:'Y'}])
 assert.equal(result.total,80.05);assert.equal(result.debits,100.10);assert.equal(result.credits,-20.05)
 assert.equal(result.byCategory.reduce((s,c)=>s+Math.round(c.value*100),0),8005)
 assert.equal(auditedTotal(result,{salary:500,allowances:20,office:1000,indemnities:null,dailyAllowances:5}),1605.05)
})
test('official CSV snapshot preserves the positive R$2000 document that the API inverted',async()=>{
 const original=globalThis.fetch
 const snapshot=JSON.parse(gunzipSync(readFileSync(new URL('../.data/ceap-2025-204379.json.gz',import.meta.url))))
 try{
  globalThis.fetch=async()=>Response.json(snapshot)
  const expenses=await getExpenses(204379,{year:2025})
  assert.equal(expenses.data.length,393);assert.equal(expenses.total,486603.48)
  const note=expenses.data.find(e=>e.documentUrl?.includes('8038262'))
  assert.equal(note.netValue,2000)
  assert.equal(expenses.total,Math.round((expenses.debits+expenses.credits)*100)/100)
 }finally{globalThis.fetch=original}
})
