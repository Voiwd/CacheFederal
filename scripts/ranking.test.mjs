import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

test('ranking covers every deputy and reconciles signed profile expenses to cents', () => {
  const ranking = JSON.parse(readFileSync('public/ranking-ceap.json'))
  const manifest = JSON.parse(readFileSync('.data/ceap-manifest.json'))
  assert.equal(ranking.fetchedAt, manifest.fetchedAt)
  for (const [year, rows] of Object.entries(ranking.years)) {
    assert.equal(rows.length, manifest.years[year].deputies)
    assert.equal(new Set(rows.map(p => p.id)).size, rows.length)
    rows.forEach((p, index) => {
      if (index) assert.ok(rows[index - 1].total >= p.total)
      const snapshot = JSON.parse(gunzipSync(readFileSync(`.data/ceap-${year}-${p.id}.json.gz`)))
      const column = snapshot.columns.indexOf('netValue')
      assert.equal(p.total, snapshot.rows.reduce((sum, row) => sum + Math.round(row[column] * 100), 0) / 100)
      assert.equal(p.count, snapshot.rows.length)
    })
  }
})
