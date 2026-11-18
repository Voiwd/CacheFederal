import { useEffect, useState } from 'react'
import { formatCurrency } from './lib/api.js'
import { normalizeUnifiedProfile } from './lib/unified.js'

export default function Ranking({ onSelect }) {
  const [data, setData] = useState(null), [error, setError] = useState('')
  const [year, setYear] = useState('2025'), [state, setState] = useState(''), [party, setParty] = useState(''), [limit, setLimit] = useState(10)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/ranking-ceap.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Ranking indisponível.'); return r.json() }).then(r => {
      setData(r); setYear(current => r.years[current] ? current : Object.keys(r.years).sort().at(-1))
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])
  const rows = data?.years[year] || []
  const filtered = rows.filter(p => (!state || p.state === state) && (!party || p.party === party))
  function change(setter, value) { setter(value); setLimit(10) }
  return <section id="ranking" className="ranking-section" aria-labelledby="ranking-title">
    <div className="section-heading"><div><span className="eyebrow">Gastos do mandato</span><h2 id="ranking-title">Quem gastou mais</h2></div><p>Deputados federais · CEAP líquida, com estornos descontados. Não inclui salário, folha ou gabinete.</p></div>
    {error ? <p role="alert">{error} Recarregue a página para tentar novamente.</p> : !data ? <p role="status">Carregando ranking…</p> : <>
      <div className="ranking-filters"><label>Ano<select value={year} onChange={e => change(setYear, e.target.value)}>{Object.keys(data.years).sort().reverse().map(y => <option key={y}>{y}</option>)}</select></label><label>Estado<select value={state} onChange={e => change(setState, e.target.value)}><option value="">Todos os estados</option>{[...new Set(rows.map(p => p.state).filter(Boolean))].sort().map(s => <option key={s}>{s}</option>)}</select></label><label>Partido<select value={party} onChange={e => change(setParty, e.target.value)}><option value="">Todos os partidos</option>{[...new Set(rows.map(p => p.party).filter(Boolean))].sort().map(p => <option key={p}>{p}</option>)}</select></label></div>
      <p className="fine-print">{filtered.length} deputados no recorte · atualização em {new Date(data.fetchedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. {year === '2026' && 'Ano parcial até a coleta. '}Partido e estado seguem o cadastro disponível; perfis sem cadastro são identificados pelo número oficial. Valores publicados não indicam irregularidade.</p>
      <div className="table-wrap"><table><caption className="ranking-caption">Maiores gastos líquidos da CEAP em {year}</caption><thead><tr><th scope="col">Posição</th><th scope="col">Deputado(a)</th><th scope="col">Gasto líquido</th><th scope="col">Perfil</th></tr></thead><tbody>{filtered.slice(0, limit).map((p, index) => <tr key={p.id}><td>{index + 1}º</td><td><strong>{p.name}</strong><small>{[p.party, p.state].filter(Boolean).join(' · ') || 'Cadastro não disponível'}</small></td><td><strong>{formatCurrency(p.total)}</strong><small>{p.count} lançamentos</small></td><td><button type="button" className="ghost-btn" aria-label={`Ver despesas de ${p.name} em ${year}`} onClick={() => onSelect(normalizeUnifiedProfile(p), Number(year))}>Ver despesas</button></td></tr>)}</tbody></table></div>
      {!filtered.length && <p role="status">Nenhum deputado encontrado com esses filtros.</p>}
      <div className="pagination"><span aria-live="polite">Exibindo {Math.min(limit, filtered.length)} de {filtered.length}</span>{limit < filtered.length && <button type="button" className="ghost-btn" onClick={() => setLimit(n => n + 20)}>Mostrar mais</button>}<a href={data.sources[year].sourceUrl} target="_blank" rel="noreferrer">Arquivo oficial da Câmara</a></div>
    </>}
  </section>
}
