import * as THREE from 'three';
import data from '../../../data/derived/town/roadside-commerce.json';
import { Builder, tileTerrain } from './street-dressing';
import type { ParkedPlacement } from './parked-life';
import { filterEvidenceSources } from './evidence-buildings';

/**
 * Fuel stations and business signs along the commercial streets.
 *
 * Each canopy's outline and deck height are measured from the 2021 lidar
 * (`scripts/prepare-roadside-commerce.py`); columns, pump islands,
 * dispensers, lights and the price sign under and beside it are authored in
 * the common New England form, and island counts follow the canopy's size.
 *
 * Signs name only what a listed business sells or does ("PIZZA",
 * "AUTO PARTS"): no business name, brand, logo, wordmark or house colour is
 * shown, and prices, palettes and sign forms are authored. Legends are drawn
 * once into one single-channel atlas; each face carries its own field and
 * legend colours, so the atlas stays small whatever the palette.
 */
type V2 = [number, number];
type Panel = { text: string; style: number; w?: number; h?: number };
/** A store body whose traced footprint also covers its canopy: the game's
 * body is replaced by `body`, the footprint less the canopy. */
export type Carve = { id: string; outline: V2[]; base: number; peak: number; eave: number; body: V2[] };
export type Station = { id: string; address: string; tileId: string; centre: V2; axis: V2; length: number; width: number; top: number; rows: number; cols: number; palette: number;
  prices: string[]; priceSign: { at: V2; along: V2; z: number; tileId: string }; lidarReturns: number; carve?: Carve };
export type Sign = { id: string; kind: 'wall' | 'pylon' | 'monument'; tileId: string; at: V2; panels: Panel[]; businesses: string[];
  normal?: V2; y?: number; frame?: string | null; station?: string | null; along?: V2; z?: number };
/** A run of head-in stalls: `a` is the first stall's corner at the walk side,
 * `t` runs along the row, `o` away from the storefront; noses point along
 * `facing` x `o`. */
export type ParkingRow = { tileId: string; a: V2; t: V2; o: V2; count: number; facing: number; z: number; occupancy: number; site: string; band: number };
export type LotLight = { tileId: string; at: V2; dir: V2; z: number };
export type CommerceData = { version: number; basis: string; stations: Station[]; signs: Sign[]; parking: ParkingRow[]; lights: LotLight[] };
const DATA = data as unknown as CommerceData;
export type CommerceReport = { stations: number; islands: number; signs: number; faces: number; stalls: number; cars: number; carvedTriangles: number; triangles: number; bytes: number };
export const STALL = { width: 2.75, depth: 5.5, line: 0.1 } as const;
/** Parked cars per tile by display level: stable, and none far off. Low
 * graphics keep fewer. Lot cars are light instanced forms (about 160
 * triangles each), not the detailed kerbside model. */
export const PARKED_CAP = [240, 120, 0] as const;
export const PARKED_CAP_LOW = [60, 0, 0] as const;
/** Roughly the mix on American roads: whites, blacks and greys, then silver, blue, red, green. */
const CAR_COLOURS = ['#f0efe9', '#e4e3dc', '#1c1e21', '#2a2d31', '#6d7479', '#8d949a', '#b9bfc2', '#1f3350', '#7d2426', '#3d4a3c'];

const TILE = 250;
export const ROADSIDE_COMMERCE = DATA;

/** Field and legend colours (sRGB), typeface, and whether the field or the
 * legend is the lit part of an internally lit cabinet. */
export const SIGN_STYLES: readonly { field: string; legend: string; font: 'sans' | 'serif' | 'narrow'; lit: 'field' | 'legend'; border?: boolean }[] = [
  { field: '#a8262b', legend: '#fbf6ec', font: 'sans', lit: 'legend' },   // 0 food: deep red
  { field: '#f4f1ea', legend: '#a8262b', font: 'sans', lit: 'field', border: true }, // 1 white, red legend
  { field: '#1d3557', legend: '#f4f1ea', font: 'serif', lit: 'legend' },  // 2 finance, health: navy
  { field: '#1f4a36', legend: '#efe6c8', font: 'sans', lit: 'legend' },   // 3 hardware, market, liquor: forest
  { field: '#2b2e33', legend: '#f0b32e', font: 'narrow', lit: 'legend' }, // 4 automotive: charcoal, amber
  { field: '#efe6cf', legend: '#5a3522', font: 'serif', lit: 'field', border: true }, // 5 cafe, bakery: cream
  { field: '#4a2b1d', legend: '#f3e3c3', font: 'sans', lit: 'legend' },   // 6 coffee: roast brown
  { field: '#f7f7f4', legend: '#1d2f4a', font: 'sans', lit: 'field', border: true },  // 7 general: white, navy
  { field: '#5e1c25', legend: '#dcb866', font: 'serif', lit: 'legend' },  // 8 dining: maroon, gold
  { field: '#1d6360', legend: '#f4f1ea', font: 'sans', lit: 'legend' },   // 9 services: teal
];
/** Canopy stripe and pump header colours: 0 navy, 1 maroon, 2 green, 3 slate.
 * The preparation script picks one per station, never its operator's colours. */
const STATION_PALETTES = ['#1d3a64', '#7a1f24', '#26543f', '#3b3f45'];
const LED = { field: '#0c0d0e', legend: '#ff4a1c' };
const LABEL = { field: '#1b1d20', legend: '#f2f2ee' };
const PX_PER_M = 56;
const ATLAS_WIDTH = 2048;

type FaceSpec = { key: string; text: string; field: string; legend: string; font: 'sans' | 'serif' | 'narrow' | 'mono'; border: boolean; wPx: number; hPx: number; fill: number; glow: [number, number] };
type FaceSlot = { u0: number; v0: number; u1: number; v1: number };

/** One line, or two broken at the middle-most space, whichever lets the
 * legend stand taller on a w x h face (capitals run about 0.62 em wide). */
export function layoutLegend(text: string, w: number, h: number, fill = 0.62): string {
  const single = Math.min(h * fill, w * 0.88 / (text.length * 0.62));
  const spaces = [...text].map((c, i) => c === ' ' ? i : -1).filter(i => i > 0);
  if (!spaces.length) return text;
  const at = spaces.reduce((best, i) => Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2) ? i : best);
  const lines = [text.slice(0, at), text.slice(at + 1)];
  const double = Math.min(h * fill / 2, w * 0.88 / (Math.max(...lines.map(l => l.length)) * 0.62));
  return double > single * 1.15 ? lines.join('\n') : text;
}

