import { useEffect, useRef } from 'react'

export default function Dialog({ title, onClose, children, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current.querySelector('button')?.focus()
    const keydown = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      if (event.key === 'Tab') {
        const controls = [...ref.current.querySelectorAll('button:not(:disabled), input, select, summary, [tabindex="0"]')]
          .filter(el => el.getClientRects().length)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    const element = ref.current
    element.addEventListener('keydown', keydown)
    return () => { element.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }) }
  }, [onClose])
  return <div className="modal-backdrop" onClick={onClose}>
    <section ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
      <div className="section-heading modal-heading"><h2>{title}</h2><button aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>Close ×</button></div>
      {children}
    </section>
  </div>
}
