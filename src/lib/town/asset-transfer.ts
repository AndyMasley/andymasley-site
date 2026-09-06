import release from '../../../data/derived/town/release.json';

/** Alternate encoding of the same immutable GLB, without changing its source URL. */
export function compressedSceneURL(rawURL: string): string | undefined {
  const url = new URL(rawURL);
  const prefix = `/town-assets/${release.directory}/`;
  if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith('.glb')) return;
  url.pathname = `/town-transfer/gzip-v1/${release.directory}/${url.pathname.slice(prefix.length)}.gz`;
  return url.href;
}

const isGLB = (buffer: ArrayBuffer): boolean => new Uint8Array(buffer).subarray(0, 4).every((v, i) => v === [103, 108, 84, 70][i]) && buffer.byteLength >= 12;

/** Decode lossless transport compression locally; raw scenery remains the fallback. */
export async function readSceneBuffer(url: string, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<ArrayBuffer> {
  const read = async (source: string): Promise<ArrayBuffer> => {
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error(`Scenery could not load (${response.status}).`);
    const data = await response.arrayBuffer();
    onBytes(Number(response.headers.get('content-length')) || data.byteLength);
    if (signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
    return data;
  };
  const compressed = typeof DecompressionStream === 'function' ? compressedSceneURL(url) : undefined;
  if (compressed) {
    try {
      const payload = await read(compressed);
      // A host may already decode a Content-Encoding response for fetch().
      if (isGLB(payload)) return payload;
      const decoded = await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if (signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
      if (!isGLB(decoded)) throw new Error('Compressed scenery did not decode to a GLB.');
      return decoded;
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
  }
  return read(url);
}
