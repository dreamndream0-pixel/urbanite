'use client';

let database: Promise<IDBDatabase> | null = null;
let writes: Promise<void> = Promise.resolve();
const knownEntries = new Map<string, Map<string, unknown>>();
function openDatabase() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('urbanite-product-import', 2);
    request.onupgradeneeded = () => {
      for (const name of ['jobs', 'entries']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}
export async function loadImportJob<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  const meta = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
    const request = db.transaction('jobs', 'readonly').objectStore('jobs').get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  if (!meta) return null;
  if (!Array.isArray(meta._entryUrls)) return meta as T;
  const entries = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction('entries', 'readonly').objectStore('entries').getAll(IDBKeyRange.bound(`${key}\0`, `${key}\0\uffff`));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const byUrl = new Map(entries.map((entry) => [String((entry as { url: string }).url), entry]));
  knownEntries.set(key, byUrl);
  const { _entryUrls, ...rest } = meta;
  return { ...rest, entries: (_entryUrls as string[]).map((url) => byUrl.get(url)).filter(Boolean) } as T;
}
export function saveImportJob(key: string, value: unknown): Promise<void> {
  const next = writes.catch(() => {}).then(async () => {
    const db = await openDatabase();
    const job = value as { entries: { url: string }[] };
    const nextEntries = new Map(job.entries.map((entry) => [entry.url, entry]));
    const previous = knownEntries.get(key) ?? new Map();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['jobs', 'entries'], 'readwrite');
      const store = transaction.objectStore('entries');
      // Save only changed products; a large shop must not rewrite every description after each read.
      for (const [url, entry] of nextEntries) if (previous.get(url) !== entry) store.put(entry, `${key}\0${url}`);
      for (const url of previous.keys()) if (!nextEntries.has(url)) store.delete(`${key}\0${url}`);
      transaction.objectStore('jobs').put({ ...job, entries: undefined, _entryUrls: [...nextEntries.keys()] }, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Progress save aborted'));
    });
    knownEntries.set(key, nextEntries);
  });
  writes = next;
  return next;
}
