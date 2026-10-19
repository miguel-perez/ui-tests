import type { NextConfig } from 'next'

/**
 * Two modes. By default a static site: `next build` writes plain HTML, CSS and assets to `out/`, with no server; the
 * `*.server.tsx` and `*.server.ts` files are not pages here, so the player and the collector are left out. With
 * `UI_TESTS_SERVER=1` (`npm run dev`, previews) it is a server build in `.next-server/` that mounts both.
 */
const server = process.env.UI_TESTS_SERVER === '1'
const shared: NextConfig = {
  trailingSlash: true,
  transpilePackages: ['ui-tests'],
  serverExternalPackages: ['@electric-sql/pglite'],
}
const config: NextConfig = server
  ? { ...shared, distDir: '.next-server', pageExtensions: ['tsx', 'ts', 'server.tsx', 'server.ts'] }
  : { ...shared, output: 'export', pageExtensions: ['tsx', 'ts'] }
export default config
