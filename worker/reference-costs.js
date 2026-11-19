// Legal reference schedules verified against official sources on 2026-11-17.
// These amounts are a simulation of the office, never evidence of payment.
export const REFERENCE_ROLES = Object.freeze(['president','minister','senator','deputy','stf','governor','mayor'])
export const ROLE_REFERENCE_SOURCES = Object.freeze({
  federal: 'https://legis.senado.leg.br/norma/36621431',
  executiveHistory: 'https://www.gov.br/servidor/pt-br/observatorio-de-pessoal-govbr/arquivos-2025/subsidioprviceminit98ago23.pdf/@@download/file',
  executiveOld: 'https://legis.senado.leg.br/norma/538902/publicacao/15636806',
  parliamentOld: 'https://www2.camara.leg.br/legin/fed/decleg/2014/decretolegislativo-276-18-dezembro-2014-779806-publicacaooriginal-145682-pl.html',
  stf: 'https://www2.camara.leg.br/legin/fed/lei/2023/lei-14520-9-janeiro-2023-793675-publicacaooriginal-166841-pl.html',
  stfOld: 'https://www2.camara.leg.br/legin/fed/lei/2018/lei-13752-26-novembro-2018-787368-publicacaooriginal-156799-pl.html',
  senatorHousing: 'https://www12.senado.leg.br/transparencia/sen/coapat/auxilio-moradia-e-imoveis-funcionais',
  deputyHousing: 'https://www.camara.leg.br/moradia',
  sp2024: 'https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17862-22.12.2023.html',
  sp2025: 'https://www.al.sp.gov.br/repositorio/legislacao/lei/2025/lei-18152-02.06.2025.html',
  sp2026: 'https://www.al.sp.gov.br/repositorio/legislacao/lei/2025/lei-18385-23.12.2025.html',
  campinas: 'https://portal-adm.campinas.sp.gov.br/sites/default/files/publicacoes-dom/dom/618455527612552766184520.pdf',
})
const VERIFIED_THROUGH = 2026
const CHECKED_AT = '2026-11-17'
const baseNotice = 'Referência legal do cargo para simulação, sem comprovação de pagamento individual. Soma de 12 parcelas mensais brutas nas vigências de cada mês; não inclui 13º, férias, impostos, descontos, pensões ou benefícios. Não comprova exercício durante os 12 meses.'
const aliases = {presidente:'president',ministro:'minister',senador:'senator',deputado:'deputy',supremeCourt:'stf',supremeCourtJustice:'stf',justice:'stf',governador:'governor',prefeito:'mayor'}

function schedule(profile,year) {
  const role=aliases[profile.role] || profile.role
  const refs=ROLE_REFERENCE_SOURCES
  if(role==='governor') {
    if(profile.state!=='SP'||year<2024||year>2026) return null
    if(year===2024) return [{from:'2024-01-01',monthly:34572.89,sourceUrl:refs.sp2024,norm:'Lei estadual SP 17.862/2023'}]
    if(year===2025) return [{from:'2025-01-01',monthly:34572.89,sourceUrl:refs.sp2025,norm:'Art. 2º da Lei estadual SP 18.152/2025, prorrogando Lei 17.862/2023'}, {from:'2025-07-01',monthly:36301.53,sourceUrl:refs.sp2025,norm:'Lei estadual SP 18.152/2025'}]
    return [{from:'2026-01-01',monthly:36301.53,sourceUrl:refs.sp2026,norm:'Lei estadual SP 18.385/2025'}]
  }
  if(role==='mayor') {
    // Territorial code, not a same-name municipality or a countrywide rate.
    if(String(profile.ibgeId)!=='3509502'||year<2025||year>2026) return null
    return [{from:'2025-01-01',monthly:37082.36,sourceUrl:refs.campinas,norm:'Lei municipal Campinas 16.503/2023'}]
  }
  if(!['president','minister','senator','deputy','stf'].includes(role)||year<2015||year>VERIFIED_THROUGH) return null
  if(role==='stf'&&year<2019) return null
  const old=role==='stf'?{from:'2019-01-01',monthly:39293.32,sourceUrl:refs.stfOld,norm:'Lei 13.752/2018'}:
    ['president','minister'].includes(role)?{from:'2015-01-01',monthly:30934.70,sourceUrl:refs.executiveOld,norm:'Decreto Legislativo 277/2014'}:
      {from:'2015-01-01',monthly:33763,sourceUrl:refs.parliamentOld,norm:'Decreto Legislativo 276/2014'}
  const sourceUrl=role==='stf'?refs.stf:refs.federal
  const norm=role==='stf'?'Lei 14.520/2023':'Decreto Legislativo 172/2022'
  return [old,...(role==='stf'?[]:[{from:'2023-01-01',monthly:39293.32,sourceUrl,norm}]),
    {from:'2023-04-01',monthly:41650.92,sourceUrl,norm},
    {from:'2024-02-01',monthly:44008.52,sourceUrl,norm},
    {from:'2025-02-01',monthly:46366.19,sourceUrl,norm}]
}

