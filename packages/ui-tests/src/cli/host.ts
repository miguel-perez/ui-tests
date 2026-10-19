import type { Command } from './main.ts'

export const hostNotShipped = 'host: not shipped yet; see https://github.com/miguel-perez/ui-tests/issues/59'

/** Prints what `host` will do and where, then exits 2 until the deploy ships. */
export const host: Command = async (_args, io) => {
  io.stdout.write([
    'host will deploy, in your own account (first provider: Cloudflare Workers with R2 and D1):',
    '  the collector, the player and the store',
    'host will print the collector and player URLs, the store name and the panel state,',
    'and the one line to paste on the live site.',
    '',
  ].join('\n'))
  io.stderr.write(`${hostNotShipped}\n`)
  return 2
}
