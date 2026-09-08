// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { CROWN_FORM_BOUNDS, treeForm, habitatAt, TREE_HABITAT_PROVENANCE, createConiferPrototype, disposeConiferPrototype, createOpenBroadleafPrototype } from '../vegetation';

describe('Authored tree forms', () => {
  it('keeps original rows, implied ground and top unchanged while bringing leaf mass lower', () => {
    for (let i = 0; i < 200; i++) {
      const row = [i * 13.7, 20 + i / 10, i * -9.1, 3 + i / 100, 2 + i / 80, 3.2 + i / 110, i * 0.7];
      const original = [...row], f = treeForm(row, [250, 0, -750]);
      expect(row).toEqual(original);
      expect(f.trunk.position[1] - f.trunk.scale[1]).toBeCloseTo(row[1] - row[4] / 0.30 * 0.71, 10);
      expect(f.crown.position[1] + CROWN_FORM_BOUNDS.near.max[1] * f.crown.scale[1]).toBeCloseTo(row[1] + CROWN_FORM_BOUNDS.near.max[1] * row[4], 10);
      const leafBottom = f.crown.position[1] + CROWN_FORM_BOUNDS.near.min[1] * f.crown.scale[1];
      expect(leafBottom).toBeLessThan(row[1] + CROWN_FORM_BOUNDS.near.min[1] * row[4]);
      expect(leafBottom).toBeGreaterThan(f.groundY);
      expect(f.trunk.position[1] + f.trunk.scale[1]).toBeGreaterThan(leafBottom);
      expect(f.crown.scale[0] / row[3]).toBeGreaterThan(0.88);
      expect(f.crown.scale[0] / row[3]).toBeLessThan(1.42);
      expect([...f.crown.position, ...f.crown.scale, ...f.trunk.position, ...f.trunk.scale].every(Number.isFinite)).toBe(true);
      expect(f.trunk.scale.every(value => value > 0)).toBe(true);
    }
  });

  it('matches near and far leaf envelopes and trunk contact without an LOD height jump', () => {
    for (let i = 0; i < 40; i++) {
      const row = [i * 41.21, 19, -i * 12.34, 5, 6, 4, 0];
      const near = treeForm(row, [0, 0, 0]), far = treeForm(row, [0, 0, 0], true);
      expect(far.trunk).toEqual(near.trunk);
      for (let axis = 0; axis < 3; axis++) for (const bound of ['min', 'max'] as const) {
        expect(far.crown.position[axis] + CROWN_FORM_BOUNDS.far[bound][axis] * far.crown.scale[axis])
          .toBeCloseTo(near.crown.position[axis] + CROWN_FORM_BOUNDS.near[bound][axis] * near.crown.scale[axis], 10);
      }
    }
  });

  it('keeps form identity stable when an anchor is assigned to another tile', () => {
    const a = treeForm([13, 25, -17, 3, 4, 3.5, 0.8], [1000, 0, -500]);
    const b = treeForm([263, 25, -267, 3, 4, 3.5, 0.8], [750, 0, -250]);
    expect(a.family).toBe(b.family);
    expect(a.renderFamily).toBe(b.renderFamily);
    expect(a.habitat).toBe(b.habitat);
    expect(a.crown.scale).toEqual(b.crown.scale);
    expect(a.trunk.scale).toEqual(b.trunk.scale);
    expect(a.crown.position[0] + 1000).toBeCloseTo(b.crown.position[0] + 750, 10);
    expect(a.crown.position[2] - 500).toBeCloseTo(b.crown.position[2] - 250, 10);
  });

  it('rejects invalid instance transforms and offers multiple bounded growth forms', () => {
    expect(() => treeForm([0, 0, 0, 1, 0, 1, 0], [0, 0, 0])).toThrow();
    expect(() => treeForm([0, 0, 0, 1, 1, 1, NaN], [0, 0, 0])).toThrow();
    const families = new Set(Array.from({ length: 100 }, (_, i) => treeForm([i * 9.3, 20, -i * 5.7, 3, 4, 3, 0], [0, 0, 0]).family));
    expect(families).toEqual(new Set(['rounded', 'spreading', 'open', 'tiered']));
  });
});


function decodedGrid() {
  const grid = TREE_HABITAT_PROVENANCE.grid;
  const data = new Uint8Array(grid.width * grid.height);
  let offset = 0;
  for (let i = 0; i < grid.runs.length; i += 2) {
    data.fill(grid.runs[i], offset, offset + grid.runs[i + 1]);
    offset += grid.runs[i + 1];
  }
  return { grid, data, offset };
}

