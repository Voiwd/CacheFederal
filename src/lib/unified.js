import { searchPoliticians, getExpenses, summarizeExpenses } from './api.js'
import { searchExpandedProfiles, getExpandedCosts, getRoleReferences } from './expansion.js'

export const UNIFIED_ROLES = [
  {id:'all',label:'Todos os cargos'}, {id:'deputy',label:'Deputados federais'},
  {id:'senator',label:'Senadores'}, {id:'president',label:'Presidente'},
  {id:'minister',label:'Ministros'}, {id:'justice',label:'Ministros do STF'},
]
const roleLabels = {deputy:'Deputado(a) federal',senator:'Senador(a)',president:'Presidente',minister:'Ministro(a)',governor:'Governador(a)',mayor:'Prefeito(a)',justice:'Ministro(a) do STF'}
const institutions = {deputy:'Câmara dos Deputados',senator:'Senado Federal',president:'Executivo federal',minister:'Executivo federal',governor:'Executivo estadual',mayor:'Executivo municipal',justice:'Supremo Tribunal Federal'}
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const finite = value => typeof value==='number' && Number.isFinite(value)
const sum = rows => rows.reduce((total,row)=>total+Math.round(row.netValue*100),0)/100

export async function searchDeputySnapshot(filters={},options={}) {
  try {
    const response=await fetch('/deputados.json',{signal:options.signal})
    if(!response.ok) throw new Error('Cadastro local indisponível.')
    const snapshot=await response.json()
    const source=new URL(snapshot.source)
    if(source.hostname!=='dadosabertos.camara.leg.br'||!Number.isFinite(Date.parse(snapshot.updatedAt))||!Array.isArray(snapshot.data)||!snapshot.data.length||!snapshot.data.every(p=>p && /^\d+$/.test(String(p.id)) && typeof p.name==='string' && p.name.trim() && typeof p.party==='string' && typeof p.state==='string')) throw new Error('Cadastro local inválido.')
    const query=fold(filters.name).trim(),party=fold(filters.party).trim(),state=fold(filters.state).trim()
    const notice=`Cadastro oficial da Câmara em arquivo coletado em ${snapshot.updatedAt}. A composição atual pode ter mudado desde a coleta.`
    return {data:snapshot.data.filter(p=>(!query||fold(`${p.name} ${p.fullName||''}`).includes(query))&&(!party||fold(p.party)===party)&&(!state||fold(p.state)===state)).map(p=>({...p,sourceMode:'official',sourceNotice:notice,sourceDate:snapshot.updatedAt})),notice,sourceMode:'official',sourceUrl:snapshot.source}
  } catch(error) {
    if(options.signal?.aborted) throw error
    return searchPoliticians(filters,{...options,allowDemo:false})
  }
}

export function normalizeUnifiedProfile(profile, fallbackRole='deputy') {
  const role = profile.role || fallbackRole
  const mandateLabel=profile.mandateLabel || (profile.termStart&&profile.termEnd?`Mandato ${profile.termStart}–${profile.termEnd}`:profile.electionYear?`Eleição ${profile.electionYear}`:'')
  return {...profile,role,roleLabel:profile.roleLabel || (role==='president'&&profile.historical?'Ex-presidente':roleLabels[role] || role),institution:profile.institutionalName || profile.institution || institutions[role],mandateLabel,scope:profile.scope || 'person'}
}

export function rankUnifiedProfiles(profiles,query='') {
  const needle=fold(query).trim()
  const rank=p=>{const name=fold(p.name),full=fold(p.fullName || p.titleholder);return !needle?3:name===needle||full===needle?0:name.startsWith(needle)||full.startsWith(needle)?1:name.split(/\s+/).some(t=>t.startsWith(needle))||full.split(/\s+/).some(t=>t.startsWith(needle))?2:3}
  const output=[]
  for(const level of [0,1,2,3]) {
    const groups=new Map()
    profiles.filter(p=>rank(p)===level).forEach(p=>{if(!groups.has(p.role))groups.set(p.role,[]);groups.get(p.role).push(p)})
    while([...groups.values()].some(items=>items.length)) for(const items of groups.values()) if(items.length)output.push(items.shift())
  }
  return output
}