function housingReference(role,year) {
  if(!['senator','deputy'].includes(role)||year<2023||year>2026) return null
  const monthlyLimit=role==='senator'?5500:4253
  const sourceUrl=ROLE_REFERENCE_SOURCES[role==='senator'?'senatorHousing':'deputyHousing']
  const notice=role==='senator'?'Limite mensal, condicionado à ausência de imóvel funcional e comprovação de aluguel/hotel. Não comprova adesão ou recebimento pelo senador.':'Valor mensal de referência para quem não ocupa imóvel funcional; modalidade e requisitos devem ser conferidos na fonte. Não comprova recebimento pelo deputado. Complemento com CEAP não é somado.'
  return {kind:'reference:allowances',label:'Auxílio-moradia (limite mensal)',value:null,monthlyLimit,status:'reference',basis:'eligibility-limit',isEstimate:true,isPaid:false,includeInPersonalTotal:false,includeInReferenceTotal:false,sourceUrl,notice,rows:[{id:`housing-limit-${role}-${year}`,kind:'reference:allowances',date:null,value:null,monthlyLimit,description:notice,category:'Limite de benefício — não é pagamento',sourceUrl,basis:'eligibility-limit',isEstimate:true,isPaid:false}]}
}

/** Returns a separate simulation basis. Callers must never merge it into paid totals. */
export function getRoleReferenceCosts(profile={},year) {
  year=Number(year)
  const role=aliases[profile.role] || profile.role
  const empty=notice=>({components:[],referenceTotal:null,monthlyReference:null,year,isEstimate:true,basis:'legal-reference',sourceUrl:null,verifiedAt:CHECKED_AT,notice})
  if(!Number.isInteger(year)||year<2015||year>VERIFIED_THROUGH) return empty('Ano sem tabela de referência verificada. Nenhum valor foi presumido.')
  if((profile.termStart && year<Number(profile.termStart.slice(0,4)))||(profile.termEnd && year>Number(profile.termEnd.slice(0,4)))) return empty('Ano fora do mandato nominal cadastrado. A referência do cargo não foi atribuída à pessoa nesse período.')
  const rates=schedule({...profile,role},year)
  if(!rates) return empty(['mayor','governor'].includes(role)?'Subsídio depende de lei do estado ou município. Sem tabela territorial verificada para este perfil/ano; não existe valor nacional presumido.':'Cargo ou ano sem tabela de referência verificada.')
  const rows=[]
  for(let month=1;month<=12;month++) {
    const date=`${year}-${String(month).padStart(2,'0')}-01`
    const rate=rates.filter(r=>r.from<=date).at(-1)
    if(!rate) return empty('Tabela incompleta para o ano; total de referência não calculado.')
    rows.push({id:`legal-subsidy-${role}-${date}`,date,year,month,value:rate.monthly,kind:'reference:remuneration',category:'Salário-base',description:`Parcela mensal bruta de referência do cargo — ${rate.norm}`,sourceUrl:rate.sourceUrl,validFrom:rate.from,norm:rate.norm,basis:'legal-reference',isEstimate:true,isPaid:false})
  }
  const value=rows.reduce((sum,r)=>sum+Math.round(r.value*100),0)/100
  const component={kind:'reference:remuneration',label:'Salário-base do cargo',value,monthlyValue:rows.at(-1).value,status:'reference',basis:'legal-reference',isEstimate:true,isPaid:false,includeInPersonalTotal:false,includeInReferenceTotal:true,sourceUrl:rows.at(-1).sourceUrl,notice:baseNotice,rows,period:{start:`${year}-01-01`,end:`${year}-12-31`,months:12},salarySchedule:rates.filter(r=>r.from<=`${year}-12-31`)}
  const housing=housingReference(role,year)
  return {components:[component,...(housing?[housing]:[])],referenceTotal:value,monthlyReference:component.monthlyValue,year,isEstimate:true,isPaid:false,basis:'legal-reference',sourceUrl:component.sourceUrl,verifiedAt:CHECKED_AT,notice:baseNotice}
}