describe('mapped habitat context', () => {
  it('decodes the exact validated source-class grid and handles its north/east axes', () => {
    const { grid, data, offset } = decodedGrid();
    expect(offset).toBe(data.length);
    expect(createHash('sha256').update(data).digest('hex')).toBe(grid.decodedSHA256);
    const expected = new Map([[10, 'evergreen-woodland'], [9, 'deciduous-woodland'], [13, 'forested-wetland'], [14, 'wetland-edge'], [12, 'scrub'], [5, 'developed'], [8, 'open'], [0, 'unknown']]);
    for (const [code, habitat] of expected) {
      const i = data.indexOf(code);
      expect(i).toBeGreaterThanOrEqual(0);
      const x = grid.boundsLocalEastNorth[0] + (i % grid.width + .5) * grid.cellSizeM;
      const north = grid.boundsLocalEastNorth[3] - (Math.floor(i / grid.width) + .5) * grid.cellSizeM;
      expect(habitatAt(x, north)).toBe(habitat);
      expect(treeForm([x, 30, -north, 4, 5, 4, 0], [0, 0, 0]).habitat).toBe(habitat);
    }
    expect(habitatAt(NaN, 0)).toBe('unknown');
    expect(habitatAt(grid.boundsLocalEastNorth[2], 0)).toBe('unknown');
    expect(habitatAt(0, grid.boundsLocalEastNorth[1])).toBe('unknown');
  });

  it('uses habitat-shaped cohorts without reallocating anchors or claiming tree species', () => {
    const { grid, data } = decodedGrid();
    const counts = new Map<number, { all: number; conifers: number }>();
    for (let i = 0; i < data.length; i++) {
      if (![9, 10, 13].includes(data[i])) continue;
      const x = grid.boundsLocalEastNorth[0] + (i % grid.width + .5) * grid.cellSizeM;
      const north = grid.boundsLocalEastNorth[3] - (Math.floor(i / grid.width) + .5) * grid.cellSizeM;
      const form = treeForm([x, 30, -north, 4, 5, 4, 0], [0, 0, 0]);
      const count = counts.get(data[i]) ?? { all: 0, conifers: 0 };
      count.all++; count.conifers += Number(form.renderFamily === 'conifer'); counts.set(data[i], count);
      expect(form.trunk.position[0]).toBe(x); expect(form.trunk.position[2]).toBe(-north);
    }
    const share = (code: number) => counts.get(code)!.conifers / counts.get(code)!.all;
    expect(share(10)).toBeGreaterThan(.80);
    expect(share(9)).toBeLessThan(.12);
    expect(share(13)).toBeLessThan(.05);
    expect(TREE_HABITAT_PROVENANCE.source.vintage).toBe('2016');
    expect(TREE_HABITAT_PROVENANCE.interpretation.purpose).toContain('never individual species');
  });
});

function prototypeFixture() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial(); material.name = 'Crown leaves';
  const texture = new THREE.Texture(); material.map = texture;
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(.8), 3));
  const leaf = new THREE.Mesh(geometry, material); leaf.position.set(.2, .4, -.1); group.add(leaf);
  const bark = new THREE.MeshStandardMaterial(); bark.name = 'Canopy trunks | schematic bark';
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 1, 7), bark); group.add(branch);
  return { group, leaf, branch, texture };
}

function attributeHash(geometry: THREE.BufferGeometry) {
  const hash = createHash('sha256');
  for (const attribute of Object.values(geometry.attributes)) hash.update(new Uint8Array(attribute.array.buffer));
  if (geometry.index) hash.update(new Uint8Array(geometry.index.array.buffer));
  return hash.digest('hex');
}

describe.each([['conifer',createConiferPrototype],['open broadleaf',createOpenBroadleafPrototype]] as const)('shared %s crown prototypes', (_name,createPrototype) => {
  it('changes the silhouette within the same bounds while retaining UVs, colors, topology and borrowed materials', () => {
    const { group, leaf, branch } = prototypeFixture();
    const original = [attributeHash(leaf.geometry), attributeHash(branch.geometry)];
    group.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(leaf);
    const variant = createPrototype(group);
    const variants = variant.children as THREE.Mesh[];
    expect(variants.length).toBe(2);
    expect(variants[0].geometry).not.toBe(leaf.geometry);
    expect(variants[0].material).toBe(leaf.material);
    expect(variants[1].material).toBe(branch.material);
    expect(variants[0].geometry.getAttribute('uv').array).toEqual(leaf.geometry.getAttribute('uv').array);
    expect(variants[0].geometry.getAttribute('color').array).toEqual(leaf.geometry.getAttribute('color').array);
    expect(variants[0].geometry.index!.array).toEqual(leaf.geometry.index!.array);
    expect(variants[0].geometry.getAttribute('position').array).not.toEqual(leaf.geometry.getAttribute('position').array);
    const bounds = new THREE.Box3().setFromObject(variants[0]);
    for (const side of ['min', 'max'] as const) for (const axis of ['x', 'y', 'z'] as const) expect(bounds[side][axis]).toBeCloseTo(sourceBounds[side][axis], 6);
    const buffers = new Set<ArrayBufferLike>();
    for (const mesh of variants) {
      for (const attribute of Object.values(mesh.geometry.attributes)) buffers.add(attribute.array.buffer);
      if (mesh.geometry.index) buffers.add(mesh.geometry.index.array.buffer);
      const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
      }
    }
    expect(variant.userData.townConiferGeometryBytes).toBe([...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0));
    expect([attributeHash(leaf.geometry), attributeHash(branch.geometry)]).toEqual(original);
    disposeConiferPrototype(variant);
    leaf.geometry.dispose(); branch.geometry.dispose();
  });

  it('disposes only variant geometry once and leaves source geometry, materials and textures alive', () => {
    const { group, leaf, branch, texture } = prototypeFixture();
    const variant = createPrototype(group); const meshes = variant.children as THREE.Mesh[];
    let clonedDisposals = 0, sourceDisposals = 0;
    for (const mesh of meshes) mesh.geometry.addEventListener('dispose', () => clonedDisposals++);
    for (const geometry of [leaf.geometry, branch.geometry] as THREE.BufferGeometry[]) geometry.addEventListener('dispose', () => sourceDisposals++);
    for (const material of [leaf.material as THREE.Material, branch.material as THREE.Material]) material.addEventListener('dispose', () => sourceDisposals++);
    texture.addEventListener('dispose', () => sourceDisposals++);
    disposeConiferPrototype(variant); disposeConiferPrototype(variant);
    expect(clonedDisposals).toBe(2); expect(sourceDisposals).toBe(0); expect(variant.children).toHaveLength(0);
    leaf.geometry.dispose(); branch.geometry.dispose();
  });

  it('rejects a prototype without a crown', () => {
    expect(() => createPrototype(new THREE.Group())).toThrow('crown primitive');
  });
});
