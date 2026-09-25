import * as THREE from 'three';
import type { NetworkData, RoadEdge } from './engine';

/**
 * Street-name signs at the corners of named intersections: two stacked
 * reflective green blades with white lettering and a white border on a
 * galvanized post, each blade parallel to the street it names. The names are
 * the mapped street names; the sign form follows the common Massachusetts
 * pattern. Which corner carries the post, its setback and the blade heights
 * are authored, not surveyed.
 */
export type SignPlacement = { x: number; n: number; z: number; names: [string, string]; dirs: [[number, number], [number, number]] };

const TILE = 250;
const ELIGIBLE = new Set([3, 4, 5]);
const CELL_W = 176, CELL_H = 32, COLUMNS = 11;
const BLADE_LENGTH = 0.84, BLADE_HEIGHT = 0.16, BLADE_DEPTH = 0.012;
const SUFFIX: Record<string, string> = { STREET: 'St', ROAD: 'Rd', AVENUE: 'Ave', DRIVE: 'Dr', LANE: 'Ln', COURT: 'Ct', CIRCLE: 'Cir', PLACE: 'Pl', TERRACE: 'Ter', EXTENSION: 'Ext', BOULEVARD: 'Blvd', HIGHWAY: 'Hwy', PARKWAY: 'Pkwy', SQUARE: 'Sq' };

/** "SCHOOL STREET" -> "School St", as lettered on current Massachusetts blades. */
export function signLabel(name: string): string {
  return name.trim().split(/\s+/).map((word, i, words) => {
    const upper = word.toUpperCase();
    if (i === words.length - 1 && SUFFIX[upper]) return SUFFIX[upper];
    if (/^(?:[IVX]+|JR|SR)$/.test(upper) && upper.length <= 3) return upper === 'JR' ? 'Jr' : upper === 'SR' ? 'Sr' : upper;
    return upper.charAt(0) + upper.slice(1).toLowerCase();
  }).join(' ');
}

function centreline(edge: RoadEdge): number[][] {
  // Directed edges share the street centreline; lane_offset_m is the driving line.
  return edge.points.map(p => [p[0], p[1], p[2] ?? 0]);
}

/** Two named streets meeting at a node, with the direction each leaves it. */
export function findSignPlacements(network: NetworkData): SignPlacement[] {
  type Arm = { name: string; dir: [number, number]; half: number; weight: number };
  const arms = new Map<number, Arm[]>();
  const nodes = new Map<number, number[]>();
  const seen = new Set<number>();
  for (const edge of network.edges) {
    const id = Number(edge.physical_id ?? edge.id);
    if (seen.has(id) || !ELIGIBLE.has(Number(edge.road_type))) continue;
    const name = String(edge.name ?? '');
    if (!name || name === 'Unnamed road' || /INTERSTATE|RAMP|ROUTE \d/i.test(name)) continue;
    seen.add(id);
    const line = centreline(edge);
    if (line.length < 2) continue;
    const half = Number(edge.width_m ?? 7) / 2;
    const ends: [number, number[], number[]][] = [[edge.from, line[0], line[Math.min(2, line.length - 1)]], [edge.to, line[line.length - 1], line[Math.max(0, line.length - 3)]]];
    for (const [node, at, toward] of ends) {
      const dx = toward[0] - at[0], dn = toward[1] - at[1], l = Math.hypot(dx, dn);
      if (l < 1) continue;
      nodes.set(node, at);
      const list = arms.get(node) ?? [];
      list.push({ name, dir: [dx / l, dn / l], half, weight: Number(edge.length_m ?? l) });
      arms.set(node, list);
    }
  }
  const placements: SignPlacement[] = [];
  for (const [node, list] of arms) {
    const names = [...new Set(list.map(a => a.name))];
    if (names.length < 2) continue;
    // The two widest (then longest) streets name the corner.
    const best = (name: string) => list.filter(a => a.name === name).sort((a, b) => b.half - a.half || b.weight - a.weight)[0];
    const ranked = names.map(best).sort((a, b) => b.half - a.half || b.weight - a.weight);
    const [a, b] = ranked;
    const cross = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
    if (Math.abs(cross) < 0.35) continue; // nearly parallel arms: no clear corner
    const at = nodes.get(node)!;
    const x = at[0] + a.dir[0] * (b.half + 1.7) + b.dir[0] * (a.half + 1.7);
    const n = at[1] + a.dir[1] * (b.half + 1.7) + b.dir[1] * (a.half + 1.7);
    placements.push({ x, n, z: at[2] ?? 0, names: [a.name, b.name], dirs: [a.dir, b.dir] });
  }
  return placements;
}