export async function searchUnifiedPoliticians(filters={},options={}) {
  const role = filters.role || 'all'
  if(['governor','mayor'].includes(role))return {data:[],sourceMode:'official',notice:'Cargo fora da cobertura do site.',partial:false}
  const roles = role==='all' ? UNIFIED_ROLES.filter(r=>r.id!=='all').map(r=>r.id) : [role]
  const results = await Promise.allSettled(roles.map(async current=>{
    const timeout=AbortSignal.timeout(8000)
    const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout
    const response = current==='deputy'
      ? await searchDeputySnapshot(filters,{...options,signal,allowDemo:false})
      : await searchExpandedProfiles({...filters,role:current},{...options,signal})
    return {...response,data:(response.data || []).map(p=>normalizeUnifiedProfile(p,current))}
  }))
  if(options.signal?.aborted) throw new DOMException('Consulta cancelada.','AbortError')
  const successful = results.filter(r=>r.status==='fulfilled').map(r=>r.value)
  if(!successful.length) throw new Error('Nenhuma fonte oficial respondeu. Tente novamente.')
  const query=fold(filters.name).trim(),party=fold(filters.party).trim()
  const data = successful.flatMap(r=>r.data).filter(p=>(!party||fold(p.party)===party)&&(!query||fold(`${p.name} ${p.fullName || ''} ${p.titleholder || ''} ${p.institutionalName || ''} ${(p.aliases||[]).join(' ')}`).includes(query)))
  const seen = new Set()
  const unique = data.filter(p=>{const key=`${p.role}:${p.id}`;if(seen.has(key))return false;seen.add(key);return true})
  const errors = results.flatMap((r,i)=>r.status==='rejected'?[UNIFIED_ROLES.find(x=>x.id===roles[i])?.label || roles[i]]:[])
  return {data:rankUnifiedProfiles(unique,query),sourceMode:'official',notice:[...new Set(successful.map(r=>r.notice).filter(Boolean)),errors.length?`Fontes temporariamente indisponíveis: ${errors.join(', ')}.`:''].filter(Boolean).join(' '),partial:errors.length>0}
}

export function selectSimulationBasis(expenses,basisId) {
  const basis=expenses.simulationBases?.find(item=>item.id===basisId)
  if(!basis) return expenses
  const stats=summarizeExpenses(basis.rows.filter(row=>finite(row.netValue)))
  const coverageNotice=[expenses.baseCoverageNotice,basis.notice].filter(Boolean).join(' ')
  return {...expenses,byCategory:stats.byCategory,bySupplier:stats.bySupplier,debits:stats.debits,credits:stats.credits,
    total:basis.budget,simulationBudget:basis.budget,simulationLabel:basis.label,simulationNotice:basis.notice,
    selectedSimulationBasis:basis.id,unitType:basis.unitType,complete:basis.id==='combined'?expenses.verifiedMonths?.length===12:basis.id==='personalPublished'&&expenses.personalPublishedComplete===true,coverageNotice,notice:coverageNotice}
}

