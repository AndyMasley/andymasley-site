import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Authored, unbranded compact touring car. Metres, Y up, forward -Z; origin is the road contact plane. */
export const TOURING_CAR_DIMENSIONS = Object.freeze({ length: 4.46, bodyWidth: 1.88, mirrorWidth: 2.28, wheelbase: 2.65, wheelRadius: 0.337 });
export type VehicleUpdate = { distanceM: number; steeringRadians: number; braking: boolean };
export type VehicleResources = { geometries: number; materials: number; triangles: number; drawCalls: number; geometryBytes: number; textures: number; wheels: number; disposed: boolean };
export type TouringCar = { root: THREE.Group; wheels: readonly THREE.Group[]; update(input: VehicleUpdate): void; resources(): VehicleResources; dispose(): void };
type Point = readonly [number, number, number];
type Material = THREE.MeshStandardMaterial;
type Batch = Map<Material, THREE.BufferGeometry[]>;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const WHEEL_NAMES = ['Drive wheel | front left', 'Drive wheel | front right', 'Drive wheel | rear left', 'Drive wheel | rear right'];

/** Smooth section interpolation; the result remains inside its two bracketing design stations. */
function profile(z: number, stations: readonly (readonly number[])[], field: number): number {
  let i = 0;
  while (i < stations.length - 2 && z > stations[i + 1][0]) i++;
  const a = stations[i], b = stations[i + 1];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const prev = stations[Math.max(0, i - 1)], next = stations[Math.min(stations.length - 1, i + 2)];
  const m0 = (b[field] - prev[field]) / (b[0] - prev[0]);
  const m1 = (next[field] - a[field]) / (next[0] - a[0]);
  const v = (2 * t ** 3 - 3 * t ** 2 + 1) * a[field] + (t ** 3 - 2 * t ** 2 + t) * m0 * (b[0] - a[0])
    + (-2 * t ** 3 + 3 * t ** 2) * b[field] + (t ** 3 - t ** 2) * m1 * (b[0] - a[0]);
  return THREE.MathUtils.clamp(v, Math.min(a[field], b[field]), Math.max(a[field], b[field]));
}

function meshData(vertices: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function panel(points: Point[], bulge = 0): THREE.BufferGeometry {
  // Bilinear patch with a gently bowed centre; winding is supplied outward by the caller.
  const vertices: number[] = [], indices: number[] = [], segments = 8;
  const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]), new THREE.Vector3(...points[0]))
    .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[3]), new THREE.Vector3(...points[0]))).normalize();
  for (let j = 0; j <= segments; j++) for (let i = 0; i <= segments; i++) {
    const u = i / segments, v = j / segments;
    for (let k = 0; k < 3; k++) vertices.push(points[0][k] * (1 - u) * (1 - v) + points[1][k] * u * (1 - v)
      + points[2][k] * u * v + points[3][k] * (1 - u) * v + normal.getComponent(k) * bulge * Math.sin(u * Math.PI) * Math.sin(v * Math.PI));
  }
  for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + 1, c = b + segments + 1, d = c - 1;
    indices.push(a, b, c, a, c, d);
  }
  return meshData(vertices, indices);
}

