import type { CompiledStudy } from '../schema/compiled.ts'

/** The study's brand as the page around the player reads it: the colours and the font it is shown in. */
export type ShellBrand = Pick<Partial<CompiledStudy['brand']>, 'accent'> & { background?: string; text?: string; font?: { family: string; url?: string } }

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Text and attribute values, escaped for HTML. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c]!)

/** A CSS value only when it cannot leave its declaration: a colour or a font name; anything else is dropped. The player reads these variables. */
const cssValue = (value: string | undefined) => (value && /^[\w\s#.,%()-]{1,200}$/.test(value) ? value : undefined)
/** Only an https stylesheet is linked. */
const stylesheet = (url: string | undefined) => { try { return url && new URL(url).protocol === 'https:' ? new URL(url).href : undefined } catch { return undefined } }

/**
 * The player's page: a root naming the run and the module that renders into it, in the study's colours and font. It names no product
 * of ours: the title is the one given.
 */
export function playerShell(input: { runId: string; brand?: ShellBrand; title: string; script: string }): string {
  const { brand } = input
  const variables = ([['--pl-accent', brand?.accent], ['--background', brand?.background], ['--foreground', brand?.text], ['--font-sans', brand?.font?.family]] as const)
    .flatMap(([name, value]) => { const safe = cssValue(value); return safe ? [`${name}:${safe}`] : [] })
  const font = stylesheet(brand?.font?.url)
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(input.title)}</title>`,
    ...(font ? [`<link rel="stylesheet" href="${escapeHtml(font)}">`] : []),
    // The values cannot hold `<`, so they cannot close the style element; entities would not be read inside it.
    `<style>${variables.length ? `:root{${variables.join(';')}}` : ''}body{margin:0}</style>`,
    '</head>',
    '<body>',
    `<div id="root" data-run="${escapeHtml(input.runId)}"></div>`,
    `<script type="module" src="${escapeHtml(input.script)}"></script>`,
    '</body>',
    '</html>',
  ].join('\n')
}
