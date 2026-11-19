import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

// Keep focus on the combobox so keyboard navigation never scrolls the page.
export default function AnimatedSelect({ value, onChange, options, label, className = '' }) {
  const id = useId()
  const root = useRef(null), trigger = useRef(null), list = useRef(null), search = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const selected = Math.max(0, options.findIndex(option => String(option.value) === String(value)))
  const [active, setActive] = useState(selected)
  useEffect(() => {
    if (!open) return
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => {
    const option = document.getElementById(`${id}-${active}`)
    const menu = list.current
    if (!open || !option || !menu) return
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight
    }
  }, [open, active, id])
  function choose(index) {
    if (!options[index] || options[index].disabled) return
    if (String(options[index].value) !== String(value)) onChange(options[index].value)
    setOpen(false)
    trigger.current?.focus()
  }
  function keyDown(event) {
    const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0)
    if (!enabled.length) return
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault()
      if (open) choose(active)
      else { setActive(selected); setOpen(true) }
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const position = enabled.indexOf(open ? active : selected)
      const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)
        : enabled[(position + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]
      setActive(next); setOpen(true)
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const now = Date.now()
      search.current = { text: (now - search.current.time < 600 ? search.current.text : '') + event.key.toLocaleLowerCase('pt-BR'), time: now }
      const match = enabled.find(index => String(options[index].label).toLocaleLowerCase('pt-BR').startsWith(search.current.text))
      if (match !== undefined) { setActive(match); setOpen(true) }
    }
  }
  return <div ref={root} className={`animated-select ${className} ${open ? 'is-open' : ''}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <button ref={trigger} type="button" className="select-trigger" role="combobox" aria-label={label}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-activedescendant={open ? `${id}-${active}` : undefined}
      onKeyDown={keyDown} onClick={() => { setActive(selected); setOpen(previous => !previous) }}>
      <span>{options[selected]?.label}</span><ChevronDown size={17} aria-hidden="true"/>
    </button>
    <div className="select-menu" inert={!open} aria-hidden={!open}>
      <div ref={list} id={id} role="listbox" aria-label={label} className="select-options">
        {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
          aria-selected={index === selected} aria-disabled={Boolean(option.disabled)}
          className={`select-option ${index === active ? 'is-active' : ''}`}
          onPointerMove={() => { if (!option.disabled) setActive(index) }}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
          <span>{option.label}</span>{index === selected && <Check size={16} aria-hidden="true"/>}
        </div>)}
      </div>
    </div>
  </div>
}
