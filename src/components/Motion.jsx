import { useEffect, useRef, useState } from 'react'
import { Banknote } from 'lucide-react'
import { formatCurrency } from '../lib/api.js'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    update()
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

export function AnimatedMoney({ value }) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const current = useRef(0)
  useEffect(() => {
    if (!Number.isFinite(value) || reduced) {
      current.current = Number.isFinite(value) ? value : 0
      return
    }
    const from = current.current
    let frame, start
    const tick = now => {
      start ??= now
      const progress = Math.min((now - start) / 1200, 1)
      current.current = progress === 1 ? value : from + (value - from) * (1 - (1 - progress) ** 3)
      setDisplay(current.current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, reduced])
  const label = Number.isFinite(value) ? formatCurrency(value) : 'Não disponível'
  return <strong className="animated-money" aria-label={label}>
    <span aria-hidden="true">{Number.isFinite(value) ? formatCurrency(reduced ? value : display) : label}</span>
    {Number.isFinite(value) && value > 0 && !reduced && <span className="money-notes" key={value} aria-hidden="true">
      {[0, 1, 2, 3, 4].map(index => <Banknote key={index} style={{ '--note': index }}/>) }
    </span>}
  </strong>
}