export function styleFace(text: string, styleIndex: number, w: number, h: number): FaceSpec {
  const style = SIGN_STYLES[styleIndex] ?? SIGN_STYLES[7];
  const glow: [number, number] = style.lit === 'field' ? [0.22, 0] : [0.02, 0.32];
  return { key: `${styleIndex}|${text}|${w.toFixed(2)}x${h.toFixed(2)}`, text: layoutLegend(text, w, h), field: style.field, legend: style.legend, font: style.font, border: !!style.border,
    wPx: Math.max(16, Math.round(w * PX_PER_M)), hPx: Math.max(12, Math.round(h * PX_PER_M)), fill: 0.62, glow };
}

function plainFace(key: string, text: string, colours: { field: string; legend: string }, w: number, h: number, font: FaceSpec['font'], glow: [number, number], fill = 0.62, border = false): FaceSpec {
  return { key, text, field: colours.field, legend: colours.legend, font, border, wPx: Math.max(16, Math.round(w * PX_PER_M)), hPx: Math.max(12, Math.round(h * PX_PER_M)), fill, glow };
}

/** Shelf packing, tallest first. Returns pixel rectangles and the atlas height. */
export function packFaces(faces: readonly { key: string; wPx: number; hPx: number }[], width = ATLAS_WIDTH): { rects: Map<string, [number, number, number, number]>; height: number } {
  const rects = new Map<string, [number, number, number, number]>();
  const order = [...faces].sort((a, b) => b.hPx - a.hPx || b.wPx - a.wPx || a.key.localeCompare(b.key));
  let x = 0, y = 0, shelf = 0;
  for (const face of order) {
    if (rects.has(face.key)) continue;
    const w = Math.min(face.wPx, width - 2) + 2, h = face.hPx + 2;
    if (x + w > width) { x = 0; y += shelf; shelf = 0; }
    rects.set(face.key, [x + 1, y + 1, w - 2, h - 2]);
    x += w; shelf = Math.max(shelf, h);
  }
  const used = y + shelf;
  let height = 64;
  while (height < used) height *= 2;
  return { rects, height };
}

const FONTS: Record<FaceSpec['font'], string> = {
  sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  narrow: '"Arial Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"DejaVu Sans Mono", Menlo, Consolas, monospace',
};

function drawAtlas(faces: readonly FaceSpec[]): { texture: THREE.DataTexture; slots: Map<string, FaceSlot> } | null {
  if (typeof document === 'undefined' || !faces.length) return null;
  const { rects, height } = packFaces(faces);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ATLAS_WIDTH, height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  const slots = new Map<string, FaceSlot>();
  for (const face of faces) {
    const rect = rects.get(face.key);
    if (!rect || slots.has(face.key)) continue;
    const [x, y, w, h] = rect;
    if (face.border) {
      const inset = Math.max(2, h * 0.07);
      ctx.lineWidth = Math.max(1.5, h * 0.035);
      ctx.strokeRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset);
    }
    const lines = face.text.split('\n');
    const size = Math.floor(h * face.fill / lines.length);
    ctx.font = `700 ${size}px ${FONTS[face.font]}`;
    const room = w * (face.border ? 0.84 : 0.9);
    lines.forEach((line, i) => {
      const measured = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(x + w / 2, y + h * (i + 0.5) / lines.length + size * 0.04);
      const squeeze = (face.font === 'narrow' ? 0.82 : 1) * Math.min(1, room / Math.max(1, measured * (face.font === 'narrow' ? 0.82 : 1)));
      ctx.scale(squeeze, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    // Canvas row 0 is texture row 0 (flipY off), so a face's top has the smaller v.
    slots.set(face.key, { u0: x / ATLAS_WIDTH, u1: (x + w) / ATLAS_WIDTH, v0: (y + h) / height, v1: y / height });
  }
  const rgba = ctx.getImageData(0, 0, ATLAS_WIDTH, height).data;
  const mask = new Uint8Array(ATLAS_WIDTH * height);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) mask[i] = rgba[j];
  canvas.width = canvas.height = 0;
  const texture = new THREE.DataTexture(mask, ATLAS_WIDTH, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = 'Roadside commerce | sign legends';
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 8; texture.needsUpdate = true;
  return { texture, slots };
}

function faceMaterial(atlas: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.34, metalness: 0 });
  material.name = 'Roadside commerce | sign faces';
  material.userData.townCrafted = true;
  material.envMapIntensity = 0.45;
  material.onBeforeCompile = shader => {
    if (!shader.fragmentShader.includes('#include <map_fragment>') || !shader.fragmentShader.includes('#include <emissivemap_fragment>')) throw new Error('Sign face shader anchors changed.');
    shader.vertexShader = `attribute vec3 townSignField;\nattribute vec3 townSignLegend;\nattribute vec2 townSignGlow;\nvarying vec3 vTownSignField;\nvarying vec3 vTownSignLegend;\nvarying vec2 vTownSignGlow;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTownSignField = townSignField; vTownSignLegend = townSignLegend; vTownSignGlow = townSignGlow;');
    shader.fragmentShader = `varying vec3 vTownSignField;\nvarying vec3 vTownSignLegend;\nvarying vec2 vTownSignGlow;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `float townSignMask = texture2D(map, vMapUv).r;\ndiffuseColor.rgb = mix(vTownSignField, vTownSignLegend, townSignMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += mix(vTownSignField * vTownSignGlow.x, vTownSignLegend * vTownSignGlow.y, townSignMask);`);
  };
  material.customProgramCacheKey = () => 'roadside-sign-face-v1';
  return material;
}

function standard(name: string, color: string, roughness: number, metalness = 0, emissive?: string, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (emissive) { m.emissive.set(emissive); m.emissiveIntensity = emissiveIntensity; }
  m.name = `Roadside commerce | ${name}`;
  m.userData.townCrafted = true;
  return m;
}

/** Sign faces of one tile: quads with atlas UVs and per-face colours. */
class FaceGeometry {
  private p: number[] = []; private n: number[] = []; private uv: number[] = [];
  private field: number[] = []; private legend: number[] = []; private glow: number[] = [];
  count = 0;
  constructor(private readonly slots: Map<string, FaceSlot>) {}
  /** Quad centred at c (tile-local), spanning `right` by w and up by h, facing `normal`. */
  add(face: FaceSpec, c: THREE.Vector3, right: THREE.Vector3, normal: THREE.Vector3, w: number, h: number): void {
    const slot = this.slots.get(face.key);
    if (!slot) return;
    const up = new THREE.Vector3(0, 1, 0);
    const corner = (i: number, j: number) => c.clone().addScaledVector(right, i * w / 2).addScaledVector(up, j * h / 2);
    const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const uvs = [[slot.u0, slot.v0], [slot.u1, slot.v0], [slot.u1, slot.v1], [slot.u0, slot.v1]];
    // Wind counter-clockwise as seen from the face's side.
    const facing = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[2], q[0])).dot(normal) > 0;
    const field = new THREE.Color(face.field), legend = new THREE.Color(face.legend);
    for (const k of facing ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      this.p.push(q[k].x, q[k].y, q[k].z); this.n.push(normal.x, normal.y, normal.z); this.uv.push(uvs[k][0], uvs[k][1]);
      this.field.push(field.r, field.g, field.b); this.legend.push(legend.r, legend.g, legend.b); this.glow.push(face.glow[0], face.glow[1]);
    }
    this.count++;
  }
  mesh(material: THREE.Material): THREE.Mesh | null {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('townSignField', new THREE.Float32BufferAttribute(this.field, 3));
    g.setAttribute('townSignLegend', new THREE.Float32BufferAttribute(this.legend, 3));
    g.setAttribute('townSignGlow', new THREE.Float32BufferAttribute(this.glow, 2));
    g.computeBoundingBox(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'Roadside commerce | sign faces';
    mesh.userData.townCrafted = true; mesh.receiveShadow = true;
    return mesh;
  }
}

