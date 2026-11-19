import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { adaptExpandedCosts } from '../src/lib/unified.js'

test('top ten uses the full dashboard composition, without salary duplication or benefit caps', () => {
  const ranking = JSON.parse(readFileSync('public/ranking-total.json'))
  assert.equal(ranking.rows.length, 10)
  assert.equal(ranking.year, 2025)
  assert.ok(ranking.compared > 600)
  assert.equal(new Set(ranking.rows.map(r => `${r.profile.role}:${r.profile.id}`)).size, 10)
  ranking.rows.forEach((row, i) => {
    assert.ok(row.profile.photoLocal || row.profile.photo)
    assert.equal(row.verifiedMonths.length, 12)
    if (i) assert.ok(ranking.rows[i - 1].total >= row.total)
    const dashboard = adaptExpandedCosts(row.profile, {components: row.components}, ranking.year)
    assert.equal(row.total, dashboard.simulationBudget)
    assert.ok(row.components.some(c => c.kind === 'remuneration' && Number.isFinite(c.value)))
    assert.ok(row.components.some(c => c.kind === 'cabinet' && Number.isFinite(c.value)))
  })
})
