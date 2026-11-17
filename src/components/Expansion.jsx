import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Landmark, LoaderCircle, Search } from 'lucide-react'
import { searchExpandedProfiles, getExpandedCosts } from '../lib/expansion.js'
import './Expansion.css'

const ROLES = [['senator','Senadores'],['president','Presidência'],['minister','Ministérios'],['governor','Governos estaduais'],['mayor','Prefeituras']]
const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value)
const labels = { remuneration:'Remuneração', office:'Despesas do cargo', administration:'Gastos da gestão' }
const unavailable = kind => ({kind,label:labels[kind],value:null,notice:'Dados não disponíveis nesta consulta.'})

export default function Expansion() {
  const [role,setRole] = useState('senator'), [name,setName] = useState(''), [state,setState] = useState(''), [city,setCity] = useState(''), [year,setYear] = useState(2025)
  const [results,setResults] = useState([]), [selected,setSelected] = useState(null), [costs,setCosts] = useState(null), [notice,setNotice] = useState(''), [error,setError] = useState('')
  const [searching,setSearching] = useState(false), [loading,setLoading] = useState(false), [page,setPage] = useState(1)
  const request = useRef(0), searchController = useRef(null)
  async function search(event) {
    event?.preventDefault()
    searchController.current?.abort()
    const controller = new AbortController(); searchController.current = controller
    const id = ++request.current
    setSearching(true); setError(''); setSelected(null); setCosts(null); setResults([])
    try {
      const response = await searchExpandedProfiles({role,name,state,city},{signal:controller.signal})
      if(id!==request.current) return
      setResults(response.data || []); setNotice(response.notice || '')
      setSelected(response.data?.[0] || null)
    } catch(e) { if(id===request.current && e.name!=='AbortError') setError(e.message || 'A fonte oficial não respondeu. Tente novamente.') }
    finally { if(id===request.current) setSearching(false) }
  }
  useEffect(()=>{ search(); return ()=>searchController.current?.abort() },[role])
  useEffect(()=>{
    if(!selected) return
    const controller = new AbortController(); let active=true
    setCosts(null); setLoading(true); setError(''); setPage(1)
    getExpandedCosts(selected,year,{signal:controller.signal}).then(data=>{if(active)setCosts(data)}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message || 'Não foi possível consultar os valores.')}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false;controller.abort()}
  },[selected,year])
  const components = Object.keys(labels).map(kind=>costs?.components?.find(c=>c.kind===kind)||unavailable(kind))
  const rows = costs?.components?.flatMap(c=>c.rows || []) || []
  const sources = Array.isArray(costs?.sources) ? costs.sources : []
  const pages = Math.max(1,Math.ceil(rows.length/25))
  return <section id="outros-cargos" className="expansion" aria-labelledby="expansion-title">
    <span className="eyebrow"><Landmark size={16}/> Outros cargos e esferas</span>
    <h2 id="expansion-title">Da União ao seu município</h2>
    <p>Consulte parlamentares e explore fontes do Executivo. Remuneração, despesas do cargo e orçamento da gestão aparecem separados, conforme a cobertura de cada fonte.</p>
    <div className="expansion-roles" aria-label="Escolha o cargo">{ROLES.map(([id,label])=><button key={id} type="button" aria-pressed={role===id} onClick={()=>{setName('');setCity('');setRole(id)}}>{label}</button>)}</div>
    <form className="expansion-form" onSubmit={search}>
      <label>{role==='governor'||role==='mayor'?'Nome do estado ou município':'Nome ou órgão'}<input value={name} onChange={e=>setName(e.target.value)} placeholder={role==='senator'?'Nome do senador':role==='mayor'?'Ex.: Campinas':role==='governor'?'Ex.: São Paulo':'Busque na fonte oficial'}/></label>
      <label>UF<input value={state} maxLength={2} onChange={e=>setState(e.target.value.toUpperCase())} placeholder="Todas"/></label>
      <label>Município<input value={city} disabled={role!=='mayor'} onChange={e=>setCity(e.target.value)} placeholder={role==='mayor'?'Filtrar município':'Não se aplica'}/></label>
      <label>Período<select value={year} onChange={e=>{setCosts(null);setLoading(Boolean(selected));setYear(Number(e.target.value))}}>{[2026,2025,2024,2023].map(y=><option key={y}>{y}</option>)}</select></label>
      <button className="primary-btn" disabled={searching} type="submit"><Search size={17}/> Consultar</button>
    </form>
    <div className="expansion-notice">Orçamento de um governo ou órgão não representa gasto pessoal de seu titular. A ausência de informação não equivale a despesa zero.</div>
    {notice&&<p role="status">{notice}</p>}
    {error&&<div className="error-state" role="alert">{error}</div>}
    {searching?<div className="expansion-loading" role="status"><LoaderCircle className="spin"/> Consultando fonte oficial…</div>:<div className="expansion-layout">
      <aside className="expansion-results" aria-label="Resultados da consulta">{results.map(p=><button key={p.id} type="button" aria-pressed={selected?.id===p.id} onClick={()=>{if(selected?.id!==p.id){setCosts(null);setLoading(true);setSelected(p)}}}><Landmark size={20}/><span><strong>{p.name}</strong><small>{[p.party,p.state,p.city].filter(Boolean).join(' · ') || (p.scope==='administration'?'Órgão ou gestão':'Perfil oficial')}</small></span></button>)}{!results.length&&<p>Nenhum resultado nesta consulta. Ajuste os filtros ou consulte as fontes indicadas.</p>}</aside>
      <div className="expansion-profile">{selected&&<><span className="expansion-role">{selected.scope==='administration'?'Órgão ou gestão pública':ROLES.find(([id])=>id===role)?.[1]} · {year}</span><h3>{selected.name}</h3>{selected.officialUrl&&<a href={selected.officialUrl} target="_blank" rel="noreferrer">Consultar fonte oficial <ExternalLink size={13}/></a>}
        {loading?<div className="expansion-loading" role="status"><LoaderCircle className="spin"/> Consultando valores do período…</div>:<><div className="expansion-costs">{components.map(c=><article className="expansion-cost" key={c.kind}><h4>{c.label || labels[c.kind]}</h4><strong>{typeof c.value==='number'&&Number.isFinite(c.value)?money(c.value):'Não disponível'}</strong><small>{c.notice || (c.value===null?'Sem valor disponível na fonte.':'Valor publicado pela fonte para o período consultado.')}</small>{c.sourceUrl&&<a href={c.sourceUrl} target="_blank" rel="noreferrer">Ver origem dos dados <ExternalLink size={13}/></a>}</article>)}</div>{costs?.notice&&<p>{costs.notice}</p>}{sources.length>0&&<div className="expansion-sources"><h4>Fontes e cobertura</h4>{sources.map((source,i)=>{const url=typeof source==='string'?source:source.url||source.sourceUrl;return url?<p key={url}><a href={url} target="_blank" rel="noreferrer">{source.name||source.label||`Fonte oficial ${i+1}`} <ExternalLink size={13}/></a>{source.notice&&<small> · {source.notice}</small>}</p>:null})}</div>}
        {!!rows.length&&<><div className="expansion-table"><table><caption>Registros publicados · {rows.length} registros. Contratos indicam valor contratado, não pagamento realizado.</caption><thead><tr><th>Data</th><th>Descrição / fornecedor</th><th>Valor informado</th><th>Fonte</th></tr></thead><tbody>{rows.slice((page-1)*25,page*25).map((r,i)=><tr key={r.id || i}><td>{r.date || 'Não informada'}</td><td>{r.description || r.category || 'Registro publicado'}{r.supplier&&<small> · {r.supplier}</small>}</td><td>{typeof (r.value??r.netValue)==='number'?money(r.value??r.netValue):'Não disponível'}</td><td>{(r.sourceUrl||r.documentUrl)?<a href={r.sourceUrl||r.documentUrl} target="_blank" rel="noreferrer">Documento</a>:'Não disponível'}</td></tr>)}</tbody></table></div><div className="expansion-pagination"><button className="ghost-btn" onClick={()=>setPage(p=>p-1)} disabled={page===1}>Anterior</button><span>{page} / {pages}</span><button className="ghost-btn" onClick={()=>setPage(p=>p+1)} disabled={page===pages}>Próxima</button></div></>}
        </>}
      </>}</div>
    </div>}
  </section>
}
