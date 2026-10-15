#!/usr/bin/env node
// Logomark exploration through OpenRouter. Reads OPENROUTER_API_KEY from the
// environment or from the repository's ignored .env file. Never prints the key.
// Usage: node design/brand/generate.mjs <model> <out-dir> <prompts.json> [max]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
function key() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  for (const candidate of [join(here, '../../.env')]) {
    if (!existsSync(candidate)) continue
    const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(readFileSync(candidate, 'utf8'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('OPENROUTER_API_KEY not found')
}

const [model, outDir, promptsFile, maxArg] = process.argv.slice(2)
const prompts = JSON.parse(readFileSync(promptsFile, 'utf8'))
const max = Number(maxArg ?? prompts.length)
mkdirSync(outDir, { recursive: true })
let calls = 0
for (const { name, prompt } of prompts) {
  if (calls >= max) break
  const svgPath = join(outDir, `${name}.svg`), pngPath = join(outDir, `${name}.png`)
  if (existsSync(svgPath) || existsSync(pngPath)) { console.log('skip', name); continue }
  writeFileSync(join(outDir, `${name}.prompt.txt`), prompt + '\n')
  calls++
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], modalities: ['image'] }),
  })
  const body = await res.json()
  if (!res.ok) { console.error(name, 'HTTP', res.status, JSON.stringify(body).slice(0, 300)); continue }
  const images = body.choices?.[0]?.message?.images ?? []
  if (!images.length) { console.error(name, 'no image', JSON.stringify(body).slice(0, 300)); continue }
  const url = images[0].image_url?.url ?? images[0].url ?? ''
  const m = /^data:([^;]+);base64,(.+)$/s.exec(url)
  if (m) {
    const [, mime, b64] = m
    const ext = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : 'bin'
    writeFileSync(join(outDir, `${name}.${ext}`), Buffer.from(b64, 'base64'))
    console.log('wrote', name, ext, mime)
  } else {
    const r = await fetch(url); const buf = Buffer.from(await r.arrayBuffer())
    const ct = r.headers.get('content-type') ?? ''
    const ext = ct.includes('svg') ? 'svg' : ct.includes('png') ? 'png' : 'jpg'
    writeFileSync(join(outDir, `${name}.${ext}`), buf); console.log('fetched', name, ext, ct)
  }
}
console.log('calls', calls)
