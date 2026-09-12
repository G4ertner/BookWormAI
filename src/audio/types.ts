/** UI- and platform-independent integration contract. IDs belong to the book importer. */
export interface Passage {
  bookId: string;
  chapterId: string;
  passageId: string;
  text: string;
}
export interface NarrationProfile { id: string; model: string; voice: string | null }
export interface AudioAsset {
  key: string;
  id: string;
  blob: Blob;
  generationId?: string;
}
export interface Position {
  bookId: string;
  chapterId: string;
  passageId: string;
  assetKey: string;
  assetId: string;
  offsetMs: number;
  updatedAt: number;
}
export interface AudioState {
  status: 'idle' | 'preparing' | 'playing' | 'paused' | 'ended' | 'error';
  index: number;
  offsetMs: number;
  durationMs: number;
  error?: string;
  notice?: string;
}
export interface MediaPort {
  load(asset: AudioAsset, offsetMs: number, signal: AbortSignal): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  reset(): void;
  setRate(rate: number): void;
  setMuted(muted: boolean): void;
  time(): { offsetMs: number; durationMs: number };
  on(event: 'time' | 'ended' | 'error', callback: () => void): () => void;
}
export interface AssetRepository {
  get(passage: Passage, signal: AbortSignal): Promise<AudioAsset>;
  invalidate?(asset: AudioAsset): Promise<void>;
}

export const MODEL = 'fish-audio/s2.1-pro-free:free';
export const MAX_PASSAGE_BYTES = 2400; // Deliberate app cap, not a provider-limit claim.

export function splitPassage(text: string, maxBytes = MAX_PASSAGE_BYTES): string[] {
  if (maxBytes < 4) throw new Error('Passage byte limit must be at least four.');
  const encoder = new TextEncoder();
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (!normalized) return [];
  const sentences = [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(normalized)]
    .map(s => s.segment.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (encoder.encode(sentence).length > maxBytes) {
      if (current) { chunks.push(current); current = ''; }
      // Split oversized sentences at words, and exceptionally at Unicode code points.
      for (const word of sentence.split(' ')) {
        if (encoder.encode(word).length > maxBytes) {
          if (current) { chunks.push(current); current = ''; }
          for (const char of word) {
            if (encoder.encode(current + char).length > maxBytes) { chunks.push(current); current = ''; }
            current += char;
          }
        } else {
          const next = current ? `${current} ${word}` : word;
          if (encoder.encode(next).length > maxBytes) { chunks.push(current); current = word; }
          else current = next;
        }
      }
    } else {
      const next = current ? `${current} ${sentence}` : sentence;
      if (encoder.encode(next).length > maxBytes) { chunks.push(current); current = sentence; }
      else current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
