import { codeToHtml } from 'shiki'

/**
 * The code roles (app/globals.css), shared by code windows and inline code so a fragment reads the same in both.
 * Every colour is a site token: keyword violet, string green, property teal on the light site.
 */
export const codeRoles = {
  name: 'ui-tests-code-roles', type: 'light' as const, colors: { 'editor.background': 'var(--surface)', 'editor.foreground': 'var(--ink)' },
  tokenColors: [
    { scope: ['keyword', 'keyword.control', 'storage'], settings: { foreground: 'var(--purple)' } },
    { scope: ['string'], settings: { foreground: 'var(--green)' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: 'var(--blue)' } },
    { scope: ['meta.object-literal.key', 'entity.other.attribute-name'], settings: { foreground: 'var(--teal)' } },
    { scope: ['variable.parameter'], settings: { foreground: 'var(--yellow)' } },
    { scope: ['constant.numeric'], settings: { foreground: 'var(--moment)' } },
    { scope: ['punctuation'], settings: { foreground: 'var(--cyan)' } },
    // The comment token is decoration only: readable comments use muted.
    { scope: ['comment'], settings: { foreground: 'var(--muted)' } },
  ],
}

export function highlight(code: string, language: 'typescript' | 'html' = 'typescript', structure: 'classic' | 'inline' = 'classic') {
  return codeToHtml(code, { lang: language, theme: codeRoles, structure })
}
