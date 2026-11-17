// Official sources only. Missing personal data is never represented as zero.
const expansionCache = new Map()
const SENATORS = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json'
const CEAPS = 'https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/'
const IBGE = 'https://servicodados.ibge.gov.br/api/v1/localidades/'
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
  const city = fold(params.get('city') || name)
  if (role === 'senator') {
    const result = await expansionJson(SENATORS)
    const data = result.ListaParlamentarEmExercicio.Parlamentares.Parlamentar.map(normalizeSenator).filter(p=>(!name||fold(p.name).includes(name))&&(!state||p.state===state))
    return {data,notice:'Senadores em exercício na consulta atual. A lista não reconstitui a composição de anos anteriores.'}
  }
  if (role === 'governor' || role === 'mayor') {
    const url = role === 'governor' ? `${IBGE}estados?orderBy=nome` : `${IBGE}municipios?orderBy=nome`
    const places = await expansionJson(url)
    const data = places.filter(p=>{
      const uf = role==='governor'?p.sigla:(p.microrregiao?.mesorregiao?.UF || p['regiao-imediata']?.['regiao-intermediaria']?.UF)?.sigla
      return (!state||uf===state)&&(!(role==='mayor'?city:name)||fold(p.nome).includes(role==='mayor'?city:name))
    }).slice(0,100).map(p=>({id:`${role}-${p.id}`,ibgeId:String(p.id),name:`${role==='governor'?'Governo de':'Prefeitura de'} ${p.nome}`,city:role==='mayor'?p.nome:null,state:role==='governor'?p.sigla:(p.microrregiao?.mesorregiao?.UF||p['regiao-imediata']?.['regiao-intermediaria']?.UF)?.sigla,role,scope:'administration',sourceMode:'official',officialUrl:'https://www.gov.br/pncp/'}))
    return {data,notice:'Busca por território do IBGE, não por nome do titular. Contratos pertencem à administração e não representam remuneração ou gasto pessoal. Até 100 resultados; refine município/UF.'}
  }
  if (role === 'president' || role === 'minister') {
    const sourceUrl='https://api.siorg.gov.br/doc/orgao-entidade'
    const result=await expansionJson(sourceUrl)
    const data=(result.unidades||[]).filter(p=>p.codigoEsfera?.endsWith('/1')&&p.codigoPoder?.endsWith('/1')&&(role==='president'?fold(p.nome)==='presidencia da republica':fold(p.nome).startsWith('ministerio '))&&(!name||fold(p.nome).includes(name))).map(p=>({id:`siorg-${p.codigoUnidade.split('/').pop()}`,externalId:p.codigoUnidade.split('/').pop(),role,scope:'administration',name:p.nome,agencyAcronym:p.sigla,state:'BR',sourceMode:'official',officialUrl:`https://api.siorg.gov.br/doc/unidade-organizacional/${p.codigoUnidade.split('/').pop()}/completa`}))
    return {data,notice:'Órgãos atuais do SIORG. Busque pelo nome do ministério; titulares e remuneração individual ainda não integrados. Dados de gestão não são gastos pessoais.'}
  }
  throw new Error('Cargo não reconhecido.')
}
const missing = (kind,label,sourceUrl,notice) => ({kind,label,value:null,status:'unavailable',sourceUrl,notice,rows:[]})
export async function expansionCosts(profile,year) {
  const role = normalizeRole(profile.role)
  const components = [missing('remuneration','Remuneração',PORTAL,'Folha individual ainda não integrada. Não disponível não significa zero.'),missing('office','Estrutura e exercício do cargo',profile.officialUrl || PORTAL,'Cobertura de gabinete, benefícios e viagens ainda não integrada.')]
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
    if (!/^[A-Z]{2}$/.test(uf) || (role==='mayor'&&!/^\d{7}$/.test(profile.ibgeId))) throw new Error('Território inválido.')
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
    if(!/^\d+$/.test(id)) throw new Error('Identificador SIORG inválido.')
    const structureUrl=`https://api.siorg.gov.br/doc/unidade-organizacional/${id}/completa`
    const structure=await expansionJson(structureUrl)
    const unit=structure.unidade
    if(!unit || (role==='president'?fold(unit.nome)!=='presidencia da republica':!fold(unit.nome).startsWith('ministerio '))) throw new Error('Órgão incompatível com o cargo selecionado.')
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
  return {components,sourceUrl:components.find(c=>c.rows?.length)?.sourceUrl || profile.officialUrl || PORTAL,notice:'Valores pessoais, exercício do cargo e gestão permanecem separados. Dados ausentes não entram em totais.',year,fetchedAt:new Date().toISOString()}
}
const invalidExpansion = message => Object.assign(new Error(message), {status:400})
async function canonicalExpansionProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidExpansion('Perfil inválido.')
  const role = normalizeRole(input.role)
  if (!['senator','governor','mayor','president','minister'].includes(role)) throw invalidExpansion('Cargo inválido.')
  const params = new URLSearchParams({role})
  let id = String(input.id || '')
  if (role === 'senator') {
    const externalId = String(input.externalId || id.replace('senate-',''))
    if (!/^\d{1,10}$/.test(externalId)) throw invalidExpansion('Identificador de senador inválido.')
    id = `senate-${externalId}`
  }
  if (role === 'governor' || role === 'mayor') {
    const ibgeId = String(input.ibgeId || id.replace(`${role}-`,''))
    if (!(role === 'mayor' ? /^\d{7}$/ : /^\d{2}$/).test(ibgeId)) throw invalidExpansion('Território inválido.')
    const place = await expansionJson(`${IBGE}${role === 'mayor' ? 'municipios' : 'estados'}/${ibgeId}`)
    if (!place || Array.isArray(place) || !place.nome) throw invalidExpansion('Território inexistente.')
    params.set(role === 'mayor' ? 'city' : 'name',place.nome)
    id = `${role}-${ibgeId}`
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
