'use client'
import { Children, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

const hashed = /^#step([1-9])$/

/**
 * The compile section's steps, one at a time (design/artefacts/compile-section.html): a tab strip, 1 Consent to 6 After the task,
 * then the open step, then previous and next. Arrow keys, Home and End move between the tabs; each step has a plain hash, #step1
 * to #step6, that opens it on load and when a link changes the hash. On desktop every step shares one grid cell, so the steps keep
 * the tallest step's height and the page never jumps when a tab changes; the steps not open stay in the layout, invisible and inert
 * (issue #49). On a phone each step takes its own height and the strip scrolls sideways.
 */
export function CompileSteps({ label, steps, children }: { label: string; steps: { n: number; name: string }[]; children: ReactNode }) {
  const contents = Children.toArray(children)
  const [current, setCurrent] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const strip = useRef<HTMLDivElement>(null)
  const last = contents.length - 1
  const scroll = (smooth: boolean) => strip.current?.scrollIntoView({ block: 'start', behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
  useEffect(() => {
    function open() {
      const match = hashed.exec(location.hash)
      if (!match || +match[1] > last + 1) return
      setCurrent(+match[1] - 1)
      requestAnimationFrame(() => scroll(false))
    }
    open()
    addEventListener('hashchange', open)
    return () => removeEventListener('hashchange', open)
  }, [last])
  function show(index: number, { focus = false, toStrip = false } = {}) {
    const next = Math.max(0, Math.min(last, index))
    setCurrent(next)
    history.replaceState(null, '', `#step${next + 1}`)
    if (focus) tabs.current[next]?.focus()
    if (toStrip) scroll(true)
  }
  function key(event: KeyboardEvent) {
    const to = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: last }[event.key]
    if (to === undefined) return
    event.preventDefault()
    show(to, { focus: true })
  }
  const name = (index: number) => <><b>{steps[index].n}</b>{steps[index].name}</>
  return <>
    <div className="compile-tabs" role="tablist" aria-label={label} ref={strip} onKeyDown={key}>
      {steps.map((step, i) => <button key={step.n} type="button" role="tab" id={`tab-step${step.n}`} aria-controls={`step${step.n}`} aria-selected={i === current} tabIndex={i === current ? 0 : -1} ref={node => { tabs.current[i] = node }} onClick={() => show(i, { focus: true })}>{name(i)}</button>)}
    </div>
    {/* Not the hidden attribute: Tailwind's base layer would take a closed step out of the layout. Inert and invisible instead. */}
    <div className="compile-steps">{contents.map((content, i) => <div key={steps[i].n} className={`compile-step${i === current ? ' is-current' : ''}`} role="tabpanel" id={`step${steps[i].n}`} aria-labelledby={`tab-step${steps[i].n}`} inert={i !== current}>{content}</div>)}</div>
    <nav className="compile-stepnav" aria-label="Previous and next step">
      <button type="button" className="sprev" disabled={current === 0} aria-label={current === 0 ? 'Previous step' : undefined} onClick={() => show(current - 1, { toStrip: true })}>{current > 0 && <><span aria-hidden="true">←</span><span className="sr-only">Previous step: </span>{name(current - 1)}</>}</button>
      <button type="button" className="snext" disabled={current === last} aria-label={current === last ? 'Next step' : undefined} onClick={() => show(current + 1, { toStrip: true })}>{current < last && <><span className="sr-only">Next step: </span>{name(current + 1)}<span aria-hidden="true">→</span></>}</button>
    </nav>
  </>
}
