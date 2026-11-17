import {NAMED_DIRECTORY} from './political-profiles.js'
// Official sources only. Missing personal data is never represented as zero.
const expansionCache = new Map()
const SENATORS = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json'
const CEAPS = 'https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/'
const PORTAL = 'https://portaldatransparencia.gov.br/'
const PNCP = 'https://pncp.gov.br/api/consulta/v1/contratos'
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function normalizeRole(value) {
  return ({senadores:'senator',senador:'senator',ministros:'minister',ministro:'minister',presidente:'president',governadores:'governor',governador:'governor',prefeitos:'mayor',prefeito:'mayor'})[fold(value)] || value
}
async function expansionJson(url) {
  const cached = expansionCache.get(url)
  if (cached && Date.now() - cached.time < 900000) return cached.data
  const response = await fetch(url, {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(25000)})
  if (response.status === 204) return {data:[], totalPaginas:0}
  if (!response.ok) throw new Error(`Fonte oficial indisponível (HTTP ${response.status}). Tente novamente.`)
  const data = await response.json()
  expansionCache.set(url, {data,time:Date.now()})
  return data
}
export function normalizeSenator(item) {
  const p = item.IdentificacaoParlamentar
  return {id:`senate-${p.CodigoParlamentar}`,externalId:String(p.CodigoParlamentar),name:p.NomeParlamentar,role:'senator',party:p.SiglaPartidoParlamentar,state:p.UfParlamentar,photo:p.UrlFotoParlamentar?.replace('http:','https:'),officialUrl:p.UrlPaginaParlamentar?.replace('http:','https:'),sourceMode:'official',scope:'person'}
}
export function normalizeCeaps(row) {
  const raw = row.valorReembolsado
  const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : null
  return {id:String(row.id),date:row.data,category:row.tipoDespesa,supplier:row.fornecedor,supplierDocument:row.cpfCnpj,documentNumber:row.documento,value:Number.isFinite(value)?value:null,netValue:Number.isFinite(value)?value:null,sourceUrl:`${CEAPS}${row.ano}`}
}
export async function searchExpansion(params) {
  const role = normalizeRole(params.get('role'))
  const name = fold(params.get('name') || params.get('query'))
  const state = String(params.get('state') || '').toUpperCase()
  if (['governor','mayor','president','minister'].includes(role)) {
    const party=fold(params.get('party'))
    const cityFilter=fold(params.get('city'))
    const matches=NAMED_DIRECTORY.profiles.filter(p=>p.role===role&&(!state||p.state===state)&&(!party||fold(p.party)===party)&&(!name||[p.name,p.fullName,p.institutionalName].some(v=>fold(v).includes(name)))&&(!cityFilter||fold(p.city).includes(cityFilter)))
    return {data:matches.slice(0,100),total:matches.length,generatedAt:NAMED_DIRECTORY.generatedAt,notice:role==='minister'?'Nomes do diretório oficial do Planalto, com data de consulta no perfil. Histórico de titulares e remuneração não integrado.':'Nomes eleitos nas eleições ordinárias: governadores/presidente 2022 e prefeitos 2024. Registros eleitorais históricos não confirmam ocupação atual. Até 100 resultados; refine nome, partido ou UF.'}
  }
  if (role === 'senator') {
    const result = await expansionJson(SENATORS)
    const data = result.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map(normalizeSenator).filter(p=>(!name||fold(p.name).includes(name))&&(!state||p.state===state))
    return {data,notice:'Senadores em exercício na consulta atual. A lista não reconstitui a composição de anos anteriores.'}
  }
  throw new Error('Cargo não reconhecido.')
}
const missing = (kind,label,sourceUrl,notice) => ({kind,label,value:null,status:'unavailable',sourceUrl,notice,rows:[]})
export async function expansionCosts(profile,year) {
  const role = normalizeRole(profile.role)
  const components = [missing('remuneration','Remuneração',PORTAL,'Folha individual ainda não integrada. Não disponível não significa zero.'),missing('office','Estrutura e exercício do cargo',profile.officialUrl || PORTAL,'Cobertura de gabinete, benefícios e viagens ainda não integrada.')]
  if (profile.termStart && (year < Number(profile.termStart.slice(0,4)) || year > Number(profile.termEnd.slice(0,4)))) {
    return {components,year,sourceUrl:profile.officialUrl,notice:`Ano fora do mandato nominal da eleição consultada (${profile.termStart.slice(0,4)}–${profile.termEnd.slice(0,4)}). Não foram atribuídas despesas de outra gestão.`}
  }
  if (role === 'senator') {
    components[0].sourceUrl='https://www25.senado.leg.br/web/transparencia/sen'
    const id = String(profile.externalId || profile.id?.replace('senate-',''))
    if (!/^\d+$/.test(id)) throw new Error('Identificador de senador inválido.')
    const sourceUrl = CEAPS+year
    try {
      const all = await expansionJson(sourceUrl)
      if (!Array.isArray(all)) throw new Error('Formato da fonte CEAPS alterado.')
      const rows = all.filter(r=>String(r.codSenador)===id).map(normalizeCeaps)
      const valid = rows.length>0 && rows.every(r=>r.value!==null)
      components[1] = {kind:'office',label:'Reembolsos CEAPS',value:valid?rows.reduce((n,r)=>n+Math.round(r.value*100),0)/100:null,status:valid?'available':'unavailable',sourceUrl,rows,notice:rows.length?'Somente reembolsos CEAPS; não inclui toda a estrutura ou a remuneração.':'Nenhum registro retornado para o senador/ano. Cobertura não confirmada; total não disponível.'}
    } catch(e) { components[1] = missing('office','Reembolsos CEAPS',sourceUrl,e.message) }
  } else if (role === 'governor' || role === 'mayor') {
    const uf = String(profile.state || '').toUpperCase()
    if (!/^[A-Z]{2}$/.test(uf) || (role==='mayor'&&!/^\d{7}$/.test(profile.ibgeId))) return {components,year,sourceUrl:profile.officialUrl,notice:'Perfil eleitoral disponível; correspondência territorial IBGE não confirmada. Despesas de gestão não consultadas para evitar atribuição incorreta.'}
    const query = new URLSearchParams({dataInicial:`${year}0101`,dataFinal:`${year}1231`,pagina:'1',tamanhoPagina:'50',poderId:'E',uf,esferaId:role==='mayor'?'M':'E'})
    if (role==='mayor') query.set('codigoMunicipioIbge',profile.ibgeId)
    const sourceUrl = `${PNCP}?${query}`
    try {
      const result = await expansionJson(sourceUrl)
      // Recheck scope locally because upstream filter semantics can change.
      const rows = (result.data || []).filter(r=>r.orgaoEntidade?.poderId==='E' && r.orgaoEntidade?.esferaId===(role==='mayor'?'M':'E') && r.unidadeOrgao?.ufSigla===uf && (role!=='mayor'||String(r.unidadeOrgao?.codigoIbge)===String(profile.ibgeId))).map(r=>({id:r.numeroControlePNCP,date:r.dataAssinatura,category:'Contrato público',supplier:r.nomeRazaoSocialFornecedor,supplierDocument:r.niFornecedor,value:Number.isFinite(r.valorInicial)?r.valorInicial:null,description:r.objetoContrato,sourceUrl:`https://pncp.gov.br/app/contratos/${r.orgaoEntidade?.cnpj}/${r.anoContrato}/${r.sequencialContrato}`}))
      components.push({kind:'administration',label:'Contratos publicados no PNCP',value:null,status:rows.length?'partial':'unavailable',rows,sourceUrl,notice:`Amostra da primeira página (até 50 registros). Valores contratados, não pagamentos; não são atribuídos pessoalmente ao governante. ${result.totalPaginas || '?'} página(s) na fonte. Sem total consolidado.`})
    } catch(e) {components.push(missing('administration','Contratos publicados no PNCP',sourceUrl,e.message))}
  } else {
    components.push(missing('administration','Despesas da gestão',PORTAL,'Consulta de despesas institucionais disponível na fonte oficial. Integração individual de presidente e ministros pendente; não há valores consolidados nesta tela.'))
    if(role==='president') components[1]=missing('office','Cartão de pagamento da Presidência','https://www.gov.br/casacivil/pt-br/acesso-a-informacao/informacoes-classificadas/despesas-com-cartao-de-pagamento','Arquivos oficiais disponíveis na Casa Civil. Importação e atribuição dos lançamentos ainda não integradas.')
    const id=String(profile.externalId||profile.id?.replace('siorg-',''))
    if(!/^\d+$/.test(id)) return {components,year,sourceUrl:profile.officialUrl,notice:'Titular identificado na fonte oficial; órgão SIORG sem correspondência confirmada. Custos indisponíveis.'}
    const structureUrl=`https://api.siorg.gov.br/doc/unidade-organizacional/${id}/completa`
    const structure=await expansionJson(structureUrl)
    const unit=structure.unidade
    if(!unit || (profile.institutionalName ? fold(unit.nome)!==fold(profile.institutionalName) : (role==='president'?fold(unit.nome)!=='presidencia da republica':!fold(unit.nome).startsWith('ministerio ')))) throw new Error('Órgão incompatível com o cargo selecionado.')
    components[1].notice += ` Órgão: ${unit.nome}. ${unit.autoridade?.denominacao?.descricao||''}. Competências e estrutura disponíveis no registro SIORG.`
    if(role!=='president') components[1].sourceUrl=structureUrl
    const query=new URLSearchParams({dataInicial:`${year}0101`,dataFinal:`${year}1231`,pagina:'1',tamanhoPagina:'50',poderId:'E',esferaId:'F'})
    const sourceUrl=`${PNCP}?${query}`
    try {
      const result=await expansionJson(sourceUrl)
      const rows=(result.data||[]).filter(r=>r.orgaoEntidade?.poderId==='E'&&r.orgaoEntidade?.esferaId==='F'&&fold(r.orgaoEntidade?.razaoSocial)===fold(unit.nome)).map(r=>({id:r.numeroControlePNCP,date:r.dataAssinatura,category:'Contrato público federal',supplier:r.nomeRazaoSocialFornecedor,value:Number.isFinite(r.valorInicial)?r.valorInicial:null,description:r.objetoContrato,sourceUrl:`https://pncp.gov.br/app/contratos/${r.orgaoEntidade?.cnpj}/${r.anoContrato}/${r.sequencialContrato}`}))
      components[2]={kind:'administration',label:'Contratos publicados no PNCP',value:null,status:rows.length?'partial':'unavailable',rows,sourceUrl,notice:'Amostra da primeira página federal (até 50 registros), filtrada pelo nome exato do órgão no SIORG. Ausência na amostra não significa ausência de contratos. Valores contratados não são pagamentos nem gastos pessoais. Sem total consolidado.'}
    } catch(e) {components[2]=missing('administration','Contratos publicados no PNCP',sourceUrl,e.message)}
  }
  return {components,sourceUrl:components.find(c=>c.rows?.length)?.sourceUrl || profile.officialUrl || PORTAL,notice:`${profile.sourceNotice||''} Valores pessoais, exercício do cargo e gestão permanecem separados. Contratos são vinculados ao órgão/território, sem prova de autoria pessoal ou permanência no cargo. Dados ausentes não entram em totais.`,year,fetchedAt:new Date().toISOString()}
}
const invalidExpansion = message => Object.assign(new Error(message), {status:400})
async function canonicalExpansionProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidExpansion('Perfil inválido.')
  const role = normalizeRole(input.role)
  if (!['senator','governor','mayor','president','minister'].includes(role)) throw invalidExpansion('Cargo inválido.')
  if(role!=='senator') {
    const canonical=NAMED_DIRECTORY.profiles.find(p=>p.role===role&&p.id===input.id)
    if(!canonical) throw invalidExpansion('Perfil nominal não encontrado no diretório oficial.')
    return canonical
  }
  const params = new URLSearchParams({role})
  let id = String(input.id || '')
  if (role === 'senator') {
    const externalId = String(input.externalId || id.replace('senate-',''))
    if (!/^\d{1,10}$/.test(externalId)) throw invalidExpansion('Identificador de senador inválido.')
    id = `senate-${externalId}`
  }
  const result = await searchExpansion(params)
  const canonical = result.data.find(profile => profile.id === id)
  if (!canonical) throw invalidExpansion('Perfil não encontrado na fonte oficial.')
  return canonical
}
export async function expansionResponse(request) {
  try {
    const url = new URL(request.url)
    let result
    if(url.pathname==='/api/expansion/search') {
      if (!['senator','governor','mayor','president','minister'].includes(normalizeRole(url.searchParams.get('role')))) throw invalidExpansion('Cargo inválido.')
      result=await searchExpansion(url.searchParams)
    }
    else if(url.pathname==='/api/expansion/costs') {
      const year=Number(url.searchParams.get('year'))
      if(!Number.isInteger(year)||year<2008||year>new Date().getUTCFullYear()) return Response.json({error:'Ano inválido.'},{status:400})
      let input
      try { input=JSON.parse(url.searchParams.get('profile')||'null') } catch { throw invalidExpansion('Perfil inválido.') }
      const profile=await canonicalExpansionProfile(input)
      result=await expansionCosts(profile,year)
    } else return Response.json({error:'Rota não encontrada.'},{status:404})
    return Response.json(result,{headers:{'Cache-Control':'public, max-age=300'}})
  } catch(e) {return Response.json({error:e.message || 'Fonte oficial indisponível.'},{status:e.status || 502})}
}
