import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SpeechError } from './speech.ts';

/** An explicit empty saved key disables the environment fallback after removal. */
export async function loadApiKey(path: string, fallback: string): Promise<string> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as { apiKey?: unknown };
    if (typeof value.apiKey !== 'string') throw new Error();
    return value.apiKey;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new Error('Saved audio settings could not be read. Check the local settings file.');
  }
}
export function validateApiKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{20,512}$/.test(value.trim()))
    throw new SpeechError('INVALID_KEY', 'Enter an API key without spaces (20–512 characters).', 400);
  return value.trim();
}
export async function saveApiKey(path: string, apiKey: string): Promise<void> {
  return saveSettingsFile(path, { apiKey });
}
export async function saveSettingsFile(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } catch {
    throw new SpeechError('KEY_SAVE_FAILED', 'The local server could not save the key. Check its settings-folder permissions.', 500);
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}
