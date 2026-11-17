import { searchPoliticians, getExpenses, summarizeExpenses } from './api.js'
import { searchExpandedProfiles, getExpandedCosts } from './expansion.js'

export const UNIFIED_ROLES = [
  {id:'all',label:'Todos os cargos'}, {id:'deputy',label:'Deputados federais'},
  {id:'senator',label:'Senadores'}, {id:'president',label:'Presidente'},
  {id:'minister',label:'Ministros'}, {id:'governor',label:'Governadores'}, {id:'mayor',label:'Prefeitos'},
]
const roleLabels = {deputy:'Deputado(a) federal',senator:'Senador(a)',president:'Presidente',minister:'Ministro(a)',governor:'Governador(a)',mayor:'Prefeito(a)'}
const institutions = {deputy:'Câmara dos Deputados',senator:'Senado Federal',president:'Executivo federal',minister:'Executivo federal',governor:'Executivo estadual',mayor:'Executivo municipal'}
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
  const mandateLabel=profile.mandateLabel || (profile.termStart&&profile.termEnd?`Mandato ${profile.termStart}–${profile.termEnd}`:profile.sourceDate?`Fonte consultada em ${profile.sourceDate}`:profile.electionYear?`Eleição ${profile.electionYear}`:'')
  return {...profile,role,roleLabel:roleLabels[role] || role,institution:profile.institutionalName || profile.institution || institutions[role],mandateLabel,scope:profile.scope || 'person'}
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
  const data = successful.flatMap(r=>r.data).filter(p=>(!party||fold(p.party)===party)&&(!query||fold(`${p.name} ${p.fullName || ''} ${p.titleholder || ''} ${p.institutionalName || ''}`).includes(query)))
  const seen = new Set()
  const unique = data.filter(p=>{const key=`${p.role}:${p.id}`;if(seen.has(key))return false;seen.add(key);return true})
  const errors = results.flatMap((r,i)=>r.status==='rejected'?[UNIFIED_ROLES.find(x=>x.id===roles[i])?.label || roles[i]]:[])
  return {data:rankUnifiedProfiles(unique,query),sourceMode:'official',notice:[...new Set(successful.map(r=>r.notice).filter(Boolean)),errors.length?`Fontes temporariamente indisponíveis: ${errors.join(', ')}.`:''].filter(Boolean).join(' '),partial:errors.length>0}
}

export function adaptExpandedCosts(profile,costs,year) {
  const components=costs.components || []
  const administration=profile.scope==='administration' || ['governor','mayor','minister','president'].includes(profile.role)
  const unitType=administration?'contracts':'reimbursements'
  const seenRows=new Set()
  const rows=components.flatMap(component=>(component.rows || []).map((row,index)=>({
    ...row,id:row.id || `${component.kind}-${index}`,year:Number(year),
    category:row.category || (administration?'Contrato público':'Reembolso CEAPS'),
    supplier:row.supplier || 'Fornecedor não informado',
    netValue:finite(row.netValue)?row.netValue:finite(row.value)?row.value:null,
    documentUrl:row.documentUrl || row.sourceUrl || null,
    sourceMode:'official',componentKind:component.kind,
  }))).filter(row=>{const key=`${row.componentKind}:${row.id}`;if(seenRows.has(key))return false;seenRows.add(key);return true})
  const validRows=rows.filter(row=>finite(row.netValue))
  const office=components.find(c=>c.kind==='office')
  const contractRows=validRows.filter(row=>row.componentKind==='administration')
  const simulationBudget=administration?(contractRows.length?sum(contractRows):null):(finite(office?.value)?office.value:null)
  const simulationLabel=administration?'Subtotal dos contratos da amostra (não representa pagamentos nem gasto pessoal)':'Reembolsos CEAPS publicados'
  const coverageNotice=[costs.notice,...components.map(c=>c.notice),administration?'Simulador usa somente valores contratados conhecidos da amostra; não é total anual, pagamento ou custo pessoal.': 'Simulador usa reembolsos CEAPS; remuneração e demais despesas não estão incluídas.',rows.some(r=>!finite(r.netValue))?'Registros sem valor informado não entram no subtotal.':''].filter(Boolean).join(' ')
  const simulationRows=validRows.filter(row=>row.componentKind===(administration?'administration':'office'))
  return summarizeExpenses(simulationRows,{
    data:rows,total:simulationBudget,components,simulationBudget,simulationLabel,unitType,coverageNotice,
    complete:!administration && office?.status==='available',sourceMode:'official',
    sourceUrl:costs.sourceUrl || profile.officialUrl, sources:costs.sources || [],
    fetchedAt:costs.fetchedAt || new Date().toISOString(),notice:coverageNotice,year:Number(year),
  })
}

export async function getUnifiedExpenses(profile,year,options={}) {
  if(!profile.role || profile.role==='deputy') {
    return getExpenses(profile.id,{year},options)
  }
  return adaptExpandedCosts(profile,await getExpandedCosts(profile,year,options),year)
}
