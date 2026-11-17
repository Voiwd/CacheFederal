import { comparisonReferences } from '../data/products.js'

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2'
const REQUEST_TIMEOUT = 12000

export const OFFICIAL_SOURCE = {
  name: 'Dados Abertos da Câmara dos Deputados',
  homepage: 'https://dadosabertos.camara.leg.br/',
  api: API_BASE,
}

const demoPoliticians = [
  {
    id: 'demo-1',
    name: 'Deputada Demonstrativa',
    party: 'EX',
    state: 'BR',
    photo: null,
    email: null,
    legislatureId: null,
    officialUrl: null,
    sourceMode: 'demo',
    sourceNotice: 'Personagem fictícia. Valores abaixo existem apenas para demonstrar a interface.',
  },
  {
    id: 'demo-2',
    name: 'Senador de Mentirinha',
    party: 'SIM',
    state: 'BR',
    photo: null,
    email: null,
    legislatureId: null,
    officialUrl: null,
    sourceMode: 'demo',
    sourceNotice: 'Personagem fictício. Não corresponde a um parlamentar real.',
  },
]

const demoExpenses = [
  {
    id: 'demo-expense-1',
    date: '2025-03-14',
    year: 2025,
    month: 3,
    category: 'PASSAGENS AÉREAS',
    supplier: 'Fornecedor Demonstrativo S.A.',
    supplierDocument: null,
    documentNumber: 'DEMO-001',
    documentType: 'Nota fictícia',
    value: 18420.5,
    netValue: 18420.5,
    reimbursementNumber: null,
    batchNumber: null,
    documentUrl: null,
    sourceMode: 'demo',
  },
  {
    id: 'demo-expense-2',
    date: '2025-02-08',
    year: 2025,
    month: 2,
    category: 'DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR',
    supplier: 'Gráfica Imaginária Ltda.',
    supplierDocument: null,
    documentNumber: 'DEMO-002',
    documentType: 'Nota fictícia',
    value: 32750,
    netValue: 32750,
    reimbursementNumber: null,
    batchNumber: null,
    documentUrl: null,
    sourceMode: 'demo',
  },
  {
    id: 'demo-expense-3',
    date: '2025-01-21',
    year: 2025,
    month: 1,
    category: 'MANUTENÇÃO DE ESCRITÓRIO',
    supplier: 'Papelaria Hipotética',
    supplierDocument: null,
    documentNumber: 'DEMO-003',
    documentType: 'Nota fictícia',
    value: 6840.9,
    netValue: 6840.9,
    reimbursementNumber: null,
    batchNumber: null,
    documentUrl: null,
    sourceMode: 'demo',
  },
]

