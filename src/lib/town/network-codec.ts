/** Transport-only encoding. The original graph asset and every reconstructed
 * node, edge, attribute and IEEE-754 coordinate remain unchanged. */
export type PackedNetwork = { format: 'webster-network-delta-v1'; sourceSha256: string; network: Record<string, unknown> & { edges: Record<string, unknown>[] } };
export function unpackNetwork(value: unknown, expectedSha256: string): Record<string, unknown> {
  const packed = value as PackedNetwork;
  if (packed?.format !== 'webster-network-delta-v1' || packed.sourceSha256 !== expectedSha256 || !Array.isArray(packed.network?.edges) || packed.network.edges.length > 10000) throw Error('Road network transport did not match its source.');
  const paths = new Map<number, number[][]>();
  const edges = packed.network.edges.map(edge => {
    const encoded = edge.points; let points: number[][];
    if (Array.isArray(encoded)) {
      if (encoded.length < 6 || encoded.length % 3 || encoded.length > 3000000) throw Error('Invalid encoded road coordinates.');
      points = []; const previous = [0, 0, 0];
      for (let i = 0; i < encoded.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
          const delta = encoded[i + axis];
          if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(previous[axis] + delta)) throw Error('Invalid encoded road coordinate.');
          previous[axis] += delta;
        }
        points.push(previous.map(value => value / 10000));
      }
    } else {
      const reverse = encoded as { reverse?: unknown }, original = typeof reverse?.reverse === 'number' ? paths.get(reverse.reverse) : undefined;
      if (!original) throw Error('Invalid reversed road reference.');
      points = original.map(point => [...point]).reverse();
    }
    if (!Number.isSafeInteger(edge.id) || paths.has(edge.id as number)) throw Error('Invalid encoded road identity.');
    paths.set(edge.id as number, points); return { ...edge, points };
  });
  return { ...packed.network, edges };
}
