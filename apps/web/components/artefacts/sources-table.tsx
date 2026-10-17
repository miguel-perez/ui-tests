'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** One source as the table draws it: the row's cells, already rendered, and its well. */
export type SourceRow = { id: string; name: string; cells: ReactNode; well: ReactNode }

/**
 * The sources table's behaviour (design/artefacts/sources-section.html): one row open at a time, none on arrival (issue #49), so the
 * first click opens one; a click
 * outside the open well, or Escape, closes it. The column header sticks to the top once scrolled past and reads as stuck.
 */
export function SourcesTable({ columns, rows }: { columns: readonly string[]; rows: SourceRow[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)
  const header = useRef<HTMLDivElement>(null)
  const table = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function click(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.src-row, .src-well')) return
      setOpen(null)
    }
    function key(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // Focus inside the well goes back to its row, so the keyboard is never left on something that just disappeared.
      const well = document.getElementById(`${open}-well`)
      if (well?.contains(document.activeElement)) document.getElementById(`${open}-row`)?.focus()
      setOpen(null)
    }
    document.addEventListener('click', click)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('click', click); document.removeEventListener('keydown', key) }
  }, [open])
  useEffect(() => {
    // Stuck only while the table is still under it: once the table has scrolled away the header is not shown, so it changes nothing.
    function tick() { const box = header.current?.getBoundingClientRect(), area = table.current?.getBoundingClientRect(); setStuck(!!box && !!area && area.top < 0 && area.bottom > box.height) }
    window.addEventListener('scroll', tick, { passive: true }); tick()
    return () => window.removeEventListener('scroll', tick)
  }, [])
  return <div className="src-table" ref={table} data-artefact="sources" data-figure>
    <div className={`src-cols${stuck ? ' is-stuck' : ''}`} ref={header} aria-hidden="true"><span />{columns.map(column => <span key={column}>{column}</span>)}<span /></div>
    {rows.map(row => <div className="src" id={row.id} key={row.id} data-open={open === row.id || undefined}>
      <button className="src-row" id={`${row.id}-row`} type="button" aria-expanded={open === row.id} aria-controls={`${row.id}-well`} onClick={() => setOpen(open === row.id ? null : row.id)}>{row.cells}</button>
      <div className="src-well" id={`${row.id}-well`} role="region" aria-label={row.name} hidden={open !== row.id}>{row.well}</div>
    </div>)}
  </div>
}
