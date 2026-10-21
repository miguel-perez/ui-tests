import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { TAG_SCRIPT } from '../packages/ui-tests/src/browser/tag.ts'
import { Tag } from '../apps/web/components/tag'

afterEach(() => vi.unstubAllEnvs())

const render = () => renderToStaticMarkup(createElement(Tag))

it('a build without NEXT_PUBLIC_UI_TESTS_URL renders the tag with an empty address, which the tag ignores', () => {
  vi.stubEnv('NEXT_PUBLIC_UI_TESTS_URL', undefined)
  const html = render()
  expect(html.startsWith('<script data-ui-tests="">')).toBe(true)
  expect(html).toContain(TAG_SCRIPT.slice(0, 40))
})

it('a build with it names that server', () => {
  vi.stubEnv('NEXT_PUBLIC_UI_TESTS_URL', 'http://127.0.0.1:4300')
  expect(render().startsWith('<script data-ui-tests="http://127.0.0.1:4300">')).toBe(true)
})
