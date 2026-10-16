import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Run, Event, StorageAdapter } from './storage.ts'
import { issues, ended, reachedLine, type HookResult } from './verify.ts'
import { screenSource, type Screener } from './screener.ts'

const cell: React.CSSProperties = { textAlign: 'left', verticalAlign: 'top', padding: '6px 12px 6px 0', borderBottom: '1px solid #d8dce8' }
const fixed: React.CSSProperties = { ...cell, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const input: React.CSSProperties = { font: 'inherit', width: '100%', minWidth: 200, padding: 4, border: '1px solid #d8dce8', borderRadius: 4 }

/** The screener as an editable table: question, options with their labels, the `screen` field each came from and the rule. Edits here are a draft; the block under the table pins them in the file. */
function ScreenerTable({ screener }: { screener: Screener }) {
  return <>
    <h2>Screener</h2>
    <p>{screener.source === 'inferred' ? `Drafted from the users sentence. Inferred: ${screener.inferred.join(', ')}. Edit it here, then paste the screen block into your file.` : 'Derived from the screen block in your file. Edit a row here, then update the screen block to pin it.'}</p>
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr><th style={fixed}>Field</th><th style={cell}>Question</th><th style={cell}>Options and labels</th><th style={cell}>Rule</th></tr></thead>
      <tbody>{screener.questions.map((question, index) => <tr key={index}>
        <td style={fixed}><code>{question.field}</code>{screener.inferred.includes(question.field) ? ' (inferred)' : ''}</td>
        <td style={cell}><input style={input} aria-label={`Question ${index + 1}`} defaultValue={question.question} /></td>
        <td style={cell}><ul style={{ margin: 0, paddingLeft: 16 }}>{question.options.map((option, choice) => <li key={choice}><input style={{ ...input, minWidth: 160, width: 'auto' }} aria-label={`Question ${index + 1} option ${choice + 1}`} defaultValue={option.text} /> <select aria-label={`Question ${index + 1} option ${choice + 1} label`} defaultValue={option.label}><option>accept</option><option>reject</option><option>may-select</option></select></li>)}</ul></td>
        <td style={cell}>{question.rule}</td>
      </tr>)}</tbody>
    </table>
    <h3>Paid panel filters, never asked</h3>
    <ul>{screener.filters.map((filter, index) => <li key={index}><code>{filter.filter}</code> {filter.value} · {filter.rule}</li>)}</ul>
    <pre style={{ whiteSpace: 'pre-wrap' }}>{screenSource(screener.screen, screener.inferred)}</pre>
  </>
}

/** Renders the rehearsal trace as a static HTML page in the attempt view's words: whether they reached the goal and how it ended, the first problem signals (time, kind, detail), the answers and spoken words, their path and yours, events, the end-state snapshot, the screener and the compiled context with its rules. */
export function renderTrace(run: Run, events: Event[], recordings?: Pick<StorageAdapter, 'recording'>) {
  const goal = run.context.goals[run.goalIndex]
  const found = issues(run, events)
  const seconds = (at: number) => `+${((at - run.startedAt) / 1000).toFixed(1)}s`
  const timeWidth = Math.max(0, ...found.map(issue => seconds(issue.at).length))
  const recording = run.recording ?? { events: true, screen: false, voice: false, webcam: false }
  return '<!DOCTYPE html>' + renderToStaticMarkup(<html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Rehearsal trace</title></head><body><main style={{ maxWidth: 1000, margin: '48px auto', padding: 24, fontFamily: 'system-ui', lineHeight: 1.6 }}>
    <h1>Rehearsal trace</h1><p>{goal.name}</p>
    {goal.resultSentence && <p><strong>{goal.resultSentence}</strong></p>}
    <h2>{reachedLine(run.result as HookResult | undefined)}</h2><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(run.result, null, 2)}</pre>
    <p>How it ended: {run.reason ? ended[run.reason] : 'in progress'}. Last page: {run.snapshot?.url ?? 'Not yet recorded'}.</p>
    <p>Recorded: {['interactions', recording.screen && 'screen', recording.voice && 'voice, with consent given when they chose to talk'].filter(Boolean).join(', ')}. Camera: {recording.webcam ? 'recorded' : 'off'}.</p>
    {run.withdrawnAt && <p><strong>Withdrawn {new Date(run.withdrawnAt).toISOString()}: their recordings were deleted, so this attempt can no longer be fully reproduced.</strong></p>}
    <h2>First problem signals</h2>
    {/* Fixed-width fields first, the free text last: time, kind, detail. */}
    <table style={{ borderCollapse: 'collapse' }}><thead><tr><th style={fixed}>Time</th><th style={fixed}>Kind</th><th style={cell}>Detail</th></tr></thead><tbody>{found.map((issue, i) => <tr key={i}><td style={{ ...fixed, textAlign: 'right' }}>{seconds(issue.at).padStart(timeWidth)}</td><td style={fixed}>{issue.kind}</td><td style={cell}>{issue.detail}</td></tr>)}</tbody></table>
    <h2>How it felt</h2><p>Started {new Date(run.startedAt).toISOString()}. Time on this goal: {((Number(run.endedAt ?? Date.now()) - run.startedAt) / 1000).toFixed(1)} s{run.extendedSeconds ? `, including ${run.extendedSeconds} s of extra time they asked for` : ''}. How easy was it? {run.seq ? `${run.seq} of 7` : 'pending'} (7 = very easy). How sure they&apos;d done it: {run.confidence === undefined ? 'not asked' : `${run.confidence} of 7 (7 = completely sure)`}. After the goal: {run.afterGoal ? `Easy to use? ${run.afterGoal.ease} of 5 · Would it help them? ${run.afterGoal.usefulness} of 5` : 'pending'}.</p>
    {run.difficulty && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>What made it difficult: {run.difficulty}</p>}
    {run.words && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Their words: {run.words}</p>}
    {run.voice?.map(answer => {
      const audio = recordings?.recording(answer.recording)
      return <figure key={answer.recording} style={{ margin: '16px 0' }}><figcaption>Spoken answer ({answer.question === 'words' ? 'their words' : 'what made it difficult'}, {answer.seconds.toFixed(1)} s). Transcript: {answer.transcript || 'none'}</figcaption>{audio && <audio controls preload="none" src={`data:${audio.mime};base64,${audio.audio.toString('base64')}`} />}</figure>
    })}
    <h2>Their path and yours</h2><pre>{JSON.stringify({ theirs: events.filter(e => e.type === 'url').map(e => e.url), yours: goal.happyPath }, null, 2)}</pre>
    <h2>Events</h2><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(events, null, 2)}</pre>
    <h2>End-state snapshot</h2><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{run.snapshot?.dom ?? 'Not yet recorded'}</pre>
    {run.context.screener && <ScreenerTable screener={run.context.screener} />}
    <h2>Compiled context and derivation rules</h2><p>The impression stage, fit questions and screener are compiled evidence; they are not run in this rehearsal.</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(run.context, null, 2)}</pre>
  </main></body></html>)
}
