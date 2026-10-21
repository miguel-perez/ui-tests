import { createElement } from 'react'
import { TAG_SCRIPT } from 'ui-tests/tag'

/**
 * The tag, for the head. Its address is the ui-tests server's, inlined from `NEXT_PUBLIC_UI_TESTS_URL` when the site is built; a build
 * without it (production) leaves the address empty, which the tag ignores.
 */
export function Tag() {
  return createElement('script', { 'data-ui-tests': process.env.NEXT_PUBLIC_UI_TESTS_URL ?? '', dangerouslySetInnerHTML: { __html: TAG_SCRIPT } })
}
