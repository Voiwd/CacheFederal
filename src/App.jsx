import { useEffect, useMemo, useState } from 'react'
import { Search, ArrowUpRight, RotateCcw, Minus, Plus, Landmark, ReceiptText, ShoppingBasket, Sparkles, Info, ExternalLink, LoaderCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { searchPoliticians, getExpenses, buildComparisons, formatCurrency, formatCompactNumber, formatDate, OFFICIAL_SOURCE } from './lib/api.js'
import { products, productDisclaimer } from './data/products.js'

const COLORS = ['#f2c94c','#71b280','#ef8354','#7ea8be','#d897d0','#a9c45a']

export default function App() {
  const [query,setQuery]=useState(''), [party,setParty]=useState(''), [state,setState]=useState('')
  const [results,setResults]=useState([]), [selected,setSelected]=useState(null), [year,setYear]=useState(2025)
  const [expenses,setExpenses]=useState(null), [notice,setNotice]=useState(''), [error,setError]=useState('')
  const [searching,setSearching]=useState(true), [loading,setLoading]=useState(false), [cart,setCart]=useState({})
  const [category,setCategory]=useState('Todas'), [tab,setTab]=useState('painel')

  async function runSearch(event) {
    event?.preventDefault(); setSearching(true); setError('')
    try { const r=await searchPoliticians({name:query,party,state}); setResults(r.data); setNotice(r.notice); if(!selected&&r.data.length)setSelected(r.data[0]) }
    catch(e){setError(e.message)} finally{setSearching(false)}
  }
  useEffect(()=>{runSearch()},[])
  useEffect(()=>{
    if(!selected)return
    const controller=new AbortController(); let active=true; setLoading(true); setExpenses(null); setCart({}); setCategory('Todas'); setError('')
    getExpenses(selected.id,{year},{signal:controller.signal}).then(r=>{if(active){setExpenses({...r,fetchedAt:new Date().toISOString()});setNotice(r.notice)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false;controller.abort()}
  },[selected,year])

  const shown=useMemo(()=>!expenses?[]:category==='Todas'?expenses.data:expenses.data.filter(x=>x.category===category),[expenses,category])
  const budget=expenses?.total||0, spent=products.reduce((s,p)=>s+p.price*(cart[p.id]||0),0), balance=Math.max(0,budget-spent)
  function adjust(p,n){if(n>0&&p.price>balance)return;setCart(c=>({...c,[p.id]:Math.max(0,(c[p.id]||0)+n)}))}

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">CF</span><span>Cachê <em>Federal</em></span></a><nav><a href="#simulador">Simulador</a><a href="#extrato">Extrato</a><a href="#metodologia">Metodologia</a></nav><span className="source-pill"><i/> Dados públicos</span></header>
    <main id="top">
      <section className="hero"><div className="hero-copy"><span className="eyebrow"><Sparkles size={15}/> Transparência com troco em ironia</span><h1>O dinheiro é público.<br/><span>A curiosidade também.</span></h1><p>Descubra quanto da vida cotidiana cabe nas despesas oficialmente registradas de representantes brasileiros.</p>
        <form className="search-box" onSubmit={runSearch}><label className="search-input"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Busque um deputado" aria-label="Nome do deputado"/></label><input value={party} onChange={e=>setParty(e.target.value)} placeholder="Partido" aria-label="Partido"/><input value={state} onChange={e=>setState(e.target.value)} placeholder="UF" maxLength="2" aria-label="Estado"/><button className="primary-btn">Investigar <ArrowUpRight/></button></form>
        <p className="source-line"><Info/> Fonte: {OFFICIAL_SOURCE.name}. Sem achismo no extrato.</p></div>
        <aside className="hero-receipt"><div className="receipt-head"><span>RECIBO DA REALIDADE</span><span>#BR-1988</span></div><div className="receipt-stamp">DADO<br/>ABERTO</div><p>1× curiosidade cidadã</p><p>1× contraste cotidiano</p><p>0× acusação gratuita</p><div className="receipt-total"><span>TOTAL</span><strong>R$ público</strong></div><small>os números preferem falar sem assessoria</small></aside>
      </section>
      <section className="workspace">
        <aside className="results-rail"><div className="section-label"><span>Representantes</span><small>{results.length} resultados</small></div>{searching?<Loading text="Consultando dados abertos…"/>:results.map(p=><button key={p.id} className={`politician-card ${selected?.id===p.id?'active':''}`} onClick={()=>setSelected(p)}><div className="avatar">{p.photo?<img src={p.photo} alt=""/>:p.name[0]}</div><span><strong>{p.name}</strong><small>{p.party} · {p.state}</small></span><ArrowUpRight/></button>)}{!searching&&!results.length&&<div className="empty-mini">Nenhum nome apareceu. Até a ironia precisa de dados.</div>}{notice&&<div className={`notice ${results[0]?.sourceMode==='demo'?'demo':''}`}><Info/><span>{notice}</span></div>}</aside>
        <div className="dashboard">{!selected?<Empty/>:<><div className="profile-head"><div className="profile-main"><div className="avatar large">{selected.photo?<img src={selected.photo} alt={`Foto de ${selected.name}`}/>:selected.name[0]}</div><div><span className="eyebrow">Deputado(a) federal · {selected.state}</span><h2>{selected.name}</h2><p>{selected.party} · Câmara dos Deputados</p></div></div><label className="year-select">Período<select value={year} onChange={e=>setYear(+e.target.value)}>{[2026,2025,2024,2023,2022].map(y=><option key={y}>{y}</option>)}</select></label></div>
          <div className="legal-banner"><Info/><p><strong>Contexto, antes da piada:</strong> estes valores representam despesas públicas registradas. Não são patrimônio, renda ou dinheiro pessoal.</p></div>
          {error?<div className="error-state"><strong>A transparência tirou cinco minutinhos.</strong><span>{error}</span></div>:loading?<Loading text="Somando recibos sem arredondar a realidade…"/>:expenses&&<Dashboard expenses={expenses} year={year} tab={tab} setTab={setTab} budget={budget} balance={balance} spent={spent} cart={cart} setCart={setCart} adjust={adjust} category={category} setCategory={setCategory} shown={shown}/>}</>}</div>
      </section>
    </main>
    <footer id="metodologia"><div className="brand footer-brand"><span className="brand-mark">CF</span><span>Cachê Federal</span></div><div><strong>O que isto é</strong><p>Uma interface satírica sobre transparência pública. Comparações e compras são simulações editoriais.</p></div><div><strong>O que isto não é</strong><p>Patrimônio, salário, acusação ou análise jurídica. Cota, despesa e patrimônio são coisas diferentes.</p></div><a href={OFFICIAL_SOURCE.homepage} target="_blank" rel="noreferrer">Fonte oficial <ExternalLink/></a></footer>
  </div>
}

function Loading({text}){return <div className="loading" role="status"><LoaderCircle className="spin"/><span>{text}</span></div>}
function Empty(){return <div className="empty-state"><Landmark/><h2>Escolha um representante</h2><p>A transparência ainda não lê pensamentos. Use a busca e abra um extrato.</p></div>}

function Dashboard({expenses,year,tab,setTab,budget,balance,spent,cart,setCart,adjust,category,setCategory,shown}){
 const comparisons=buildComparisons(budget)
 return <>
  <div className="tabbar"><button className={tab==='painel'?'active':''} onClick={()=>setTab('painel')}>Visão geral</button><button className={tab==='simulador'?'active':''} onClick={()=>setTab('simulador')}>Simulador</button><button className={tab==='extrato'?'active':''} onClick={()=>setTab('extrato')}>Extrato</button></div>
  <section className="stats-grid"><article className="stat-card hero-stat"><span>Total registrado em {year}</span><strong>{formatCurrency(budget)}</strong><small>Tudo documentado. O espanto é por conta da casa.</small></article><article className="stat-card"><ReceiptText/><span>Lançamentos</span><strong>{expenses.data.length}</strong><small>no período consultado</small></article><article className="stat-card"><ShoppingBasket/><span>Fornecedores</span><strong>{expenses.bySupplier.length}</strong><small>relacionamentos no extrato</small></article></section>
  {(tab==='painel'||tab==='simulador')&&<>
   <section className="comparisons"><Heading eyebrow="Cálculo derivado" title="Em português de boleto" text="Equivalências aproximadas sobre o total acima."/><div className="comparison-grid">{comparisons.map(x=><article key={x.id}><strong>{formatCompactNumber(x.quantity)}</strong><span>{x.label}</span><small>base: {formatCurrency(x.value)} · {x.referenceDate}</small></article>)}</div></section>
   <section className="chart-section"><Heading eyebrow="Dado oficial agrupado" title="Para onde foi o valor" text="Os números preferem falar sem assessoria."/><div className="chart-wrap"><ResponsiveContainer width="100%" height={300}><BarChart data={expenses.byCategory.slice(0,6)} layout="vertical" margin={{right:30}}><XAxis type="number" hide/><YAxis type="category" dataKey="name" width={145} tick={{fontSize:11}} tickFormatter={v=>v.length>20?v.slice(0,20)+'…':v}/><Tooltip formatter={v=>formatCurrency(v)} cursor={{fill:'#f4efdf'}}/><Bar dataKey="value" radius={[0,8,8,0]}>{expenses.byCategory.slice(0,6).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer></div></section>
  </>}
  {(tab==='painel'||tab==='simulador')&&<section id="simulador" className="simulator"><div className="sim-header"><div><span className="eyebrow">Simulação fictícia</span><h3>Gaste o equivalente</h3><p>Compre à vontade. A fatura aqui é apenas pedagógica.</p></div><div className="balance"><span>Saldo equivalente</span><strong>{formatCurrency(balance)}</strong><small>de {formatCurrency(budget)}</small></div></div><div className="products-grid">{products.map(p=>{const count=cart[p.id]||0;return <article className="product-card" key={p.id}><div className="product-emoji">{p.emoji}</div><span className="product-category">{p.category}</span><h4>{p.name}</h4><p>{p.description}</p><strong>{formatCurrency(p.price)}</strong><div className="counter"><button onClick={()=>adjust(p,-1)} disabled={!count} aria-label={`Remover ${p.name}`}><Minus/></button><span>{count}</span><button onClick={()=>adjust(p,1)} disabled={p.price>balance} aria-label={`Adicionar ${p.name}`}><Plus/></button></div></article>})}</div><div className="cart-footer"><div><span>Total fictício</span><strong>{formatCurrency(spent)}</strong></div><button className="ghost-btn" onClick={()=>setCart({})}><RotateCcw/> Desfazer a gastança fictícia</button></div><p className="fine-print">{productDisclaimer} Referências de 2025.</p></section>}
  {(tab==='painel'||tab==='extrato')&&<section id="extrato" className="statement"><div className="section-heading"><div><span className="eyebrow">Dados oficiais</span><h3>Extrato parlamentar</h3><small>Consultado em {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(expenses.fetchedAt))}</small></div><label className="filter">Categoria <select value={category} onChange={e=>setCategory(e.target.value)}><option>Todas</option>{expenses.byCategory.map(x=><option key={x.name}>{x.name}</option>)}</select></label></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Categoria / fornecedor</th><th>Documento</th><th>Valor líquido</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td>{formatDate(x.date)}</td><td><strong>{x.category}</strong><small>{x.supplier}</small></td><td>{x.documentUrl?<a href={x.documentUrl} target="_blank" rel="noreferrer">Comprovante <ExternalLink/></a>:<small>Indisponível na fonte</small>}</td><td><strong>{formatCurrency(x.netValue)}</strong></td></tr>)}</tbody></table>{!shown.length&&<div className="empty-mini">Nada neste filtro. Até a ironia precisa de dados.</div>}</div>{expenses.sourceUrl&&<a className="official-link" href={expenses.sourceUrl} target="_blank" rel="noreferrer">Abrir consulta oficial <ExternalLink/></a>}</section>}
 </>
}

function Heading({eyebrow,title,text}){return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><p>{text}</p></div>}