/** Legend and size of every face a station's price sign shows. */
export function priceSignFaces(station: Station): { header: FaceSpec; rows: { label: FaceSpec; digits: FaceSpec }[]; width: number } {
  const width = station.rows * station.cols >= 4 ? 2.6 : 2.2;
  const palette = STATION_PALETTES[station.palette % STATION_PALETTES.length];
  const header = plainFace(`price|GAS|${palette}|${width}`, 'GAS', { field: '#f7f7f4', legend: palette }, width - 0.16, 0.78, 'sans', [0.22, 0], 0.72, true);
  const labels = ['REGULAR', 'PREMIUM', 'DIESEL'];
  const rows = station.prices.map((price, i) => ({
    label: plainFace(`price|${labels[i]}|${width}`, labels[i], LABEL, width * 0.44, 0.5, 'narrow', [0.02, 0.28], 0.56),
    // The tenth of a cent is the customary superscript nine.
    digits: plainFace(`price|${price}|${width}`, `${price}⁹`, LED, width * 0.5, 0.5, 'mono', [0, 2.4], 0.8),
  }));
  return { header, rows, width };
}

/** The panels a roadside sign stacks, with their sizes. */
export function roadsidePanels(sign: Sign): { faces: FaceSpec[]; width: number; panelHeight: number; bottom: number } {
  const monument = sign.kind === 'monument';
  const panelHeight = monument ? 0.62 : sign.panels.length === 1 ? 1.2 : 0.95;
  // Cabinets run 2 to 3.2 m wide; long legends wrap rather than widen them.
  const longest = Math.max(...sign.panels.map(p => Math.max(...layoutLegend(p.text, 3.1, panelHeight).split('\n').map(l => l.length))));
  const width = Math.min(monument ? 3.4 : 3.2, Math.max(monument ? 2.2 : 2.0, longest * 0.3 + 0.8));
  // Pylons stand at one of three authored heights; monuments sit on a plinth.
  const bottom = monument ? 0.72 : 2.9 + (hashUnit(sign.id) < 1 / 3 ? 0 : hashUnit(sign.id) < 2 / 3 ? 0.7 : 1.4);
  return { faces: sign.panels.map(p => styleFace(p.text, p.style, width - 0.14, panelHeight)), width, panelHeight, bottom };
}

function hashUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

export class RoadsideCommerce {
  private readonly stationsByTile = new Map<string, Station[]>();
  private readonly signsByTile = new Map<string, Sign[]>();
  private readonly parkingByTile = new Map<string, ParkingRow[]>();
  private readonly lightsByTile = new Map<string, LotLight[]>();
  private lotCar?: { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; tyres: THREE.BufferGeometry };
  private readonly faces = new Map<string, FaceSpec>();
  private readonly materials: Record<string, THREE.MeshStandardMaterial>;
  private atlas?: { texture: THREE.DataTexture; slots: Map<string, FaceSlot> } | null;
  private faceMaterial?: THREE.MeshStandardMaterial;

  private readonly caps: readonly number[];

  constructor(private readonly input: CommerceData = DATA, { low = false }: { low?: boolean } = {}) {
    this.caps = low ? PARKED_CAP_LOW : PARKED_CAP;
    for (const s of input.stations) {
      for (const tile of new Set([s.tileId, s.priceSign.tileId])) this.push(this.stationsByTile, tile, s);
      const { header, rows } = priceSignFaces(s);
      for (const face of [header, ...rows.flatMap(r => [r.label, r.digits])]) this.faces.set(face.key, face);
    }
    for (const row of input.parking ?? []) this.push(this.parkingByTile, row.tileId, row);
    for (const light of input.lights ?? []) this.push(this.lightsByTile, light.tileId, light);
    for (const sign of input.signs) {
      this.push(this.signsByTile, sign.tileId, sign);
      if (sign.kind === 'wall') for (const p of sign.panels as Panel[]) { const f = styleFace(p.text, p.style, p.w!, p.h!); this.faces.set(f.key, f); }
      else for (const f of roadsidePanels(sign).faces) this.faces.set(f.key, f);
      if (sign.kind === 'wall' && sign.panels.some(p => p.text === 'FOOD MART')) this.faces.set(ICE.key, ICE);
    }
    this.materials = {
      fascia: standard('canopy fascia', '#f1f1ec', 0.46),
      soffit: standard('canopy soffit', '#e7e7e2', 0.6),
      trim: standard('canopy reveal', '#26292c', 0.5, 0.3),
      lamp: standard('canopy downlight', '#fbfaf2', 0.3, 0, '#fff8e6', 1.6),
      column: standard('painted steel column', '#e4e4df', 0.42, 0.25),
      masonry: standard('split-face block', '#8f8579', 0.9),
      concrete: standard('island concrete', '#b9b5ab', 0.85),
      dispenser: standard('dispenser body', '#e9e9e4', 0.38, 0.1),
      screen: standard('dispenser display', '#16191c', 0.25, 0, '#1b2a33', 0.35),
      hose: standard('hose and nozzle', '#191a1b', 0.55),
      bollard: standard('safety bollard', '#e3b21c', 0.5, 0.15),
      signFrame: standard('sign cabinet', '#2d2a27', 0.45, 0.35),
      signPost: standard('sign post', '#3a3834', 0.5, 0.4),
      ice: standard('ice merchandiser', '#f4f6f7', 0.35, 0.1),
      stripe: standard('stall line paint', '#e9e7df', 0.78),
      block: standard('painted block', '#aba89c', 0.9),
      coping: standard('metal coping', '#6c706a', 0.45, 0.4),
      roofing: standard('membrane roof', '#5a5c5c', 0.95),
      window: standard('storefront glass', '#26323a', 0.08, 0.3),
      frame: standard('storefront frame', '#d9d9d2', 0.5, 0.2),
      carBody: standard('lot car paint', '#ffffff', 0.32, 0.35),
      carGlass: standard('lot car glass', '#20272c', 0.22, 0.1),
      carTyres: standard('lot car tyres', '#1c1d1e', 0.85),
      ...Object.fromEntries(STATION_PALETTES.map((colour, i) => [`band${i}`, standard(`canopy stripe ${i}`, colour, 0.4, 0.1)])),
    };
    this.materials.lamp.userData.townEmissive = true;
    this.materials.pier = this.materials.concrete;
    // Parked-car glass mirrors the treeline more than open sky.
    this.materials.carGlass.envMapIntensity = 0.55;
    if (this.faces.size) this.atlas = drawAtlas([...this.faces.values()]);
  }