export function adaptExpandedCosts(profile,costs,year) {
  const components=costs.components || []
  const administration=profile.scope==='administration' || ['governor','mayor','minister','president'].includes(profile.role)
  const unitType=administration?'contracts':'reimbursements'
  const seenRows=new Set()
  const rows=components.flatMap(component=>(component.rows || []).map((row,index)=>({
    ...row,id:row.id || `${component.kind}-${index}`,year:Number(year),
    category:row.category || (component.status==='reference'||component.kind?.startsWith('reference:')?component.label||'Referência legal do cargo':administration?'Contrato público':profile.role==='deputy'?'Despesa CEAP':'Reembolso CEAPS'),
    supplier:row.supplier || (component.status==='reference'||component.kind?.startsWith('reference:')?'Referência legal do cargo':'Fornecedor não informado'),
    netValue:finite(row.netValue)?row.netValue:finite(row.value)?row.value:null,
    documentUrl:row.documentUrl || row.sourceUrl || null,
    sourceMode:component.status==='reference'||component.kind?.startsWith('reference:')?'reference':'official',componentKind:component.kind,
    basisId:component.status==='reference'||component.kind?.startsWith('reference:')?'reference':component.kind==='administration'?'administration':'personalPublished',
  }))).filter(row=>{const key=`${row.componentKind}:${row.id}`;if(seenRows.has(key))return false;seenRows.add(key);return true})
  const validRows=rows.filter(row=>finite(row.netValue))
  const office=components.find(c=>c.kind==='office')
  const contractRows=validRows.filter(row=>row.componentKind==='administration')
  const simulationBudget=administration?(contractRows.length?sum(contractRows):null):(finite(office?.value)?office.value:null)
  const simulationLabel=administration?'Subtotal dos contratos da amostra (não representa pagamentos nem gasto pessoal)':'Reembolsos CEAPS publicados'
  const coverageNotice=[costs.notice,...components.map(c=>c.notice),rows.some(r=>!finite(r.netValue))?'Registros sem valor informado não entram no subtotal.':''].filter(Boolean).join(' ')
  const simulationRows=validRows.filter(row=>row.componentKind===(administration?'administration':'office'))
  const referenceComponents=components.filter(c=>c.kind?.startsWith('reference:')||c.status==='reference')
  const knownReferences=referenceComponents.filter(c=>finite(c.value)&&c.includeInReferenceTotal!==false)
  const personalComponents=components.filter(c=>!referenceComponents.includes(c)&&['office','remuneration','allowances','indemnities','dailyAllowances','cabinet','extraExpenses'].includes(c.kind)&&finite(c.value))
  const personalBudget=personalComponents.length?personalComponents.reduce((value,c)=>value+Math.round(c.value*100),0)/100:null
  const referenceBudget=knownReferences.length?knownReferences.reduce((value,c)=>value+Math.round(c.value*100),0)/100:null
  // Published payroll replaces the salary table; conditional caps are never payments.
  const hasSalary=personalComponents.some(c=>c.kind==='remuneration')
  const baseComponents=knownReferences.filter(c=>!(hasSalary&&c.kind==='reference:remuneration') && !(c.kind==='reference:allowances'&&personalComponents.some(p=>p.kind==='allowances')))
  const combinedComponents=[...baseComponents,...personalComponents]
  const combinedBudget=combinedComponents.length?combinedComponents.reduce((total,c)=>total+Math.round(c.value*100),0)/100:null
  const combinedKinds=new Set(combinedComponents.map(c=>c.kind))
  const combinedRows=validRows.filter(r=>combinedKinds.has(r.componentKind)&&r.componentKind!=='administration')
  const simulationBases=[
    {id:'combined',label:'Salário + auxílios + gastos extras',budget:combinedBudget,unitType:'combined',rows:combinedRows,notice:'Salário da tabela quando a folha não está disponível, mais auxílios e despesas publicados. Limites de benefícios não são somados. Contratos da gestão ficam separados. O total pode estar incompleto e não representa dinheiro recebido pela pessoa.'},
    {id:'personalPublished',label:administration||personalComponents.some(c=>c.kind==='remuneration')?'Valores pessoais publicados':profile.role==='deputy'?'Despesas CEAP publicadas':'Reembolsos CEAPS publicados',budget:personalBudget,unitType:'reimbursements',rows:validRows.filter(r=>r.basisId==='personalPublished'),notice:'Somente valores publicados vinculados à pessoa ou ao exercício do cargo; não inclui referências legais nem contratos da gestão.'},
    {id:'reference',label:'Somente salário-base (tabela)',budget:referenceBudget,unitType:'reference',rows:validRows.filter(r=>r.basisId==='reference'),notice:referenceComponents.map(c=>c.notice).filter(Boolean).join(' ')||'Referência legal estimada para o período. Não representa remuneração efetivamente recebida nem inclui benefícios sem valor confirmado.'},
    {id:'administration',label:'Subtotal dos contratos da amostra (não representa pagamentos nem gasto pessoal)',budget:contractRows.length?sum(contractRows):null,unitType:'contracts',rows:contractRows,notice:'Amostra de valores contratados conhecidos; não é total anual, pagamento ou custo pessoal.'},
  ]
  const defaultSimulationBasis=finite(combinedBudget)?'combined':administration?'administration':'personalPublished'
  const result=summarizeExpenses(simulationRows,{
    verifiedMonths:costs.verifiedMonths,sourceIssues:[...new Set([costs.notice,...components.filter(c=>c.status==='unavailable').map(c=>c.notice)].filter(Boolean))],data:rows,total:simulationBudget,components,simulationBudget,simulationLabel,unitType,coverageNotice,baseCoverageNotice:coverageNotice,
    complete:!administration && office?.status==='available',personalPublishedComplete:costs.verifiedMonths?.length===12||(!administration && office?.status==='available'),sourceMode:'official',
    sourceUrl:costs.sourceUrl || profile.officialUrl, sources:costs.sources || [],
    fetchedAt:costs.fetchedAt || new Date().toISOString(),notice:coverageNotice,year:Number(year),simulationBases,defaultSimulationBasis,
  })
  return selectSimulationBasis(result,defaultSimulationBasis)
}

