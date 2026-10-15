import { defineConfig } from 'ui-tests'
export default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })
