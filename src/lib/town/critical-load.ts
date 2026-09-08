import { compressedJsonURL } from './json-transfer';
import { networkTransferURL, decodeNetworkTransfer, validNetworkTransferBytes } from './network-transfer';

export type LoadProgress = { receivedBytes: number; totalBytes?: number };
export type CriticalLoadOptions = { label?: string; timeoutMs?: number; onProgress?: (progress: LoadProgress) => void };

/** A deadline covers headers AND body. Even a reader that ignores abort releases
 * its caller; late results must never be adopted by a destroyed game. */
export async function withLoadDeadline<T>(
  parent: AbortSignal, read: (signal: AbortSignal) => Promise<T>,
  options: Pick<CriticalLoadOptions, 'label' | 'timeoutMs'> = {},
  discardLate?: (value: T) => void,
): Promise<T> {
  const controller = new AbortController();
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStop!: (error: Error) => void;
  const stop = new Promise<never>((_, reject) => { rejectStop = reject; });
  const cancel = (error: Error) => { if (stopped) return; stopped = true; controller.abort(); rejectStop(error); };
  const abort = () => cancel(new DOMException('Loading cancelled', 'AbortError'));
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  else timer = setTimeout(() => cancel(new Error(`${options.label ?? 'Town data'} is taking longer to load. Check your connection and try again.`)), options.timeoutMs ?? 25000);
  const pending = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
    return read(controller.signal);
  }).then(value => { if (stopped) discardLate?.(value); return value; });
  try { return await Promise.race([pending, stop]); }
  finally { if (timer) clearTimeout(timer); parent.removeEventListener('abort', abort); }
}

export function readCriticalJson<T>(url: string, signal: AbortSignal, options: CriticalLoadOptions = {}): Promise<T> {
  return withLoadDeadline(signal, async requestSignal => {
    let transferred = 0;
    const read = async (source: string, encoded: boolean, network = false, transportSignal = requestSignal): Promise<T> => {
      const response = await fetch(source, { signal: transportSignal });
      if (!response.ok) throw new Error(`${options.label ?? 'Town data'} could not load (${response.status}). Please try again.`);
      const length = Number(response.headers.get('content-length'));
      const totalBytes = !transferred && !response.headers.get('content-encoding') && length > 0 ? length : undefined;
      let text: string;
      if (encoded || response.body && options.onProgress) {
        const reader = response.body?.getReader(), decoder = new TextDecoder();
        const strings: string[] = [], buffers: Uint8Array<ArrayBuffer>[] = [];
        let receivedBytes = 0;
        try {
          if (reader) for (;;) {
            const { done, value } = await reader.read();
            if (transportSignal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
            if (done) break;
            receivedBytes += value.byteLength;
            if (encoded) buffers.push(value); else strings.push(decoder.decode(value, { stream: true }));
            options.onProgress?.({ receivedBytes: transferred + receivedBytes, totalBytes });
          }
          else { const value = new Uint8Array(await response.arrayBuffer()); buffers.push(value); receivedBytes = value.length; options.onProgress?.({ receivedBytes: transferred + receivedBytes, totalBytes }); }
          transferred += receivedBytes;
          if (encoded) {
            const bytes = new Uint8Array(receivedBytes); let offset = 0;
            for (const part of buffers) { bytes.set(part, offset); offset += part.length; }
            if (network && !await validNetworkTransferBytes(bytes)) throw new Error('Compact road transport checksum did not match.');
            // Hosting may already decode Content-Encoding; inspect bytes first.
            text = bytes[0] === 31 && bytes[1] === 139
              ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
              : decoder.decode(bytes);
          } else { strings.push(decoder.decode()); text = strings.join(''); }
        } finally { if (reader) { if (transportSignal.aborted) void reader.cancel().catch(() => {}); reader.releaseLock(); } }
      } else text = await response.text();
      if (transportSignal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
      try { const parsed = JSON.parse(text); return (network ? decodeNetworkTransfer(parsed) : parsed) as T; }
      catch { throw new Error(`${options.label ?? 'Town data'} was incomplete or invalid. Please try again.`); }
    };
    const compressed = typeof DecompressionStream === 'function' ? compressedJsonURL(url) : undefined;
    const network = typeof DecompressionStream === 'function' ? networkTransferURL(url) : undefined;
    if (network) {
      try { return await withLoadDeadline(requestSignal, signal => read(network, true, true, signal), { label: 'Compact road transport', timeoutMs: 8000 }); }
      catch (error) { if (requestSignal.aborted || error instanceof DOMException && error.name === 'AbortError') throw error; }
    }
    if (compressed) {
      try { return await read(compressed, true); }
      catch (error) { if (requestSignal.aborted || error instanceof DOMException && error.name === 'AbortError') throw error; }
    }
    return read(url, false);
  }, options);
}
