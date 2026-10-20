import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import type { RunRecord } from '../record/schema.ts'
import type { Trace } from '../trace/build.ts'
import { momentLabel } from '../trace/reel.ts'
import { clipAt } from '../video.ts'
import { mayShow, ReportView } from './view.tsx'

export type ReportDocumentInput = {
  record: RunRecord
  /** The run's trace; needed only for one person's page, which carries their recording. */
  trace?: Trace
  /** One person (from 1, in the record's order) instead of the whole report. */
  person?: number
  /** Opens the recording at this moment, in the clock of its events. */
  at?: number
  /** Where the report lives, without a trailing slash; `/r/<run>` when not given. */
  base?: string
  /** Turns a path into the link to follow: a signed link inside a signed report. */
  link(path: string): string
  /** The address of a person's video from the segment that began at `segment`. Without it no video is shown. */
  video?(person: number, segment: number): string
  /** The module that mounts the replay on a person's page. */
  replayScript: string
}

/**
 * The report as a whole page, as both servers send it: the whole report, or one person's page with their recording when they agreed to
 * it being shown, opened at the moment `at` names. Undefined for a person the record does not have.
 */
export function reportDocument(input: ReportDocumentInput): string | undefined {
  const { record, person, at, base, link } = input
  const page = (body: ReactNode, script: boolean) => `<!doctype html>${renderToString(
    createElement('html', { lang: 'en' },
      createElement('head', null,
        createElement('meta', { charSet: 'utf-8' }),
        createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
        createElement('meta', { name: 'robots', content: 'noindex, nofollow' }),
        createElement('title', null, `Report · ${record.compiled.name}`)),
      createElement('body', { style: { margin: 0 } }, body, script ? createElement('script', { type: 'module', src: input.replayScript }) : null)),
  )}`
  if (person === undefined) return page(createElement(ReportView, { record, link, ...(base !== undefined && { base }) }), false)

  const attempt = record.attempts[person - 1]
  if (!attempt) return undefined
  const item = input.trace?.attempts[person - 1]
  const shown = mayShow(attempt)
  const begun = item?.replay?.length ? (item.replay[0]!.data as { timestamp?: number }).timestamp : undefined
  const replay = item?.replay && shown && createElement('div', { 'data-replay': attempt.id },
    createElement('script', { type: 'application/json', dangerouslySetInnerHTML: { __html: JSON.stringify({ events: item.replay.map((e) => e.data), moments: item.reel.map((m) => ({ start: m.start, end: m.end, label: momentLabel(m) })), ...(at !== undefined && { startAt: at }) }).replace(/</g, '\\u003c') } }))
  const where = item?.video && at !== undefined ? clipAt(item.video, at) : undefined
  const clip = item?.video && shown && input.video && createElement('video', { controls: true, preload: 'none', 'data-clip': '', src: `${input.video(person, where?.segment ?? item.video[0]!.startedAt)}${where ? `#t=${where.seconds}` : ''}` })
  return page(createElement(ReportView, {
    record, link, attemptIndex: person - 1,
    ...(base !== undefined && { base }),
    ...(replay && { replay }),
    ...(clip && { clip }),
    ...(at !== undefined && begun !== undefined && { moment: Math.max(0, at - begun) }),
  }), Boolean(replay))
}
