import type { NextConfig } from 'next'
/** A static site: `next build` writes plain HTML, CSS and assets to `out/`, with no server. */
const config: NextConfig = { output: 'export', trailingSlash: true }
export default config
