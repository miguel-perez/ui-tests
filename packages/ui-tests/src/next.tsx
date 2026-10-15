'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Participant = { id: string; author: string; purpose: string; status: string; scenario: string; tasks: string[]; timeout: number; startedAt: number; verificationReady: boolean; validation?: { question: string; choices: string[] } }
const endpoint = '/api/ui-tests'
async function send(body: unknown) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`Could not save (${response.status}). Please try again.`)
  return response.json() as Promise<Participant>
}
function snapshot() {
  const root = document.documentElement.cloneNode(true) as HTMLElement
  root.querySelectorAll('script, style, noscript, [data-research-taskbar]').forEach(node => node.remove())
  root.querySelectorAll('input, textarea, select, [contenteditable]').forEach(node => {
    node.removeAttribute('value'); node.removeAttribute('checked'); node.textContent = '[masked]'
  })
  root.querySelectorAll('*').forEach(node => { for (const attribute of Array.from(node.attributes)) if (/^on|token|secret|password/i.test(attribute.name)) node.removeAttribute(attribute.name) })
  return { url: location.origin + location.pathname, dom: root.outerHTML }
}
function targetLabel(element: Element) {
  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.getAttribute('aria-label') ? `[${element.getAttribute('aria-label')}]` : ''}`.slice(0, 300)
}
const panelStyle: React.CSSProperties = { position: 'fixed', zIndex: 2147483647, bottom: 16, left: 16, maxWidth: 'min(420px, calc(100vw - 32px))', padding: 20, borderRadius: 'var(--radius, 12px)', border: '1px solid var(--border, #aaa)', background: 'var(--background, #fff)', color: 'var(--foreground, #171717)', fontFamily: 'inherit', boxShadow: '0 8px 36px #0002' }
const buttonStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 'var(--radius, 6px)', border: '1px solid var(--border, #aaa)', background: 'var(--primary, #222)', color: 'var(--primary-foreground, white)', cursor: 'pointer', font: 'inherit', margin: '8px 8px 0 0' }

/** Mount once in the root layout. The portal survives App Router navigation. */
export function UiTests() {
  const [run, setRun] = useState<Participant>()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  useEffect(() => {
    fetch(endpoint).then(response => response.ok ? response.json() : null).then(value => { if (value?.status === 'active') setRun(value) }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!run || location.pathname.startsWith('/ui-tests/')) return
    let lastActivity = Date.now(), lastUrl = '', paused = false, cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    function record(event: Record<string, unknown>) {
      if (cancelled) return
      queue.current = queue.current.then(() => send({ action: 'events', events: [{ at: Date.now(), url: location.origin + location.pathname, ...event }] })).catch(err => { setError(String(err)) })
    }
    function activity() { lastActivity = Date.now(); paused = false }
    function click(event: MouseEvent) {
      const element = event.target instanceof Element ? event.target.closest('button,a,input,[role=button]') ?? event.target : null
      if (!element || element.closest('[data-research-taskbar]')) return
      activity()
      const before = document.body.innerHTML, url = location.href, target = targetLabel(element)
      const timer = setTimeout(() => { record({ type: 'click', target, changed: before !== document.body.innerHTML || url !== location.href }); timers.delete(timer) }, 300)
      timers.add(timer)
    }
    function input(event: globalThis.Event) { activity(); if (event.target instanceof Element && !event.target.closest('[data-research-taskbar]')) record({ type: 'input', target: targetLabel(event.target) }) }
    let lastScroll = 0
    function scroll() { activity(); if (Date.now() - lastScroll > 500) { lastScroll = Date.now(); record({ type: 'scroll', target: `y=${Math.round(window.scrollY)}` }) } }
    const interval = setInterval(() => {
      if (location.pathname !== lastUrl) { lastUrl = location.pathname; record({ type: 'url' }) }
      if (!paused && Date.now() - lastActivity > 5000) { paused = true; record({ type: 'pause', duration: Date.now() - lastActivity }) }
    }, 250)
    document.addEventListener('click', click, true); document.addEventListener('input', input, true); window.addEventListener('scroll', scroll); document.addEventListener('keydown', activity)
    return () => { cancelled = true; clearInterval(interval); timers.forEach(clearTimeout); document.removeEventListener('click', click, true); document.removeEventListener('input', input, true); window.removeEventListener('scroll', scroll); document.removeEventListener('keydown', activity) }
  }, [run])
  async function finish(reason: 'done' | 'gave up' | 'timed out') {
    if (!run || busy) return
    setBusy(true)
    try { await queue.current; await send({ action: 'end', reason, snapshot: snapshot() }); location.assign(`/ui-tests/${run.id}?stage=questions`) }
    catch (err) { setError(String(err)); setBusy(false) }
  }
  useEffect(() => {
    if (!run) return
    const timer = setTimeout(() => { void finish('timed out') }, Math.max(0, run.startedAt + run.timeout * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [run, busy]) // attempt deadline persists through navigation
  if (!run || typeof document === 'undefined' || location.pathname.startsWith('/ui-tests/')) return null
  return createPortal(<aside data-research-taskbar aria-label="Your task" style={panelStyle}>
    <strong>{run.author}</strong> <button style={{ ...buttonStyle, fontSize: 12, padding: '4px 8px' }} aria-expanded={!minimized} onClick={() => setMinimized(!minimized)}>{minimized ? 'Show task' : 'Hide task details'}</button>
    <div hidden={minimized}><p>{run.tasks.length ? run.tasks[step] : run.scenario}</p>
    {error && <p role="alert">{error}</p>}
    <button style={buttonStyle} disabled={busy} onClick={async () => {
      if (run.tasks.length) {
        try { await queue.current; await send({ action: 'events', events: [{ type: 'step', at: Date.now(), url: location.origin + location.pathname, step, snapshot: snapshot() }] }) }
        catch (err) { setError(String(err)); return }
      }
      if (step + 1 < run.tasks.length) setStep(step + 1)
      else await finish('done')
    }}>{run.tasks.length && step + 1 < run.tasks.length ? 'Done with this step' : "I'm done"}</button>
    <button style={buttonStyle} disabled={busy} onClick={() => void finish('gave up')}>I can't do this</button>
    </div>
  </aside>, document.body)
}

export function Player({ runId, token }: { runId: string; token?: string }) {
  const [run, setRun] = useState<Participant>()
  const [stage, setStage] = useState(token ? 'consent' : 'questions')
  const [error, setError] = useState('')
  const [seq, setSeq] = useState('4'), [confidence, setConfidence] = useState('3'), [answer, setAnswer] = useState('')
  useEffect(() => {
    if (token) history.replaceState(null, '', `/ui-tests/${runId}`)
    fetch(endpoint, token ? { headers: { Authorization: `Bearer ${runId}.${token}` } } : undefined).then(r => r.ok ? r.json() : Promise.reject(new Error('Start this rehearsal from the command line.'))).then(setRun).catch(err => setError(String(err)))
  }, [token, runId])
  useEffect(() => {
    if (!['questions', 'checking'].includes(stage)) return
    const timer = setInterval(() => {
      fetch(endpoint).then(r => r.ok ? r.json() : null).then((value: Participant | null) => {
        if (!value) return
        setRun(value)
        if (stage === 'checking' && value.verificationReady) setStage(value.validation ? 'questions' : 'thanks')
      }).catch(err => setError(String(err)))
    }, 250)
    return () => clearInterval(timer)
  }, [stage])
  return <main className="player" style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
    {stage === 'consent' && <><h1>A rehearsal with {run?.author ?? 'the author'}</h1><p>Purpose: {run?.purpose ?? 'Loading…'}</p><p>With your permission, we will record clicks, navigation, scroll, masked input events, pauses and a final page snapshot to learn whether you can complete the task. No input values are recorded. This rehearsal is stored locally on this computer.</p><p>You may stop at any time.</p><button style={buttonStyle} disabled={!run} onClick={async () => { try { const value = await send({ action: 'consent', id: runId, token }); setRun(value); setStage('scenario') } catch (err) { setError(String(err)) } }}>I consent</button></>}
    {stage === 'scenario' && run && <><h1>Your scenario</h1><p>From {run.author}</p><p>Purpose: {run.purpose}</p><p>{run.scenario}</p><p>Use the floating task card to finish or stop.</p><button style={buttonStyle} onClick={async () => { try { await send({ action: 'begin' }); location.assign('/') } catch (err) { setError(String(err)) } }}>Begin task</button></>}
    {stage === 'questions' && <><h1>A few final questions</h1><form onSubmit={async event => { event.preventDefault(); try { await send({ action: 'questions', seq: Number(seq), confidence: Number(confidence), answers: run?.validation ? { [run.validation.question]: answer } : undefined }); setStage('checking') } catch (err) { setError(String(err)) } }}>
      <label htmlFor="seq">Overall, how easy or difficult was this task? (1 very difficult, 7 very easy)</label><select id="seq" value={seq} onChange={e => setSeq(e.target.value)}>{[1,2,3,4,5,6,7].map(n => <option key={n}>{n}</option>)}</select>
      <label htmlFor="confidence">How confident are you that you completed it? (1 not at all, 5 very)</label><select id="confidence" value={confidence} onChange={e => setConfidence(e.target.value)}>{[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}</select>
      {run?.validation && <><label htmlFor="validation">{run.validation.question}</label><select id="validation" required value={answer} onChange={e => setAnswer(e.target.value)}><option value="">Choose an answer</option>{run.validation.choices.map(choice => <option key={choice}>{choice}</option>)}</select></>}
      <button style={buttonStyle} disabled={!run?.verificationReady} type="submit">Send answers</button></form></>}
    {stage === 'checking' && <><h1>Saving your rehearsal</h1><p role="status">Waiting for the local verifier…</p></>}
    {stage === 'thanks' && <><h1>Thank you</h1><p>Your rehearsal is saved. You can return to your terminal.</p></>}
    {error && <p role="alert">{error}</p>}
  </main>
}
