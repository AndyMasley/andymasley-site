import catalog from '../../../data/derived/town/network-transfer.json';
import release from '../../../data/derived/town/release.json';
import { unpackNetwork } from './network-codec';
export function networkTransferURL(source: string): string | undefined {
  if (catalog.sourceManifestSha256 !== release.manifestSha256 || catalog.directory !== release.directory) return;
  let url: URL; try { url = new URL(source, typeof location === 'object' ? location.href : undefined); } catch { return; }
  if (url.pathname !== `/town-assets/${release.directory}/network.json`) return;
  return new URL(catalog.url, url).href;
}
export const decodeNetworkTransfer = (value: unknown): Record<string, unknown> => unpackNetwork(value, catalog.sourceSha256);
/** Check actual transport bytes before decoding, including hosts that have
 * already removed Content-Encoding. Header claims alone are insufficient. */
export async function validNetworkTransferBytes(bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return false;
  const expected = bytes[0] === 31 && bytes[1] === 139 ? catalog.sha256 : catalog.decodedSha256;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') === expected;
}