function roundedPlate(width: number, height: number, radius: number, depth = 0.008): THREE.BufferGeometry {
  const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2), s = new THREE.Shape();
  s.moveTo(x + r, y); s.lineTo(x + width - r, y); s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r); s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height); s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 4, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function createTouringCar(): TouringCar {
  const root = new THREE.Group();
  root.name = 'Your car'; root.userData.vehicleVersion = 'webster-touring-v1'; root.userData.dimensions = TOURING_CAR_DIMENSIONS;
  const materials = new Set<Material>(), geometries = new Set<THREE.BufferGeometry>();
  const material = (name: string, color: number, roughness: number, metalness = 0): Material => {
    const m = new THREE.MeshStandardMaterial({ name, color, roughness, metalness }); materials.add(m); return m;
  };
  const paint = new THREE.MeshPhysicalMaterial({ name: 'Touring | deep mineral teal metallic', color: 0x245d61, roughness: 0.28, metalness: 0.58,
    clearcoat: 0.8, clearcoatRoughness: 0.19, envMapIntensity: 1.2 }); materials.add(paint);
  const shadowPaint = material('Touring | lower satin teal', 0x183c40, 0.41, 0.35);
  const rubber = material('Touring | fine matte tyre rubber', 0x141617, 0.84);
  const trim = material('Touring | graphite seals and grille', 0x131d21, 0.52, 0.12);
  const alloy = material('Touring | machined aluminium', 0xc2c8c9, 0.27, 0.86);
  const darkAlloy = material('Touring | graphite wheel barrel', 0x3c474c, 0.33, 0.76);
  const chrome = material('Touring | satin brightwork', 0xaebfc3, 0.23, 0.85);
  const glass = new THREE.MeshPhysicalMaterial({ name: 'Touring | smoked automotive glass', color: 0x293f49, metalness: 0.22, roughness: 0.09,
    clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.35 }); materials.add(glass);
  const interior = material('Touring | warm charcoal interior', 0x292c2b, 0.9);
  const red = material('Touring | ruby rear lamp', 0x8d1014, 0.23, 0.16); red.emissive.setHex(0xff251b); red.emissiveIntensity = 0.12;
  const led = material('Touring | warm white running lamps', 0xe2e8df, 0.21, 0.22); led.emissive.setHex(0xfff4d8); led.emissiveIntensity = 0.65;
  const amber = material('Touring | amber reflectors', 0xc67d27, 0.29, 0.13);
  const plate = material('Touring | ivory registration plate', 0xd4d8ca, 0.5, 0.06);
  const caliperMaterial = material('Touring | brake caliper', 0x62676a, 0.65, 0.5);
  let disposed = false;

  function add(batch: Batch, g: THREE.BufferGeometry, m: Material, position: Point = [0, 0, 0], rotation: Point = [0, 0, 0], scale: Point = [1, 1, 1]): void {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    const list = batch.get(m) ?? []; list.push(g); batch.set(m, list);
  }
  function tube(batch: Batch, points: Point[], radius: number, m: Material, closed = false): void {
    let curve: THREE.Curve<THREE.Vector3>;
    if (closed) {
      const outline = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < points.length; i++) outline.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[(i + 1) % points.length])));
      curve = outline;
    } else curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    add(batch, new THREE.TubeGeometry(curve, Math.max(4, points.length * 4), radius, 5, closed), m);
  }
  function finish(batch: Batch, parent: THREE.Group): void {
    for (const [m, sources] of batch) {
      const normalized = sources.map((g) => { const out = g.index ? g.toNonIndexed() : g; if (out !== g) g.dispose(); return out; });
      const g = mergeGeometries(normalized, false);
      for (const input of normalized) input.dispose();
      if (!g) throw new Error(`Cannot merge touring car ${m.name}`);
      geometries.add(g); g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, m); mesh.name = m.name; mesh.castShadow = m !== glass && m !== led && m !== red; mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }

  const body: Batch = new Map();
  // The continuous pressed-metal envelope has real curved wheel openings, instead of tyres over a solid cuboid.
  const stations = [[-2.23, 0.69, 0.77], [-2.12, 0.846, 0.875], [-1.8, 0.91, 0.985], [-1.325, 0.925, 1.035], [-0.75, 0.918, 1.055],
    [0, 0.92, 1.055], [0.65, 0.924, 1.04], [1.325, 0.925, 1.04], [1.84, 0.905, 0.992], [2.13, 0.843, 0.895], [2.23, 0.755, 0.80]];
  const width = (z: number) => profile(z, stations, 1), top = (z: number) => profile(z, stations, 2);
  const arch = (z: number) => {
    let base = 0.285;
    for (const axle of [-1.325, 1.325]) { const d = z - axle; if (Math.abs(d) < 0.393) base = Math.max(base, 0.337 + Math.sqrt(0.393 ** 2 - d ** 2)); }
    return base;
  };
  const vertices: number[] = [], indices: number[] = [], nz = 128, nr = 16;
  for (let j = 0; j <= nz; j++) {
    const z = -2.23 + j / nz * 4.46, w = width(z), h = top(z), bottom = arch(z);
    const ring = [[0, h + 0.008], [0.55 * w, h + 0.003], [0.82 * w, h - 0.019], [0.97 * w, h - 0.08], [w, h - 0.17],
      [0.998 * w, bottom + 0.035], [0.96 * w, bottom], [0.7 * w, bottom - 0.008], [0, bottom - 0.01],
      [-0.7 * w, bottom - 0.008], [-0.96 * w, bottom], [-0.998 * w, bottom + 0.035], [-w, h - 0.17], [-0.97 * w, h - 0.08], [-0.82 * w, h - 0.019], [-0.55 * w, h + 0.003]];
    for (const [x, y] of ring) vertices.push(x, y, z);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) {
    const a = j * nr + i, b = j * nr + (i + 1) % nr, c = b + nr, d = a + nr;
    indices.push(a, d, b, b, d, c);
  }
  // Separate flat end caps avoid averaging fascia normals into the long body highlights.
  add(body, meshData(vertices, indices), paint);
  for (const end of [-1, 1]) {
    const z = end * 2.23, ring = vertices.slice((end < 0 ? 0 : nz * nr) * 3, (end < 0 ? nr : (nz + 1) * nr) * 3), vs = [...ring, 0, (top(z) + arch(z)) / 2, z], ix: number[] = [];
    for (let i = 0; i < nr; i++) { const b = (i + 1) % nr; if (end < 0) ix.push(nr, i, b); else ix.push(nr, b, i); }
    add(body, meshData(vs, ix), paint);
  }
  add(body, new THREE.BoxGeometry(1.22, 0.11, 3.75), trim, [0, 0.25, 0]);

  // A shallow barrel-crowned roof, long enough to read as a compact touring hatch.
  const roofStations = [[-0.18, 0.60, 1.465], [0.0, 0.638, 1.495], [0.62, 0.648, 1.50], [0.99, 0.62, 1.468]];
  const roofV: number[] = [], roofI: number[] = [], ru = 24, rv = 12;
  for (let j = 0; j <= ru; j++) for (let i = 0; i <= rv; i++) {
    const z = -0.18 + j / ru * 1.17, u = i / rv * 2 - 1;
    roofV.push(u * profile(z, roofStations, 1), profile(z, roofStations, 2) + 0.019 * (1 - u * u), z);
  }
  for (let j = 0; j < ru; j++) for (let i = 0; i < rv; i++) { const a = j * (rv + 1) + i; roofI.push(a, a + rv + 1, a + 1, a + 1, a + rv + 1, a + rv + 2); }
  add(body, meshData(roofV, roofI), paint);
  const front: Point[] = [[-0.765, 1.055, -0.785], [0.765, 1.055, -0.785], [0.596, 1.464, -0.19], [-0.596, 1.464, -0.19]];
  const back: Point[] = [[0.779, 1.066, 1.56], [-0.779, 1.066, 1.56], [-0.607, 1.464, 1.005], [0.607, 1.464, 1.005]];
  add(body, panel([...front].reverse(), 0.017), glass); add(body, panel([...back].reverse(), 0.009), glass);
  tube(body, front, 0.018, trim, true); tube(body, back, 0.018, trim, true);
  for (const side of [-1, 1]) {
    const v = (x: number, y: number, z: number): Point => [side * x, y, z];
    const sideWindows: Point[][] = [
      [v(0.804, 1.071, -0.701), v(0.641, 1.455, -0.10), v(0.658, 1.463, 0.282), v(0.817, 1.074, 0.282)],
      [v(0.818, 1.074, 0.379), v(0.659, 1.463, 0.379), v(0.646, 1.446, 0.925), v(0.805, 1.072, 1.19)],
      [v(0.80, 1.074, 1.254), v(0.65, 1.426, 1.011), v(0.72, 1.258, 1.30), v(0.781, 1.074, 1.49)],
    ];
    for (const points of sideWindows) {
      add(body, panel(side > 0 ? points : [...points].reverse(), 0.004), glass); tube(body, points, 0.011, trim, true);
    }
    // Painted A/D pillars, dark structural B pillar, and a slender uninterrupted belt moulding.
    for (const points of [
      [v(0.765, 1.055, -0.785), v(0.596, 1.464, -0.19), v(0.641, 1.455, -0.10), v(0.804, 1.071, -0.701)],
      [v(0.65, 1.426, 1.011), v(0.781, 1.074, 1.49), v(0.779, 1.066, 1.56), v(0.607, 1.464, 1.005)],
      [v(0.80, 1.069, -0.73), v(0.817, 1.069, 0.33), v(0.894, 0.997, 0.33), v(0.89, 0.997, -0.73)],
      [v(0.817, 1.069, 0.33), v(0.782, 1.069, 1.54), v(0.897, 0.988, 1.54), v(0.894, 0.997, 0.33)],
    ]) add(body, panel(side > 0 ? points : [...points].reverse(), 0.003), paint);
    const bPillar = [v(0.822, 1.059, 0.29), v(0.655, 1.468, 0.29), v(0.655, 1.468, 0.369), v(0.822, 1.059, 0.369)];
    add(body, panel(side > 0 ? bPillar : [...bPillar].reverse()), trim);
    tube(body, [v(0.781, 1.056, -0.78), v(0.826, 1.053, -0.35), v(0.833, 1.053, 0.50), v(0.801, 1.053, 1.55)], 0.009, chrome);
    tube(body, [v(0.624, 1.469, -0.17), v(0.657, 1.486, 0.32), v(0.647, 1.473, 0.93), v(0.792, 1.07, 1.54)], 0.010, chrome);
    for (const axle of [-1.325, 1.325]) {
      const points: Point[] = [];
      for (let i = 0; i <= 26; i++) { const a = (-8 + i / 26 * 196) * Math.PI / 180; points.push(v(0.929, 0.337 + 0.393 * Math.sin(a), axle + 0.393 * Math.cos(a))); }
      tube(body, points, 0.008, shadowPaint);
      const liner: Point[] = points.map((p) => [p[0] * 0.954, p[1] + 0.012, p[2]]);
      tube(body, liner, 0.025, trim);
    }
    // Door shut lines stop at the sill/arch instead of being stamped across the tyre cutout.
    for (const points of [
      [[-0.66, 1.006], [-0.615, 0.74], [-0.55, 0.353], [0.282, 0.353], [0.302, 0.78], [0.30, 1.002]],
      [[0.385, 1.002], [0.385, 0.72], [0.402, 0.353], [0.842, 0.363], [0.985, 0.60], [1.18, 0.775], [1.30, 1.00]],
    ]) tube(body, points.map(([z, y]) => { const w = width(z), h = top(z); const x = y > h - 0.08 ? THREE.MathUtils.lerp(0.82 * w, 0.97 * w, THREE.MathUtils.clamp((h - 0.019 - y) / 0.061, 0, 1)) : y > h - 0.17 ? THREE.MathUtils.lerp(0.97 * w, w, (h - 0.08 - y) / 0.09) : w; return v(x + 0.003, y, z); }), 0.0032, shadowPaint);
    tube(body, [v(0.90, 0.315, -0.89), v(0.929, 0.304, -0.45), v(0.93, 0.304, 0.62), v(0.907, 0.328, 0.89)], 0.022, shadowPaint);
    for (const z of [0.045, 0.94]) {
      add(body, roundedPlate(0.125, 0.036, 0.018, 0.009), shadowPaint, v(0.929, 0.94, z), [0, side * Math.PI / 2, 0]);
      add(body, roundedPlate(0.091, 0.015, 0.007, 0.015), chrome, v(0.939, 0.946, z), [0, side * Math.PI / 2, 0]);
    }
    // Sculpted mirror pods taper into a short dark stalk; maximum span stays within the existing envelope.
    tube(body, [v(0.79, 1.081, -0.61), v(0.912, 1.088, -0.57), v(0.97, 1.114, -0.52)], 0.023, trim);
    add(body, new THREE.SphereGeometry(1, 16, 10), paint, v(1.017, 1.136, -0.522), [0, side * -0.12, 0], [0.107, 0.064, 0.132]);
    add(body, panel([v(0.942, 1.097, -0.408), v(1.102, 1.105, -0.408), v(1.10, 1.164, -0.431), v(0.95, 1.174, -0.431)]), glass);
    tube(body, [v(0.943, 1.112, -0.603), v(1.045, 1.106, -0.631), v(1.107, 1.122, -0.61)], 0.004, led);
    // Bonnet pressed creases and a restrained rear shoulder highlight.
    const crease: Point[] = [-1.98, -1.78, -1.38, -0.91, -0.76].map((z) => v(0.32 + (z + 1.98) * 0.087, top(z) + 0.008, z));
    tube(body, crease, 0.004, paint);
  }

  // The interior is shallow and inexpensive but gives the glazing real dark volumes to reflect over.
  add(body, new THREE.BoxGeometry(1.43, 0.07, 1.94), interior, [0, 1.019, 0.28]);
  add(body, new THREE.BoxGeometry(1.40, 0.17, 0.27), interior, [0, 1.105, -0.57]);
  for (const side of [-1, 1]) {
    add(body, new THREE.SphereGeometry(1, 12, 8), interior, [side * 0.36, 1.145, 0.29], [0.11, 0, 0], [0.23, 0.235, 0.075]);
    add(body, new THREE.SphereGeometry(1, 12, 8), interior, [side * 0.36, 1.37, 0.30], [0, 0, 0], [0.13, 0.078, 0.058]);
  }
  tube(body, [[-0.57, 1.072, -0.765], [-0.37, 1.103, -0.72], [-0.13, 1.11, -0.704]], 0.006, trim);
  tube(body, [[0.06, 1.072, -0.765], [0.28, 1.10, -0.723], [0.53, 1.099, -0.729]], 0.006, trim);

  // Front air opening and recessed running-light units, with continuous bumper rather than stacked boxes.
  add(body, roundedPlate(0.92, 0.155, 0.057), trim, [0, 0.586, -2.229]);
  for (const y of [0.545, 0.584, 0.623]) tube(body, [[-0.414, y, -2.239], [0, y - 0.002, -2.244], [0.414, y, -2.239]], 0.005, darkAlloy);
  tube(body, [[-0.76, 0.41, -2.119], [-0.50, 0.397, -2.205], [0, 0.395, -2.232], [0.50, 0.397, -2.205], [0.76, 0.41, -2.119]], 0.024, shadowPaint);
  for (const side of [-1, 1]) {
    const v = (x: number, y: number, z: number): Point => [side * x, y, z];
    const head: Point[] = [v(0.37, 0.756, -2.235), v(0.745, 0.748, -2.225), v(0.818, 0.827, -2.132), v(0.425, 0.842, -2.218)];
    add(body, panel(side > 0 ? [...head].reverse() : head), trim);
    tube(body, [v(0.42, 0.791, -2.242), v(0.60, 0.779, -2.238), v(0.747, 0.785, -2.21), v(0.794, 0.816, -2.156)], 0.011, led);
    tube(body, [v(0.79, 0.758, -2.13), v(0.825, 0.781, -2.08)], 0.006, amber);
    const tail: Point[] = [v(0.41, 0.731, 2.237), v(0.765, 0.718, 2.234), v(0.828, 0.847, 2.158), v(0.443, 0.865, 2.18)];
    add(body, panel(side < 0 ? [...tail].reverse() : tail), trim);
    tube(body, [v(0.446, 0.812, 2.224), v(0.67, 0.804, 2.226), v(0.787, 0.817, 2.18), v(0.817, 0.844, 2.098)], 0.012, red);
    tube(body, [v(0.451, 0.757, 2.246), v(0.67, 0.749, 2.246), v(0.756, 0.764, 2.218)], 0.008, red);
    tube(body, [v(0.46, 0.788, 2.239), v(0.65, 0.781, 2.24)], 0.004, led);
    tube(body, [v(0.63, 0.454, 2.214), v(0.78, 0.467, 2.151)], 0.008, red);
  }
  tube(body, [[-0.19, 1.463, 1.032], [0, 1.472, 1.037], [0.19, 1.463, 1.032]], 0.008, red);
  tube(body, [[-0.72, 0.43, 2.14], [-0.45, 0.393, 2.207], [0, 0.384, 2.239], [0.45, 0.393, 2.207], [0.72, 0.43, 2.14]], 0.033, trim);
  add(body, roundedPlate(0.348, 0.148, 0.012), trim, [0, 0.612, 2.237]);
  add(body, roundedPlate(0.303, 0.119, 0.008), plate, [0, 0.616, 2.246]);
  // Invented registration marks, not a real plate/brand or a raster dependency.
  for (let i = 0; i < 5; i++) {
    const x = -0.10 + i * 0.05;
    tube(body, [[x, 0.591, 2.255], [x, 0.638, 2.255], [x + 0.023, 0.638, 2.255], [x + 0.023, 0.592, 2.255]], 0.0025, trim);
  }
  tube(body, [[-0.102, 0.677, 2.235], [0.102, 0.677, 2.235]], 0.009, chrome);
  // Small abstract round manufacturer's medallion, intentionally unbranded.
  add(body, new THREE.TorusGeometry(0.023, 0.0035, 5, 20), chrome, [0, 0.764, 2.232]);
  finish(body, root);
  // Stay inside the source bumper-to-bumper envelope, including plate and lamp relief.
  // Axles and wheel openings stay unchanged: only the final 0.5m of each overhang contracts.
  let extremity = 2.23;
  for (const g of geometries) { const a = g.getAttribute('position'); for (let i = 0; i < a.count; i++) extremity = Math.max(extremity, Math.abs(a.getZ(i))); }
  const overhangScale = (2.23 - 1.73) / (extremity - 1.73);
  for (const g of geometries) {
    const a = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < a.count; i++) if (Math.abs(a.getZ(i)) > 1.73) {
      const z = a.getZ(i); a.setZ(i, Math.sign(z) * (1.73 + (Math.abs(z) - 1.73) * overhangScale));
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i) / overhangScale, length = Math.hypot(nx, ny, nz);
      n.setXYZ(i, nx / length, ny / length, nz / length);
    }
    g.computeBoundingBox(); g.computeBoundingSphere();
  }

  // One shared wheel model: rolled tyre sidewall, machined lip, brake disc and ten swept spokes.
  const wheelBatch: Batch = new Map();
  const tireProfile = [[0.228, -0.095], [0.270, -0.111], [0.307, -0.111], [0.329, -0.088], [0.337, -0.051], [0.337, 0.051], [0.329, 0.088], [0.307, 0.111], [0.270, 0.111], [0.228, 0.095], [0.228, -0.095]];
  add(wheelBatch, new THREE.LatheGeometry(tireProfile.map(([r, a]) => new THREE.Vector2(r, a)), 48), rubber, [0, 0, 0], [0, 0, Math.PI / 2]);
  const rimProfile = [[0.221, -0.10], [0.239, -0.104], [0.246, -0.098], [0.246, -0.088], [0.226, -0.071], [0.226, 0.071], [0.246, 0.088], [0.246, 0.098], [0.239, 0.104], [0.221, 0.10]];
  add(wheelBatch, new THREE.LatheGeometry(rimProfile.map(([r, a]) => new THREE.Vector2(r, a)), 40), alloy, [0, 0, 0], [0, 0, Math.PI / 2]);
  add(wheelBatch, new THREE.CylinderGeometry(0.218, 0.218, 0.14, 40), darkAlloy, [0, 0, 0], [0, 0, Math.PI / 2]);
  for (const side of [-1, 1]) {
    for (const r of [0.292, 0.312]) add(wheelBatch, new THREE.TorusGeometry(r, 0.0021, 4, 48), rubber, [side * 0.110, 0, 0], [0, Math.PI / 2, 0]);
    add(wheelBatch, new THREE.CylinderGeometry(0.184, 0.184, 0.006, 40), caliperMaterial, [side * 0.076, 0, 0], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, s = new THREE.Shape();
      s.moveTo(0.056, -0.013); s.lineTo(0.132, -0.010); s.lineTo(0.224, 0.004); s.lineTo(0.230, 0.025); s.lineTo(0.123, 0.015); s.lineTo(0.056, 0.009); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1, steps: 1 });
      g.rotateZ(a); g.rotateY(side * Math.PI / 2); add(wheelBatch, g, alloy, [side * 0.084, 0, 0]);
    }
    add(wheelBatch, new THREE.CylinderGeometry(0.066, 0.068, 0.019, 24), alloy, [side * 0.104, 0, 0], [0, 0, Math.PI / 2]);
    add(wheelBatch, new THREE.CylinderGeometry(0.031, 0.031, 0.004, 24), darkAlloy, [side * 0.115, 0, 0], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 2 * Math.PI;
      add(wheelBatch, new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 8), trim, [side * 0.116, 0.046 * Math.cos(a), 0.046 * Math.sin(a)], [0, 0, Math.PI / 2]);
    }
  }
  const wheelTemplate = new THREE.Group(); finish(wheelBatch, wheelTemplate);
  const wheels: THREE.Group[] = [], spins: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1, front = i < 2;
    const pivot = new THREE.Group(); pivot.name = WHEEL_NAMES[i]; pivot.position.set(side * 0.814, 0.337, front ? -1.325 : 1.325);
    pivot.userData.driving_wheel = true; pivot.userData.front_wheel = front; pivot.userData.wheel_radius_m = 0.337;
    const spin = wheelTemplate.clone(true); spin.name = 'Rolling wheel'; spin.userData.vehicleRole = 'wheel-roll'; pivot.add(spin); root.add(pivot); wheels.push(pivot); spins.push(spin);
  }
  const steering = new THREE.Quaternion(), rolling = new THREE.Quaternion(), identity = new THREE.Quaternion();
  const uniqueBytes = () => {
    let bytes = 0;
    for (const g of geometries) { for (const a of Object.values(g.attributes)) bytes += a.array.byteLength; bytes += g.index?.array.byteLength ?? 0; }
    return bytes;
  };
  return {
    root, wheels,
    update({ distanceM, steeringRadians, braking }) {
      if (disposed) return;
      // No per-frame geometry/material allocations and no mutation of the authoritative road pose.
      const angle = Number.isFinite(steeringRadians) ? THREE.MathUtils.clamp(steeringRadians, -0.55, 0.55) : 0;
      const distance = Number.isFinite(distanceM) ? distanceM : 0;
      steering.setFromAxisAngle(Y, angle); rolling.setFromAxisAngle(X, -(distance / 0.337) % (Math.PI * 2));
      for (let i = 0; i < wheels.length; i++) { wheels[i].quaternion.copy(i < 2 ? steering : identity); spins[i].quaternion.copy(rolling); }
      red.emissiveIntensity = braking ? 1.6 : 0.12;
    },
    resources() {
      let triangles = 0, drawCalls = 0;
      root.traverse((o) => { if (o instanceof THREE.Mesh) { drawCalls++; triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; } });
      return { geometries: disposed ? 0 : geometries.size, materials: disposed ? 0 : materials.size, triangles, drawCalls, geometryBytes: disposed ? 0 : uniqueBytes(), textures: 0, wheels: disposed ? 0 : wheels.length, disposed };
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); root.clear();
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); geometries.clear(); materials.clear();
      wheelTemplate.clear(); wheels.length = 0; spins.length = 0;
    },
  };
}
