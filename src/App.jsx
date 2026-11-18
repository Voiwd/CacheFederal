import Ranking from './Ranking.jsx'
import { useEffect, useMemo, useState, useRef } from 'react'
import { Search, ArrowUpRight, RotateCcw, Minus, Plus, Landmark, ReceiptText, ShoppingBasket, Sparkles, Info, ExternalLink, LoaderCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { getExpenses, buildComparisons, formatCurrency, formatCompactNumber, formatDate, OFFICIAL_SOURCE, getMandateCosts, auditedTotal } from './lib/api.js'
import { products, productDisclaimer } from './data/products.js'
import { searchUnifiedPoliticians, getUnifiedExpenses, selectSimulationBasis, adaptExpandedCosts, getAvailableYears, getCoverageStatus } from './lib/unified.js'

const RECEIPT_YEAR = 2025

const ROLE_OPTIONS = [['all','Todos os cargos'],['deputy','Deputados'],['senator','Senadores'],['president','Presidente'],['minister','Ministros'],['justice','Ministros do STF']]
const HERO_ROLES = ['Deputado?','Senador?','Presidente?','Ministro?','Ministro do STF?']



const COLORS = ['#f2c94c','#71b280','#ef8354','#7ea8be','#d897d0','#a9c45a']

export default function App() {
  const [role,setRole]=useState('all')
  const [heroRoleIndex,setHeroRoleIndex]=useState(0)
  const [query,setQuery]=useState('')
  const [expenseYears,setExpenseYears]=useState(null)
  const [results,setResults]=useState([]), [selected,setSelected]=useState(null), [year,setYear]=useState(2025)
  const [expenses,setExpenses]=useState(null), [notice,setNotice]=useState(''), [error,setError]=useState('')
  const [searching,setSearching]=useState(true), [loading,setLoading]=useState(false), [cart,setCart]=useState({})
  const [audit,setAudit]=useState(null),[auditLoading,setAuditLoading]=useState(false),[auditError,setAuditError]=useState('')
  const [basisChoice,setBasisChoice]=useState('')
  const [category,setCategory]=useState('Todas'), [tab,setTab]=useState('painel')

  const [suggestions,setSuggestions]=useState([]), [suggestOpen,setSuggestOpen]=useState(false), [suggestBusy,setSuggestBusy]=useState(false)
  const searchSequence=useRef(0)
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/ceap-available.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('Anos indisponíveis');return r.json()}).then(setExpenseYears).catch(()=>{})
    return()=>controller.abort()
  },[])
  useEffect(()=>{
    if(!selected)return
    const years=getAvailableYears(selected,expenseYears)
    setYear(current=>years.includes(current)?current:years.includes(2025)?2025:years[0])
  },[selected,expenseYears])
  useEffect(()=>{
    if(!selected)return
    const frame=requestAnimationFrame(()=>document.getElementById('dashboard-tabs')?.scrollIntoView({block:'start',behavior:'smooth'}))
    return()=>cancelAnimationFrame(frame)
  },[tab])
  useEffect(()=>{
    const timer=setInterval(()=>setHeroRoleIndex(index=>(index+1)%HERO_ROLES.length),5000)
    return()=>clearInterval(timer)
  },[])
  useEffect(()=>{
    if(query.trim().length<2){setSuggestions([]);setSuggestBusy(false);return}
    const controller=new AbortController(); let active=true
    setSuggestBusy(true)
    const timer=setTimeout(()=>{
      searchUnifiedPoliticians({name:query,role},{signal:controller.signal,allowDemo:false})
        .then(r=>{if(active)setSuggestions(r.data.slice(0,7))})
        .catch(()=>{if(active)setSuggestions([])})
        .finally(()=>{if(active)setSuggestBusy(false)})
    },350)
    return()=>{active=false;clearTimeout(timer);controller.abort()}
  },[query,role])
  function selectProfile(p){setBasisChoice('');setCart({});setExpenses(null);setAudit(null);setLoading(Boolean(p));setSelected(p);if(p){const years=getAvailableYears(p,expenseYears);setYear(y=>years.includes(y)?y:years.includes(2025)?2025:years[0])}}
  function chooseSuggestion(p){++searchSequence.current;setSearching(false);selectProfile(p);setQuery(p.name);setSuggestOpen(false);setResults([p])}
  async function runSearch(event) {
    event?.preventDefault(); const sequence=++searchSequence.current; setSuggestOpen(false); setSearching(true); setError('')
    try { const r=await searchUnifiedPoliticians({name:query,role}); if(sequence!==searchSequence.current)return; setResults(r.data); setNotice(r.notice); selectProfile(r.data[0]||null) }
    catch(e){setError(e.message)} finally{if(sequence===searchSequence.current)setSearching(false)}
  }
  useEffect(()=>{runSearch()},[role])
  useEffect(()=>{
    if(!selected)return
    setBasisChoice('')
    const controller=new AbortController(); let active=true; setLoading(true); setExpenses(null); setCart({}); setCategory('Todas'); setError('')
    getUnifiedExpenses(selected,year,{signal:controller.signal,onProgress:r=>{if(active){setExpenses(r);setNotice(r.notice);setLoading(false)}}}).then(r=>{if(active){setExpenses({...r,fetchedAt:r.fetchedAt||new Date().toISOString()});setNotice(r.notice)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false;controller.abort()}
  },[selected,year])

  useEffect(()=>{
    if(!selected || selected.role!=='deputy'){setAudit(null);setAuditLoading(false);setAuditError('');return}
    const controller=new AbortController();let active=true
    setAudit(null);setAuditLoading(true);setAuditError('')
    getMandateCosts(selected.id,year,{signal:controller.signal}).then(data=>{if(active)setAudit(data)}).catch(e=>{if(active)setAuditError(e.message)}).finally(()=>{if(active)setAuditLoading(false)})
    return()=>{active=false;controller.abort()}
  },[selected,year])

  const displayExpenses=useMemo(()=>{
    if(!expenses)return null
    let merged=expenses
    if(selected?.role==='deputy'&&audit){
      const salaryKinds=[['remuneration','Remuneração publicada',audit.salary,audit.sources?.payroll],['allowances','Auxílios publicados',audit.allowances,audit.sources?.payroll],['indemnities','Reembolsos em folha',audit.indemnities,audit.sources?.payroll],['dailyAllowances','Viagens a trabalho',audit.dailyAllowances,audit.sources?.payroll],['cabinet','Equipe do gabinete',audit.office,audit.sources?.summary]]
      merged=adaptExpandedCosts(selected,{...expenses,components:[...expenses.components,...salaryKinds.map(([kind,label,value,sourceUrl])=>({kind,label,value,sourceUrl,status:Number.isFinite(value)?'available':'unavailable',notice:audit.coverage,rows:Number.isFinite(value)?[{id:`payroll-${kind}-${year}`,date:null,category:label,value,sourceUrl}]:[]}))],},year)
    }
    return selectSimulationBasis(merged,basisChoice||merged.selectedSimulationBasis)
  },[expenses,basisChoice,audit,selected,year])
  const basisRows=displayExpenses?.simulationBases?.find(b=>b.id===displayExpenses.selectedSimulationBasis)?.rows||displayExpenses?.data||[]
  const shown=category==='Todas'?basisRows:basisRows.filter(x=>x.category===category)
  const budget=displayExpenses?.simulationBudget??null, spent=products.reduce((s,p)=>s+p.price*(cart[p.id]||0),0), balance=budget===null?0:Math.max(0,budget-spent)
  function adjust(p,n){if(n>0&&p.price>balance)return;setCart(c=>({...c,[p.id]:Math.max(0,(c[p.id]||0)+n)}))}

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><img className="brand-logo" src="/icon-brasil.png" alt=""/><span>Cachê <em>Federal</em></span></a><nav><a href="#top">Buscar</a><a href="#ranking">Ranking</a><a href="#simulador" onClick={()=>setTab('simulador')}>Simulador</a><a href="#extrato" onClick={()=>setTab('extrato')}>Extrato</a><a href="#metodologia">Metodologia</a></nav><SourcesButton expenses={displayExpenses} profile={selected} audit={audit} auditError={auditError}/></header>
    <main id="top">
      <section className="hero"><div className="hero-copy"><span className="eyebrow"><Sparkles size={15}/> Transparência em todos os cargos</span><h1><span className="hero-title-lead">Quanto custa um</span><span className="hero-title-role" aria-live="polite" aria-atomic="true">{HERO_ROLES[heroRoleIndex]}</span></h1><p>Busque uma figura política e explore salário-base, despesas publicadas e o equivalente no simulador. Dinheiro público, conta por conta.</p>
        <div className="search-area" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setSuggestOpen(false)}}><form className="search-box" onSubmit={runSearch}><select className="role-filter" aria-label="Cargo" value={role} onChange={e=>{setRole(e.target.value);setSuggestOpen(false)}}>{ROLE_OPTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><label className="search-input"><Search/><input value={query} onFocus={()=>setSuggestOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setSuggestOpen(false)}} onChange={e=>{setQuery(e.target.value);setSuggestOpen(true)}} aria-expanded={suggestOpen&&query.trim().length>=2} aria-controls="name-suggestions" autoComplete="off" placeholder="Busque pelo nome" aria-label="Nome da figura política"/></label><button className="primary-btn">Consultar <ArrowUpRight/></button></form>{suggestOpen&&query.trim().length>=2&&<div id="name-suggestions" className="name-suggestions" aria-label="Sugestões de figuras políticas">{suggestBusy?<Loading text="Buscando nomes…"/>:suggestions.length?suggestions.map(p=><button type="button" key={p.id} onClick={()=>chooseSuggestion(p)}><div className="avatar"><ProfilePhoto profile={p}/></div><span><strong>{p.name}</strong><small>{[p.roleLabel,p.party,p.state,p.city].filter(Boolean).join(' · ')}</small></span><ArrowUpRight size={16}/></button>):<p>Nenhum perfil encontrado com esses filtros.</p>}</div>}</div>
        <p className="source-line"><Info/> Fontes oficiais da Câmara, Senado, Executivo e STF. Cobertura indicada em cada perfil.</p></div>
        <RotatingReceipt/>
      </section>
      <section className="workspace">
        <aside className="results-rail"><div className="section-label"><span>Representantes</span><small>{results.length} resultados</small></div>{searching?<Loading text="Consultando dados abertos…"/>:results.map(p=><button key={p.id} className={`politician-card ${selected?.id===p.id?'active':''}`} onClick={()=>{if(selected?.id===p.id)return;selectProfile(p)}}><div className="avatar"><ProfilePhoto profile={p}/></div><span><strong>{p.name}</strong><small>{[p.roleLabel,p.party,p.state].filter(Boolean).join(' · ')}</small></span><ArrowUpRight/></button>)}{!searching&&!results.length&&<div className="empty-mini">Nenhum representante encontrado. Ajuste os filtros.</div>}{false&&notice&&<div className={`notice ${results[0]?.sourceMode==='demo'?'demo':''}`}><Info/><span>{expenses?.components?"Consulta às fontes oficiais. Veja a cobertura dos valores na composição do perfil.":notice}</span></div>}</aside>
        <div className="dashboard">{!selected?<Empty/>:<><div className="profile-head"><div className="profile-main"><div className="avatar large"><ProfilePhoto profile={selected}/></div><div><span className="eyebrow">{selected.roleLabel} · {selected.state || 'BR'}</span><h2>{selected.name}</h2><p>{[selected.party,selected.institution,selected.mandateLabel].filter(Boolean).join(' · ')}</p></div></div><label className="year-select">Período<select value={year} onChange={e=>{setExpenses(null);setLoading(true);setAudit(null);setBasisChoice('');setCart({});setYear(+e.target.value)}}>{getAvailableYears(selected,expenseYears).map(y=><option key={y}>{y}</option>)}</select></label></div>
          {error?<div className="error-state"><strong>Não foi possível carregar as despesas.</strong><span>{error}</span></div>:loading?<Loading text="Carregando valores publicados…"/>:expenses&&<Dashboard basisChoice={basisChoice} onBasisChange={id=>{setBasisChoice(id);setCart({});setCategory('Todas')}} key={`${selected.id}-${year}-${displayExpenses?.selectedSimulationBasis}`} audit={audit} auditLoading={auditLoading} auditError={auditError} expenses={displayExpenses} year={year} tab={tab} setTab={setTab} budget={budget} balance={balance} spent={spent} cart={cart} setCart={setCart} adjust={adjust} category={category} setCategory={setCategory} shown={shown}/>}</>}</div>
      </section>
      <Ranking onSelect={(profile,rankingYear)=>{++searchSequence.current;setSearching(false);setResults([profile]);setQuery(profile.name);selectProfile(profile);setYear(rankingYear);setTab('painel');requestAnimationFrame(()=>document.querySelector('.workspace')?.scrollIntoView({block:'start',behavior:'smooth'}))}}/>
    </main>
    <footer id="metodologia"><div className="brand footer-brand"><img className="brand-logo" src="/icon-brasil.png" alt=""/><span>Cachê Federal</span></div><div><strong>O que isto é</strong><p>Consulta de despesas parlamentares e fontes do Executivo federal e STF. Cada consulta informa sua cobertura e origem. As comparações da Câmara usam preços fixos com data e fonte.</p></div><div><strong>Como ler os valores</strong><p>Os dados não representam patrimônio pessoal. O total combina salário-base e gastos publicados. Despesas do órgão não entram na conta pessoal.</p></div><a href={OFFICIAL_SOURCE.homepage} target="_blank" rel="noreferrer">Fonte oficial <ExternalLink/></a></footer>
  </div>
}

