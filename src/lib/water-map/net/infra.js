import { fetchPacked, fetchJSON } from '../core/assets.js';
import { PointLayer } from './points.js';
import { CAT, DC } from '../core/config.js';

/** National Inventory of Dams (USACE): every dam, sized by its storage. */
/** move points baked beside the lower 48 to where the inset slabs are drawn now */
function moveBaked(slabs, x, z) {
  for (let i = 0; i < x.length; i++) for (const s of slabs) if ((s.move[0] || s.move[1]) && s.containsBaked(x[i], z[i])) { x[i] += s.move[0]; z[i] += s.move[1]; break; }
}

export async function loadDams(shared, slabAt, slabs) {
  const buf = await fetchPacked('dams_nid.dat.png');
  const dv = new DataView(buf);
  const n = dv.getUint32(4, true);
  let o = 8;
  const take = (T, cnt) => { const a = new T(buf.slice(o, o + cnt * T.BYTES_PER_ELEMENT)); o += cnt * T.BYTES_PER_ELEMENT; return a; };
  const x = take(Float32Array, n), z = take(Float32Array, n), stor = take(Float32Array, n);
  if (slabs) moveBaked(slabs, x, z);
  const ht = take(Uint16Array, n), yr = take(Uint16Array, n);
  const pu = take(Uint8Array, n), ty = take(Uint8Array, n), hz = take(Uint8Array, n), sl = take(Uint8Array, n);
  const pm = take(Uint16Array, n), ow = take(Uint8Array, n), fp = take(Uint8Array, n), fl = take(Uint8Array, n);
  const size = new Float32Array(n), dmax = new Float32Array(n), kind = new Uint8Array(n);
  // purposes (bake_dams.py): 0 other, 1 recreation, 2 flood, 3 fire/stock/pond, 4 irrigation, 5 water supply, 6 fish & wildlife, 7 hydro, 8 tailings...
  for (let i = 0; i < n; i++) {
    const s = fl[i] ? 0 : stor[i];
    const l = Math.log10(1 + s);           // 0 .. 8.4 (acre-feet)
    size[i] = Math.min(1, Math.max(0, (l - 1.5) / 5.5));
    dmax[i] = s >= 1e6 ? 900 : s >= 1e5 ? 340 : s >= 1e4 ? 120 : s >= 1e3 ? 48 : s >= 100 ? 26 : 15;
    kind[i] = pu[i] === 7 ? 1 : pu[i] === 5 ? 2 : pu[i] === 4 ? 3 : 0;
  }
  const kinds = [
    { color: '#c9cfd2', shape: 4 },   // other purposes
    { color: '#e9a27a', shape: 4 },   // hydroelectric
    { color: '#86b8ec', shape: 4 },   // water supply
    { color: '#7cc9a2', shape: 4 },   // irrigation
  ];
  const layer = new PointLayer(shared, { n, x, z, kind, size, dmax }, kinds, slabAt, 'dams-nid');
  layer.data = { n, x, z, stor, ht, yr, pu, ty, hz, sl, pm, ow, fp, fl };
  layer.names = null;
  layer.loadNames = async () => {
    if (layer.names || layer._ln) return layer._ln;
    layer._ln = fetchJSON('dams_nid.json').then((j) => { layer.meta = j; layer.names = j.dams; return j; });
    return layer._ln;
  };
  return layer;
}

export const OSM_KINDS = ['water_tower', 'water_works', 'wastewater_plant', 'golf_course', 'data_center'];
export const OSM_LABEL = { water_tower: 'Water tower', water_works: 'Water treatment plant', wastewater_plant: 'Wastewater treatment plant', golf_course: 'Golf course', data_center: 'Data center' };

/** OpenStreetMap water infrastructure, golf courses and data centers. */
export async function loadOsm(shared, slabAt, slabs) {
  const buf = await fetchPacked('osm_points.dat.png');
  const dv = new DataView(buf);
  const n = dv.getUint32(4, true);
  let o = 8;
  const take = (T, cnt) => { const a = new T(buf.slice(o, o + cnt * T.BYTES_PER_ELEMENT)); o += cnt * T.BYTES_PER_ELEMENT; return a; };
  const x = take(Float32Array, n), z = take(Float32Array, n), kind = take(Uint8Array, n), slab = take(Uint8Array, n), county = take(Int16Array, n);
  if (slabs) moveBaked(slabs, x, z);
  const size = new Float32Array(n), dmax = new Float32Array(n);
  const DMAX = [34, 75, 75, 70, 160], SIZE = [0.03, 0.22, 0.20, 0.18, 0.34];
  for (let i = 0; i < n; i++) { size[i] = SIZE[kind[i]]; dmax[i] = DMAX[kind[i]]; }
  const kinds = [
    { color: '#e8dcb4', shape: 3 },   // water tower: ring (pale, like the public supply it holds)
    { color: '#f2cf63', shape: 1 },   // water treatment: square, in the public-supply gold
    { color: '#d2a467', shape: 1 },   // wastewater: square
    { color: CAT.go.color, shape: 0 },   // golf: disc
    { color: DC.color, shape: 2 },       // data center: diamond
  ];
  const layer = new PointLayer(shared, { n, x, z, kind, size, dmax }, kinds, slabAt, 'osm-points');
  layer.data = { n, x, z, kind, slab, county };
  layer.counts = OSM_KINDS.map((_, k) => kind.reduce((s, v) => s + (v === k ? 1 : 0), 0));
  layer.byCounty = new Map();
  for (let i = 0; i < n; i++) { const c = county[i]; if (c < 0) continue; let a = layer.byCounty.get(c); if (!a) layer.byCounty.set(c, (a = [0, 0, 0, 0, 0])); a[kind[i]]++; }
  layer.loadNames = async () => {
    if (layer.names || layer._ln) return layer._ln;
    layer._ln = fetchJSON('osm_points.json').then((j) => { layer.names = j.names; layer.ops = j.ops; return j; });
    return layer._ln;
  };
  return layer;
}

/** every modeled power plant as a dot sized by the water it withdrew: shown nationally when power plants are isolated */
export function plantDots(shared, model, slabAt, color) {
  const P = model.plants.filter((p) => (p.w_env || 0) > 0);
  const n = P.length;
  const x = new Float32Array(n), z = new Float32Array(n), kind = new Uint8Array(n), size = new Float32Array(n), dmax = new Float32Array(n);
  P.forEach((p, i) => { x[i] = p.x; z[i] = p.z; size[i] = 0.72 * Math.min(1, Math.max(0, Math.log10(1 + p.w_env) / 3.4)); dmax[i] = 30; });
  const layer = new PointLayer(shared, { n, x, z, kind, size, dmax }, [{ color, shape: 0 }], slabAt, 'plant-dots');
  layer.plantIndex = P.map((p) => model.plants.indexOf(p));
  return layer;
}
