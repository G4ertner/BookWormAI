import type { AssetRepository, AudioAsset, AudioState, MediaPort, Passage, Position } from './types.ts';

/** Owns ordering and cancellation. No DOM, provider credentials, or screen assumptions. */
export class AudioController {
  private passages: Passage[] = [];
  private state: AudioState = { status: 'idle', index: 0, offsetMs: 0, durationMs: 0 };
  private listeners = new Set<(state: AudioState) => void>();
  private epoch = 0;
  private wanted = false;
  private loaded?: AudioAsset;
  private resume?: Position;
  private jobs = new Map<number, { controller: AbortController; promise: Promise<AudioAsset> }>();
  private unsubscribers: (() => void)[];
  private lastSave = 0;

  constructor(private media: MediaPort, private assets: AssetRepository,
    private save: (position: Position) => void = () => {}) {
    this.unsubscribers = [
      media.on('time', () => {
        if (!this.loaded || this.state.status !== 'playing') return;
        this.update(media.time());
        if (Date.now() - this.lastSave >= 2000) this.checkpoint();
      }),
      media.on('ended', () => {
        if (!this.wanted || this.state.status !== 'playing') return;
        this.checkpoint();
        if (this.state.index + 1 < this.passages.length) {
          this.loaded = undefined;
          this.resume = undefined;
          this.media.reset();
          this.update({ index: this.state.index + 1, offsetMs: 0, durationMs: 0 });
          void this.start();
        } else { this.wanted = false; this.update({ status: 'ended' }); }
      }),
      media.on('error', () => {
        if (this.wanted) this.fail('Audio playback failed. Retry this passage.');
      }),
    ];
  }

  snapshot(): AudioState { return { ...this.state }; }
  subscribe(listener: (state: AudioState) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }
  load(passages: Passage[], resume?: Position, index = 0): void {
    this.pause();
    this.media.reset(); this.loaded = undefined;
    this.passages = passages.map(p => ({ ...p }));
    const savedIndex = resume ? passages.findIndex(p => p.bookId === resume.bookId && p.chapterId === resume.chapterId && p.passageId === resume.passageId) : -1;
    this.resume = savedIndex >= 0 ? resume : undefined;
    this.state = { status: passages.length ? 'paused' : 'idle', index: savedIndex >= 0 ? savedIndex : Math.max(0, Math.min(passages.length - 1, index)), offsetMs: this.resume?.offsetMs ?? 0, durationMs: 0 };
    this.emit();
  }
  async play(): Promise<void> {
    if (!this.passages.length || this.wanted) return;
    if (this.state.status === 'ended') this.seek(0);
    this.wanted = true;
    await this.start();
  }
  pause(): void {
    this.wanted = false;
    this.checkpoint();
    this.epoch++;
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
    this.media.pause();
    if (this.state.status !== 'idle') this.update({ status: 'paused' });
  }
  seek(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.passages.length) return;
    const continuePlaying = this.wanted;
    this.pause(); this.media.reset(); this.loaded = undefined; this.resume = undefined;
    this.update({ status: 'paused', index, offsetMs: 0, durationMs: 0, error: undefined, notice: undefined });
    // Persist source position even before this passage has audio.
    const passage = this.passages[index]!;
    this.save({ bookId: passage.bookId, chapterId: passage.chapterId, passageId: passage.passageId, assetKey: '', assetId: '', offsetMs: 0, updatedAt: Date.now() });
    if (continuePlaying) void this.play();
  }
  setRate(rate: number): void {
    if (Number.isFinite(rate) && rate >= 0.5 && rate <= 2) this.media.setRate(rate);
  }
  setMuted(muted: boolean): void { this.media.setMuted(muted); }
  checkpoint(): void {
    const passage = this.passages[this.state.index];
    if (!passage || !this.loaded) return;
    const { offsetMs } = this.media.time();
    this.resume = { bookId: passage.bookId, chapterId: passage.chapterId, passageId: passage.passageId,
      assetKey: this.loaded.key, assetId: this.loaded.id, offsetMs, updatedAt: Date.now() };
    this.save(this.resume); this.lastSave = Date.now();
  }
  dispose(): void { this.pause(); this.media.reset(); this.unsubscribers.forEach(unsub => unsub()); this.listeners.clear(); }

  private obtain(index: number): Promise<AudioAsset> {
    const existing = this.jobs.get(index);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const promise = this.assets.get(this.passages[index]!, controller.signal);
    const job = { controller, promise };
    this.jobs.set(index, job);
    void promise.finally(() => { if (this.jobs.get(index) === job) this.jobs.delete(index); }).catch(() => {});
    return promise;
  }
  private async start(): Promise<void> {
    const epoch = this.epoch;
    const index = this.state.index;
    try {
      if (!this.loaded) {
        this.update({ status: 'preparing', error: undefined });
        const asset = await this.obtain(index);
        if (epoch !== this.epoch || !this.wanted) return;
        let offset = 0;
        if (this.resume?.assetId === asset.id && this.resume.assetKey === asset.key) offset = this.resume.offsetMs;
        else if ((this.resume?.offsetMs ?? 0) > 0) this.update({ notice: 'The saved audio is unavailable or changed. Continuing from the start of this passage.' });
        const controller = new AbortController();
        // Loading/decoding media must be cancellable too.
        const loading = { controller, promise: Promise.resolve(asset) };
        this.jobs.set(index, loading);
        try { await this.media.load(asset, offset, controller.signal); }
        catch (error) {
          if (!controller.signal.aborted) await this.assets.invalidate?.(asset).catch(() => {});
          throw error;
        }
        if (this.jobs.get(index) === loading) this.jobs.delete(index);
        if (epoch !== this.epoch || !this.wanted) return;
        this.loaded = asset;
      }
      await this.media.play();
      if (epoch !== this.epoch || !this.wanted) return;
      this.update({ status: 'playing', error: undefined, ...this.media.time() });
      this.checkpoint();
      // One ahead: bounded spending and memory, and no generation while paused.
      if (index + 1 < this.passages.length) void this.obtain(index + 1).catch(() => {});
    } catch (error) {
      if (epoch !== this.epoch || !this.wanted) return;
      this.fail(error instanceof Error ? error.message : 'Narration failed. Please retry.');
    }
  }
  private fail(error: string): void { this.pause(); this.update({ status: 'error', error }); }
  private update(patch: Partial<AudioState>): void { Object.assign(this.state, patch); this.emit(); }
  private emit(): void { for (const listener of this.listeners) listener(this.snapshot()); }
}
