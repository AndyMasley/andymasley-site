import * as THREE from 'three';

/**
 * Thermoelectric power plants from the USGS 2015 plant-level model (1,122 plants): coal, gas, nuclear, oil and biomass
 * plants that use water for cooling. Each is built from simple parts sized by the plant's generation and cooling type,
 * drawn larger than life (a map symbol) so they read from a distance, and shrinking towards true scale up close.
 * Positions come straight from the GPU: x/z from the plant's coordinates, height from the terrain at the current
 * exaggeration.
 */

const PART_COL = {
  coal: 0x5d5f63, gas: 0xb9bcbf, nuclear: 0xe9e6de, oil: 0x8a8278, biomass: 0x7c6a52, complex: 0x9a9d9f,
  tower: 0xd8d4cb, mech: 0x8d9296, stack: 0x6e6f70, dome: 0xf0ece4, roof: 0x3d4146, intake: 0x9aa3a6,
};

function lathe(profile, seg = 20) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
// natural-draft cooling tower: a hyperboloid, about 1.6 model units tall
const hyperTower = () => {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, y = t * 1.6, r = 0.30 + 0.33 * Math.pow((t - 0.72) / 0.72, 2) * (t < 0.72 ? 1 : 0.35); pts.push([r, y]); }
  const g = lathe(pts, 22);
  g.translate(0, 0, 0);
  return g;
};

function fuelKey(gen) {
  const g = (gen || '').toUpperCase();
  if (g.includes('NUCLEAR')) return 'nuclear';
  if (g.includes('COAL')) return 'coal';
  if (g.includes('BIOMASS')) return 'biomass';
  if (g.includes('OIL')) return 'oil';
  if (g.includes('COMPLEX')) return 'complex';
  return 'gas';
}

/** the parts of one plant, in model units (1 unit ~ 120 m at true scale), relative to its centre */
export function plantParts(p) {
  const fuel = fuelKey(p.gen), cool = (p.cooling || '').toUpperCase();
  const mwh = p.mwh || 0, size = Math.min(1.8, Math.max(0.55, Math.pow(mwh / 3e6, 0.28)));
  const parts = [];
  // main hall
  const hw = 1.3 * size, hd = 0.8 * size, hh = (fuel === 'gas' ? 0.55 : 0.85) * size;
  parts.push({ type: 'box', col: PART_COL[fuel] || PART_COL.gas, pos: [0, hh / 2, 0], scl: [hw, hh, hd] });
  parts.push({ type: 'box', col: PART_COL.roof, pos: [0, hh + 0.02, 0], scl: [hw * 1.02, 0.04, hd * 1.02] });
  if (fuel === 'nuclear') {
    const n = mwh > 15e6 ? 2 : 1;
    for (let i = 0; i < n; i++) parts.push({ type: 'dome', col: PART_COL.dome, pos: [-hw * 0.25 + i * 0.75 * size, 0, -hd * 1.1], scl: [0.42 * size, 0.42 * size, 0.42 * size] });
  } else {
    const n = fuel === 'gas' ? 2 : mwh > 6e6 ? 2 : 1;
    const sh = fuel === 'gas' ? 1.1 : 2.2;
    for (let i = 0; i < n; i++) parts.push({ type: 'stack', col: PART_COL.stack, pos: [hw * 0.55 - i * 0.35, 0, -hd * 0.3], scl: [0.09 * size, sh * size, 0.09 * size] });
  }
  // cooling
  const towers = [];
  if (/TOWER|COMPLEX/.test(cool)) {
    const natural = (fuel === 'nuclear' || fuel === 'coal') && mwh > 2.5e6;
    if (natural) {
      const n = Math.min(4, Math.max(1, Math.round(mwh / 8e6)));
      for (let i = 0; i < n; i++) {
        const tx = hw * 0.9 + 0.75 * size + (i % 2) * 1.05 * size, tz = -0.55 * size + Math.floor(i / 2) * 1.05 * size + (n === 1 ? 0.5 * size : 0);
        parts.push({ type: 'tower', col: PART_COL.tower, pos: [tx, 0, tz], scl: [size, size, size] });
        towers.push([tx, 1.6 * size, tz]);
      }
    } else {
      const cells = Math.min(8, Math.max(2, Math.round(2 + mwh / 2e6)));
      const L = 0.32 * cells * Math.min(1.3, size);
      parts.push({ type: 'box', col: PART_COL.mech, pos: [hw * 0.75 + 0.45, 0.17, 0.6 * size], scl: [L, 0.34, 0.42] });
      for (let i = 0; i < cells; i++) parts.push({ type: 'fan', col: 0x4a4e52, pos: [hw * 0.75 + 0.45 - L / 2 + (i + 0.5) * L / cells, 0.36, 0.6 * size], scl: [0.12, 0.05, 0.12] });
      towers.push([hw * 0.75 + 0.45, 0.4, 0.6 * size]);
    }
  }
  if (/ONCE-THROUGH|COMPLEX/.test(cool)) {
    // discharge canal and intake house
    parts.push({ type: 'box', col: PART_COL.intake, pos: [-hw * 0.5 - 0.35, 0.12, hd * 0.9], scl: [0.35, 0.24, 0.3] });
  }
  return { parts, towers, size, fuel };
}

