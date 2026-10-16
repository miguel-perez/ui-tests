/**
 * The player's inverse light theme: the site's dark tokens inverted (light canvas and surface, the same ink hierarchy
 * turned over) with the same moment and signal hues, darkened until each reads at AA on both light grounds.
 * tests/palette.test.ts checks every text token here and keeps the site's light tokens identical to these.
 */
export const playerTheme = {
  canvas: '#f6f7fb',
  surface: '#ffffff',
  line: '#d5d9e6',
  ink: '#1f2335',
  muted: '#4c5374',
  comment: '#9aa1c2',
  moment: '#a64d00',
  deviation: '#2f5bcc',
  dead: '#c0244b',
  pause: '#7d5600',
  done: '#00726a',
  note: '#7536c4',
} as const

const vars = Object.entries(playerTheme).map(([name, value]) => `--uit-${name}: ${value};`).join(' ')

/** One stylesheet for every player surface, scoped to `.uit`, so a host app's styles neither leak in nor need to exist. */
export const playerCss = `
.uit { ${vars} color-scheme: light; color: var(--uit-ink); font-family: inherit; font-size: 16px; line-height: 1.5; text-align: left; box-sizing: border-box; }
.uit *, .uit *::before, .uit *::after { box-sizing: border-box; }
.uit h1, .uit h2, .uit h3, .uit p, .uit fieldset, .uit legend, .uit ul { margin: 0; padding: 0; }
.uit button, .uit input, .uit textarea, .uit select { font: inherit; color: inherit; }
.uit button { cursor: pointer; border: 1px solid var(--uit-line); background: var(--uit-surface); border-radius: 6px; padding: 0 16px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 500; }
.uit button:disabled { cursor: default; color: var(--uit-muted); background: var(--uit-canvas); }
.uit :focus-visible { outline: 2px solid var(--uit-deviation); outline-offset: 2px; }
.uit .uit-primary { background: var(--uit-moment); border-color: var(--uit-moment); color: #ffffff; }
.uit .uit-primary:disabled { background: var(--uit-line); border-color: var(--uit-line); color: var(--uit-muted); }
.uit .uit-quiet { background: transparent; border-color: transparent; }
.uit .uit-link { border: 0; min-height: 32px; padding: 0 4px; background: transparent; color: var(--uit-deviation); text-decoration: underline; text-underline-offset: 3px; }
.uit .uit-progress { font-size: 13px; font-weight: 500; color: var(--uit-muted); font-variant-numeric: tabular-nums; }
.uit .uit-ends, .uit .uit-hint { font-size: 14px; color: var(--uit-muted); }
.uit .uit-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.uit .uit-error { color: var(--uit-dead); font-size: 14px; }
.uit svg { flex-shrink: 0; }

/* The scenario card: full screen before each task. */
.uit-card { width: 100%; max-width: 560px; padding: 40px; background: var(--uit-surface); border: 1px solid var(--uit-line); border-radius: 12px; box-shadow: 0 24px 64px rgb(31 35 53 / .12); display: grid; gap: 16px; justify-items: start; }
.uit-card h1, .uit-card h2 { font-size: 15px; font-weight: 500; color: var(--uit-muted); }
.uit-card .uit-scenario { font-size: 20px; line-height: 1.45; font-weight: 500; }
.uit-card .uit-primary { margin-top: 8px; padding: 0 28px; }

/* The task bar: a fixed compact strip, bottom by default, movable to the top, never removable. */
.uit-bar { position: fixed; z-index: 2147483646; left: 50%; transform: translateX(-50%); width: min(760px, calc(100vw - 24px)); background: var(--uit-surface); border: 1px solid var(--uit-line); border-radius: 10px; box-shadow: 0 12px 40px rgb(31 35 53 / .18); }
.uit-bar.uit-bottom { bottom: 12px; }
.uit-bar.uit-top { top: 12px; }
.uit-bar.uit-contained { position: absolute; width: calc(100% - 24px); max-width: 680px; }
.uit-bar-row { display: flex; align-items: center; gap: 8px; padding: 8px; min-height: 60px; }
.uit-bar .uit-progress { white-space: nowrap; padding: 0 4px; }
.uit-bar .uit-summary { flex: 1; min-width: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uit-bar .uit-handle { min-height: 44px; width: 32px; padding: 0; border-color: transparent; background: transparent; color: var(--uit-muted); cursor: grab; touch-action: none; }
.uit-bar .uit-task { padding: 4px 16px 16px 48px; display: grid; gap: 8px; border-top: 1px solid var(--uit-line); padding-top: 16px; }
.uit-bar .uit-task p:first-child { font-size: 16px; }
.uit-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px 12px 48px; border-top: 1px solid var(--uit-line); background: var(--uit-canvas); border-radius: 0 0 10px 10px; }
.uit-confirm p { flex: 1; min-width: 160px; font-weight: 500; }

/* The recording surface: small, apart from the task bar. */
.uit-rec { position: fixed; z-index: 2147483646; top: 12px; right: 12px; display: grid; gap: 2px; padding: 8px 8px 8px 12px; background: var(--uit-surface); border: 1px solid var(--uit-line); border-radius: 10px; box-shadow: 0 8px 24px rgb(31 35 53 / .12); font-size: 13px; }
.uit-rec.uit-contained { position: absolute; }
.uit-rec.uit-static { position: static; box-shadow: none; }
.uit-bar.uit-top ~ .uit-rec { top: auto; bottom: 12px; }
.uit-rec-row { display: flex; align-items: center; gap: 8px; }
.uit-rec time { font-variant-numeric: tabular-nums; font-weight: 500; }
.uit-rec button { min-height: 32px; padding: 0 10px; font-size: 13px; }
.uit-rec .uit-states { color: var(--uit-muted); font-size: 12px; }
.uit-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--uit-dead); flex-shrink: 0; }
.uit-dot.uit-paused { background: var(--uit-comment); }

/* Questions: one per screen, large targets, the scale selectable by keyboard. */
.uit-questions { width: 100%; max-width: 600px; padding: 32px 40px 28px; background: var(--uit-surface); border: 1px solid var(--uit-line); border-radius: 12px; box-shadow: 0 24px 64px rgb(31 35 53 / .12); }
.uit-questions .uit-q { display: grid; gap: 20px; animation: uit-in 220ms ease-out both; }
.uit-questions legend, .uit-questions .uit-label { font-size: 22px; line-height: 1.3; font-weight: 500; margin-bottom: 4px; }
.uit-questions fieldset { border: 0; min-width: 0; display: grid; gap: 12px; }
.uit-scale { display: grid; grid-template-columns: repeat(var(--uit-points, 7), minmax(0, 1fr)); gap: 6px; }
.uit-scale label { position: relative; display: block; }
.uit-scale input, .uit-choices input { position: absolute; inset: 0; opacity: 0; margin: 0; width: 100%; height: 100%; cursor: pointer; }
.uit-scale span { display: grid; place-items: center; height: 56px; border: 1px solid var(--uit-line); border-radius: 8px; font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; background: var(--uit-surface); }
.uit-scale input:checked + span, .uit-choices input:checked + span { background: var(--uit-moment); border-color: var(--uit-moment); color: #ffffff; }
.uit-scale input:focus-visible + span, .uit-choices input:focus-visible + span { outline: 2px solid var(--uit-deviation); outline-offset: 2px; }
.uit-anchors { display: flex; justify-content: space-between; gap: 16px; font-size: 14px; color: var(--uit-muted); }
.uit-choices { display: grid; gap: 8px; }
.uit-choices label { position: relative; display: block; }
.uit-choices span { display: flex; align-items: center; min-height: 48px; padding: 0 16px; border: 1px solid var(--uit-line); border-radius: 8px; }
.uit-questions textarea { display: block; width: 100%; min-height: 112px; padding: 12px; border: 1px solid var(--uit-line); border-radius: 8px; background: var(--uit-canvas); resize: vertical; font-size: 16px; }
.uit-questions textarea[readonly] { background: var(--uit-surface); border-style: dashed; }
.uit-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 28px; }
.uit-actions > span { display: flex; gap: 8px; margin-left: auto; }
.uit-talk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 44px; }
.uit-talk .uit-live { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; font-variant-numeric: tabular-nums; }
.uit-talk .uit-live .uit-dot { animation: uit-pulse 1.2s ease-in-out infinite; }
.uit-talk-consent { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--uit-line); border-radius: 8px; background: var(--uit-canvas); }
.uit-talk-consent > span { display: flex; flex-wrap: wrap; gap: 8px; }

/* The player page: consent, the card, the questions and the upload wait, centred on the light canvas. */
.uit-page { min-height: 100vh; background: var(--uit-canvas); display: grid; place-items: center; padding: 48px 16px; }
.uit-consent { width: 100%; max-width: 600px; padding: 40px; background: var(--uit-surface); border: 1px solid var(--uit-line); border-radius: 12px; display: grid; gap: 16px; }
.uit-consent h1, .uit-page > .uit-questions h1, .uit-wait h1 { font-size: 26px; line-height: 1.25; font-weight: 500; }
.uit-consent table { border-collapse: collapse; width: 100%; font-size: 15px; }
.uit-consent th, .uit-consent td { text-align: left; padding: 10px 12px 10px 0; border-bottom: 1px solid var(--uit-line); vertical-align: top; }
.uit-consent th { font-weight: 500; white-space: nowrap; }
.uit-consent td:nth-child(2) { white-space: nowrap; color: var(--uit-muted); }
.uit-reassure { font-weight: 500; }
.uit-stack { display: grid; gap: 16px; justify-items: center; width: 100%; }
.uit-wait { width: 100%; max-width: 560px; padding: 40px; background: var(--uit-surface); border: 1px solid var(--uit-line); border-radius: 12px; display: grid; gap: 12px; }

@media (hover: hover) {
  .uit button:not(:disabled):hover { border-color: var(--uit-muted); }
  .uit .uit-primary:not(:disabled):hover { background: #8f4200; border-color: #8f4200; }
  .uit .uit-quiet:not(:disabled):hover, .uit .uit-handle:hover { background: var(--uit-canvas); border-color: var(--uit-line); }
  .uit .uit-link:hover { color: var(--uit-ink); }
  .uit-scale label:hover span, .uit-choices label:hover span { border-color: var(--uit-muted); }
}
/* A calm move into place; text is never part-transparent, so it always reads at full contrast. */
@keyframes uit-in { from { transform: translateY(12px); } to { transform: none; } }
@keyframes uit-pulse { 50% { opacity: .35; } }
@media (max-width: 640px) {
  .uit-card, .uit-questions, .uit-consent, .uit-wait { padding: 24px 20px; }
  .uit-bar-row { flex-wrap: wrap; }
  .uit-bar .uit-summary { flex-basis: calc(100% - 140px); }
  .uit-scale { gap: 4px; }
  .uit-scale span { height: 48px; font-size: 16px; }
  .uit-confirm, .uit-bar .uit-task { padding-left: 16px; }
}
@media (prefers-reduced-motion: reduce) { .uit *, .uit *::before, .uit *::after { animation: none !important; transition: none !important; } }
`
