import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Reuse the exact signed CEAP values displayed in each profile.
const manifest = JSON.parse(readFileSync('.data/ceap-manifest.json', 'utf8'))
const profiles = new Map(JSON.parse(readFileSync('public/deputados.json', 'utf8')).data.map(p => [String(p.id), p]))
const years = {}
for (const year of Object.keys(manifest.years)) {
  years[year] = readdirSync('.data').filter(name => name.startsWith(`ceap-${year}-`) && name.endsWith('.json.gz')).map(name => {
    const id = name.split('-')[2].split('.')[0]
    const snapshot = JSON.parse(gunzipSync(readFileSync(`.data/${name}`)))
    const valueIndex = snapshot.columns.indexOf('netValue')
    if (valueIndex < 0 || !snapshot.complete) throw new Error(`Snapshot inválido: ${name}`)
    const total = snapshot.rows.reduce((sum, row) => {
      if (!Number.isFinite(row[valueIndex])) throw new Error(`Valor inválido: ${name}`)
      return sum + Math.round(row[valueIndex] * 100)
    }, 0) / 100
    const p = profiles.get(id)
    return { id: Number(id), name: p?.name || `Deputado(a) · cadastro ${id}`, party: p?.party || '', state: p?.state || '', photo: p?.photo || null, total, count: snapshot.rows.length }
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
  if (years[year].length !== manifest.years[year].deputies) throw new Error(`Cobertura divergente: ${year}`)
}
writeFileSync('public/ranking-ceap.json', JSON.stringify({ fetchedAt: manifest.fetchedAt, sources: manifest.years, years }))
console.log('Ranking CEAP gerado para', Object.keys(years).join(', '))
