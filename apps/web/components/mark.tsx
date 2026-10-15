import type { CSSProperties } from 'react'

/** Masks keep external, authored SVGs in the current text colour. */
export function Mark({ name, className = '' }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={`mark ${className}`} style={{ '--mark': `url(/marks/${name}.svg)` } as CSSProperties} />
}