const GEO = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  stack: () => { const g = new THREE.CylinderGeometry(0.75, 1, 1, 10); g.translate(0, 0.5, 0); return g; },
  dome: () => { const c = new THREE.CylinderGeometry(1, 1, 0.9, 20); c.translate(0, 0.45, 0); const s = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); s.translate(0, 0.9, 0); return mergeGeos([c, s]); },
  tower: hyperTower,
  fan: () => { const g = new THREE.CylinderGeometry(1, 1, 1, 12); g.translate(0, 0.5, 0); return g; },
};

function mergeGeos(list) {
  const pos = [], nrm = [], idx = []; let off = 0;
  for (const g of list) {
    const gi = g.index ? g : g.toNonIndexed();
    const p = gi.attributes.position.array, n = gi.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nrm.push(n[i]); }
    if (gi.index) for (const i of gi.index.array) idx.push(i + off); else for (let i = 0; i < p.length / 3; i++) idx.push(i + off);
    off += p.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export class PlantLayer {
  constructor(shared, model, slabAt) {
    this.shared = shared; this.model = model; this.slabAt = slabAt;
    this.group = new THREE.Group(); this.group.name = 'plants';
    this.uScale = { value: 0.1 }; this.uFade = { value: 1 }; this.uSelPlant = { value: -1 }; this.uHoverPlant = { value: -1 };
    this.items = [];
    this._build();
  }
  _build() {
    const insts = {};   // type -> list of {plant idx, x, h, z, rot, pos, scl, col}
    const plants = this.model.plants;
    plants.forEach((p, pi) => {
      const s = this.slabAt(p.x, p.z); if (!s) return;
      const h = Math.max(0, s.sampleH(p.x, p.z)) / s.mpu;
      const { parts, towers, size, fuel } = plantParts(p);
      // face the plant towards its water
      let rot = 0;
      if (p.intake) rot = Math.atan2(p.intake.x - p.x, p.intake.z - p.z) + Math.PI;
      for (const part of parts) { (insts[part.type] = insts[part.type] || []).push({ pi, x: p.x, h, z: p.z, rot, ...part }); }
      this.items.push({ pi, p, x: p.x, z: p.z, h, towers, rot, size, fuel });
    });
    const sh = this.shared;
    for (const [type, list] of Object.entries(insts)) {
      const geo = GEO[type]();
      const g = new THREE.InstancedBufferGeometry();
      g.index = geo.index; g.attributes.position = geo.attributes.position; g.attributes.normal = geo.attributes.normal;
      const n = list.length;
      const aBase = new Float32Array(n * 4), aOff = new Float32Array(n * 4), aScl = new Float32Array(n * 3), aCol = new Float32Array(n * 3);
      const c = new THREE.Color();
      list.forEach((it, i) => {
        aBase.set([it.x, it.h, it.z, it.rot], 4 * i);
        aOff.set([it.pos[0], it.pos[1], it.pos[2], it.pi], 4 * i);
        aScl.set(it.scl, 3 * i);
        c.setHex(it.col); aCol.set([c.r, c.g, c.b], 3 * i);
      });
      g.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 4));
      g.setAttribute('aOff', new THREE.InstancedBufferAttribute(aOff, 4));
      g.setAttribute('aScl', new THREE.InstancedBufferAttribute(aScl, 3));
      g.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
      g.instanceCount = n;
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
      const ptype = { box: 0, stack: 1, dome: 2, tower: 3, fan: 4 }[type] ?? 0;
      mat.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, { uExag: sh.uExag, uScale: this.uScale, uFade: this.uFade, uSelPlant: this.uSelPlant, uHoverPlant: this.uHoverPlant, uNight: sh.uNight, uTime: sh.uTime });
        s.vertexShader = `uniform float uExag, uScale, uFade, uSelPlant, uHoverPlant;
attribute vec4 aBase, aOff; attribute vec3 aScl, aCol;
varying vec3 vPCol, vLoc, vScl, vONrm; varying float vHi, vPid;
` + s.vertexShader
          .replace('#include <beginnormal_vertex>', `
            float cr = cos(aBase.w), sr = sin(aBase.w);
            mat3 R = mat3(cr, 0.0, -sr, 0.0, 1.0, 0.0, sr, 0.0, cr);
            vec3 objectNormal = R * normalize(normal / aScl);`)
          .replace('#include <begin_vertex>', `
            vec3 local = (position * aScl + aOff.xyz) * uScale;
            vec3 transformed = R * local + vec3(aBase.x, aBase.y * uExag, aBase.z);
            vPCol = aCol; vLoc = position; vScl = aScl; vONrm = normal; vPid = aOff.w;
            vHi = abs(aOff.w - uSelPlant) < 0.5 ? 1.0 : (abs(aOff.w - uHoverPlant) < 0.5 ? 0.6 : 0.0);`);
        s.fragmentShader = `#define PTYPE ${ptype}
uniform float uFade, uNight, uTime; varying vec3 vPCol, vLoc, vScl, vONrm; varying float vHi, vPid;
` + s.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            diffuseColor.rgb *= vPCol;`)
          .replace('#include <opaque_fragment>', `
            outgoingLight += vec3(1.0, 0.75, 0.35) * vHi * 0.35;
            // night: lit windows on the halls, red aviation lights blinking on the stacks
            if (uNight > 0.001) {
              vec3 em = vec3(0.0);
              #if PTYPE == 0
                if (abs(vONrm.y) < 0.5 && vScl.y > 0.2) {
                  float along = (abs(vONrm.x) > 0.5 ? vLoc.z * vScl.z : vLoc.x * vScl.x) * 9.0;
                  float up = (vLoc.y + 0.5) * vScl.y * 7.0;
                  float win = step(0.45, fract(along)) * step(0.35, fract(up)) * step(fract(up), 0.75) * step(0.2, vLoc.y + 0.5);
                  float on = step(0.35, fract(sin(dot(floor(vec2(along, up)) + vPid, vec2(12.9898, 78.233))) * 43758.5));
                  em = vec3(1.0, 0.72, 0.38) * win * on * 1.6;
                }
              #elif PTYPE == 1
                if (vLoc.y > 0.94) em = vec3(1.0, 0.08, 0.04) * 6.0 * step(0.55, fract(uTime * 0.7 + vPid * 0.37));
              #elif PTYPE == 3
                em = vec3(0.9, 0.75, 0.55) * 0.05 * (1.0 - smoothstep(0.0, 0.4, vLoc.y));
              #endif
              outgoingLight += em * uNight;
            }
            #include <opaque_fragment>`);
      };
      mat.customProgramCacheKey = () => `plant-v2-${ptype}`;
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = `plants-${type}`;
      this.group.add(mesh);
    }
  }
  /** model size in world units per model unit, by camera distance (bigger than life far away) */
  update(camDist) {
    // roughly constant on screen from afar; near true size (a big plant site is ~1 km) when close
    const s = Math.min(0.55, Math.max(0.13, camDist * 0.0045));
    this.uScale.value = s;
    this.group.visible = camDist < 520;
    this.scale = s;
  }
  /** plant index under a screen point (CPU projection), or -1 */
  pick(camera, cx, cy, rect, exag, maxPx = 14) {
    if (!this.group.visible) return -1;
    let best = -1, bd = maxPx * maxPx;
    const v = new THREE.Vector3();
    for (const it of this.items) {
      v.set(it.x, it.h * exag + 0.6 * this.scale, it.z).project(camera);
      if (v.z > 1) continue;
      const px = (v.x * 0.5 + 0.5) * rect.width + rect.left, py = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d < bd) { bd = d; best = it.pi; }
    }
    return best;
  }
}

