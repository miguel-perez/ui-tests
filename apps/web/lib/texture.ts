/**
 * The background texture: its waves are drawn in the line token, read from the page, so they stay light with the site.
 * Text contrast over its strongest pixel is checked in tests/palette.test.ts.
 */
export const texture = { token: '--line', maxAlpha: 1, lineWidth: 1, rows: 26, frameMs: 40, speed: 0.11 }
