import { ExternalLink } from 'lucide-react'
import { formatCurrency } from '../lib/api.js'
import { buildBreakdownFields } from '../lib/breakdown.js'

export default function ValueBreakdown({role, expenses, loading, auditLoading}) {
  const fields = buildBreakdownFields({role, expenses, loading, auditLoading})
  const pending = fields.filter(field => field.state === 'loading').length
  return <section className="cost-breakdown value-breakdown" aria-label="Composição dos valores">
    <div className="section-heading"><div><span className="eyebrow">Composição dos valores</span><h3>O que entra na conta</h3></div><p role="status">{pending ? `Consultando ${pending} campos…` : 'Consulta concluída. Lacunas não são tratadas como zero.'}</p></div>
    {[...new Set(fields.map(field => field.group))].map(group => <div key={group}><h4>{group}</h4><div className="value-fields">
      {fields.filter(field => field.group === group).map(field => <article className={`value-field ${field.state}`} key={field.kind} aria-busy={field.state === 'loading'}>
        <div className="value-field-label"><span>{field.label}</span>{field.sourceUrl && <a href={field.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Fonte de ${field.label}`}><ExternalLink size={14}/></a>}</div>
        <div className="value-field-result" aria-live="polite" aria-atomic="true">{field.state === 'loading' ? <span className="field-loading"><span className="sr-only">Buscando valor</span><span aria-hidden="true">{[0,1,2].map(dot => <span key={dot} style={{'--dot':dot}}>.</span>)}</span></span> : <strong key={`${field.state}-${field.value}`}>{field.state === 'unavailable' ? 'Sem dados suficientes' : Number.isFinite(field.value) ? formatCurrency(field.value) : `Até ${formatCurrency(field.monthlyLimit)}/mês`}</strong>}</div>
        {field.note && <small>{field.note}</small>}
      </article>)}
    </div></div>)}
    <p className="fine-print">Os campos são atualizados conforme as fontes respondem. Valores da tabela e limites não comprovam pagamentos. Detalhes em Dados públicos.</p>
  </section>
}
