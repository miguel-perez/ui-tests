import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Run, Event } from './storage.ts'
import { issues } from './verify.ts'

/** Renders the rehearsal trace as a static HTML page: outcome, issue signals, timings, URL path versus happy path, events, the end-state snapshot and the compiled context with its rules. */
export function renderTrace(run: Run, events: Event[]) {
  const goal = run.context.goals[run.goalIndex]
  return '<!DOCTYPE html>' + renderToStaticMarkup(<html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Rehearsal trace</title></head><body><main style={{ maxWidth: 1000, margin: '48px auto', padding: 24, fontFamily: 'system-ui', lineHeight: 1.6 }}>
    <h1>Rehearsal trace</h1><p>{goal.name}</p>
    {goal.resultSentence && <p><strong>{goal.resultSentence}</strong></p>}
    <h2>Outcome</h2><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(run.result, null, 2)}</pre>
    <p>Terminal reason: {run.reason ?? 'In progress'}. Final URL: {run.snapshot?.url ?? 'Not yet recorded'}.</p>
    <h2>First issue signals</h2><ul>{issues(run, events).map((issue, i) => <li key={i}>{issue.kind} at {new Date(issue.at).toISOString()} (+{((issue.at - run.startedAt) / 1000).toFixed(1)}s): {issue.detail}</li>)}</ul>
    <h2>Timings and answers</h2><p>Started {new Date(run.startedAt).toISOString()}; duration {((Number(run.endedAt ?? Date.now()) - run.startedAt) / 1000).toFixed(1)} seconds. SEQ: {run.seq ?? 'pending'} / 7. Confidence: {run.confidence ?? 'pending'} / 5.</p>
    {run.words && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Their words: {run.words}</p>}
    <h2>URL path versus happy path</h2><pre>{JSON.stringify({ actual: events.filter(e => e.type === 'url').map(e => e.url), expected: goal.happyPath }, null, 2)}</pre>
    <h2>Events</h2><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(events, null, 2)}</pre>
    <h2>End-state snapshot</h2><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{run.snapshot?.dom ?? 'Not yet recorded'}</pre>
    <h2>Compiled context and derivation rules</h2><p>The impression stage and fit questions are compiled evidence; they are not run in this rehearsal.</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(run.context, null, 2)}</pre>
  </main></body></html>)
}
