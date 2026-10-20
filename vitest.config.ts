import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/**/*.test.ts', 'packages/*/test/**/*.test.ts'], exclude: ['**/*.ui.test.ts', '**/node_modules/**'] } })
