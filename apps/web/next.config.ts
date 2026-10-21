import type { NextConfig } from 'next'

/** A static site: `next build` writes plain HTML, CSS and assets to `out/`, with no server. The tag in the layout is all it carries of ui-tests. */
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['ui-tests'],
}
export default config