  private push<T>(map: Map<string, T[]>, key: string, value: T): void { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); }

  get counts(): { stations: number; signs: number; faces: number } { return { stations: this.input.stations.length, signs: this.input.signs.length, faces: this.faces.size }; }

  /** Adds the tile's stations and signs (once). */
  apply(group: THREE.Group, tileId: string, origin: readonly number[], level: number): CommerceReport | undefined {
    if (group.userData.roadsideCommerce) return group.userData.roadsideCommerce;
    const report: CommerceReport = { stations: 0, islands: 0, signs: 0, faces: 0, stalls: 0, cars: 0, carvedTriangles: 0, triangles: 0, bytes: 0 };
    const stations = this.stationsByTile.get(tileId) ?? [], signs = this.signsByTile.get(tileId) ?? [], parking = level < 2 ? this.parkingByTile.get(tileId) ?? [] : [];
    const lights = this.lightsByTile.get(tileId) ?? [];
    if (!stations.length && !signs.length && !parking.length && !lights.length) { group.userData.roadsideCommerce = report; return report; }
    const terrain = tileTerrain(group);
    const local = (x: number, y: number, n: number) => new THREE.Vector3(x - origin[0], y - origin[1], -n - origin[2]);
    const groundAt = (x: number, n: number, fallback: number): number => {
      const p = terrain.sample(x - origin[0], -n - origin[2]);
      const y = p ? p.y + origin[1] : fallback;
      return Number.isFinite(y) && Math.abs(y - fallback) < 6 ? y : fallback;
    };
    const b = new Builder();
    const faces = this.atlas ? new FaceGeometry(this.atlas.slots) : null;
    const roofs: THREE.Mesh[] = [];
    for (const s of stations) {
      if (s.carve && s.tileId === tileId) {
        // The filter adds `origin` to world positions; a tile group already
        // placed at its origin needs only the remainder.
        group.updateMatrixWorld(true);
        const offset = new THREE.Vector3(origin[0], origin[1], origin[2]).sub(new THREE.Vector3().setFromMatrixPosition(group.matrixWorld));
        report.carvedTriangles += filterEvidenceSources(group, offset, [{ id: s.carve.id, tileId, outline: s.carve.outline, base: s.carve.base, peak: s.carve.peak, replaceBody: true }]).removedTriangles;
        roofs.push(this.rebuiltBody(b, s.carve, s.centre, local));
        clearUnderCanopy(group, s, origin);
      }
      if (s.tileId === tileId) { report.islands += this.canopy(b, s, local, groundAt, level); report.stations++; }
      if (s.priceSign.tileId === tileId) this.priceSign(b, faces, s, local, groundAt);
    }
    for (const sign of signs) {
      if (sign.kind === 'wall') this.wallSign(b, faces, sign, local, groundAt, level);
      else this.roadsideSign(b, faces, sign, local, groundAt, level);
      report.signs++;
    }
    for (const light of lights) this.lotLight(b, light, local, groundAt, level);
    const stripes = parking.length ? this.stallLines(parking, local, groundAt) : null;
    report.stalls = parking.reduce((n, row) => n + row.count, 0);
    const built = b.finish(this.materials as unknown as Record<string, THREE.Material>);
    built.name = 'Roadside commerce';
    built.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const role = o.name.replace('Street dressing | ', '');
      o.name = `Roadside commerce | ${role}`;
      o.castShadow = !['lamp', 'screen', 'hose'].includes(role);
    });
    if (faces && this.atlas) {
      this.faceMaterial ??= faceMaterial(this.atlas.texture);
      const mesh = faces.mesh(this.faceMaterial);
      if (mesh) { built.add(mesh); report.faces = faces.count; }
    }
    if (stripes) built.add(stripes);
    for (const roof of roofs) built.add(roof);
    const cars = parkedCars(parking, this.caps[Math.min(level, 2)], groundAt);
    if (cars.length) { for (const mesh of this.lotCars(cars, origin)) built.add(mesh); report.cars = cars.length; }
    if (built.children.length) group.add(built);
    built.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const instances = o instanceof THREE.InstancedMesh ? o.count : 1;
      report.triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3 * instances;
      for (const a of Object.values(o.geometry.attributes)) report.bytes += (a as THREE.BufferAttribute).array.byteLength;
      if (o.geometry.index) report.bytes += o.geometry.index.array.byteLength;
    });
    group.userData.roadsideCommerce = report;
    return report;
  }

  /** Canopy deck, columns, islands, dispensers and bollards; returns the island count. */
  private canopy(b: Builder, s: Station, local: (x: number, y: number, n: number) => THREE.Vector3, groundAt: (x: number, n: number, f: number) => number, level: number): number {
    const [ce, cn] = s.centre, [ae, an] = s.axis, be = -an, bn = ae;
    const at = (u: number, v: number): [number, number] => [ce + ae * u + be * v, cn + an * u + bn * v];
    const dir: [number, number] = [ae, -an];
    const fallback = s.top - 5.3;
    const g0 = groundAt(ce, cn, fallback);
    // A deep fascia on the larger canopies; never less than 3.9 m clearance.
    let fascia = s.width >= 12 ? 1.05 : 0.85;
    const lowest = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([i, j]) => groundAt(...at(i * s.length / 2, j * s.width / 2), g0)));
    fascia = Math.max(0.45, Math.min(fascia, s.top - Math.max(g0, lowest) - 3.9));
    const soffit = s.top - fascia;
    const c = local(ce, s.top - fascia / 2, cn);
    b.box('fascia', [c.x, c.y, c.z], dir, s.length, fascia, s.width);
    const band = local(ce, s.top - fascia * 0.56, cn);
    b.box(`band${s.palette % STATION_PALETTES.length}`, [band.x, band.y, band.z], dir, s.length + 0.04, fascia * 0.3, s.width + 0.04);
    const reveal = local(ce, soffit + 0.05, cn);
    b.box('trim', [reveal.x, reveal.y, reveal.z], dir, s.length + 0.02, 0.07, s.width + 0.02);
    if (level < 2) {
      const nx = Math.max(2, Math.round(s.length / 4.2)), ny = Math.max(1, Math.round(s.width / 4.2));
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const [e, n] = at((i + 0.5) / nx * s.length - s.length / 2, (j + 0.5) / ny * s.width - s.width / 2);
        const p = local(e, soffit - 0.02, n);
        b.box('lamp', [p.x, p.y, p.z], dir, 0.62, 0.04, 0.62);
      }
    }
    const pitch = s.length / s.cols, islandLength = Math.min(5.2, pitch - 1.3), islandWidth = 1.05;
    let islands = 0;
    for (let i = 0; i < s.cols; i++) for (let j = 0; j < s.rows; j++) {
      const u = (i + 0.5) * pitch - s.length / 2, v = (j + 0.5) / s.rows * s.width - s.width / 2;
      const [e, n] = at(u, v), g = groundAt(e, n, g0), top = g + 0.15;
      islands++;
      if (level >= 2) {
        const [colE, colN] = at(u + islandLength * 0.3, v);
        const col = local(colE, (g + soffit) / 2, colN);
        b.box('column', [col.x, col.y, col.z], dir, 0.36, soffit - g, 0.36);
        continue;
      }
      const island = local(e, g - 0.025, n);
      b.box('concrete', [island.x, island.y, island.z], dir, islandLength, 0.35, islandWidth);
      // Column on the island, clad at its foot.
      const [colE, colN] = at(u + islandLength * 0.3, v);
      const col = local(colE, (top + soffit) / 2, colN);
      b.box('column', [col.x, col.y, col.z], dir, 0.36, soffit - top, 0.36);
      const base = local(colE, top + 0.55, colN);
      b.box('masonry', [base.x, base.y, base.z], dir, 0.64, 1.1, 0.64);
      // Dispenser: body, coloured header, a display and nozzle boot each side.
      const [de, dn] = at(u - islandLength * 0.12, v);
      const body = local(de, top + 0.9, dn);
      b.box('dispenser', [body.x, body.y, body.z], dir, 1.12, 1.8, 0.52);
      const header = local(de, top + 1.95, dn);
      b.box(`band${s.palette % STATION_PALETTES.length}`, [header.x, header.y, header.z], dir, 1.16, 0.3, 0.56);
      const screen = local(de, top + 1.38, dn);
      b.box('screen', [screen.x, screen.y, screen.z], dir, 0.5, 0.34, 0.56);
      if (level === 0) {
        for (const side of [-1, 1]) {
          const [he, hn] = at(u - islandLength * 0.12 + 0.3, v + side * 0.3);
          const holster = local(he, top + 1.0, hn);
          b.box('hose', [holster.x, holster.y, holster.z], dir, 0.16, 0.34, 0.12);
        }
        for (const end of [-1, 1]) {
          const [pe, pn] = at(u + end * (islandLength / 2 + 0.28), v);
          const foot = local(pe, g - 0.2, pn), head = local(pe, g + 1.05, pn);
          b.cylinder('bollard', [foot.x, foot.y, foot.z], [head.x, head.y, head.z], 0.085, 0.085, 10);
        }
      }
    }
    return islands;
  }

  /** Double-sided price sign on two posts, set at right angles to the street. */
  private priceSign(b: Builder, faces: FaceGeometry | null, s: Station, local: (x: number, y: number, n: number) => THREE.Vector3, groundAt: (x: number, n: number, f: number) => number): void {
    const [x, n] = s.priceSign.at, [te, tn] = s.priceSign.along;
    const { header, rows, width } = priceSignFaces(s);
    const g = groundAt(x, n, s.priceSign.z);
    const across: [number, number] = [-tn, te];           // sign plane runs away from the street
    const dir: [number, number] = [across[0], -across[1]];
    const bottom = g + 2.3, height = 0.9 + rows.length * 0.6 + 0.12, top = bottom + height;
    for (const side of [-1, 1]) {
      const p = local(x + across[0] * side * (width / 2 - 0.32), (g - 0.3 + bottom + 0.25) / 2, n + across[1] * side * (width / 2 - 0.32));
      b.box('signPost', [p.x, p.y, p.z], dir, 0.2, bottom + 0.55 - g, 0.2);
    }
    const cab = local(x, bottom + height / 2, n);
    b.box('signFrame', [cab.x, cab.y, cab.z], dir, width, height, 0.34);
    const cap = local(x, top + 0.06, n);
    b.box('signFrame', [cap.x, cap.y, cap.z], dir, width + 0.1, 0.12, 0.42);
    if (!faces) return;
    const right = new THREE.Vector3(across[0], 0, -across[1]).normalize(), normal = new THREE.Vector3(te, 0, -tn).normalize();
    for (const side of [1, -1]) {
      const nrm = normal.clone().multiplyScalar(side), r = right.clone().multiplyScalar(side), off = 0.172;
      const put = (face: FaceSpec, y: number, u: number, w: number, h: number) =>
        faces.add(face, local(x + across[0] * u * side, y, n + across[1] * u * side).addScaledVector(nrm, off), r, nrm, w, h);
      put(header, top - 0.06 - 0.39, 0, width - 0.16, 0.78);
      rows.forEach((row, i) => {
        const y = top - 0.9 - 0.3 - i * 0.6;
        put(row.label, y, -width * 0.25 + 0.02, width * 0.44, 0.5);
        put(row.digits, y, width * 0.24, width * 0.5, 0.5);
      });
    }
  }

  private wallSign(b: Builder, faces: FaceGeometry | null, sign: Sign, local: (x: number, y: number, n: number) => THREE.Vector3, groundAt: (x: number, n: number, f: number) => number, level: number): void {
    const panel = sign.panels[0];
    const [x, n] = sign.at, [ne, nn] = sign.normal!;
    const w = panel.w!, h = panel.h!, depth = 0.12;
    const along: [number, number] = [-nn, ne];
    const dir: [number, number] = [along[0], -along[1]];
    const c = local(x + ne * depth / 2, sign.y!, n + nn * depth / 2);
    b.box('signFrame', [c.x, c.y, c.z], dir, w, h, depth);
    const normal = new THREE.Vector3(ne, 0, -nn).normalize(), right = new THREE.Vector3(along[0], 0, -along[1]).normalize();
    // Legends read left to right facing the wall: right = up x normal.
    if (new THREE.Vector3(0, 1, 0).cross(normal).dot(right) < 0) right.negate();
    if (faces) faces.add(styleFace(panel.text, panel.style, w, h), local(x + ne * (depth + 0.004), sign.y!, n + nn * (depth + 0.004)), right, normal, w - 0.08, h - 0.08);
    if (panel.text === 'FOOD MART' && level === 0) {
      // An ice merchandiser beside the entrance.
      const u = w / 2 + 1.3, pe = x + right.x * u + ne * 0.55, pn = n - right.z * u + nn * 0.55;
      const g = groundAt(pe, pn, sign.y! - 3);
      const box = local(pe, g + 0.95, pn);
      b.box('ice', [box.x, box.y, box.z], dir, 1.5, 1.9, 0.8);
      if (faces) faces.add(ICE, local(pe + ne * 0.402, g + 1.2, pn + nn * 0.402), right, normal, 1.3, 0.5);
    }
  }

  private roadsideSign(b: Builder, faces: FaceGeometry | null, sign: Sign, local: (x: number, y: number, n: number) => THREE.Vector3, groundAt: (x: number, n: number, f: number) => number, level: number): void {
    const [x, n] = sign.at, [te, tn] = sign.along!;
    const { faces: panels, width, panelHeight, bottom: lift } = roadsidePanels(sign);
    const monument = sign.kind === 'monument';
    const ground = groundAt(x, n, sign.z!);
    const across: [number, number] = [-tn, te];
    const dir: [number, number] = [across[0], -across[1]];
    const stack = panels.length * panelHeight + (panels.length - 1) * 0.06 + 0.16;
    const bottom = ground + lift;
    const top = bottom + stack;
    if (monument) {
      const base = local(x, ground + 0.72 / 2 - 0.1, n);
      b.box('masonry', [base.x, base.y, base.z], dir, width + 0.5, 0.92, 0.62);
    } else if (width < 2.3) {
      const foot = local(x, ground - 0.3, n), head = local(x, bottom + 0.2, n);
      b.cylinder('signPost', [foot.x, foot.y, foot.z], [head.x, head.y, head.z], 0.16, 0.16, 12);
    } else {
      for (const side of [-1, 1]) {
        const p = local(x + across[0] * side * (width / 2 - 0.3), (ground - 0.3 + bottom + 0.2) / 2, n + across[1] * side * (width / 2 - 0.3));
        b.box('signPost', [p.x, p.y, p.z], dir, 0.2, bottom + 0.5 - ground, 0.2);
      }
    }
    const cab = local(x, bottom + stack / 2, n);
    b.box('signFrame', [cab.x, cab.y, cab.z], dir, width, stack, 0.34);
    const cap = local(x, top + 0.05, n);
    b.box(monument ? 'masonry' : 'signFrame', [cap.x, cap.y, cap.z], dir, width + (monument ? 0.6 : 0.1), 0.1, monument ? 0.74 : 0.42);
    if (!faces || level >= 2) return;
    const right = new THREE.Vector3(across[0], 0, -across[1]).normalize(), normal = new THREE.Vector3(te, 0, -tn).normalize();
    for (const side of [1, -1]) {
      const nrm = normal.clone().multiplyScalar(side), r = right.clone().multiplyScalar(side);
      panels.forEach((face, i) => {
        const y = top - 0.08 - panelHeight / 2 - i * (panelHeight + 0.06);
        faces.add(face, local(x, y, n).addScaledVector(nrm, 0.172), r, nrm, width - 0.14, panelHeight);
      });
    }
  }

  /** Painted block walls with a metal coping and a flat membrane roof over `carve.body`. */
  private rebuiltBody(b: Builder, carve: Carve, centre: V2, local: (x: number, y: number, n: number) => THREE.Vector3): THREE.Mesh {
    const pts = carve.body, area = pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    const height = carve.eave - carve.base;
    for (let i = 0; i < pts.length; i++) {
      const [ae, an] = pts[i], [ce, cn] = pts[(i + 1) % pts.length], de = ce - ae, dn = cn - an, w = Math.hypot(de, dn);
      if (w < 0.05) continue;
      // Inward normal: left of a counter-clockwise edge.
      const ie = (area > 0 ? -dn : dn) / w, in_ = (area > 0 ? de : -de) / w;
      const wall = local((ae + ce) / 2 + ie * 0.1, carve.base + height / 2, (an + cn) / 2 + in_ * 0.1);
      b.box('block', [wall.x, wall.y, wall.z], [de / w, -dn / w], w + 0.2, height, 0.2);
      const coping = local((ae + ce) / 2 + ie * 0.1, carve.eave + 0.06, (an + cn) / 2 + in_ * 0.1);
      b.box('coping', [coping.x, coping.y, coping.z], [de / w, -dn / w], w + 0.32, 0.14, 0.34);
      // Openings: a glazed front with a door where the wall faces the pumps,
      // a few service windows elsewhere.
      if (w < 3.2) continue;
      const mid = [(ae + ce) / 2, (an + cn) / 2], toward = [centre[0] - mid[0], centre[1] - mid[1]];
      const front = -(ie * toward[0] + in_ * toward[1]) > 0.3 * Math.hypot(toward[0], toward[1]);
      const count = front ? Math.max(2, Math.floor(w / 3.2)) : Math.max(1, Math.floor(w / 6));
      for (let k = 0; k < count; k++) {
        const u = (k + 0.5) / count, door = front && k === Math.floor(count / 2);
        const [ow, oh, sill] = door ? [1.0, 2.2, 0] : front ? [Math.min(2.2, w / count - 0.6), 1.7, 0.55] : [1.1, 1.1, 1.1];
        const at = [ae + de * u - ie * 0.01, an + dn * u - in_ * 0.01];
        const pane = local(at[0], carve.base + 0.15 + sill + oh / 2, at[1]);
        b.box('window', [pane.x, pane.y, pane.z], [de / w, -dn / w], ow, oh, 0.06);
        const head = local(at[0] - ie * 0.03, carve.base + 0.15 + sill + oh + 0.06, at[1] - in_ * 0.03);
        b.box('frame', [head.x, head.y, head.z], [de / w, -dn / w], ow + 0.16, 0.1, 0.1);
      }
    }
    const contour = pts.map(p => new THREE.Vector2(p[0], p[1]));
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    const position: number[] = [];
    for (const tri of triangles) {
      const corners = tri.map(k => local(pts[k][0], carve.eave - 0.02, pts[k][1]));
      const up = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[2], corners[0])).y > 0;
      for (const c of up ? corners : [corners[0], corners[2], corners[1]]) position.push(c.x, c.y, c.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(position.map((_, k) => k % 3 === 1 ? 1 : 0), 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    const roof = new THREE.Mesh(g, this.materials.roofing);
    roof.name = 'Roadside commerce | rebuilt roof'; roof.userData.townCrafted = true; roof.castShadow = true; roof.receiveShadow = true;
    return roof;
  }

  /** A lot light: concrete pier, square steel pole and twin flat LED heads. */
  private lotLight(b: Builder, light: LotLight, local: (x: number, y: number, n: number) => THREE.Vector3, groundAt: (x: number, n: number, f: number) => number, level: number): void {
    const [x, n] = light.at, [te, tn] = light.dir, g = groundAt(x, n, light.z), top = g + 8.2;
    const dir: [number, number] = [te, -tn];
    const pole = local(x, (g + 0.6 + top) / 2, n);
    const foot = local(x, g - 0.3, n), cap = local(x, g + 0.6, n);
    b.cylinder('pier', [foot.x, foot.y, foot.z], [cap.x, cap.y, cap.z], 0.32, 0.3, 10);
    b.box('signPost', [pole.x, pole.y, pole.z], dir, 0.14, top - g - 0.6, 0.14);
    if (level >= 2) return;
    // Heads reach both ways along the row, over the stall noses.
    for (const side of [-1, 1]) {
      const arm = local(x - tn * side * 0.45, top - 0.1, n + te * side * 0.45);
      b.box('signPost', [arm.x, arm.y, arm.z], [-tn, -te], 0.9, 0.07, 0.07);
      const head = local(x - tn * side * 1.05, top - 0.13, n + te * side * 1.05);
      b.box('signFrame', [head.x, head.y, head.z], [-tn, -te], 0.62, 0.1, 0.36);
      const lens = local(x - tn * side * 1.05, top - 0.185, n + te * side * 1.05);
      b.box('lamp', [lens.x, lens.y, lens.z], [-tn, -te], 0.5, 0.012, 0.28);
    }
  }

  /** White stall lines between and at the ends of each row, laid on the ground. */
  private stallLines(rows: readonly ParkingRow[], local: (x: number, y: number, n: number) => THREE.Vector3, groundAt: (x: number, n: number, f: number) => number): THREE.Mesh | null {
    const p: number[] = [], nrm: number[] = [];
    const half = STALL.line / 2, steps = 3;
    for (const row of rows) {
      const [ae, an] = row.a, [te, tn] = row.t, [oe, on] = row.o;
      for (let i = 0; i <= row.count; i++) {
        const u = i * STALL.width;
        // A line from the walk side to the aisle, sampled along its length.
        const strip: THREE.Vector3[][] = [];
        for (let k = 0; k <= steps; k++) {
          const v = 0.25 + (STALL.depth - 0.25) * k / steps;
          const e = ae + te * u + oe * v, n = an + tn * u + on * v, g = groundAt(e, n, row.z) + 0.018;
          strip.push([local(e - te * half, g, n - tn * half), local(e + te * half, g, n + tn * half)]);
        }
        for (let k = 0; k < steps; k++) {
          const [a, b] = strip[k], [c, d] = strip[k + 1];
          const up = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
          const quad = up.y >= 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
          up.normalize(); if (up.y < 0) up.negate();
          for (const q of quad) { p.push(q.x, q.y, q.z); nrm.push(up.x, up.y, up.z); }
        }
      }
    }
    if (!p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    const material = this.materials.stripe;
    material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2;
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'Roadside commerce | stall lines'; mesh.userData.townCrafted = true; mesh.receiveShadow = true;
    return mesh;
  }

  /** One instanced draw each for painted bodies, glass and tyres. */
  private lotCars(cars: readonly ParkedPlacement[], origin: readonly number[]): THREE.InstancedMesh[] {
    this.lotCar ??= lotCarGeometry();
    const matrix = new THREE.Matrix4(), colour = new THREE.Color();
    const meshes = (['body', 'glass', 'tyres'] as const).map(part => {
      const mesh = new THREE.InstancedMesh(this.lotCar![part].clone(), this.materials[`car${part[0].toUpperCase()}${part.slice(1)}`], cars.length);
      mesh.name = `Roadside commerce | lot car ${part}`;
      mesh.userData.townCrafted = true; mesh.userData.category = 'cars';
      mesh.castShadow = part !== 'glass'; mesh.receiveShadow = true;
      return mesh;
    });
    cars.forEach((car, i) => {
      const f = new THREE.Vector3(car.forward[0], car.grade[0], -car.forward[1]).normalize();
      const r = new THREE.Vector3(car.forward[1], car.grade[1], car.forward[0]).normalize();
      const up = new THREE.Vector3().crossVectors(r, f).normalize(), right = new THREE.Vector3().crossVectors(f, up).normalize();
      matrix.makeBasis(right, up, f.clone().negate()).scale(new THREE.Vector3(car.scale, car.scale, car.scale));
      matrix.setPosition(car.center[0] - origin[0], car.center[2] - origin[1], -car.center[1] - origin[2]);
      for (const mesh of meshes) mesh.setMatrixAt(i, matrix);
      meshes[0].setColorAt(i, colour.set(car.color));
    });
    for (const mesh of meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
    if (meshes[0].instanceColor) meshes[0].instanceColor.needsUpdate = true;
    return meshes;
  }

  dispose(): void {
    if (this.lotCar) for (const g of Object.values(this.lotCar)) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.faceMaterial?.dispose();
    this.atlas?.texture.dispose();
  }
}

/** A light parked-car form in local car space (forward is -Z, as the drive
 * car): a painted lower body with hood and deck, a narrower glass cabin with a
 * painted roof, and four tyres. About 160 triangles. */
export function lotCarGeometry(): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; tyres: THREE.BufferGeometry } {
  /** Appends a closed convex part with every face turned away from its centre. */
  const add = (triangles: number[][][], out: number[]) => {
    const c = [0, 0, 0]; let count = 0;
    for (const t of triangles) for (const v of t) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; count++; }
    c[0] /= count; c[1] /= count; c[2] /= count;
    for (const [a, b, d] of triangles) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const m = [(a[0] + b[0] + d[0]) / 3 - c[0], (a[1] + b[1] + d[1]) / 3 - c[1], (a[2] + b[2] + d[2]) / 3 - c[2]];
      out.push(...a, ...(n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0 ? [...b, ...d] : [...d, ...b]));
    }
  };
  // Side profiles (x along the car, +x = front; y up) extruded across the
  // width; `taper` narrows the section with height (a cabin's tumblehome).
  const prism = (profile: number[][], half: number, out: number[], taper = (_y: number) => 1) => {
    const n = profile.length, at = (p: number[], side: number) => [side * half * taper(p[1]), p[1], -p[0]];
    const triangles: number[][][] = [];
    for (let i = 0; i < n; i++) {
      const a = profile[i], b = profile[(i + 1) % n];
      triangles.push([at(a, -1), at(b, -1), at(b, 1)], [at(a, -1), at(b, 1), at(a, 1)]);
    }
    for (const t of THREE.ShapeUtils.triangulateShape(profile.map(p => new THREE.Vector2(p[0], p[1])), []))
      for (const side of [-1, 1]) triangles.push(t.map(k => at(profile[k], side)));
    add(triangles, out);
  };
  const geometry = (positions: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  };
  const body: number[] = [], glass: number[] = [], tyres: number[] = [];
  // A mid-size sedan: bumpers, hood and deck to the beltline, then a tapering
  // glass cabin under a painted roof.
  prism([[-2.28, 0.22], [2.3, 0.22], [2.33, 0.6], [2.2, 0.78], [1.2, 0.95], [-1.45, 0.98], [-2.15, 0.98], [-2.3, 0.74]], 0.88, body);
  const tumble = (y: number) => 1 - Math.max(0, y - 0.93) * 0.38;
  prism([[1.26, 0.93], [0.36, 1.37], [-0.86, 1.39], [-1.5, 0.95]], 0.8, glass, tumble);
  prism([[0.38, 1.36], [-0.88, 1.38], [-0.86, 1.42], [0.34, 1.4]], 0.8, body, tumble);
  for (const [x, z] of [[1.38, -0.75], [1.38, 0.75], [-1.35, -0.75], [-1.35, 0.75]]) {
    const r = 0.32, w = 0.2, sides = 10, c = [z, r, -x], triangles: number[][][] = [];
    const p = (a: number, s: number) => [c[0] + s * w / 2, c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r];
    for (let i = 0; i < sides; i++) {
      const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
      triangles.push([p(a0, -1), p(a1, -1), p(a1, 1)], [p(a0, -1), p(a1, 1), p(a0, 1)]);
      for (const s of [-1, 1]) triangles.push([[c[0] + s * w / 2, c[1], c[2]], p(a0, s), p(a1, s)]);
    }
    add(triangles, tyres);
  }
  return { body: geometry(body), glass: geometry(glass), tyres: geometry(tyres) };
}

