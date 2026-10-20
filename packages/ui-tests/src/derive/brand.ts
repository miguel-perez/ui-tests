import type { CompiledBrand } from '../schema/compiled.ts'
import type { UiTestsConfig } from '../types.ts'

const COLOUR = /^#(?:[\da-f]{3}|[\da-f]{6})$/i
const IMAGE_DATA = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/i

function url(value: string): URL | undefined { try { return new URL(value) } catch { return undefined } }
/** An https address, or http to this machine while the author tries the study out. */
function logoAllowed(value: string): boolean {
  if (IMAGE_DATA.test(value)) return true
  const parsed = url(value)
  return parsed !== undefined && (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')))
}

/**
 * The brand participants see, from the config: the name defaults to the author, then the product. Each value ends up in a style,
 * a stylesheet link or an image source on a page we serve, so a value that could leave its place is refused, naming the field.
 */
export function deriveBrand(config: UiTestsConfig, product: string): CompiledBrand {
  const brand = config.brand ?? {}
  for (const field of ['accent', 'background', 'text'] as const) {
    const value = brand[field]
    if (value !== undefined && !COLOUR.test(value)) throw new Error(`brand.${field}: "${value}" is not a colour; write it as #rgb or #rrggbb`)
  }
  if (brand.logo !== undefined && !logoAllowed(brand.logo)) throw new Error('brand.logo: use an https address, http://localhost, or a png, jpeg, gif, webp or svg data: image')
  if (brand.font) {
    if (!brand.font.family.trim() || /[;{}<>"]/.test(brand.font.family)) throw new Error('brand.font.family: a font name, without ; { } < > or quotes')
    if (brand.font.url !== undefined && url(brand.font.url)?.protocol !== 'https:') throw new Error('brand.font.url: use an https address')
  }
  return {
    name: brand.name ?? config.author ?? product,
    ...(brand.logo !== undefined && { logo: brand.logo }),
    ...(brand.accent !== undefined && { accent: brand.accent }),
    ...(brand.background !== undefined && { background: brand.background }),
    ...(brand.text !== undefined && { text: brand.text }),
    ...(brand.font && { font: { family: brand.font.family, ...(brand.font.url !== undefined && { url: brand.font.url }) } }),
  }
}