function withTimeout(signal) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  if (signal) {
    if (signal.aborted) controller.abort()
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

async function request(path, params = {}, signal) {
  const url = new URL(`${API_BASE}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })

  const timed = withTimeout(signal)
  try {
    const response = await fetch(url, {
      signal: timed.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`A API oficial respondeu com status ${response.status}.`)
    const payload = await response.json()
    return { ...payload, requestUrl: url.toString() }
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A consulta oficial demorou mais que o esperado.')
    throw error
  } finally {
    timed.clear()
  }
}

function normalizePolitician(item) {
  return {
    id: item.id,
    name: item.nome,
    party: item.siglaPartido,
    state: item.siglaUf,
    photo: item.urlFoto,
    email: item.email || null,
    legislatureId: item.idLegislatura || null,
    officialUrl: item.uri || `${API_BASE}/deputados/${item.id}`,
    sourceMode: 'official',
    sourceNotice: 'Cadastro retornado pela API oficial da Câmara dos Deputados.',
  }
}

function normalizeExpense(item, index) {
  const netValue = Number(item.valorLiquido ?? item.valorDocumento ?? 0)
  return {
    id: `${item.codDocumento || item.numDocumento || 'despesa'}-${item.numRessarcimento || index}`,
    date: item.dataDocumento || null,
    year: Number(item.ano),
    month: Number(item.mes),
    category: item.tipoDespesa || 'Não informado',
    supplier: item.nomeFornecedor || 'Fornecedor não informado',
    supplierDocument: item.cnpjCpfFornecedor || null,
    documentNumber: item.numDocumento || null,
    documentType: item.tipoDocumento || null,
    value: Number(item.valorDocumento || 0),
    netValue,
    reimbursementNumber: item.numRessarcimento || null,
    batchNumber: item.codLote || null,
    documentUrl: item.urlDocumento || null,
    sourceMode: 'official',
  }
}

export async function searchPoliticians(filters = {}, options = {}) {
  const { name = '', party = '', state = '' } = filters
  try {
    const payload = await request(
      '/deputados',
      {
        nome: name.trim(),
        siglaPartido: party.trim().toUpperCase(),
        siglaUf: state.trim().toUpperCase(),
        itens: 30,
        ordem: 'ASC',
        ordenarPor: 'nome',
      },
      options.signal,
    )
    return {
      data: payload.dados.map(normalizePolitician),
      sourceMode: 'official',
      sourceUrl: payload.requestUrl,
      notice: 'Resultados obtidos agora na API oficial da Câmara.',
    }
  } catch (error) {
    if (options.allowDemo === false) throw error
    const query = `${name} ${party} ${state}`.trim().toLocaleLowerCase('pt-BR')
    const filtered = query
      ? demoPoliticians.filter((item) =>
          `${item.name} ${item.party} ${item.state}`.toLocaleLowerCase('pt-BR').includes(query),
        )
      : demoPoliticians
    return {
      data: filtered,
      sourceMode: 'demo',
      sourceUrl: null,
      notice: `API oficial indisponível: ${error.message} Exibindo somente personagens fictícios para demonstração.`,
      error,
    }
  }
}

export async function getPolitician(id, options = {}) {
  if (String(id).startsWith('demo-')) {
    const politician = demoPoliticians.find((item) => item.id === String(id))
    if (!politician) throw new Error('Personagem demonstrativo não encontrado.')
    return { data: politician, sourceMode: 'demo', sourceUrl: null }
  }

  const payload = await request(`/deputados/${id}`, {}, options.signal)
  const latestStatus = payload.dados.ultimoStatus || payload.dados
  return {
    data: normalizePolitician({ id: payload.dados.id, ...latestStatus }),
    sourceMode: 'official',
    sourceUrl: payload.requestUrl,
  }
}

export async function getExpenses(politicianId, filters = {}, options = {}) {
  const { year = new Date().getFullYear(), month, category } = filters
  if (String(politicianId).startsWith('demo-')) {
    const data = demoExpenses.filter(
      (expense) =>
        (!year || expense.year === Number(year)) &&
        (!month || expense.month === Number(month)) &&
        (!category || expense.category === category),
    )
    return summarizeExpenses(data, {
      sourceMode: 'demo',
      sourceUrl: null,
      notice: 'Dados totalmente fictícios, exibidos apenas para demonstrar o produto.',
    })
  }

  const allItems = []
  let page = 1
  let sourceUrl = null
  const maxPages = options.maxPages || 8

  do {
    const payload = await request(
      `/deputados/${politicianId}/despesas`,
      { ano: year, mes: month, itens: 100, pagina: page, ordem: 'DESC', ordenarPor: 'dataDocumento' },
      options.signal,
    )
    sourceUrl ||= payload.requestUrl
    allItems.push(...payload.dados)
    const next = payload.links?.find((link) => link.rel === 'next')
    if (!next || payload.dados.length === 0) break
    page += 1
  } while (page <= maxPages)

  const normalized = allItems
    .map(normalizeExpense)
    .filter((expense) => !category || expense.category === category)

  return summarizeExpenses(normalized, {
    sourceMode: 'official',
    sourceUrl,
    notice:
      page > maxPages
        ? `Foram carregadas as primeiras ${maxPages * 100} despesas do período.`
        : 'Despesas obtidas na API oficial da Câmara dos Deputados.',
  })
}

export function summarizeExpenses(expenses, metadata = {}) {
  const total = expenses.reduce((sum, expense) => sum + expense.netValue, 0)
  const byCategory = Object.entries(
    expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.netValue
      return acc
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const bySupplier = Object.entries(
    expenses.reduce((acc, expense) => {
      acc[expense.supplier] = (acc[expense.supplier] || 0) + expense.netValue
      return acc
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return { data: expenses, total, byCategory, bySupplier, ...metadata }
}

export function buildComparisons(value) {
  const amount = Number(value || 0)
  return Object.entries(comparisonReferences).map(([id, reference]) => ({
    id,
    ...reference,
    quantity: amount / reference.value,
    isOfficialReference: Boolean(reference.sourceUrl),
  }))
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

export function formatCompactNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits,
  }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return 'Data não informada'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export { demoPoliticians }
