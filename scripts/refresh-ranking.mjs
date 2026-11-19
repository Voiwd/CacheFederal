import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { auditDeputy } from '../worker/audit.js'
import { searchExpansion, expansionCosts } from '../worker/expansion.js'
import { getRoleReferenceCosts } from '../worker/reference-costs.js'
import { adaptExpandedCosts, normalizeUnifiedProfile } from '../src/lib/unified.js'

const year = 2025
const cache = '.data/ranking'
mkdirSync(cache, { recursive: true })
const profiles = JSON.parse(readFileSync('public/deputados.json')).data.map(p => normalizeUnifiedProfile(p))
for (const role of ['senator', 'president', 'minister', 'justice']) {
  const result = await searchExpansion(new URLSearchParams({ role }))
  profiles.push(...result.data.map(p => normalizeUnifiedProfile(p)))
}
// One common year; historical mandates from other years cannot compete.
const candidates = profiles.filter(p => !p.historical && (!p.termStart || Number(p.termStart.slice(0,4)) <= year) && (!p.termEnd || Number(p.termEnd.slice(0,4)) >= year))
let cursor = 0, completed = 0
const results = []
async function collect(profile) {
  const file = `${cache}/${year}-${profile.role}-${profile.id}.json`
  let costs
  if (existsSync(file)) costs = JSON.parse(readFileSync(file))
  else {
    if (profile.role === 'deputy') {
      const filename = `.data/ceap-${year}-${profile.id}.json.gz`
      if (!existsSync(filename)) return
      const snapshot = JSON.parse(gunzipSync(readFileSync(filename)))
      const rows = snapshot.rows.map((row, i) => ({ id: `ceap-${i}`, ...Object.fromEntries(snapshot.columns.map((key, j) => [key, row[j]])) }))
      const audit = await auditDeputy(profile.id, year)
      const components = [{ kind: 'office', label: 'Gastos do mandato (CEAP)', value: rows.reduce((n, r) => n + Math.round(r.netValue * 100), 0) / 100, status: 'available', rows, sourceUrl: snapshot.sourceUrl }]
      for (const [kind, label, key] of [['remuneration','Salário publicado','salary'],['allowances','Auxílios','allowances'],['indemnities','Indenizações','indemnities'],['dailyAllowances','Diárias','dailyAllowances'],['cabinet','Equipe do gabinete','office']]) {
        const value = audit[key]
        components.push({kind,label,value,status:Number.isFinite(value)?'available':'unavailable',sourceUrl:kind==='cabinet'?audit.sources.summary:audit.sources.payroll,rows:[]})
      }
      costs = { components, verifiedMonths: audit.months.map(m => m.month), fetchedAt: audit.fetchedAt }
    } else costs = await expansionCosts(profile, year)
    writeFileSync(file, JSON.stringify(costs))
  }
  const references = getRoleReferenceCosts(profile, year)
  const combined = adaptExpandedCosts(profile, {...costs, components: [...costs.components, ...references.components]}, year)
  if (!Number.isFinite(combined.simulationBudget)) return
  results.push({ profile, total: combined.simulationBudget, components: combined.components.map(({kind,label,value,status,sourceUrl})=>({kind,label,value,status,sourceUrl})), verifiedMonths: costs.verifiedMonths || [], fetchedAt: costs.fetchedAt || null })
}
await Promise.all(Array.from({length: 6}, async () => {
  while (cursor < candidates.length) {
    const profile = candidates[cursor++]
    try { await collect(profile) } catch (error) { console.error(profile.id, error.message) }
    if (++completed % 25 === 0) console.log(`${completed}/${candidates.length} perfis conferidos`)
  }
}))
results.sort((a,b)=>b.total-a.total || a.profile.name.localeCompare(b.profile.name,'pt-BR'))
writeFileSync('public/ranking-total.json', JSON.stringify({year, fetchedAt:new Date().toISOString(), ceapFetchedAt:JSON.parse(readFileSync('.data/ceap-manifest.json')).fetchedAt, compared:results.length, rows:results.slice(0,10)}))
console.log('Top 10 consolidado:', results.slice(0,10).map(r=>`${r.profile.name}: ${r.total}`).join('\n'))
