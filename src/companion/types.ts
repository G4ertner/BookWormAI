export const COMPANION_MODEL = 'google/gemini-2.5-flash';
export interface Source { id: string; kind: 'book' | 'web'; title: string; text: string; order?: number; url?: string }
export interface ReaderContext { bookId: string; title: string; author: string; sample: boolean; boundary: number; scope: 'position' | 'whole'; current: Source; selection: string }
export interface Answer { blocks: { kind: 'book' | 'interpretation' | 'background'; text: string; citations: { id: string; quote: string }[] }[]; followUp: string }
export type Action = { name: 'search_book'; query: string } | { name: 'read_passages'; ids: string[] } | { name: 'search_web'; query: string };
export interface Step { action: Action; sources: Source[]; notice: string }
export interface Turn { context: ReaderContext; question: string; history: { question: string; answer: string }[]; steps: Step[]; allowWeb: boolean }
export type Reply = { action: Action } | { answer: Answer };
export class CompanionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CompanionError('INVALID_REQUEST', 'Expected a companion request object.');
  return value as Record<string, unknown>;
}
export function bounded(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new CompanionError('INVALID_REQUEST', 'The companion request contains invalid or oversized text.');
  return value;
}
export function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new CompanionError('INVALID_REQUEST', 'The companion request exceeds its item limit.');
  return value;
}
export function safeUrl(value: unknown): string {
  const url = new URL(bounded(value, 2000));
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)) throw new CompanionError('INVALID_SOURCE', 'An external source address was invalid.');
  return url.href;
}
export function source(value: unknown): Source {
  const v = record(value);
  const base = { id: bounded(v.id, 100), title: bounded(v.title, 250), text: bounded(v.text, 2200) };
  if (v.kind === 'web' && base.id.startsWith('w:')) return { ...base, kind: 'web', url: safeUrl(v.url) };
  if (v.kind === 'book' && /^b:\d+:\d+:\d+$/.test(base.id) && Number.isSafeInteger(v.order) && Number(v.order) >= 0) return { ...base, kind: 'book', order: Number(v.order) };
  throw new CompanionError('INVALID_SOURCE', 'The companion source is invalid.');
}
export function action(value: unknown): Action {
  const v = record(value);
  if (v.name === 'search_book' || v.name === 'search_web') return { name: v.name, query: bounded(v.query, 300) };
  if (v.name === 'read_passages') return { name: v.name, ids: list(v.ids, 4).map(id => bounded(id, 100)) };
  throw new CompanionError('INVALID_ACTION', 'The companion requested an unsupported action.');
}
export function validateTurn(value: unknown): Turn {
  const v = record(value), c = record(v.context);
  if (!Number.isSafeInteger(c.boundary) || Number(c.boundary) < 0 || !['position', 'whole'].includes(String(c.scope)) || typeof v.allowWeb !== 'boolean' || typeof c.sample !== 'boolean') throw new CompanionError('INVALID_REQUEST', 'The reading scope is invalid.');
  const current = source(c.current);
  const context: ReaderContext = { bookId: bounded(c.bookId, 120), title: bounded(c.title, 250), author: bounded(c.author, 250, true), sample: c.sample, boundary: Number(c.boundary), scope: c.scope as ReaderContext['scope'], current, selection: bounded(c.selection, 1600, true) };
  if (current.kind !== 'book' || current.order !== context.boundary || (context.selection && !current.text.includes(context.selection))) throw new CompanionError('INVALID_SCOPE', 'Select text within the current passage.');
  const steps: Step[] = list(v.steps, 2).map(item => { const s = record(item); return { action: action(s.action), sources: list(s.sources, 5).map(source), notice: bounded(s.notice, 300, true) }; });
  const seen = new Map<string, string>([[current.id, JSON.stringify(current)]]);
  let webSearches = 0;
  for (const step of steps) {
    if (step.action.name === 'search_web' && (!v.allowWeb || ++webSearches > 1)) throw new CompanionError('INVALID_ACTION', 'Web search is not enabled or was already used.');
    for (const s of step.sources) {
      if ((step.action.name === 'search_web') !== (s.kind === 'web')) throw new CompanionError('INVALID_SOURCE', 'Source type does not match the requested tool.');
      if (s.kind === 'book' && context.scope === 'position' && s.order! > context.boundary) throw new CompanionError('INVALID_SCOPE', 'The requested passage is beyond your reading boundary.');
      if (seen.has(s.id) && seen.get(s.id) !== JSON.stringify(s)) throw new CompanionError('INVALID_SOURCE', 'Conflicting source identifiers.');
      seen.set(s.id, JSON.stringify(s));
    }
  }
  return { context, question: bounded(v.question, 1200), history: list(v.history, 4).map(item => { const h = record(item); return { question: bounded(h.question, 1200), answer: bounded(h.answer, 4000) }; }), steps, allowWeb: v.allowWeb };
}
export function sourcesFor(turn: Turn): Source[] { return [turn.context.current, ...turn.steps.flatMap(step => step.sources)]; }
export function validateAnswer(value: unknown, sources: Source[]): Answer {
  const v = record(value), allowed = new Map(sources.map(s => [s.id, s]));
  const blocks = list(v.blocks, 5).map(item => {
    const b = record(item);
    if (!['book', 'interpretation', 'background'].includes(String(b.kind))) throw new CompanionError('INVALID_ANSWER', 'The companion returned an invalid answer.', 502);
    const citations = list(b.citations, 4).map(item => {
      const c = record(item), id = bounded(c.id, 100), quote = bounded(c.quote, 400), s = allowed.get(id);
      if (!s || !s.text.includes(quote) || (b.kind === 'book' && s.kind !== 'book')) throw new CompanionError('INVALID_CITATION', 'The companion could not verify its quotation. Please try a more specific question.', 502);
      return { id, quote };
    });
    if (b.kind === 'book' && !citations.length) throw new CompanionError('INVALID_CITATION', 'The companion did not support its book claim with a passage. Please retry.', 502);
    return { kind: b.kind as Answer['blocks'][number]['kind'], text: bounded(b.text, 1200), citations };
  });
  if (!blocks.length || blocks.reduce((n, b) => n + b.text.length, 0) > 3500) throw new CompanionError('INVALID_ANSWER', 'The companion answer was empty or too long.', 502);
  return { blocks, followUp: bounded(v.followUp, 300, true) };
}
