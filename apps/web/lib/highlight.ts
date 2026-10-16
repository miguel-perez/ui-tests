import { codeToHtml } from 'shiki'

/** Tokyo Night's syntax roles (issue #14, item 14), shared by code windows and inline code so a fragment reads the same in both. */
export const tokyoNight = {
  name: 'ui-tests-tokyo-night', type: 'dark' as const, colors: { 'editor.background': '#1a1b26', 'editor.foreground': '#c0caf5' },
  tokenColors: [
    { scope: ['keyword'], settings: { foreground: '#f7768e' } },
    { scope: ['keyword.control', 'storage'], settings: { foreground: '#bb9af7' } },
    { scope: ['string'], settings: { foreground: '#9ece6a' } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#7aa2f7' } },
    { scope: ['meta.object-literal.key', 'entity.other.attribute-name'], settings: { foreground: '#73daca' } },
    { scope: ['variable.parameter'], settings: { foreground: '#e0af68' } },
    { scope: ['constant.numeric'], settings: { foreground: '#ff9e64' } },
    { scope: ['punctuation'], settings: { foreground: '#a9b1d6' } },
    // Tokyo Night's comment colour is decorative-only: readable comments use muted.
    { scope: ['comment'], settings: { foreground: '#a9b1d6' } },
  ],
}

export function highlight(code: string, language: 'typescript' | 'html' = 'typescript', structure: 'classic' | 'inline' = 'classic') {
  return codeToHtml(code, { lang: language, theme: tokyoNight, structure })
}
