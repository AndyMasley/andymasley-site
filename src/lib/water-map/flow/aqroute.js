/**
 * The mapped aqueducts (features.aqueducts, from OpenStreetMap) as a graph, so a water system's route between counties
 * can follow the aqueduct it actually takes instead of a straight line between its waypoints. OpenStreetMap maps an
 * aqueduct in many short pieces, not always in order and sometimes with gaps, so pieces whose ends lie close together
 * are joined, and the gaps left between the pieces of one aqueduct are bridged, shortest first.
 */

const SNAP = 0.15;   // world units: ends of two pieces this close are one junction
const GAP = 2.5;     // the longest gap bridged between two pieces of one aqueduct

export function aqGraph(aqueducts) {
  const pts = [], adj = [];
  const grid = new Map(), cell = (x, z) => `${Math.floor(x / SNAP)},${Math.floor(z / SNAP)}`;
  const add = (x, z) => { const i = pts.length; pts.push([x, z]); adj.push([]); const k = cell(x, z); (grid.get(k) || grid.set(k, []).get(k)).push(i); return i; };
  const linked = (i, j) => adj[i].some((e) => e[0] === j);
  const link = (i, j) => { if (i === j || linked(i, j)) return; const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); adj[i].push([j, d]); adj[j].push([i, d]); };
  const near = (x, z, r) => {
    const out = [], cx = Math.floor(x / SNAP), cz = Math.floor(z / SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(`${cx + dx},${cz + dz}`) || []) if (Math.hypot(pts[j][0] - x, pts[j][1] - z) <= r) out.push(j);
    return out;
  };
  const ends = [];
  for (const a of aqueducts || []) {
    if (a.kind !== 'aqueduct') continue;
    const i0 = pts.length, mine = [];
    for (const sg of a.segs) {
      let prev = -1;
      for (let k = 0; k + 1 < sg.p.length; k += 2) {
        const i = add(sg.p[k], sg.p[k + 1]);
        if (prev >= 0) link(prev, i);
        if (k === 0 || k + 2 >= sg.p.length) { ends.push(i); mine.push(i); }
        prev = i;
      }
    }
    for (const i of mine) for (const j of near(pts[i][0], pts[i][1], SNAP)) if (j >= i0) link(i, j);
    // the pieces of this aqueduct that still do not meet: bridge the shortest gaps between them, as a spanning tree
    const n = pts.length - i0, comp = new Int32Array(n).fill(-1);
    let nc = 0;
    for (let s = 0; s < n; s++) if (comp[s] < 0) {
      const st = [s]; comp[s] = nc;
      while (st.length) { const u = st.pop(); for (const [v] of adj[u + i0]) if (v >= i0 && comp[v - i0] < 0) { comp[v - i0] = nc; st.push(v - i0); } }
      nc++;
    }
    if (nc > 1) {
      const cand = [];
      for (let p = 0; p < mine.length; p++) for (let q = p + 1; q < mine.length; q++) {
        const e = mine[p], f = mine[q]; if (comp[e - i0] === comp[f - i0]) continue;
        const d = Math.hypot(pts[e][0] - pts[f][0], pts[e][1] - pts[f][1]);
        if (d < GAP) cand.push([d, e, f]);
      }
      cand.sort((x, y) => x[0] - y[0]);
      const up = Array.from({ length: nc }, (_, k) => k), find = (k) => (up[k] === k ? k : (up[k] = find(up[k])));
      for (const [, e, f] of cand) { const ce = find(comp[e - i0]), cf = find(comp[f - i0]); if (ce !== cf) { up[ce] = cf; link(e, f); } }
    }
  }
  // where two aqueducts meet (at a reservoir both run to), their ends join too
  for (const i of ends) for (const j of near(pts[i][0], pts[i][1], SNAP)) link(i, j);
  return { pts, adj };
}

/**
 * The way along the mapped aqueducts from near point a to near point b (both within `reach` world units of an
 * aqueduct), as a list of points from a to b; null when no mapped aqueduct joins them, or the way round is more than
 * `slack` times the straight distance.
 */
export function aqPath(g, a, b, reach = 1.0, slack = 1.6) {
  if (!g || !g.pts.length) return null;
  const { pts, adj } = g;
  const x0 = Math.min(a[0], b[0]) - 3, x1 = Math.max(a[0], b[0]) + 3, z0 = Math.min(a[1], b[1]) - 3, z1 = Math.max(a[1], b[1]) + 3;
  let ia = -1, ib = -1, da = reach, db = reach;
  const live = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; if (p[0] < x0 || p[0] > x1 || p[1] < z0 || p[1] > z1) continue;
    live.push(i);
    const d1 = Math.hypot(p[0] - a[0], p[1] - a[1]), d2 = Math.hypot(p[0] - b[0], p[1] - b[1]);
    if (d1 < da) { da = d1; ia = i; }
    if (d2 < db) { db = d2; ib = i; }
  }
  if (ia < 0 || ib < 0 || ia === ib) return null;
  // Dijkstra over the aqueduct points near the two ends
  const inBox = new Set(live), dist = new Map([[ia, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let u = -1, du = Infinity;
    for (const [k, v] of dist) if (!done.has(k) && v < du) { du = v; u = k; }
    if (u < 0 || u === ib) break;
    done.add(u);
    for (const [v, w] of adj[u]) {
      if (!inBox.has(v) || done.has(v)) continue;
      const nd = du + w;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); }
    }
  }
  if (!dist.has(ib)) return null;
  const straight = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (da + dist.get(ib) + db > slack * straight + 1) return null;
  const path = [];
  for (let v = ib; v !== undefined; v = prev.get(v)) { path.push(pts[v]); if (v === ia) break; }
  path.reverse();
  return [a, ...path, b];
}
