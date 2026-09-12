import { action, list, record, source, sourcesFor, validateAnswer, validateTurn } from './types.ts';
import type { Answer, ReaderContext, Source, Turn } from './types.ts';
import { bookTool } from './retrieval.ts';
export interface Discussion { question: string; answer: Answer; sources: Source[]; boundary: number; notice?: string }
export async function companionRequest(path: string, body: unknown, signal: AbortSignal, method = 'POST'): Promise<unknown> {
  const payload = JSON.stringify(body);
  if (new TextEncoder().encode(payload).length > 65536) throw new Error('This discussion is too long. Clear older discussion or shorten the question.');
  const response = await fetch(`/api/companion/${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' }, body: payload, signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'The companion could not complete this request.');
  return result;
}
export async function discuss(context: ReaderContext, pool: Source[], question: string, history: Discussion[], allowWeb: boolean, signal: AbortSignal, status: (message: string) => void, request = companionRequest): Promise<Discussion> {
  const turn: Turn = { context, question, allowWeb, steps: [], history: history.filter(h => context.scope === 'whole' || h.boundary <= context.boundary).slice(-4).map(h => ({ question: h.question, answer: h.answer.blocks.map(b => b.text).join('\n') })) };
  for (let round = 0; round < 3; round++) {
    signal.throwIfAborted(); validateTurn(turn);
    status(round ? 'Connecting the evidence…' : 'Reading with you…');
    const reply = record(await request('turn', turn, signal)); signal.throwIfAborted();
    if (reply.answer) return { question, answer: validateAnswer(reply.answer, sourcesFor(turn)), sources: [...new Map(sourcesFor(turn).map(s => [s.id, s])).values()], boundary: context.boundary, notice: turn.steps.find(s => s.action.name === 'search_web' && s.notice)?.notice };
    if (round === 2) throw new Error('The companion reached its search limit. Please narrow your question.');
    const next = action(reply.action);
    if (next.name === 'search_web') {
      if (!allowWeb || turn.steps.some(s => s.action.name === 'search_web')) throw new Error('Outside research is not enabled or has already been used for this question.');
      status(`Looking outside the book: ${next.query}`);
      try {
        const result = record(await request('search', { query: next.query, allowWeb: true }, signal));
        turn.steps.push({ action: next, sources: list(result.sources, 4).map(source), notice: '' });
      } catch (error) {
        signal.throwIfAborted();
        turn.steps.push({ action: next, sources: [], notice: 'Outside research failed. Do not claim web verification. Tell the reader: ' + (error instanceof Error ? error.message.slice(0, 180) : 'Search unavailable.') });
      }
    } else {
      status(next.name === 'search_book' ? 'Finding passages in your book…' : 'Checking the cited passages…');
      turn.steps.push(bookTool(next, pool, context));
    }
  }
  throw new Error('The companion could not finish this discussion.');
}
