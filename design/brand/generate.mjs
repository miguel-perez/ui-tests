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
for (const { name, prompt, image } of prompts) {
  // Optional reference image, a path relative to the prompts file, sent as a data URL.
  const reference = image ? `data:image/png;base64,${readFileSync(join(dirname(promptsFile), image)).toString('base64')}` : null
  if (calls >= max) break
  // Skip when any saved output exists, whatever format the model returned, so a rerun never pays twice.
  if (['svg', 'png', 'jpg'].some(ext => existsSync(join(outDir, `${name}.${ext}`)))) { console.log('skip', name); continue }
  writeFileSync(join(outDir, `${name}.prompt.txt`), prompt + '\n')
  calls++
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: reference
      ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: reference } }]
      : prompt }], modalities: ['image'] }),
  })
  const body = await res.json()
  if (!res.ok) { console.error(name, 'HTTP', res.status, JSON.stringify(body).slice(0, 300)); continue }
  const images = body.choices?.[0]?.message?.images ?? []
  if (!images.length) { console.error(name, 'no image', JSON.stringify(body).slice(0, 300)); continue }
  const url = images[0].image_url?.url ?? images[0].url ?? ''
  const m = /^data:([^;]+);base64,(.+)$/s.exec(url)
  if (m) {
    const [, mime, b64] = m
    if (!/^image\/(svg\+xml|png|jpeg)$/.test(mime)) { console.error(name, 'unexpected data URL type', mime); continue }
    const ext = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : 'jpg'
    writeFileSync(join(outDir, `${name}.${ext}`), Buffer.from(b64, 'base64'))
    console.log('wrote', name, ext, mime)
  } else {
    const r = await fetch(url)
    const ct = r.headers.get('content-type') ?? ''
    if (!r.ok || !/^image\/(svg\+xml|png|jpeg)/.test(ct)) { console.error(name, 'remote image rejected', r.status, ct); continue }
    const buf = Buffer.from(await r.arrayBuffer())
    const ext = ct.includes('svg') ? 'svg' : ct.includes('png') ? 'png' : 'jpg'
    writeFileSync(join(outDir, `${name}.${ext}`), buf); console.log('fetched', name, ext, ct)
  }
}
console.log('calls', calls)
