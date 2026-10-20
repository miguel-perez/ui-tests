import { cssValue, stylesheet } from '../derive/brand.ts'
import type { CompiledBrand } from '../schema/compiled.ts'

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Text and attribute values, escaped for HTML. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c]!)

/**
 * The player's page: a root naming the run and the module that renders into it, in the study's colours and font. It names no product
 * of ours: the title is the brand's name.
 */
export function playerShell(input: { runId: string; brand: CompiledBrand; script: string }): string {
  const { brand } = input
  const variables = ([['--pl-accent', brand.accent], ['--pl-bg', brand.background], ['--pl-ink', brand.text], ['--pl-font', brand.font?.family]] as const)
    .flatMap(([name, value]) => { const safe = cssValue(value); return safe ? [`${name}:${safe}`] : [] })
  const font = stylesheet(brand.font?.url)
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(brand.name)}</title>`,
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