/**
 * Dams at the outlets of Natural Earth reservoirs (where the largest river leaves the reservoir polygon), drawn as a
 * concrete wall across the river. Names come from Natural Earth or, for major U.S. dams it leaves unnamed, are added
 * by hand.
 */
export class DamLayer {
  constructor(shared, dams, slabAt, plantScale) {
    this.shared = shared; this.items = [];
    this.group = new THREE.Group(); this.group.name = 'dams';
    this.uScale = plantScale; this.uSel = { value: -1 }; this.uHover = { value: -1 };
    const list = [];
    dams.forEach((d, i) => {
      const s = slabAt(d.x, d.z); if (!s) return;
      const h = Math.max(0, s.sampleH(d.x, d.z)) / s.mpu;
      // wall across the flow direction
      const rot = -d.flow_dir;
      this.items.push({ i, d, x: d.x, z: d.z, h });
      list.push({ i, x: d.x, h, z: d.z, rot });
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = geo.index; g.setAttribute('position', geo.attributes.position); g.setAttribute('normal', geo.attributes.normal);
    const n = list.length;
    const aBase = new Float32Array(n * 4), aId = new Float32Array(n);
    list.forEach((it, k) => { aBase.set([it.x, it.h, it.z, it.rot], 4 * k); aId[k] = it.i; });
    g.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 4));
    g.setAttribute('aId', new THREE.InstancedBufferAttribute(aId, 1));
    g.instanceCount = n;
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.8 });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { uExag: shared.uExag, uScale: this.uScale, uSel: this.uSel, uHover: this.uHover });
      s.vertexShader = `uniform float uExag, uScale, uSel, uHover; attribute vec4 aBase; attribute float aId; varying float vHi;
` + s.vertexShader
        .replace('#include <beginnormal_vertex>', `float cr = cos(aBase.w), sr = sin(aBase.w); mat3 R = mat3(cr, 0.0, -sr, 0.0, 1.0, 0.0, sr, 0.0, cr);
          vec3 objectNormal = R * normal;`)
        .replace('#include <begin_vertex>', `vec3 local = position * vec3(0.35, 0.9, 3.2) * uScale + vec3(0.0, 0.45 * uScale, 0.0);
          vec3 transformed = R * local + vec3(aBase.x, aBase.y * uExag, aBase.z);
          vHi = abs(aId - uSel) < 0.5 ? 1.0 : (abs(aId - uHover) < 0.5 ? 0.6 : 0.0);`);
      s.fragmentShader = `varying float vHi;
` + s.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight += vec3(1.0, 0.75, 0.35) * vHi * 0.35;
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'dam-v1';
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 3;
    this.group.add(mesh);
  }
  update(camDist) { this.group.visible = camDist < 360 && this.enabled !== false; }
  pick(camera, cx, cy, rect, exag, maxPx = 12) {
    if (!this.group.visible) return -1;
    let best = -1, bd = maxPx * maxPx;
    const v = new THREE.Vector3();
    for (const it of this.items) {
      v.set(it.x, it.h * exag + 0.3 * this.uScale.value, it.z).project(camera);
      if (v.z > 1) continue;
      const px = (v.x * 0.5 + 0.5) * rect.width + rect.left, py = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = (px - cx) ** 2 + (py - cy) ** 2;
      if (d < bd) { bd = d; best = it.i; }
    }
    return best;
  }
}
