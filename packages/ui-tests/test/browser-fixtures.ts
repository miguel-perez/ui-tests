/** A `Storage` kept in a map. */
export function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, String(value)) },
    removeItem: (key: string) => { items.delete(key) },
    clear: () => items.clear(),
  }
}

/** Opens a database so it exists, then closes it. */
export async function createDatabase(idb: IDBFactory, name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = idb.open(name, 1)
    request.onsuccess = () => { request.result.close(); resolve() }
    request.onerror = () => reject(request.error)
  })
}
export const databaseNames = async (idb: IDBFactory) => (await idb.databases()).map((db) => db.name)
