import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioController } from '../src/audio/controller.ts';
import { splitPassage, type AudioAsset, type MediaPort, type Passage, type Position } from '../src/audio/types.ts';

const passages: Passage[] = [0, 1, 2].map(i => ({ bookId: 'b', chapterId: 'c', passageId: String(i), text: `Passage ${i}.` }));
const asset = (i: string, version = 'v1'): AudioAsset => ({ key: i, id: `${i}-${version}`, blob: new Blob(['fixture']) });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
class Media implements MediaPort {
  events = new Map<string, () => void>();
  played: string[] = []; current?: AudioAsset; offset = 0; rate = 1; muted = false;
  async load(value: AudioAsset, offset: number, signal: AbortSignal) { signal.throwIfAborted(); this.current = value; this.offset = offset; }
  async play() { this.played.push(this.current!.id); }
  pause() {}
  reset() { this.current = undefined; this.offset = 0; }
  setRate(rate: number) { this.rate = rate; }
  setMuted(muted: boolean) { this.muted = muted; }
  time() { return { offsetMs: this.offset, durationMs: 10000 }; }
  on(event: string, callback: () => void) { this.events.set(event, callback); return () => { this.events.delete(event); }; }
  fire(event: string) { this.events.get(event)?.(); }
}

test('splitting preserves prose and bounds UTF-8 bytes, including Chinese and emoji', () => {
  const text = 'First sentence.  A question? Then another thought! 中文很长的一句话没有空格。 🐛'.repeat(20);
  const parts = splitPassage(text, 100);
  assert(parts.length > 1);
  assert(parts.every(part => Buffer.byteLength(part) <= 100));
  assert.equal(parts.join(' ').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert(parts.every(part => !part.includes('\ufffd')));
});
test('progressive queue starts the first passage, prefetches one, and advances in order', async () => {
  const media = new Media(); const requests: string[] = [];
  const controller = new AudioController(media, { get: async p => { requests.push(p.passageId); return asset(p.passageId); } });
  controller.load(passages); await controller.play();
  assert.deepEqual(media.played, ['0-v1']); assert.deepEqual(requests, ['0', '1']);
  media.fire('ended'); await tick();
  assert.deepEqual(media.played, ['0-v1', '1-v1']);
  assert.equal(controller.snapshot().index, 1);
  controller.dispose();
});
test('pause preserves actual offset; resume does not synthesize current passage again', async () => {
  const media = new Media(); const saved: Position[] = []; const requests: string[] = [];
  const controller = new AudioController(media, { get: async p => { requests.push(p.passageId); return asset(p.passageId); } }, p => saved.push(p));
  controller.load(passages); await controller.play(); media.offset = 4321; controller.pause();
  assert.equal(saved.at(-1)?.offsetMs, 4321);
  await controller.play();
  assert.equal(media.offset, 4321); assert.equal(requests.filter(id => id === '0').length, 1);
  assert.equal(JSON.stringify(saved).includes('Passage'), false);
  controller.dispose();
});
test('late generation cannot play after pause or selection of a different book', async () => {
  const media = new Media(); let finish!: (asset: AudioAsset) => void; let oldSignal!: AbortSignal;
  const controller = new AudioController(media, { get: async (p, signal) => {
    if (p.bookId === 'b') { oldSignal = signal; return new Promise(resolve => { finish = resolve; }); }
    return asset('new');
  } });
  controller.load(passages); const pending = controller.play();
  controller.load([{ ...passages[0]!, bookId: 'new-book' }]); await controller.play();
  finish(asset('old')); await pending;
  assert(oldSignal.aborted); assert.deepEqual(media.played, ['new-v1']);
  controller.dispose();
});
test('reopening restores exact cached rendition offset; new rendition restarts passage', async () => {
  const bookmark: Position = { bookId: 'b', chapterId: 'c', passageId: '1', assetKey: '1', assetId: '1-v1', offsetMs: 3200, updatedAt: 1 };
  for (const version of ['v1', 'v2']) {
    const media = new Media(); const controller = new AudioController(media, { get: async p => asset(p.passageId, version) });
    controller.load(passages, bookmark); await controller.play();
    assert.equal(controller.snapshot().index, 1);
    assert.equal(media.offset, version === 'v1' ? 3200 : 0);
    assert.equal(Boolean(controller.snapshot().notice), version !== 'v1');
    controller.dispose();
  }
});
test('failed generation preserves selection and can be explicitly retried', async () => {
  const media = new Media(); let fail = true;
  const controller = new AudioController(media, { get: async p => { if (fail) throw new Error('Credit required'); return asset(p.passageId); } });
  controller.load(passages, undefined, 1); await controller.play();
  assert.equal(controller.snapshot().status, 'error'); assert.equal(controller.snapshot().index, 1);
  fail = false; await controller.play(); assert.deepEqual(media.played, ['1-v1']);
  controller.dispose();
});
test('seeking while preparing rejects stale completion; pause stops prefetch work', async () => {
  const media = new Media(); const signals: AbortSignal[] = []; let finish!: (value: AudioAsset) => void;
  const controller = new AudioController(media, { get: async (p, signal) => {
    signals.push(signal);
    if (p.passageId === '0') return new Promise(resolve => { finish = resolve; });
    return asset(p.passageId);
  } });
  controller.load(passages); const pending = controller.play(); controller.seek(2); await tick();
  finish(asset('0')); await pending;
  assert.deepEqual(media.played, ['2-v1']); assert(signals[0]!.aborted);
  controller.pause(); assert.equal(controller.snapshot().status, 'paused'); controller.dispose();
});
test('rate and mute modify playback without changing synthesis identity', async () => {
  const media = new Media(); const requests: string[] = [];
  const controller = new AudioController(media, { get: async p => { requests.push(p.passageId); return asset(p.passageId); } });
  controller.load(passages); await controller.play();
  const count = requests.length; controller.setRate(1.5); controller.setMuted(true);
  assert.equal(media.rate, 1.5); assert.equal(media.muted, true); assert.equal(requests.length, count);
  controller.dispose();
});

test('decode failure evicts the corrupt asset so an explicit retry can recover', async () => {
  const media = new Media(); const invalidated: string[] = []; let corrupt = true;
  const originalLoad = media.load.bind(media);
  media.load = async (...args) => { if (corrupt) throw new Error('Cannot decode'); return originalLoad(...args); };
  const controller = new AudioController(media, { get: async p => asset(p.passageId), invalidate: async a => { invalidated.push(a.id); } });
  controller.load(passages); await controller.play();
  assert.equal(controller.snapshot().status, 'error'); assert.deepEqual(invalidated, ['0-v1']);
  corrupt = false; await controller.play(); assert.equal(controller.snapshot().status, 'playing');
  controller.dispose();
});

test('failed prefetch never skips the failed passage or interrupts current audio', async () => {
  const media = new Media();
  const controller = new AudioController(media, { get: async p => { if (p.passageId === '1') throw new Error('Network disconnected'); return asset(p.passageId); } });
  controller.load(passages); await controller.play(); await tick();
  assert.equal(controller.snapshot().status, 'playing');
  media.fire('ended'); await tick();
  assert.equal(controller.snapshot().status, 'error'); assert.equal(controller.snapshot().index, 1);
  assert.deepEqual(media.played, ['0-v1']); controller.dispose();
});
