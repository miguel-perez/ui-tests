/**
 * The background texture: its waves are drawn in the line token of the current theme, read from the page, so it follows the theme.
 * Text contrast over its strongest pixel is checked in tests/palette.test.ts.
 */
export const texture = { token: '--line', maxAlpha: 1, lineWidth: 1, rows: 26, frameMs: 40, speed: 0.11 }
