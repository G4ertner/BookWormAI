export const OPENAI_VOICES = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'] as const;
export type ProviderId = 'openrouter' | 'openai';
export interface AudioSelection { provider: ProviderId; voice: string }
export interface AudioSettings { keyStorage?: 'local' | 'session'; selection: AudioSelection; keys: Record<ProviderId, boolean> }