/** One atlas of every blade legend: white lettering and border as a mask. */
function buildAtlas(names: string[]): { texture: THREE.DataTexture; cells: Map<string, number> } | null {
  if (typeof document === 'undefined') return null;
  const rows = Math.ceil(names.length / COLUMNS);
  const width = CELL_W * COLUMNS, height = Math.max(CELL_H, rows * CELL_H);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cells = new Map<string, number>();
  names.forEach((name, i) => {
    const cx = (i % COLUMNS) * CELL_W, cy = Math.floor(i / COLUMNS) * CELL_H;
    cells.set(name, i);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    const r = 3.5, x0 = cx + 3, y0 = cy + 3, x1 = cx + CELL_W - 3, y1 = cy + CELL_H - 3;
    ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + r); ctx.lineTo(x1, y1 - r); ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
    ctx.lineTo(x0 + r, y1); ctx.quadraticCurveTo(x0, y1, x0, y1 - r); ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0); ctx.closePath(); ctx.stroke();
    const label = signLabel(name);
    ctx.font = '600 19px "Helvetica Neue", Helvetica, Arial, sans-serif';
    const measured = ctx.measureText(label).width, room = CELL_W - 18;
    ctx.save();
    ctx.translate(cx + CELL_W / 2, cy + CELL_H / 2 + 1);
    if (measured > room) ctx.scale(room / measured, 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  // Texture row 0 is the canvas's top row (flipY false); blade UVs follow it.
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) mask[i] = rgba[j];
  const texture = new THREE.DataTexture(mask, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = 'Street sign legends';
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  canvas.width = canvas.height = 0;
  return { texture, cells };
}

function bladeMaterial(atlas: THREE.Texture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.42, metalness: 0.0 });
  material.name = 'Street signs | reflective green blade';
  material.userData.townCrafted = true;
  material.envMapIntensity = 0.5;
  material.onBeforeCompile = shader => {
    if (!shader.fragmentShader.includes('#include <map_fragment>')) throw new Error('Street sign shader anchor changed.');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
float townLegend = texture2D(map, vMapUv).r;
// Reflective sheeting: saturated green field, near-white legend.
diffuseColor.rgb = mix(vec3(0.004, 0.105, 0.045), vec3(0.78, 0.8, 0.78), townLegend);`);
  };
  material.customProgramCacheKey = () => 'street-sign-blade-v1';
  return material;
}

export class StreetSigns {
  private readonly byTile = new Map<string, SignPlacement[]>();
  private readonly names: string[];
  private atlas?: { texture: THREE.DataTexture; cells: Map<string, number> } | null;
  private blade?: THREE.MeshStandardMaterial;
  readonly count: number;

  constructor(network: NetworkData) {
    const placements = findSignPlacements(network);
    const names = new Set<string>();
    for (const p of placements) {
      const key = `${Math.floor(p.x / TILE)}_${Math.floor(p.n / TILE)}`;
      const list = this.byTile.get(key); if (list) list.push(p); else this.byTile.set(key, [p]);
      p.names.forEach(name => names.add(name));
    }
    this.names = [...names].sort();
    this.count = placements.length;
    // Lettering is drawn once while the town loads, not when a tile streams in.
    if (placements.length) this.atlas = buildAtlas(this.names);
  }

  placements(tileId: string): readonly SignPlacement[] { return this.byTile.get(tileId) ?? []; }

  /**
   * Blade geometry for a tile's signs (posts are drawn by the caller). `local`
   * maps east/up/north to tile coordinates and `ground` gives the terrain height.
   */
  blades(tileId: string, local: (x: number, y: number, n: number) => [number, number, number], ground: (x: number, n: number, fallback: number) => number): THREE.Mesh | null {
    const placements = this.placements(tileId);
    if (!placements.length) return null;
    if (this.atlas === undefined) this.atlas = buildAtlas(this.names);
    if (!this.atlas) return null;
    this.blade ??= bladeMaterial(this.atlas.texture);
    const atlas = this.atlas, width = CELL_W * COLUMNS, height = atlas.texture.image.height;
    const p: number[] = [], nrm: number[] = [], uv: number[] = [];
    const green = [1 / width, 1 / height];
    for (const sign of placements) {
      const base = ground(sign.x, sign.n, sign.z);
      sign.names.forEach((name, k) => {
        const cell = atlas.cells.get(name);
        if (cell === undefined) return;
        const [dx, dn] = sign.dirs[k];
        // Blades are clamped at their middle to the post top, one above the other.
        const centre = local(sign.x, base + (k === 0 ? 2.86 : 2.66), sign.n);
        // Blade axes in tile coordinates: along the named street, up, and its face normal.
        const L = new THREE.Vector3(dx, 0, -dn).normalize(), U = new THREE.Vector3(0, 1, 0), N = new THREE.Vector3().crossVectors(L, U);
        const C = new THREE.Vector3(...centre);
        // Canvas rows are texture rows, so the cell's top edge has the smaller v.
        const u0 = (cell % COLUMNS) * CELL_W / width, u1 = u0 + CELL_W / width;
        const v1 = Math.floor(cell / COLUMNS) * CELL_H / height, v0 = v1 + CELL_H / height;
        const corner = (a: number, b: number, c: number) => C.clone().addScaledVector(L, a * BLADE_LENGTH / 2).addScaledVector(U, b * BLADE_HEIGHT / 2).addScaledVector(N, c * BLADE_DEPTH / 2);
        const quad = (q: THREE.Vector3[], normal: THREE.Vector3, uvs: number[][]) => {
          for (const i of [0, 1, 2, 0, 2, 3]) { p.push(q[i].x, q[i].y, q[i].z); nrm.push(normal.x, normal.y, normal.z); uv.push(uvs[i][0], uvs[i][1]); }
        };
        // Front (+N) reads left to right along +L; back (-N) along -L.
        quad([corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)], N, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
        quad([corner(1, -1, -1), corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1)], N.clone().negate(), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
        const g = [green, green, green, green];
        quad([corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1), corner(-1, 1, -1)], U, g);
        quad([corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)], U.clone().negate(), g);
        quad([corner(1, -1, 1), corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1)], L, g);
        quad([corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)], L.clone().negate(), g);
      });
    }
    if (!p.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.blade);
    mesh.name = 'Street signs | name blades';
    mesh.userData.townCrafted = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  dispose(): void {
    this.blade?.dispose();
    this.atlas?.texture.dispose();
  }
}
