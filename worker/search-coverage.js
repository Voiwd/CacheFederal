// Compare published personal amounts with the legal salary for the same year.
// References and institutional contracts are not evidence of personal spending.
export function hasSearchableCosts(costs, referenceTotal) {
  const published = (costs?.components || []).filter(component =>
    component.status !== 'unavailable' && component.status !== 'reference' &&
    !component.kind?.startsWith('reference:') &&
    ['remuneration', 'office', 'allowances', 'indemnities', 'dailyAllowances', 'cabinet', 'extraExpenses'].includes(component.kind) &&
    Number.isFinite(component.value))
  const total = published.reduce((sum, component) => sum + Math.round(component.value * 100), 0)
  return total > 0 && Number.isFinite(referenceTotal) && referenceTotal > 0 && total >= Math.round(referenceTotal * 100)
}
