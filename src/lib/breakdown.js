const payrollKinds = ['remuneration', 'thirteenth', 'allowances', 'indemnities', 'dailyAllowances', 'cabinet']
const fields = [
  ['reference:remuneration', 'Salário do cargo (tabela)', 'Referências do cargo'],
  ['reference:allowances', 'Moradia (limite mensal)', 'Referências do cargo'],
  ['remuneration', 'Remuneração publicada', 'Folha e benefícios'],
  ['thirteenth', '13º identificado na folha', 'Folha e benefícios'],
  ['allowances', 'Auxílios publicados', 'Folha e benefícios'],
  ['indemnities', 'Indenizações em folha', 'Folha e benefícios'],
  ['dailyAllowances', 'Viagens a trabalho', 'Gastos do mandato'],
  ['office', 'Estrutura e exercício do cargo', 'Gastos do mandato'],
  ['cabinet', 'Equipe do gabinete', 'Gastos do mandato'],
  ['extraExpenses', 'Gastos fora da cota', 'Gastos do mandato'],
]

export function buildBreakdownFields({role, expenses, loading = false, auditLoading = false}) {
  const components = expenses?.components || []
  const expected = fields.filter(([kind]) => {
    if (kind === 'reference:allowances') return ['deputy', 'senator'].includes(role)
    if (kind === 'extraExpenses') return ['senator', 'president', 'minister'].includes(role)
    if (kind === 'indemnities' || kind === 'thirteenth') return role === 'deputy'
    return true
  })
  // Preserve every additional field returned by a source, including institutional costs.
  const definitions = [...expected, ...components.filter(c => !expected.some(([kind]) => kind === c.kind)).map(c => [c.kind, c.label, c.kind === 'administration' ? 'Despesas do órgão (fora do total pessoal)' : 'Outros dados'])]
  return definitions.map(([kind, label, group]) => {
    const component = components.find(c => c.kind === kind)
    const reference = kind.startsWith('reference:')
    const pending = loading || (reference ? expenses?.referencesPending : expenses?.publishedPending) || (role === 'deputy' && payrollKinds.includes(kind) && auditLoading)
    const hasValue = Number.isFinite(component?.value) && component?.status !== 'unavailable' && (component.value !== 0 || component.status === 'available' || component.rows?.length > 0)
    const hasLimit = Number.isFinite(component?.monthlyLimit) && component?.status !== 'unavailable'
    return {...component, kind, label: reference ? label : component?.label || label, group,
      state: pending && !hasValue && !hasLimit ? 'loading' : hasValue || hasLimit ? 'available' : 'unavailable',
      value: hasValue ? component.value : null,
      note: reference ? (kind === 'reference:allowances' ? 'Limite de benefício; não comprova pagamento e não entra no total.' : 'Referência legal; substituída pela folha quando disponível.') : kind === 'thirteenth' ? 'Já incluído na remuneração publicada; não é somado novamente.' : component?.notice,
    }
  })
}
