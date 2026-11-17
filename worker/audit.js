const ORIGIN = 'https://www.camara.leg.br'
export const money = value => Math.round(Number(String(value).replace(/\./g, '').replace(',', '.')) * 100) / 100
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const plain = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const round = value => Math.round(value * 100) / 100

export function parsePayroll(html) {
  const fields = {}
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => text(c[1]))
    if (cells.length < 2 || !/^-?\s*[\d.]+,\d{2}$/.test(cells.at(-1))) continue
    const key = plain(cells[0]).replace(/^[a-z]\s*-\s*/, '')
    fields[key] = round((fields[key] || 0) + money(cells.at(-1)))
  }
  if (!Object.hasOwn(fields, 'remuneracao fixa')) return null
  const sum = names => round(names.reduce((s, name) => s + (Object.entries(fields).find(([key]) => key.startsWith(name))?.[1] || 0), 0))
  return {
    salary: sum(['remuneracao fixa', 'vantagens de natureza pessoal', 'funcao ou cargo', 'gratificacao natalina', 'ferias', 'outras remuneracoes', 'abono permanencia', 'redutor constitucional']),
    thirteenth: sum(['gratificacao natalina']),
    allowances: sum(['auxilios']), indemnities: sum(['vantagens indenizatorias']), dailyAllowances: sum(['diarias']),
  }
}

export function parseOffice(html) {
  const table = html.match(/<table\b[^>]*id="percentualgastoverbagabinete"[^>]*>([\s\S]*?)<\/table>/i)?.[1]
  if (!table) return null
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => text(c[1]))
    if (cells[0] === 'Gasto' && /^[\d.]+,\d{2}$/.test(cells[1])) return money(cells[1])
  }
  return null
}

async function official(path) {
  const response = await fetch(ORIGIN + path, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(18000) })
  if (!response.ok) throw new Error(`Fonte oficial: HTTP ${response.status}`)
  return response.text()
}

export async function auditDeputy(id, year) {
  const now = new Date(), maxMonth = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12
  const summaryUrl = `${ORIGIN}/deputados/${id}?ano=${year}`
  let office = null, housing = 'Não disponível', officeError = null
  try {
    const html = await official(`/deputados/${id}?ano=${year}`)
    office = parseOffice(html)
    const section = html.match(/beneficio__auxilio-moradia([\s\S]*?)<\/li>/i)?.[1]
    housing = section ? text(section).replace(/^.*?Auxílio-moradia\s*\?\s*/, '').slice(0, 220) : 'Consulte a fonte oficial'
  } catch (e) { officeError = e.message }
  const months = [], unavailable = []
  // Three simultaneous requests avoid a burst of twelve requests to the source.
  for (let start = 1; start <= maxMonth; start += 3) {
    await Promise.all(Array.from({ length: Math.min(3, maxMonth - start + 1) }, async (_, i) => {
      const month = start + i, sourceUrl = `${ORIGIN}/deputados/${id}/remuneracao-deputado-detalhado?mesAno=${String(month).padStart(2,'0')}${year}`
      try {
        const data = parsePayroll(await official(sourceUrl.slice(ORIGIN.length)))
        if (data) months.push({month, ...data, sourceUrl}); else unavailable.push(month)
      } catch { unavailable.push(month) }
    }))
  }
  months.sort((a,b) => a.month-b.month)
  const total = key => months.length ? round(months.reduce((sum, m) => sum + m[key], 0)) : null
  return { id, year, fetchedAt: now.toISOString(), salary: total('salary'), thirteenth: total('thirteenth'),
    allowances: total('allowances'), indemnities: total('indemnities'), dailyAllowances: total('dailyAllowances'),
    office, officeError, housing, months, unavailable: unavailable.sort((a,b)=>a-b),
    sources: {summary: summaryUrl, payroll: `${ORIGIN}/deputados/${id}/remuneracao?ano=${year}`},
    coverage: 'Folhas mensais publicadas; lacunas não são consideradas zero. Moradia fora da folha, missões e encargos adicionais do gabinete não são somados sem conciliação.' }
}

const memory = new Map()
export async function auditResponse(request, ctx) {
  const url = new URL(request.url), match = url.pathname.match(/^\/api\/audit\/(\d{1,7})$/), year = Number(url.searchParams.get('year'))
  if (request.method !== 'GET' || !match || ![2025,2026].includes(year)) return Response.json({error:'Consulta inválida'}, {status:400})
  const key = match[1] + '-' + year
  const hit = memory.get(key)
  if (hit && Date.now()-hit.time < 3600000) return Response.json(hit.data)
  const data = await auditDeputy(match[1], year)
  if (memory.size > 80) memory.delete(memory.keys().next().value)
  memory.set(key, {time:Date.now(), data})
  return Response.json(data, {headers:{'Cache-Control':'private, max-age=3600'}})
}
