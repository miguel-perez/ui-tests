import { parseHTML } from 'linkedom'
import { MissingEvidence } from './expect.ts'
import type { Snapshot } from './store/types.ts'
import type { SnapshotPage } from './types.ts'

/**
 * What a hook sees of a stored end state. A missing snapshot, or a selector that finds nothing on a truncated one,
 * throws `MissingEvidence`: the element may have been cut off, so the verdict is `unknown`, not `incorrect`.
 */
export function snapshotPage(snapshot?: Snapshot): SnapshotPage {
  const need = (): Snapshot => {
    if (!snapshot?.url || snapshot.dom === undefined) throw new MissingEvidence('Missing end-state snapshot')
    return snapshot
  }
  let document: Document | undefined
  const doc = () => document ??= parseHTML(need().dom).document as unknown as Document
  const find = (selector: string): Element | null => {
    const found = doc().querySelector(selector)
    if (!found && snapshot?.truncated) throw new MissingEvidence(`The snapshot was truncated and "${selector}" was not found`)
    return found
  }
  return {
    url: () => need().url,
    textContent: selector => find(selector)?.textContent ?? null,
    query: find,
    state: () => need().state,
  }
}
