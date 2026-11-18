import {STF_PAYROLL} from './stf-payroll.js'
import {FEDERAL_COSTS} from './federal-costs.js'
import {ADDITIONAL_PROFILES,PROFILE_ENRICHMENTS} from './additional-profiles.js'
import {PARLIAMENT_DIRECTORY} from './parliament-directory.js'
import {getRoleReferenceCosts} from './reference-costs.js'
import {NAMED_DIRECTORY} from './political-profiles.js'
// Official sources only. Missing personal data is never represented as zero.
const expansionCache = new Map()
const SENATORS = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json'
const CEAPS = 'https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/'
const PORTAL = 'https://portaldatransparencia.gov.br/'
const PNCP = 'https://pncp.gov.br/api/consulta/v1/contratos'
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const enrichProfile = profile => {
  const extra=PROFILE_ENRICHMENTS[profile.id] || PROFILE_ENRICHMENTS[profile.name] || PROFILE_ENRICHMENTS[fold(profile.name)] || {}
  const costYears=['president','minister'].includes(profile.role)?Object.entries(FEDERAL_COSTS.years).filter(([,data])=>data.profiles[profile.id]).map(([year])=>Number(year)).sort((a,b)=>b-a):undefined
  return {...profile,...extra,...(costYears?{costYears}: {})}
}
const namedProfiles=()=>[...NAMED_DIRECTORY.profiles,...ADDITIONAL_PROFILES].map(enrichProfile)
export function normalizeRole(value) {
  return ({senadores:'senator',senador:'senator',ministros:'minister',ministro:'minister',presidente:'president',governadores:'governor',governador:'governor',prefeitos:'mayor',prefeito:'mayor',ministrostf:'justice',stf:'justice'})[fold(value)] || value
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
  if(['governor','mayor'].includes(role))return {data:[],total:0,notice:'Cargo fora da cobertura do site.'}
  const name = fold(params.get('name') || params.get('query'))
  const state = String(params.get('state') || '').toUpperCase()
  if (['governor','mayor','president','minister','justice'].includes(role)) {
    const party=fold(params.get('party'))
    const cityFilter=fold(params.get('city'))
    const matches=namedProfiles().filter(p=>p.role===role&&(!state||p.state===state)&&(!party||fold(p.party)===party)&&(!name||[p.name,p.fullName,p.institutionalName,...(p.aliases||[])].some(v=>fold(v).includes(name)))&&(!cityFilter||fold(p.city).includes(cityFilter)))
    return {data:matches.slice(0,100),total:matches.length,generatedAt:NAMED_DIRECTORY.generatedAt,notice:role==='minister'?'Nomes do diretório oficial do Planalto, com data de consulta no perfil. Histórico de titulares e remuneração não integrado.':'Nomes eleitos nas eleições ordinárias: governadores/presidente 2022 e prefeitos 2024. Registros eleitorais históricos não confirmam ocupação atual. Até 100 resultados; refine nome, partido ou UF.'}
  }
  if (role === 'senator' || role === 'deputy') {
    const profiles=role==='senator'?PARLIAMENT_DIRECTORY.senators:PARLIAMENT_DIRECTORY.deputies
    const party=fold(params.get('party'))
    return {data:profiles.map(enrichProfile).filter(p=>(!name||fold(p.name).includes(name))&&(!state||p.state===state)&&(!party||fold(p.party)===party)),notice:'Cadastro parlamentar oficial em arquivo, com data da coleta no perfil. Valores de referência por cargo separados dos registros publicados.'}
  }
  throw new Error('Cargo não reconhecido.')
}
const missing = (kind,label,sourceUrl,notice) => ({kind,label,value:null,status:'unavailable',sourceUrl,notice,rows:[]})
// Reject the whole extra-expense block if either published total fails to reconcile.
export function reconcileSenateResources(payload,profile,year,ceapsTotal){
  if(payload?.statusCode!==200||!Array.isArray(payload.data)||payload.data.length!==1)throw new Error('Relatório de recursos inválido.')
  const report=payload.data[0]
  if(Number(report.ano)!==Number(year)||!profile.name||fold(report.parlamentar?.nome)!==fold(profile.name)||report.parlamentar?.estado!==profile.state)throw new Error('Relatório não corresponde ao senador e ano selecionados.')
  const cents=n=>{if(typeof n!=='number'||!Number.isFinite(n))throw new Error('Relatório contém valor ausente ou inválido.');return Math.round(n*100)}
  for(const block of [report.cotas,report.gastosNaoInclusos]){
    if(!Array.isArray(block?.despesas)||!block.despesas.length||block.despesas.some(row=>typeof row.recurso!=='string'||!row.recurso.trim()))throw new Error('Categorias incompletas no relatório.')
    if(block.despesas.reduce((sum,row)=>sum+cents(row.valor),0)!==cents(block.totalValor))throw new Error('Categorias não conferem com o total publicado.')
  }
  if(cents(report.cotas.totalValor)!==cents(ceapsTotal))throw new Error('Relatório e lançamentos CEAPS divergem. Gastos extras não somados.')
  const sourceUrl=`https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/${profile.externalId||profile.id.replace('senate-','')}/recursos-utilizados?ano=${year}`
  return {kind:'extraExpenses',label:'Gastos fora da cota',value:report.gastosNaoInclusos.totalValor,status:'available',sourceUrl,
    notice:'Categorias e total conferidos no relatório anual e cota conferida com os lançamentos CEAPS. Não repete a cota. Quantidades de funcionários e uso de moradia não são convertidos em valores.',
    rows:report.gastosNaoInclusos.despesas.map((row,index)=>({id:`senate-extra-${year}-${index}`,date:null,category:row.recurso,value:row.valor,sourceUrl,description:`Total publicado em ${year}`}))}
}