export async function getUnifiedExpenses(profile,year,options={}) {
  let references=null, published=null, publishedError='',referenceError='',active=true,publishedSettled=false,referencesSettled=false
  const deputy=!profile.role||profile.role==='deputy'
  const combine=()=>{
    const personal=deputy&&published?{
      ...published,components:[{kind:'office',label:'Despesas CEAP publicadas',value:published.total,status:published.complete?'available':'partial',rows:published.data||[],notice:published.notice,sourceUrl:published.sourceUrl}],
    }:published||{}
    const components=[...(personal.components||[]).filter(c=>!c.kind?.startsWith('reference:')&&c.status!=='reference'),...(references?.components||[])]
    return {...adaptExpandedCosts({...profile,role:profile.role||'deputy'},{...personal,components,notice:[personal.notice,references?.notice,publishedError,referenceError].filter(Boolean).join(' ')},year),publishedPending:!publishedSettled,referencesPending:!referencesSettled}
  }
  const emit=()=>{if(active&&!options.signal?.aborted)options.onProgress?.(combine())}
  const referencePromise=getRoleReferences(profile,year,{signal:options.signal}).then(result=>{references=result}).catch(error=>{referenceError=`Referências indisponíveis: ${error.message}`}).finally(()=>{referencesSettled=true;emit()})
  const publishedPromise=(deputy
    ?getExpenses(profile.id,{year},{...options,onProgress:result=>{published=result;if(references)emit()}})
    :getExpandedCosts(profile,year,{signal:options.signal}))
    .then(result=>{published=result;publishedSettled=true;if(references)emit()})
    .catch(error=>{publishedSettled=true;publishedError=`Dados publicados indisponíveis: ${error.message}`;if(references)emit()})
  try {
    await Promise.all([referencePromise,publishedPromise])
    if(options.signal?.aborted)throw new DOMException('Consulta cancelada.','AbortError')
    if(!references&&!published)throw new Error([publishedError,referenceError].filter(Boolean).join(' ')||'Fontes indisponíveis.')
    return combine()
  }finally{active=false}
}

// Deputy years follow the imported expense files, never an invented mandate start.
export function getAvailableYears(profile,available=null){
 if(profile.costYears?.length)return profile.costYears
 if(profile.role==='minister')return [2025]
 if(profile.role==='president'&&!profile.historical)return [2025]
 if(['justice','senator'].includes(profile.role))return [2025]
 if(profile.role==='deputy'){
   const imported=Object.keys(available||{'2025':[],'2026':[]}).map(Number).filter(Number.isInteger).sort((a,b)=>b-a)
   const withRecords=imported.filter(year=>available?.[year]?.map(String).includes(String(profile.id)))
   if(withRecords.length)return withRecords
   return imported.length?imported:[2025]
 }
 const start=Number(profile.termStart?.slice(0,4))||2019
 const end=Math.min(2026,Number(profile.termEnd?.slice(0,4))||2026)
 return Array.from({length:Math.max(1,end-start+1)},(_,i)=>end-i)
}

export function getCoverageStatus(expenses){
 if(expenses.publishedPending)return {kind:'loading',message:'Consultando os gastos individuais. O salário da tabela pode aparecer primeiro.'}
 const components=expenses.components||[]
 const table=components.some(c=>(c.status==='reference'||c.kind?.startsWith('reference:'))&&finite(c.value))
 const published=components.some(c=>c.status!=='reference'&&!c.kind?.startsWith('reference:')&&c.kind!=='administration'&&finite(c.value))
 const contracts=components.some(c=>c.kind==='administration'&&c.rows?.some(r=>finite(r.value)||finite(r.netValue)))
 if(!table&&!published&&!contracts)return {kind:'unavailable',message:'Ainda não temos valores para este perfil neste ano. Isso não significa gasto zero.'}
 if(table&&!published)return {kind:'table-only',message:'Só o salário da tabela está disponível. Ainda não temos gastos individuais para este perfil e ano.'}
 if(!table&&!published&&contracts)return {kind:'contracts-only',message:'Só há contratos da gestão nesta consulta; os gastos individuais ainda não estão disponíveis.'}
 return {kind:'published',message:''}
}
