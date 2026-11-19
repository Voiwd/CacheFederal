import { useEffect, useState } from 'react'
import { ArrowUpRight, Trophy } from 'lucide-react'
import { formatCurrency } from './lib/api.js'

function Portrait({ profile }) {
  const [failed, setFailed] = useState([])
  const src = [profile.photoLocal, profile.photo, profile.photoSource].filter(Boolean).find(url => !failed.includes(url))
  return src ? <img src={src} alt={`Foto de ${profile.name}`} loading="lazy" onError={() => setFailed(previous => [...previous, src])}/> : <span>{profile.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</span>
}

export default function Ranking({ onSelect }) {
  const [data, setData] = useState(null), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/ranking-total.json', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Ranking indisponível.'); return r.json() }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [])
  return <section id="ranking" className="ranking-section" aria-labelledby="ranking-title">
    <div className="section-heading"><div><span className="eyebrow">Top 10 · {data?.year || 2025}</span><h2 id="ranking-title">Quem gastou mais</h2></div><p>Salário, auxílios, benefícios, despesas e equipe do gabinete disponíveis em todas as fontes do site.</p></div>
    {error ? <p role="alert">{error} Recarregue a página para tentar novamente.</p> : !data ? <p role="status">Carregando ranking…</p> : <>
      <ol className="ranking-list">{data.rows.map(({ profile, total }, index) => <li key={`${profile.role}:${profile.id}`} className={index === 0 ? 'ranking-leader' : ''}>
        <button type="button" className="ranking-person" onClick={() => onSelect(profile, data.year)} aria-label={`${index + 1}º lugar: ${profile.name}, ${formatCurrency(total)}. Ver despesas.`}>
          <span className="ranking-position">{index === 0 ? <Trophy size={23} aria-hidden="true"/> : `${index + 1}º`}</span>
          <div className="avatar ranking-avatar"><Portrait profile={profile}/></div>
          <span className="ranking-identity">{index === 0 && <span className="ranking-first">1º lugar</span>}<strong>{profile.name}</strong><small>{[profile.roleLabel, profile.party, profile.state].filter(Boolean).join(' · ')}</small></span>
          <span className="ranking-amount"><strong>{formatCurrency(total)}</strong><small>total em {data.year}</small></span><ArrowUpRight className="ranking-arrow" size={20} aria-hidden="true"/>
        </button>
      </li>)}</ol>
      <p className="ranking-note">Entre {data.compared} perfis com valores disponíveis para {data.year}. Soma a mesma composição da visão geral: a folha publicada substitui a tabela salarial; estornos são descontados. Benefícios sem valor confirmado e despesas do órgão não são estimados. A cobertura varia por perfil.</p>
      <p className="fine-print">Consolidação em {new Date(data.fetchedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · CEAP coletada em {new Date(data.ceapFetchedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Toque em um nome para conferir a composição e as fontes.</p>
    </>}
  </section>
}
