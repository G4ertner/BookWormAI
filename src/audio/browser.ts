import type { AssetRepository, AudioAsset, MediaPort, NarrationProfile, Passage, Position } from './types.ts';

export class BrowserMedia implements MediaPort {
  private audio = new Audio();
  private url?: string;
  private loading = false;
  private listeners = new Map<string, Set<() => void>>();
  constructor() {
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', () => this.emit('time'));
    this.audio.addEventListener('ended', () => this.emit('ended'));
    this.audio.addEventListener('error', () => { if (!this.loading) this.emit('error'); });
  }
  async load(asset: AudioAsset, offsetMs: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted(); this.reset(); this.loading = true;
    this.url = URL.createObjectURL(asset.blob);
    try {
      await new Promise<void>((resolve, reject) => {
        const clean = () => { clearTimeout(timer); this.audio.removeEventListener('loadedmetadata', ready); this.audio.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); };
        const ready = () => { clean(); resolve(); };
        const failed = () => { clean(); reject(new Error('The audio could not be decoded. Retry this passage.')); };
        const aborted = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
        const timer = setTimeout(failed, 15000);
        this.audio.addEventListener('loadedmetadata', ready);
        this.audio.addEventListener('error', failed);
        signal.addEventListener('abort', aborted, { once: true });
        this.audio.src = this.url!; this.audio.load();
      });
      signal.throwIfAborted();
      // A completed final passage restarts from its beginning on explicit replay.
      const duration = this.audio.duration;
      this.audio.currentTime = Number.isFinite(duration) && offsetMs / 1000 < duration - 0.1 ? Math.max(0, offsetMs / 1000) : 0;
    } finally { this.loading = false; }
  }
  async play(): Promise<void> {
    try { await this.audio.play(); }
    catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') throw new Error('Your browser needs another Play click to start audio.');
      throw error;
    }
  }
  pause(): void { this.audio.pause(); }
  reset(): void {
    this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url); this.url = undefined;
  }
  setRate(rate: number): void { this.audio.playbackRate = rate; }
  setMuted(muted: boolean): void { this.audio.muted = muted; }
  time() { return { offsetMs: Math.round((this.audio.currentTime || 0) * 1000), durationMs: Number.isFinite(this.audio.duration) ? Math.round(this.audio.duration * 1000) : 0 }; }
  on(event: string, callback: () => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
    return () => { this.listeners.get(event)?.delete(callback); };
  }
  private emit(event: string): void { this.listeners.get(event)?.forEach(callback => callback()); }
}

type StoredAsset = AudioAsset & { usedAt: number };
export class BrowserAssets implements AssetRepository {
  private database?: Promise<IDBDatabase>;
  private memory = new Map<string, AudioAsset>();
  constructor(private profile: NarrationProfile, private warn: (message: string) => void = () => {}) {}
  private db(): Promise<IDBDatabase> {
    return this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('bookworm-audio-v1', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('assets', { keyPath: 'key' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Audio storage is blocked by another tab.'));
    });
  }
  async get(passage: Passage, signal: AbortSignal): Promise<AudioAsset> {
    const key = await digest(`${this.profile.id}\0${passage.text}`);
    signal.throwIfAborted();
    if (this.memory.has(key)) return this.memory.get(key)!;
    try {
      const db = await this.db();
      const stored = await new Promise<StoredAsset | undefined>((resolve, reject) => {
        const request = db.transaction('assets').objectStore('assets').get(key);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      if (stored?.blob instanceof Blob && stored.blob.size > 0) {
        signal.throwIfAborted(); this.remember(stored); return stored;
      }
    } catch (error) { if (signal.aborted) throw error; this.warn('Audio storage is unavailable. Playback works, but cached audio may not survive reopening.'); }
    signal.throwIfAborted();
    const response = await fetch('/api/audio/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' },
      body: JSON.stringify({ text: passage.text, profileId: this.profile.id }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(95000)]),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body.error?.message || 'The narration server could not prepare audio. Please retry.');
    }
    const blob = await response.blob(); signal.throwIfAborted();
    if (!/^audio\//.test(blob.type) || !blob.size) throw new Error('The server returned invalid audio. Please retry.');
    const id = await digest(await blob.arrayBuffer());
    const asset: AudioAsset = { key, id, blob, generationId: response.headers.get('X-Generation-Id') ?? undefined };
    // Cache only complete responses; an interrupted transfer never becomes playable.
    this.remember(asset);
    try {
      const db = await this.db();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('assets', 'readwrite'); const store = tx.objectStore('assets');
        store.put({ ...asset, usedAt: Date.now() });
        const request = store.getAll();
        request.onsuccess = () => {
          const items = (request.result as StoredAsset[]).sort((a, b) => a.usedAt - b.usedAt);
          let bytes = items.reduce((n, item) => n + item.blob.size, 0);
          for (const item of items) {
            if (bytes <= 64 * 1024 * 1024) break;
            if (!this.memory.has(item.key)) { store.delete(item.key); bytes -= item.blob.size; }
          }
        };
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    } catch { this.warn('Audio could not be saved. You can listen now; reopening may restart this passage.'); }
    return asset;
  }
  async clear(): Promise<void> {
    this.memory.clear();
    const db = await this.db();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  }
  async invalidate(asset: AudioAsset): Promise<void> {
    this.memory.delete(asset.key);
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').delete(asset.key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
  private remember(asset: AudioAsset): void {
    this.memory.set(asset.key, asset);
    while (this.memory.size > 4) this.memory.delete(this.memory.keys().next().value!);
  }
}
export async function digest(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function readPosition(bookId: string): Position | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(`bookworm-audio-position:${bookId}`) || 'null') as Position | null;
    if (value?.bookId === bookId && typeof value.chapterId === 'string' && typeof value.passageId === 'string' && typeof value.assetId === 'string' && typeof value.assetKey === 'string' && Number.isFinite(value.offsetMs) && value.offsetMs >= 0) return value;
  } catch { /* A malformed or unavailable bookmark must not prevent opening a book. */ }
}
export function writePosition(position: Position): void {
  localStorage.setItem(`bookworm-audio-position:${position.bookId}`, JSON.stringify(position));
}
