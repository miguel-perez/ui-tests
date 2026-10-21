import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { compilation, example, landing } from '../apps/web/lib/copy'
import { gettingStarted } from '../apps/web/lib/getting-started'
import { TAG_SETUPS } from '../packages/ui-tests/src/browser/setups'
import { initTag } from '../packages/ui-tests/src/cli/init'
import { offences, was } from './vocabulary'

it('keeps the landing study byte-equal to the study the landing shows', async () => {
  expect(await readFile('apps/web/ui-tests/landing.ui.test.ts', 'utf8')).toBe(`${example}\n`)
})

it('points the config at the preview and the ui-tests server, names the product and the author', async () => {
  const config = await readFile('apps/web/ui-tests.config.ts', 'utf8')
  expect(config).toContain("target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' }")
  expect(config).toContain("server: { url: process.env.UI_TESTS_PUBLIC_URL ?? 'http://localhost:4300' }")
  expect(config).toContain("product: 'ui-tests'")
  expect(config).toContain("author: 'ui-tests'")
})

it('gives the first three commands of the compile section, the study and the rehearsal sentence', () => {
  const commands = gettingStarted.steps.flatMap(step => 'command' in step && step.id !== 'tag' ? [step.command] : [])
  expect(commands).toEqual(compilation.commands.slice(0, 3).map(c => c.command))
  expect(compilation.commands[1].does).toBe('Writes a study file and a config, and prints the script tag for your app.')
  expect(gettingStarted.steps.map(step => step.id)).toEqual(['install', 'init', 'tag', 'study', 'run', 'read'])
  const study = gettingStarted.steps.find(step => step.id === 'study')
  expect(study && 'code' in study && study.code).toBe(example)
  const read = gettingStarted.steps.find(step => step.id === 'read')
  expect(read && 'result' in read && read.result).toBe('Rehearsal: 0 of 5 planned attempts recorded.')
})

it('adds the tag init prints, the line for each setup, and the server: npx ui-tests serve or the Docker image', () => {
  const tag = gettingStarted.steps.find(step => step.id === 'tag')!
  expect(tag.heading).toBe('Add the tag and start the server')
  expect('tag' in tag && tag.tag).toBe(initTag)
  expect('setups' in tag && tag.setups).toEqual(TAG_SETUPS)
  expect(tag.text).toContain('does nothing until a person is in an attempt')
  expect(tag.text).toContain('rehearsal starts one on this machine for you')
  expect('command' in tag && tag.command).toBe('npx ui-tests serve')
  expect('docker' in tag && tag.docker).toBe('docker run -p 4300:4300 -v ui-tests:/data ghcr.io/miguel-perez/ui-tests')
})

it('runs the server for a study from CI, and points the preview\'s tag at it', () => {
  const steps = gettingStarted.ci.steps.join('\n')
  expect(steps).toContain('`npx ui-tests serve`')
  expect(steps).toContain('`UI_TESTS_PUBLIC_URL`')
  expect(steps).toContain('`NEXT_PUBLIC_UI_TESTS_URL`')
})

it('says plainly that the package is not published, and how to run it from a clone', () => {
  expect(gettingStarted.clone.heading).toMatch(/not on npm yet/)
  expect(gettingStarted.clone.commands.at(-1)).toBe('npm ci && npm run dev')
  expect(gettingStarted.clone.then).toContain('`npx ui-tests` in `apps/web`')
})

it('uses the landing\'s words: none of the old ones', () => {
  const text = JSON.stringify(gettingStarted)
  expect(offences(text, was)).toEqual([])
  expect(landing.start).toBe('Get started')
})
