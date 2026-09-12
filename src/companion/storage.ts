import { source, validateAnswer } from './types.ts';
import type { Discussion } from './controller.ts';
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('bookworm-companion-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('discussion');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Discussion storage is unavailable.'));
    request.onblocked = () => reject(new Error('Discussion storage is blocked by another tab.'));
  });
}
export async function loadDiscussion(key: string): Promise<Discussion[]> {
  const database = await db();
  const raw: unknown = await new Promise((resolve, reject) => { const r = database.transaction('discussion').objectStore('discussion').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  if (!Array.isArray(raw)) return [];
  return raw.slice(-8).flatMap(v => {
    try {
      if (typeof v.question !== 'string' || v.question.length > 1200 || !Number.isSafeInteger(v.boundary) || v.boundary < 0 || !Array.isArray(v.sources) || v.sources.length > 11) return [];
      const sources = v.sources.map(source);
      return [{ question: v.question, boundary: v.boundary, sources, answer: validateAnswer(v.answer, sources), notice: typeof v.notice === 'string' ? v.notice.slice(0, 300) : undefined }];
    } catch { return []; }
  });
}
export async function saveDiscussion(key: string, value: Discussion[]): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => { const tx = database.transaction('discussion', 'readwrite'); tx.objectStore('discussion').put(value.slice(-8), key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
