import version from '../../../data/derived/town/runtime-version.json';
import { withLoadDeadline } from './critical-load';

/** Invoked only by explicit recovery; no startup dependency or polling loop. */
export async function checkTownUpdate(signal: AbortSignal): Promise<'same' | 'new' | 'unavailable'> {
  try {
    return await withLoadDeadline(signal, async requestSignal => {
      const response = await fetch('/town-version.json', { signal: requestSignal, cache: 'no-store' });
      if (!response.ok) return 'unavailable';
      const current = await response.json() as { version?: number; runtimeSha256?: string };
      if (current.version !== 1 || !/^[a-f0-9]{64}$/.test(current.runtimeSha256 ?? '')) return 'unavailable';
      return current.runtimeSha256 === version.runtimeSha256 ? 'same' : 'new';
    }, { timeoutMs: 3000 });
  } catch { return 'unavailable'; }
}
