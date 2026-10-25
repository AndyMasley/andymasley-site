// The lower-48 conic equal-area projection of the scene (d3 geoAlbers as fitted for the county map), so places given
// in longitude/latitude can be put on the model.
const D2R = Math.PI / 180;
const K = 1240.583314171773, TX = 528.2480705172319, TY = 315.4452552440835;
function conicEA(rotLon, center, parallels, k, translate) {
  const l0 = -rotLon;
  const p1 = parallels[0] * D2R, p2 = parallels[1] * D2R;
  const sy0 = Math.sin(p1);
  const n = (sy0 + Math.sin(p2)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;
  const raw = (lam, phi) => { const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n; return [r * Math.sin(lam * n), r0 - r * Math.cos(lam * n)]; };
  const [cx, cy] = raw(center[0] * D2R, center[1] * D2R);
  const tx = translate[0] - k * cx, ty = translate[1] + k * cy;
  return (lon, lat) => { let lam = lon - l0; lam = ((lam + 180) % 360 + 360) % 360 - 180; const [x, y] = raw(lam * D2R, lat * D2R); return [tx + k * x, ty - k * y]; };
}
export const projectLower48 = conicEA(96, [-0.6, 38.7], [29.5, 45.5], K, [TX, TY]);