/** Foundation planting laid along a traced footprint that turned out to be a
 * canopy: shrubs, beds and walks inside the canopy (plus half a metre) go. */
export function clearUnderCanopy(group: THREE.Object3D, s: Station, origin: readonly number[]): number {
  const inside = (x: number, z: number) => {
    const e = x + origin[0] - s.centre[0], n = -(z + origin[2]) - s.centre[1];
    return Math.abs(e * s.axis[0] + n * s.axis[1]) < s.length / 2 + 0.5 && Math.abs(-e * s.axis[1] + n * s.axis[0]) < s.width / 2 + 0.5;
  };
  group.updateMatrixWorld(true);
  const toTile = new THREE.Matrix4().copy(group.matrixWorld).invert(), m = new THREE.Matrix4(), p = new THREE.Vector3(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  let cleared = 0;
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.name.startsWith('House dressing |')) return;
    if (o instanceof THREE.InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld).applyMatrix4(toTile);
        if (inside(p.x, p.z)) { o.setMatrixAt(i, hidden); cleared++; }
      }
      o.instanceMatrix.needsUpdate = true;
      return;
    }
    const position = o.geometry.getAttribute('position');
    if (!position || o.geometry.index) return;
    const keep: number[] = [];
    for (let t = 0; t < position.count; t += 3) {
      p.set(0, 0, 0);
      for (let k = 0; k < 3; k++) p.add(new THREE.Vector3().fromBufferAttribute(position, t + k));
      p.multiplyScalar(1 / 3).applyMatrix4(o.matrixWorld).applyMatrix4(toTile);
      if (inside(p.x, p.z)) { cleared++; continue; }
      for (let k = 0; k < 3; k++) keep.push(t + k);
    }
    if (keep.length === position.count) return;
    const next = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(o.geometry.attributes) as [string, THREE.BufferAttribute][]) {
      const values = new Float32Array(keep.length * attribute.itemSize);
      keep.forEach((v, i) => { for (let k = 0; k < attribute.itemSize; k++) values[i * attribute.itemSize + k] = attribute.array[v * attribute.itemSize + k]; });
      next.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    next.computeBoundingBox(); next.computeBoundingSphere();
    o.geometry.dispose(); o.geometry = next;
  });
  return cleared;
}

