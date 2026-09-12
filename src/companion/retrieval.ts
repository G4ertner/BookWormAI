import type { Action, ReaderContext, Source, Step } from './types.ts';
export function eligible(sources: Source[], context: ReaderContext): Source[] {
  return sources.filter(s => s.kind === 'book' && (context.scope === 'whole' || s.order! <= context.boundary));
}
const words = (text: string) => [...new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
const stop = new Set(['the', 'this', 'that', 'what', 'where', 'when', 'with', 'from', 'does', 'have', 'was', 'and', 'who', 'did']);
export function bookTool(action: Action, sources: Source[], context: ReaderContext): Step {
  const pool = eligible(sources, context);
  let found: Source[] = [];
  if (action.name === 'read_passages') found = pool.filter(s => action.ids.includes(s.id)).slice(0, 4);
  if (action.name === 'search_book') {
    const terms = words(action.query).filter(t => !stop.has(t));
    found = pool.map(s => { const text = s.text.toLocaleLowerCase(); return { s, score: terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0) + (text.includes(action.query.toLocaleLowerCase()) ? 3 : 0) }; })
      .filter(v => v.score > 0).sort((a, b) => b.score - a.score || a.s.order! - b.s.order!).slice(0, 5).map(v => v.s);
  }
  return { action, sources: found, notice: found.length ? '' : 'No matching passages were found in the allowed reading scope. Try different terms; this does not prove the book has no such passage.' };
}