function ProfilePhoto({profile}){
 const candidates=[...new Set([profile.photoLocal,profile.photo,profile.photoSource].filter(Boolean))]
 const [failed,setFailed]=useState([])
 const src=candidates.find(url=>!failed.includes(url))
 return src?<img src={src} alt={`Foto de ${profile.name}`} loading="lazy" onError={()=>setFailed(previous=>[...previous,src])}/>:<span aria-label={`Foto indisponível de ${profile.name}`}>{profile.name.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span>
}

function Loading({text}){return <div className="loading" role="status"><LoaderCircle className="spin"/><span>{text}</span></div>}
function Empty(){return <div className="empty-state"><Landmark/><h2>Escolha um representante</h2><p>Busque pelo nome e escolha um perfil para consultar os valores do período.</p></div>}

function Dashboard({basisChoice,onBasisChange,audit,auditLoading,auditError,expenses,year,tab,setTab,budget,balance,spent,cart,setCart,adjust,category,setCategory,shown}){
 const [page,setPage]=useState(1)
 const [statementOpen,setStatementOpen]=useState(tab==='extrato')
 const coverage=getCoverageStatus(expenses)
 const tableOnly=expenses.unitType==='reference'||(coverage.kind==='table-only'&&expenses.unitType==='combined')
 useEffect(()=>{if(tab==='extrato')setStatementOpen(true)},[tab])
 useEffect(()=>setPage(1),[category,year])
 const pages=Math.max(1,Math.ceil(shown.length/50)), currentPage=Math.min(page,pages)
 const pageRows=shown.slice((currentPage-1)*50,currentPage*50)
 const canSimulate=Number.isFinite(budget)
 const comparisons=canSimulate?buildComparisons(Math.max(0,budget)):[]
 const amount=value=>Number.isFinite(value)?formatCurrency(value):'Não disponível'
 return <>
  <div id="dashboard-tabs" className="tabbar" role="navigation" aria-label="Seções do perfil"><button type="button" aria-pressed={tab==='painel'} className={tab==='painel'?'active':''} onClick={()=>setTab('painel')}>Visão geral</button><button type="button" aria-pressed={tab==='simulador'} className={tab==='simulador'?'active':''} onClick={()=>setTab('simulador')}>Simulador</button><button type="button" aria-pressed={tab==='extrato'} className={tab==='extrato'?'active':''} onClick={()=>setTab('extrato')}>Extrato</button></div>
  {expenses.simulationBases&&<div className="basis-selector"><label>Base do simulador<select aria-label="Base do simulador" value={expenses.selectedSimulationBasis} onChange={e=>onBasisChange(e.target.value)}>{expenses.simulationBases.filter(b=>b.id!=='administration').map(b=><option key={b.id} value={b.id} disabled={!Number.isFinite(b.budget)}>{({combined:'Salário + auxílios + gastos extras',reference:'Somente salário-base',personalPublished:'Somente gastos publicados',administration:'Contratos da gestão (amostra)'})[b.id]||b.label}{!Number.isFinite(b.budget)?' — indisponível':''}</option>)}</select></label></div>}
  {tab==='painel'&&<>
  <section className="stats-grid"><article className="stat-card hero-stat"><span>{tableOnly?'Salário-base anual':expenses.simulationLabel || 'Total disponível'} em {year}</span><strong>{amount(budget)}</strong><small>{auditLoading?'Consultando folhas e gabinete…':'Salário, auxílios e gastos disponíveis'}</small></article><article className="stat-card"><ReceiptText/><span>{tableOnly?'Meses calculados':'Lançamentos'}</span><strong>{shown.length}</strong><small>no período consultado</small></article><article className="stat-card"><ShoppingBasket/><span>{tableOnly?'Origem do valor':'Categorias'}</span><strong>{tableOnly?'Tabela salarial':expenses.byCategory.length}</strong><small>{tableOnly?'Valor da tabela':'na composição do valor'}</small></article></section>
  {expenses.components?<UnifiedBreakdown expenses={expenses}/>:<CostBreakdown expenses={expenses} audit={audit} loading={auditLoading} error={auditError} year={year}/>}
  </>}
  {coverage.message&&<p className={`coverage-status ${coverage.kind}`} role="status">{auditLoading?'Buscando folha e gastos do gabinete…':coverage.message} Veja os detalhes em Dados públicos.</p>}
  {tab==='painel'&&canSimulate&&<>
   <section className="comparisons"><Heading eyebrow="Comparação" title="O equivalente no dia a dia" text={expenses.unitType==='reference'?'Equivalências sobre o salário-base estimado para o ano.':'Equivalências sobre os valores da base selecionada.'}/><div className="comparison-grid">{comparisons.map(x=><article key={x.id}><strong>{formatCompactNumber(x.quantity)}</strong><span>{x.label}</span><small>base: {formatCurrency(x.value)} · {x.referenceDate}</small></article>)}</div></section>
   <section className="chart-section"><Heading eyebrow={expenses.unitType==='reference'?'Salário-base':'Dado oficial agrupado'} title="Para onde foi o valor" text={expenses.unitType==='combined'?'Salário-base, auxílios e gastos extras disponíveis no período.':expenses.unitType==='reference'?'Salário de cada mês, conforme a tabela do cargo.':expenses.unitType==='contracts'?'Amostra de valores contratados por categoria; não representa pagamentos.':'Despesas publicadas por categoria, descontados os estornos.'}/><div className="chart-wrap"><ResponsiveContainer width="100%" height={300}><BarChart data={expenses.byCategory.slice(0,6)} layout="vertical" margin={{right:30}}><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={145} tick={{fontSize:11}} tickFormatter={v=>v.length>20?v.slice(0,20)+'…':v}/><Tooltip formatter={v=>formatCurrency(v)} cursor={{fill:'#f4efdf'}}/><Bar dataKey="value" radius={[0,8,8,0]}>{expenses.byCategory.slice(0,6).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></section>
  </>}
  {(tab==='painel'||tab==='simulador')&&canSimulate&&<section id="simulador" className="simulator"><div className="sim-header"><div><span className="eyebrow">Simulação fictícia</span><h3>Gaste o equivalente</h3><p>{expenses.unitType==='combined'?'Compare o total disponível com compras e custos do dia a dia.':expenses.unitType==='reference'?'Compare o salário-base do cargo com compras fictícias.':expenses.unitType==='contracts'?'Compare o valor contratado da amostra com compras fictícias. Essa base pertence à gestão, não à pessoa.':'Compare o valor publicado com compras e custos do dia a dia.'}</p></div><div className="balance"><span>Saldo equivalente</span><strong>{canSimulate?formatCurrency(balance):'Não disponível'}</strong><small>de {amount(budget)}</small></div></div><div className="products-grid">{products.map(p=>{const count=cart[p.id]||0;return <article className="product-card" key={p.id}><div className="product-photo"><img src={p.image} alt={p.imageAlt||p.name} loading="lazy" width="640" height="400"/></div><span className="product-category">{p.category}</span><h4>{p.name}</h4><p>{p.description}</p><strong>{formatCurrency(p.price)}</strong><div className="counter"><button onClick={()=>adjust(p,-1)} disabled={!count} aria-label={`Remover ${p.name}`}><Minus/></button><span>{count}</span><button onClick={()=>adjust(p,1)} disabled={!canSimulate||p.price>balance} aria-label={`Adicionar ${p.name}`}><Plus/></button></div></article>})}</div><div className="cart-footer"><div><span>Total fictício</span><strong>{formatCurrency(spent)}</strong></div><button className="ghost-btn" onClick={()=>setCart({})}><RotateCcw/> Limpar simulação</button></div></section>}
  {(tab==='painel'||tab==='extrato')&&<details id="extrato" className="statement" open={statementOpen} onToggle={e=>setStatementOpen(e.currentTarget.open)}><summary className="statement-summary"><span>Extrato de despesas</span><span className="statement-toggle">{statementOpen?'Recolher':'Ver extrato'}</span></summary><div className="section-heading"><div><span className="eyebrow">Dados oficiais</span><h3>{expenses.unitType==='reference'?'Cálculo do salário-base':expenses.unitType==='contracts'?'Contratos da gestão':'Extrato de despesas'}</h3><small>Dados consultados em {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(expenses.fetchedAt))}</small></div><label className="filter">Categoria <select value={category} onChange={e=>setCategory(e.target.value)}><option>Todas</option>{expenses.byCategory.map(x=><option key={x.name}>{x.name}</option>)}</select></label></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Categoria / fornecedor</th><th>Documento</th><th>{expenses.unitType==='reference'?'Valor de referência':expenses.unitType==='contracts'?'Valor contratado':'Débito / estorno'}</th></tr></thead><tbody>{pageRows.map(x=><tr key={x.id}><td>{(x.id?.startsWith('payroll-')||x.id?.startsWith('senate-extra-'))?`Total de ${year}`:formatDate(x.date)}</td><td><strong>{x.category}</strong><small>{x.description||x.supplier}</small></td><td>{(x.documentUrl||x.sourceUrl)?<a href={x.documentUrl||x.sourceUrl} target="_blank" rel="noreferrer">{x.sourceMode==='reference'?'Fonte da tabela':'Fonte oficial'} <ExternalLink/></a>:<small>Indisponível na fonte</small>}</td><td className={x.netValue<0?'credit-value':''}><strong>{amount(x.netValue)}</strong><small>{x.sourceMode==='reference'?'Tabela salarial':!Number.isFinite(x.netValue)?'Valor não informado':x.netValue<0?'Estorno / crédito':x.netValue===0?'Sem débito':expenses.unitType==='contracts'?'Contrato, não pagamento':'Despesa'}</small></td></tr>)}</tbody></table>{!shown.length&&<div className="empty-mini">Nenhuma despesa nesta categoria.</div>}</div><div className="pagination"><span aria-live="polite">{shown.length?`${(currentPage-1)*50+1}–${Math.min(currentPage*50,shown.length)} de ${shown.length}`:'0 despesas'} · 50 por página{!expenses.complete?(expenses.components?' · cobertura parcial':' · carregando mais…'):''}</span><div><button className="ghost-btn" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Anterior</button><span> {currentPage} / {pages} </span><button className="ghost-btn" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Próxima</button></div></div>{expenses.sourceUrl&&<a className="official-link" href={expenses.sourceUrl} target="_blank" rel="noreferrer">Abrir consulta oficial <ExternalLink/></a>}</details>}
 </>
}

function UnifiedBreakdown({expenses}) {
 const groups=[['Salário',c=>c.kind==='reference:remuneration'||c.kind==='remuneration'],['Auxílios',c=>c.kind==='reference:allowances'||c.kind==='allowances'],['Gastos extras',c=>!c.kind?.startsWith('reference:')&&!['remuneration','allowances','administration'].includes(c.kind)]]
 const paidSalary=expenses.components.some(c=>c.kind==='remuneration'&&Number.isFinite(c.value))
 const tableSalary=expenses.components.some(c=>c.kind==='reference:remuneration'&&Number.isFinite(c.value))
 return <section className="cost-breakdown"><Heading eyebrow="Composição dos valores" title="O que entra na conta"/>{groups.filter(([,filter])=>expenses.components.some(filter)).map(([title,filter])=><div key={title}><h4>{title}</h4><div className="cost-rows">{expenses.components.filter(filter).filter(c=>!(paidSalary&&c.kind==='reference:remuneration')&&!(tableSalary&&c.kind==='remuneration'&&!Number.isFinite(c.value))).map(c=><div key={c.kind}><span>{c.kind==='reference:remuneration'?'Salário do cargo (tabela)':c.kind==='remuneration'?(c.label||'Salário publicado'):c.kind==='reference:allowances'?'Moradia (limite mensal)':c.kind==='office'&&c.label?.includes('CEAP')?'Gastos do mandato':c.label}</span><strong>{Number.isFinite(c.value)?formatCurrency(c.value):Number.isFinite(c.monthlyLimit)?`Até ${formatCurrency(c.monthlyLimit)}/mês`:'Não disponível'}</strong></div>)}</div></div>)}<p className="fine-print">{expenses.verifiedMonths?.length===12?'Folha publicada: 12 meses conferidos.':'Valores da tabela + gastos publicados.'} Detalhes em Dados públicos.</p></section>
}

function Heading({eyebrow,title,text}){return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><p>{text}</p></div>}

function RotatingReceipt(){
 const [receipt,setReceipt]=useState(null),[status,setStatus]=useState('Consultando despesas…'),[paused,setPaused]=useState(false)
 const pool=useRef([]), cache=useRef(new Map()), previous=useRef(null)
 useEffect(()=>{
   const controller=new AbortController();let active=true,timer
   async function cycle(){
    try{
     if(!pool.current.length){const [response,availableResponse]=await Promise.all([fetch('/deputados.json',{signal:controller.signal}),fetch('/ceap-available.json',{signal:controller.signal})]);if(!response.ok||!availableResponse.ok)throw new Error('Lista de deputados indisponível');const r=await response.json(),available=await availableResponse.json();pool.current=r.data.filter(p=>available[String(RECEIPT_YEAR)].includes(String(p.id)))}
     const candidates=pool.current.filter(p=>p.id!==previous.current)
     const politician=candidates[Math.floor(Math.random()*candidates.length)]
     if(!politician)throw new Error('Sem representantes disponíveis')
     let data=cache.current.get(politician.id)
     if(!data){const [expenses,audit]=await Promise.all([getExpenses(politician.id,{year:RECEIPT_YEAR},{signal:controller.signal}),getMandateCosts(politician.id,RECEIPT_YEAR,{signal:controller.signal}).catch(()=>null)]);data={...expenses,audit,total:auditedTotal(expenses,audit)};cache.current.set(politician.id,data)}
     if(active){previous.current=politician.id;setReceipt({politician,...data});setStatus('')}
    }catch(e){if(active)setStatus(`Consulta indisponível: ${e.message} Nova tentativa em 30 s.`)}
    if(active&&!paused)timer=setTimeout(cycle,30000)
   }
   if(!paused||!receipt)cycle()
   return()=>{active=false;controller.abort();clearTimeout(timer)}
 },[paused])
 const top=receipt?[...receipt.data].filter(x=>x.netValue>0).sort((a,b)=>b.netValue-a.netValue).slice(0,3):[]
 return <aside className="hero-receipt" aria-label="Recibo de despesas de um deputado aleatório"><div className="receipt-head"><span>DESPESAS DECLARADAS</span><span>{RECEIPT_YEAR}</span></div><div className="receipt-content" key={receipt?.politician.id||'loading'}><div className="receipt-person">{receipt?.politician.photo&&<img src={receipt.politician.photo} alt="" width="48" height="48"/>}<div><strong>{receipt?.politician.name||'Consultando deputado'}</strong><small>{receipt?`${receipt.politician.party} · ${receipt.politician.state}`:'Dados Abertos da Câmara'}</small></div></div><span className="receipt-caption">Maiores despesas da CEAP</span>{top.map(x=><p key={x.id} className="receipt-expense"><span>{x.category}<small>{x.supplier}</small></span><strong>{formatCurrency(x.netValue)}</strong></p>)}{receipt&&!top.length&&<p>Nenhuma despesa registrada no período.</p>}{status&&<p role="status">{status}</p>}<div className="receipt-total"><span>TOTAL DISPONÍVEL</span><strong>{receipt?formatCurrency(receipt.total):'—'}</strong></div><small>{receipt?`${receipt.data.length} lançamentos CEAP${receipt.audit?' · inclui folha e gabinete disponíveis':' · somente CEAP'}`:'Consultando o total…'}</small></div><div className="receipt-controls"><span>Troca a cada 30 s</span><button type="button" onClick={()=>setPaused(p=>!p)}>{paused?'Continuar':'Pausar'}</button></div>{receipt?.sourceUrl&&<a className="official-link" href={receipt.sourceUrl} target="_blank" rel="noreferrer">Conferir na fonte <ExternalLink/></a>}</aside>
}

function SourcesButton({expenses,profile,audit,auditError}){
 const dialog=useRef(null)
 return <><button type="button" className="source-pill" aria-haspopup="dialog" onClick={()=>dialog.current.showModal()}><i/> Dados públicos</button><dialog ref={dialog} className="sources-dialog" aria-labelledby="sources-title" onClick={e=>{if(e.target===e.currentTarget)dialog.current.close()}}><div className="sources-header"><div><span className="eyebrow">De onde vêm os dados</span><h2 id="sources-title">Fontes do site</h2></div><button type="button" className="sources-close" aria-label="Fechar fontes" autoFocus onClick={()=>dialog.current.close()}>×</button></div><div className="sources-list">{profile&&<section className="profile-sources"><h3>{profile.name} · {expenses?.year}</h3><p>O total junta o salário-base do cargo com auxílios e gastos extras publicados. Quando a folha está disponível, ela substitui o salário da tabela. Limites de auxílios não entram como gastos. Despesas do órgão não entram na conta pessoal.</p>{profile.sourceNotice&&<p>{profile.sourceNotice}</p>}{profile.photoCredit&&<p>Foto: {profile.photoCredit} {profile.photoSource&&<a href={profile.photoSource} target="_blank" rel="noreferrer">Ver origem</a>}</p>}{expenses&&<p>{getCoverageStatus(expenses).message}</p>}{expenses?.simulationNotice&&<p>{expenses.simulationNotice}</p>}{expenses?.sourceIssues?.map((issue,index)=><p key={index}>{issue}</p>)}{expenses?.components?.map((c,index)=><div key={c.kind}><h4>{c.label}: {Number.isFinite(c.value)?formatCurrency(c.value):Number.isFinite(c.monthlyLimit)?`Limite de ${formatCurrency(c.monthlyLimit)}/mês`:'Não disponível'}</h4>{c.notice&&!expenses.components.slice(0,index).some(previous=>previous.notice===c.notice)&&<p>{c.notice}</p>}{c.sourceUrl&&<a href={c.sourceUrl} target="_blank" rel="noreferrer">Consultar fonte <ExternalLink size={13}/></a>}</div>)}{auditError&&<p>{auditError}</p>}{audit&&<><p>{audit.coverage}</p><p>{audit.housing}</p>{audit.months.map(m=><a key={m.month} href={m.sourceUrl} target="_blank" rel="noreferrer">Folha de {m.month}/{expenses?.year}</a>)}</>}</section>}<a href="https://portaldatransparencia.gov.br/download-de-dados/servidores" target="_blank" rel="noreferrer"><strong>Folha federal — Portal da Transparência <ExternalLink size={16}/></strong><span>Arquivos mensais SIAPE: salário, 13º, férias e auxílios. Conferimos os 12 meses por pessoa e cargo; vínculos ambíguos não substituem a tabela.</span></a><a href="https://portaldatransparencia.gov.br/download-de-dados/viagens" target="_blank" rel="noreferrer"><strong>Viagens a serviço — Portal da Transparência <ExternalLink size={16}/></strong><span>Arquivos anuais SCDP: diárias, passagens e outros gastos, descontadas as devoluções. Apenas viagens com beneficiário e cargo conferidos. Não cobre todos os deslocamentos presidenciais ou comitivas.</span></a><a href="https://www.gov.br/casacivil/pt-br/acesso-a-informacao/informacoes-classificadas/despesas-com-cartao-de-pagamento" target="_blank" rel="noreferrer"><strong>Cartão da Presidência <ExternalLink size={16}/></strong><span>Fonte consultada, fora do total pessoal: os valores agregam unidades da Presidência e não identificam o beneficiário.</span></a><a href="https://egesp-portal.stf.jus.br/transparencia/rendimento_folha" target="_blank" rel="noreferrer"><strong>Folha do STF <ExternalLink size={16}/></strong><span>Arquivos oficiais de 2025: remuneração bruta e equipe por lotação. Só foram importados perfis com os 12 meses conferidos; parcelas de um mesmo mês são somadas, sem repetir o ministro na equipe. Presidência, lotações ambíguas e duplicidades não conciliadas foram excluídas.</span></a><a href="https://legis.senado.leg.br/norma/36621431" target="_blank" rel="noreferrer"><strong>Subsídios federais — DL 172/2022 <ExternalLink size={16}/></strong><span>Valores legais por cargo, com reajustes nas datas de vigência. Referência para simulação, sem comprovação de pagamento individual.</span></a><a href="https://www2.camara.leg.br/legin/fed/lei/2023/lei-14520-9-janeiro-2023-793675-publicacaooriginal-166841-pl.html" target="_blank" rel="noreferrer"><strong>Subsídio do STF — Lei 14.520/2023 <ExternalLink size={16}/></strong><span>Remuneração legal usada na referência salarial dos ministros do Supremo.</span></a><a href="https://www12.senado.leg.br/dados-abertos" target="_blank" rel="noreferrer"><strong>Senado Federal <ExternalLink size={16}/></strong><span>Reembolsos CEAPS e gastos fora da cota. Os totais dos dois blocos são conferidos e a cota é conciliada com os lançamentos antes de somar gastos extras.</span></a><a href="https://dadosabertos.tse.jus.br/" target="_blank" rel="noreferrer"><strong>Nomes e eleições — TSE <ExternalLink size={16}/></strong><span>Registro eleitoral do presidente eleito em 2022. O histórico eleitoral não confirma ocupação atual.</span></a><a href="https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros/" target="_blank" rel="noreferrer"><strong>Ministros — Planalto <ExternalLink size={16}/></strong><span>Diretório oficial consultado na data indicada no perfil. A ocupação do cargo é conferida no cadastro mensal do SIAPE antes de importar uma conta anual.</span></a><a href="https://www.camara.leg.br/transparencia/gastos-parlamentares/" target="_blank" rel="noreferrer"><strong>Folhas e gabinete <ExternalLink size={16}/></strong><span>Remuneração bruta, 13º e benefícios das folhas publicadas; despesas do gabinete. Cada consulta mostra os links individuais.</span></a><a href="https://dadosabertos.camara.leg.br/howtouse/2023-12-26-dados-ceap.html" target="_blank" rel="noreferrer"><strong>Metodologia CEAP <ExternalLink size={16}/></strong><span>Débitos, glosas e restituições no arquivo oficial. Os estornos mantêm seus sinais.</span></a><a href={OFFICIAL_SOURCE.homepage} target="_blank" rel="noreferrer"><strong>Câmara dos Deputados <ExternalLink size={16}/></strong><span>Cadastro dos deputados. A CEAP usa os arquivos CSV anuais oficiais; a API retornou divergências de sinal.</span></a><a href="https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/decreto/d12342.htm" target="_blank" rel="noreferrer"><strong>Salário mínimo de 2025 <ExternalLink size={16}/></strong><span>Decreto nº 12.342/2024 · R$ 1.518 por mês.</span></a><a href="https://www.dieese.org.br/analisecestabasica/2025/202501cestabasica.pdf" target="_blank" rel="noreferrer"><strong>Cesta básica — DIEESE <ExternalLink size={16}/></strong><span>São Paulo, janeiro de 2025 · R$ 852,87.</span></a></div><section className="product-sources"><h3>Preços do simulador</h3><p>{productDisclaimer}</p>{products.map(p=><div key={p.id}><strong>{p.name} · {formatCurrency(p.price)}</strong><p>{p.referenceLabel||'Preço de comparação · 2025'}</p>{p.sourceUrl&&<a href={p.sourceUrl} target="_blank" rel="noreferrer">Consultar preço <ExternalLink size={12}/></a>}</div>)}</section></dialog></>
}

function CostBreakdown({expenses,audit,loading,error,year}){
 const amount=value=>Number.isFinite(value)?formatCurrency(value):'Não disponível'
 const rows=[['CEAP líquida',expenses.total,expenses.sourceUrl],['Remuneração bruta + 13º e ajustes',audit?.salary,audit?.sources.payroll],['Auxílios em folha',audit?.allowances,audit?.sources.payroll],['Indenizações em folha',audit?.indemnities,audit?.sources.payroll],['Diárias em folha',audit?.dailyAllowances,audit?.sources.payroll],['Pessoal do gabinete',audit?.office,audit?.sources.summary]]
 return <section className="cost-breakdown"><Heading eyebrow="Composição dos valores" title={`O que entra na conta de ${year}`} text="Somente valores publicados. Lacunas não são tratadas como zero."/><div className="cost-rows">{rows.map(([label,value,url])=><div key={label}><span>{label}{url&&<a href={url} target="_blank" rel="noreferrer" aria-label={`Fonte de ${label}`}><ExternalLink size={13}/></a>}</span><strong>{amount(value)}</strong></div>)}</div><div className="cost-reconciliation"><span>Débitos CEAP: {formatCurrency(expenses.debits)}</span><span>Estornos CEAP: {formatCurrency(expenses.credits)}</span><strong>Líquido: {formatCurrency(expenses.total)}</strong></div>{loading&&<Loading text="Conferindo folhas mensais e gabinete…"/>}{error&&<p role="status">{error}</p>}{audit&&<><p>{audit.months.length} folhas mensais encontradas{audit.unavailable.length?` · meses sem folha disponível: ${audit.unavailable.map(m=>String(m).padStart(2,'0')).join(', ')}`:''}. 13º identificado dentro da remuneração: {amount(audit.thirteenth)}.</p><p>{audit.coverage}</p><details><summary>Fontes e folhas por mês</summary><p>Moradia: {audit.housing}</p>{audit.months.map(m=><a key={m.month} href={m.sourceUrl} target="_blank" rel="noreferrer">{String(m.month).padStart(2,'0')}/{year} <ExternalLink size={12}/></a>)}</details></>}<p>Subtotal sem valor atribuído a imóvel funcional, encargos adicionais de assessores e benefícios fora das folhas consultadas. As folhas podem ser publicadas com atraso. A CEAP inclui complementação de moradia quando registrada; ela não é somada novamente.</p></section>
}