/** Stable, sparse occupancy: each stall's own hash against its row's rate,
 * the rows nearest the storefronts first, up to `cap` cars. */
export function parkedCars(rows: readonly ParkingRow[], cap: number, groundAt: (x: number, n: number, f: number) => number): ParkedPlacement[] {
  if (cap <= 0) return [];
  const chosen: { row: ParkingRow; i: number; value: number }[] = [];
  for (const row of rows) for (let i = 0; i < row.count; i++) {
    const value = hashUnit(`${row.site}|${row.a[0]},${row.a[1]}|${i}`);
    if (value < row.occupancy) chosen.push({ row, i, value });
  }
  chosen.sort((x, y) => x.row.band - y.row.band || x.value - y.value);
  const out: ParkedPlacement[] = [];
  for (const { row, i, value } of chosen) {
    if (out.length >= cap) break;
    const [ae, an] = row.a, [te, tn] = row.t, [oe, on] = row.o;
    const u = (i + 0.5) * STALL.width, v = STALL.depth / 2 + (value - 0.5) * 0.3;
    const centre = [ae + te * u + oe * v, an + tn * u + on * v];
    // One car in eight backed in.
    const flip = hashUnit(`${value}`) < 0.125 ? -1 : 1;
    const forward = [oe * row.facing * flip, on * row.facing * flip], right = [forward[1], -forward[0]];
    const scale = 0.95 + (value * 97 % 1) * 0.06;
    const at = (a: number, b: number) => [centre[0] + (forward[0] * a + right[0] * b) * scale, centre[1] + (forward[1] * a + right[1] * b) * scale];
    const corners = [[-2.276, -1.14], [2.276, -1.14], [2.276, 1.14], [-2.276, 1.14]].map(([a, b]) => at(a, b));
    const h = [[-1.325, -0.814], [1.325, -0.814], [1.325, 0.814], [-1.325, 0.814]].map(([a, b]) => { const q = at(a, b); return groundAt(q[0], q[1], row.z); });
    const mean = h.reduce((x, y) => x + y, 0) / 4;
    const along = ((h[1] + h[2]) - (h[0] + h[3])) / (4 * 1.325 * scale), across = ((h[2] + h[3]) - (h[0] + h[1])) / (4 * 0.814 * scale);
    if (Math.hypot(along, across) > 0.12) continue;
    out.push({ center: [centre[0], centre[1], mean + 0.016], corners, forward, grade: [along, across], color: CAR_COLOURS[Math.floor(value * 1e4) % CAR_COLOURS.length], scale });
  }
  return out;
}

const ICE = plainFace('ice|ICE', 'ICE', { field: '#f4f6f7', legend: '#1f64b4' }, 1.3, 0.5, 'sans', [0.12, 0], 0.8);

/** Stations and signs by tile, for acceptance checks. */
export function commerceTiles(input: CommerceData = DATA): string[] {
  return [...new Set([...input.stations.flatMap(s => [s.tileId, s.priceSign.tileId]), ...input.signs.map(s => s.tileId)])].sort();
}

export const COMMERCE_TILE_SIZE = TILE;