export async function expansionCosts(profile,year) {
  const role = normalizeRole(profile.role)
  const components = [missing('remuneration','Remuneração',PORTAL,'Folha individual ainda não integrada. Não disponível não significa zero.'),missing('office','Estrutura e exercício do cargo',profile.officialUrl || PORTAL,'Cobertura de gabinete, benefícios e viagens ainda não integrada.')]
  if (profile.termStart && (year < Number(profile.termStart.slice(0,4)) || year > Number(profile.termEnd.slice(0,4)))) {
    return {components,year,sourceUrl:profile.officialUrl,notice:`Ano fora do mandato nominal da eleição consultada (${profile.termStart.slice(0,4)}–${profile.termEnd.slice(0,4)}). Não foram atribuídas despesas de outra gestão.`}
  }
  if(role==='justice'){
    const payroll=year===STF_PAYROLL.year?STF_PAYROLL.profiles[profile.id]:null
    if(payroll)return payroll
    return {components,year,sourceUrl:'https://egesp-portal.stf.jus.br/transparencia/rendimento_folha',notice:'Folha individual não integrada para este perfil/ano: não foi possível validar os 12 meses de remuneração e a equipe com lotação individual inequívoca. Nenhum subtotal incompleto foi importado.'}
  }
  if(['president','minister'].includes(role)){
    const annual=FEDERAL_COSTS.years[year]
    const published=annual?.profiles[profile.id]
    if(published)return published
    const failure=FEDERAL_COSTS.sourceFailures?.[year]
    return {components,year,sourceUrl:failure?.sourceUrl||PORTAL,notice:annual?.excludedProfiles[profile.id] || failure?.notice || 'Não há uma conta individual anual conciliada para este perfil e ano. Folhas e viagens federais só entram após conferência de identidade, cargo e período. Despesas do órgão não são atribuídas à pessoa.'}
  }
  if (role === 'deputy') return {components,year,sourceUrl:profile.officialUrl,notice:'Referências legais do cargo são exibidas em base separada; folha individual não integrada.'}
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
      if(valid){
        const resourceUrl=`https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/${id}/recursos-utilizados?ano=${year}`
        try{components.push(reconcileSenateResources(await expansionJson(resourceUrl),profile,year,components[1].value))}
        catch(error){components.push(missing('extraExpenses','Gastos fora da cota',resourceUrl,error.message))}
      }

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
    return {components,sourceUrl:PORTAL,year,fetchedAt:new Date().toISOString(),notice:'Somente salário tabelado: a folha federal e os gastos individuais ainda não foram conciliados. Amostras de contratos institucionais não entram na conta da pessoa.'}
  }

  return {components,sourceUrl:components.find(c=>c.rows?.length)?.sourceUrl || profile.officialUrl || PORTAL,notice:`${profile.sourceNotice||''} Valores pessoais, exercício do cargo e gestão permanecem separados. Contratos são vinculados ao órgão/território, sem prova de autoria pessoal ou permanência no cargo. Dados ausentes não entram em totais.`,year,fetchedAt:new Date().toISOString()}
}
const invalidExpansion = message => Object.assign(new Error(message), {status:400})
async function canonicalExpansionProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidExpansion('Perfil inválido.')
  const role = normalizeRole(input.role)
  if (!['deputy','senator','governor','mayor','president','minister','justice'].includes(role)) throw invalidExpansion('Cargo inválido.')
  if(role==='deputy') {
    const canonical=PARLIAMENT_DIRECTORY.deputies.find(p=>String(p.id)===String(input.id))
    if(!canonical)throw invalidExpansion('Deputado não encontrado no cadastro oficial.')
    return enrichProfile(canonical)
  }
  if(role!=='senator') {
    const canonical=namedProfiles().find(p=>p.role===role&&p.id===input.id)
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
  const staticProfile=PARLIAMENT_DIRECTORY.senators.find(p=>p.id===id)
  if(staticProfile)return enrichProfile(staticProfile)
  const upstream=await expansionJson(SENATORS)
  const result={data:upstream.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map(normalizeSenator)}
  const canonical = result.data.find(profile => profile.id === id)
  if (!canonical) throw invalidExpansion('Perfil não encontrado na fonte oficial.')
  return canonical
}
export async function expansionResponse(request) {
  try {
    const url = new URL(request.url)
    let result
    if(url.pathname==='/api/expansion/search') {
      if (!['deputy','senator','governor','mayor','president','minister','justice'].includes(normalizeRole(url.searchParams.get('role')))) throw invalidExpansion('Cargo inválido.')
      result=await searchExpansion(url.searchParams)
    }
    else if(url.pathname==='/api/expansion/costs'||url.pathname==='/api/expansion/references') {
      const year=Number(url.searchParams.get('year'))
      if(!Number.isInteger(year)||year<1889||year>new Date().getUTCFullYear()) return Response.json({error:'Ano inválido.'},{status:400})
      let input
      try { input=JSON.parse(url.searchParams.get('profile')||'null') } catch { throw invalidExpansion('Perfil inválido.') }
      const profile=await canonicalExpansionProfile(input)
      const excluded=profile.role==='minister'&&FEDERAL_COSTS.years[year]?.excludedProfiles[profile.id]?.startsWith('O cadastro mensal')
      result=url.pathname.endsWith('/references')?(excluded?{components:[],year,referenceTotal:null,notice:FEDERAL_COSTS.years[year].excludedProfiles[profile.id]}:getRoleReferenceCosts(profile,year)):await expansionCosts(profile,year)
    } else return Response.json({error:'Rota não encontrada.'},{status:404})
    return Response.json(result,{headers:{'Cache-Control':'public, max-age=300'}})
  } catch(e) {return Response.json({error:e.message || 'Fonte oficial indisponível.'},{status:e.status || 502})}
}
