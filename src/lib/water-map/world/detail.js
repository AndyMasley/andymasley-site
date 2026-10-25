/**
 * Close-range ground detail for the terrain shader. Up close the land cover comes from NLCD (about 262 m per class
 * pixel on the lower 48, warped along organic boundaries); finer than that the shader paints plausible texture driven
 * by the data: fields in the public-land survey's mile grid, each county's irrigated acreage split by method
 * (center-pivot sprinklers, drip, flood), forest canopy, city blocks. The patterns are illustrative; where they are
 * and how dense they are follows the data.
 */
export const DETAIL_GLSL = /* glsl */`
uniform sampler2D uLand;        // r developed intensity, g cropland, b tree cover, a irrigated land (0..1)
uniform sampler2D uCountyData;  // per county: r sprinkler share, g drip share, b flood share, a irrigated fraction of land
uniform vec2 uApex;             // apex of the lower-48 Albers cone: meridians radiate from it
uniform float uGrid;            // 1 on the lower-48 slab
uniform float uDetailAmt;       // 0 far away .. 1 close
uniform float uTime2;

float dh12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 dh22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float dnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(dh12(i), dh12(i + vec2(1, 0)), f.x), mix(dh12(i + vec2(0, 1)), dh12(i + vec2(1, 1)), f.x), f.y);
}
vec4 countyDataAt(float cid) {
  if (cid < 0.0) return vec4(0.0);
  vec2 uv = (vec2(mod(cid, 64.0), floor(cid / 64.0)) + 0.5) / 64.0;
  return texture2D(uCountyData, uv);
}
// survey coordinates: x east-west, y north-south, world units, aligned with the meridians
vec2 surveyCoords(vec2 p) {
  if (uGrid < 0.5) return p;
  vec2 d = p - uApex;
  float r = length(d);
  float th = atan(d.x, d.y);
  return vec2(th * 1580.0, r);
}
const vec3 LUMW = vec3(0.2126, 0.7152, 0.0722);
// the mix of class colours a colour-texture pixel averages over, estimated from the land weights (for relief shading)
vec3 landMixAlbedo(vec4 land) {
  float dev = clamp(land.r, 0.0, 1.0), crop = clamp(land.g, 0.0, 1.0), tree = clamp(land.b, 0.0, 1.0);
  float rest = max(0.0, 1.0 - dev * 1.4 - crop - tree);
  return dev * 1.4 * vec3(0.215, 0.200, 0.180) + crop * vec3(0.220, 0.262, 0.088) + tree * vec3(0.062, 0.115, 0.040) + rest * vec3(0.385, 0.300, 0.150);
}
// colour of the ground with small-scale detail; base is the albedo from the colour texture (linear). cls is the NLCD
// class here (or -1 when no close-up tile is loaded)
vec3 groundDetail(vec3 base, vec2 p, vec4 land, vec4 cdat, float amt, float pxw, float cls) {
  // irrigated land is greener in summer: a tint that shows the irrigated acreage at every zoom
  float irr0 = land.a;
  base = mix(base, base * vec3(0.78, 1.12, 0.62) + vec3(0.0, 0.012, 0.0), clamp(irr0 * 0.55, 0.0, 0.55));
  if (amt <= 0.001) return base;
  // relief shading baked into the colour texture: its brightness relative to the land it averages
  float shadeK = clamp(dot(base, LUMW) / max(1e-3, dot(landMixAlbedo(land), LUMW)), 0.35, 2.4);
  if (cls > 0.5) {
    vec3 a = nlcdAlbedo(cls);
    int k = int(cls);
    float irrHere = (k == 18 || k == 17) ? clamp(irr0 * 1.6, 0.0, 1.0) : 0.0;
    a = mix(a, a * vec3(0.78, 1.15, 0.62) + vec3(0.0, 0.015, 0.0), irrHere * 0.5);
    base = mix(base, a * shadeK, amt);
    land = vec4(nlcdDev(cls), k == 18 ? 1.0 : k == 17 ? 0.6 : 0.0, (k >= 8 && k <= 10) || k == 19 ? 1.0 : 0.0, irr0);
  }
  vec2 q = surveyCoords(p);
  const float QS = 0.15667;                 // a quarter section (half a mile) in world units
  vec2 cq = q / QS, cell = floor(cq), f = fract(cq);
  float h = dh12(cell), h2 = dh12(cell + 17.0);
  float urban = land.r, crop = land.g, forest = land.b, irr = land.a;
  vec3 col = base;
  // pattern visibility from pixel footprint (avoid shimmer when a field is only a few pixels wide)
  float fieldVis = amt * (1.0 - smoothstep(QS / 7.0, QS / 3.0, pxw));
  // --- farmland: fields of different crops in the mile grid, with section-line roads
  float farm = clamp(crop * 1.2 + (cls > 0.5 ? 0.0 : irr), 0.0, 1.0) * (1.0 - clamp(urban * 1.6, 0.0, 1.0)) * (1.0 - forest * 0.8);
  if (farm > 0.02 && fieldVis > 0.0) {
    bool hay = int(cls) == 17;
    vec3 wheat = vec3(0.42, 0.33, 0.16), green = vec3(0.17, 0.27, 0.08), fallow = vec3(0.30, 0.23, 0.15), hayc = vec3(0.27, 0.30, 0.12);
    vec3 fc = hay ? (h < 0.5 ? hayc : vec3(0.20, 0.27, 0.09)) : (h < 0.3 ? wheat : h < 0.55 ? green : h < 0.75 ? hayc : fallow);
    vec3 fieldCol = mix(base, fc * (0.85 + 0.3 * h2) * shadeK, 0.55);
    // irrigation by method in this county: pivots (sprinkler), orchards and vineyards (drip), furrows (flood)
    float pIrr = clamp(irr * 1.15, 0.0, 1.0);
    float r = dh12(cell + 3.7);
    float tot = max(1e-3, cdat.r + cdat.g + cdat.b);
    if (r < pIrr) {
      float m = dh12(cell + 9.1) * tot;
      vec3 lush = vec3(0.12, 0.30, 0.06) * (0.9 + 0.25 * h2) * shadeK;
      if (m < cdat.r) {
        // centre pivot: a green disc in the quarter section, dry corners, a slowly turning arm
        vec2 c = f - 0.5; float d = length(c);
        float disc = 1.0 - smoothstep(0.44, 0.47, d);
        vec3 dry = mix(base, vec3(0.36, 0.29, 0.19) * shadeK, 0.6);
        fieldCol = mix(dry, lush, disc);
        fieldCol *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.015, abs(d - 0.455)));
        float ang = atan(c.y, c.x), arm = mod(ang - uTime2 * (0.05 + 0.05 * h) + 6.2832 * h, 6.2832);
        fieldCol = mix(fieldCol, vec3(0.75, 0.76, 0.72), disc * (1.0 - smoothstep(0.0, 0.03, arm)) * step(0.04, d) * 0.6);
      } else if (m < cdat.r + cdat.g) {
        // orchard or vineyard rows
        vec2 g = fract(f * vec2(22.0, 22.0)) - 0.5;
        float tree = 1.0 - smoothstep(0.18, 0.32, length(g));
        fieldCol = mix(mix(base, vec3(0.33, 0.27, 0.17), 0.5), vec3(0.09, 0.19, 0.05), tree * 0.85);
      } else {
        // flood or furrow irrigation: long parallel rows
        float rows = 0.5 + 0.5 * sin(f.x * 120.0);
        fieldCol = lush * (0.85 + 0.25 * rows);
      }
    }
    // roads along the section lines (every mile) and faint field edges
    vec2 sq = fract(q / (2.0 * QS));
    float road = 1.0 - smoothstep(0.004, 0.012, min(min(sq.x, 1.0 - sq.x), min(sq.y, 1.0 - sq.y)));
    float edge = 1.0 - smoothstep(0.006, 0.02, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    fieldCol = mix(fieldCol, fieldCol * 0.82, edge * 0.6);
    fieldCol = mix(fieldCol, vec3(0.40, 0.38, 0.34) * clamp(shadeK, 0.6, 1.4), road * 0.55);
    col = mix(col, fieldCol, farm * fieldVis);
  }
  // --- forest canopy: stands and gaps from afar, crowns up close
  if (forest > 0.05) {
    float far = amt * (1.0 - smoothstep(0.03, 0.12, pxw));
    float stands = dnoise(p * 38.0) * 0.6 + dnoise(p * 97.0) * 0.4;
    col = mix(col, col * (0.78 + 0.42 * stands), forest * far);
    float vis = amt * (1.0 - smoothstep(0.004, 0.02, pxw));
    float n = dnoise(p * 140.0) * 0.6 + dnoise(p * 420.0) * 0.4;
    float clump = dnoise(p * 30.0);
    vec3 canopy = col * (0.72 + 0.5 * n) * mix(0.85, 1.1, clump);
    col = mix(col, canopy, forest * vis);
  }
  // --- towns and cities: a grey built-up tone with the mile-grid arterials from afar, blocks and roofs up close
  if (urban > 0.05) {
    float u = clamp(urban * 1.3, 0.0, 1.0);
    vec2 aq = fract(q / (2.0 * QS));
    float arterial = 1.0 - smoothstep(0.006, 0.02, min(min(aq.x, 1.0 - aq.x), min(aq.y, 1.0 - aq.y)));
    float speck = dnoise(p * 90.0);
    vec3 built = mix(vec3(0.24, 0.23, 0.22), vec3(0.33, 0.31, 0.28), speck) * shadeK;
    built = mix(built, vec3(0.40, 0.39, 0.37) * shadeK, arterial * (1.0 - smoothstep(QS / 6.0, QS / 2.5, pxw)) * 0.7);
    col = mix(col, built, u * amt * 0.85);
    float vis = amt * (1.0 - smoothstep(0.004, 0.012, pxw));
    vec2 bq = q / 0.034;
    vec2 bc = floor(bq), bf = fract(bq);
    float street = 1.0 - smoothstep(0.06, 0.12, min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)));
    float bh = dh12(bc);
    vec2 lot = fract(bq * 3.0);
    float roof = step(0.18, lot.x) * step(0.18, lot.y) * step(lot.x, 0.85) * step(lot.y, 0.85);
    vec3 roofCol = mix(vec3(0.30, 0.28, 0.27), vec3(0.44, 0.36, 0.30), dh12(floor(bq * 3.0)));
    vec3 lawn = vec3(0.16, 0.22, 0.10);
    vec3 blockCol = mix(mix(lawn, roofCol, 0.6 + 0.4 * urban), roofCol, roof * (0.4 + 0.5 * urban));
    if (bh > 0.92 - 0.1 * urban) blockCol = vec3(0.22, 0.30, 0.13);   // parks
    vec3 uc = mix(blockCol, vec3(0.46, 0.45, 0.43), street * 0.85) * shadeK;
    col = mix(col, uc, u * vis);
  }
  // --- open dry land: scattered shrubs; bare ground in barren land
  float open_ = (1.0 - farm) * (1.0 - forest) * (1.0 - urban);
  if (open_ > 0.2) {
    float vis = amt * (1.0 - smoothstep(0.003, 0.012, pxw));
    float s = dnoise(p * 260.0);
    float shrub = smoothstep(int(cls) == 12 ? 0.55 : 0.64, 0.76, s);
    vec3 oc = col * mix(1.0, 0.72, shrub) * (0.95 + 0.1 * dnoise(p * 60.0));
    if (int(cls) == 7) oc = col * (0.86 + 0.28 * dnoise(p * 180.0)) * (0.92 + 0.16 * dnoise(p * 23.0));
    if (int(cls) == 20) oc = mix(col, vec3(0.06, 0.11, 0.07) * shadeK, 0.35 * smoothstep(0.45, 0.6, dnoise(p * 210.0)));
    col = mix(col, oc, open_ * vis);
  }
  return col;
}
// night: street lights and buildings by developed intensity; a smooth glow from afar, a lamp grid up close
vec3 cityLights(float dev, vec2 p, float pxw) {
  if (dev < 0.015) return vec3(0.0);
  float k = pow(clamp(dev, 0.0, 1.0), 1.7) * 1.25;
  vec2 q = surveyCoords(p) / 0.034;
  vec2 c = floor(q), f = fract(q);
  float street = 1.0 - smoothstep(0.03, 0.11, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  vec2 aq = fract(surveyCoords(p) / 0.31334);
  float arterial = 1.0 - smoothstep(0.004, 0.016, min(min(aq.x, 1.0 - aq.x), min(aq.y, 1.0 - aq.y)));
  float vis = 1.0 - smoothstep(0.003, 0.016, pxw);
  float pattern = mix(1.0, 0.18 + 1.4 * street * (0.6 + 0.4 * dh12(c)) + 2.2 * arterial + 1.6 * step(0.93, dh12(c + 3.1)) * dev, vis);
  // neutral and dim: the developed land is context, and the warm colours belong to power plants and public supply
  return vec3(0.70, 0.73, 0.78) * k * pattern * 0.42;
}
`;
