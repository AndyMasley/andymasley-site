import * as THREE from 'three';

/**
 * Window and door openings. Each inferred glass pane and door leaf in the
 * pinned tiles is a small closed box; at tile load every box receives its own
 * frame coordinates (position across and up the opening, 0-1), its width and
 * its height, with a stable per-opening seed packed below the centimetre of
 * the height. The glass shader uses them to open a shallow room behind every
 * pane, and the door shader to lay out raised panels. Rooms, furnishings,
 * blinds, curtains, door styles and colours are generic authored
 * interpretations, never observations of a particular building interior.
 */
export const OPENING_ATTRIBUTE = 'townOpening';
const OPENING_MATERIALS = new Set(['V2 inferred | glass', 'V2 inferred | door']);
/** Photographed and reference glazing keeps its colour; rooms open behind its panes too. */
export const REFERENCE_GLAZING = new Set(['Reference | mill aged glazing', 'Reference | muted blue glass', 'Town Hall | dark window panes', 'Reference | School observed muted glass']);
const isOpeningMaterial = (name: string): boolean => OPENING_MATERIALS.has(name) || REFERENCE_GLAZING.has(name) || /^Crafted frontage \| (?:glass|door) \|/.test(name);

const OPENING_HASH = `
float townArtHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
`;

/** Installs the room or panel treatment on a material outside the art pool
 * (crafted frontage glass and doors), after that material's own hook. */
export function installOpeningMaterial(material: THREE.MeshStandardMaterial, kind: 'glass' | 'door'): void {
  if (material.userData.townOpening) return;
  material.userData.townOpening = kind;
  (material as THREE.MeshStandardMaterial & { defaultAttributeValues?: Record<string, number[]> }).defaultAttributeValues = { [OPENING_ATTRIBUTE]: [0, 0, 0, 0] };
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <opaque_fragment>') || !shader.fragmentShader.includes('#include <map_fragment>')) throw new Error('Town opening shader anchors changed.');
    shader.vertexShader = `varying vec3 vTownArtWorld;\nvarying vec3 vTownArtNormal;\nattribute vec4 ${OPENING_ATTRIBUTE};\nvarying vec4 vTownOpening;\n${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
vec4 townOpenPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
townOpenPosition = instanceMatrix * townOpenPosition;
#endif
vTownArtWorld = (modelMatrix * townOpenPosition).xyz;
vTownArtNormal = inverseTransformDirection(transformedNormal, viewMatrix);
vTownOpening = ${OPENING_ATTRIBUTE};`);
    shader.fragmentShader = `varying vec3 vTownArtWorld;\nvarying vec3 vTownArtNormal;\nvarying vec4 vTownOpening;\n${OPENING_HASH}\n${shader.fragmentShader}`;
    if (kind === 'glass') shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${WINDOW_INTERIOR_GLSL}\n#include <opaque_fragment>`);
    else shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\nfloat townArtHeight = 0.0;\n${DOOR_PANEL_GLSL}`).replace('#include <normal_fragment_maps>', DOOR_PANEL_NORMAL);
  };
  material.customProgramCacheKey = () => `${previousKey}|opening-${kind}-v1`;
  material.needsUpdate = true;
}

function hashCenter(x: number, y: number, z: number): number {
  let h = Math.imul(Math.round(x * 20) ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(Math.round(y * 20) ^ 0x7f4a7c15, 0x632be5ab) ^ Math.imul(Math.round(z * 20) ^ 0x1b873593, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return ((h >>> 0) % 997) / 997;
}

/** Adds opening coordinates to every eligible glass/door geometry once.
 * `origin` is the tile translation, so seeds differ between tiles. */
export function prepareOpenings(root: THREE.Object3D, origin: readonly number[] = [0, 0, 0]): { openings: number; bytes: number; doors: number[][] } {
  root.updateMatrixWorld(true);
  let openings = 0, bytes = 0;
  const doors: number[][] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material || !isOpeningMaterial(material.name)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    if (geometry.getAttribute(OPENING_ATTRIBUTE)) return;
    const position = geometry.getAttribute('position');
    if (!position || position.count < 3) return;
    const count = position.count;
    // Weld by millimetre position: boxes are often stored with split vertices.
    const ids = new Int32Array(count);
    const keys = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      const key = `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
      let id = keys.get(key);
      if (id === undefined) { id = keys.size; keys.set(key, id); }
      ids[i] = id;
    }
    const parent = Int32Array.from({ length: keys.size }, (_, i) => i);
    const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const index = geometry.index;
    const triangles = Math.floor((index ? index.count : count) / 3);
    for (let t = 0; t < triangles; t++) {
      const a = ids[index ? index.getX(t * 3) : t * 3], b = ids[index ? index.getX(t * 3 + 1) : t * 3 + 1], c = ids[index ? index.getX(t * 3 + 2) : t * 3 + 2];
      const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb;
      const rb2 = find(b), rc = find(c); if (rb2 !== rc) parent[rb2] = rc;
    }
    const groups = new Map<number, number[]>();
    for (let i = 0; i < count; i++) {
      const root = find(ids[i]);
      let list = groups.get(root);
      if (!list) groups.set(root, list = []);
      list.push(i);
    }
    const values = new Float32Array(count * 4);
    for (const list of groups.values()) {
      let mx = 0, mz = 0;
      for (const i of list) { mx += position.getX(i); mz += position.getZ(i); }
      mx /= list.length; mz /= list.length;
      let sxx = 0, sxz = 0, szz = 0;
      for (const i of list) { const dx = position.getX(i) - mx, dz = position.getZ(i) - mz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
      // The opening's width runs along its principal horizontal axis.
      const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz), ex = Math.cos(angle), ez = Math.sin(angle);
      let umin = Infinity, umax = -Infinity, ymin = Infinity, ymax = -Infinity;
      for (const i of list) {
        const u = position.getX(i) * ex + position.getZ(i) * ez, y = position.getY(i);
        if (u < umin) umin = u; if (u > umax) umax = u; if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
      const width = umax - umin, height = ymax - ymin;
      if (!(width > 0.05 && height > 0.05 && width < 40 && height < 40)) continue;
      openings++;
      // Tile-local door centres let planting and mailboxes keep entries clear.
      if (/door/.test(material.name) && height > 1.6) doors.push([mx + object.matrixWorld.elements[12], (ymin + ymax) / 2 + object.matrixWorld.elements[13], mz + object.matrixWorld.elements[14]]);
      const worldX = mx + object.matrixWorld.elements[12] + origin[0], worldZ = mz + object.matrixWorld.elements[14] + origin[2];
      const seed = hashCenter(worldX, (ymin + ymax) / 2 + object.matrixWorld.elements[13] + origin[1], worldZ);
      // 64 centred seed levels survive varying interpolation error intact.
      const packedHeight = Math.round(height * 100) / 100 + (Math.floor(seed * 64) + 0.5) / 64 * 0.009;
      for (const i of list) {
        const u = position.getX(i) * ex + position.getZ(i) * ez;
        values[i * 4] = (u - umin) / width;
        values[i * 4 + 1] = (position.getY(i) - ymin) / height;
        values[i * 4 + 2] = width;
        values[i * 4 + 3] = packedHeight;
      }
    }
    geometry.setAttribute(OPENING_ATTRIBUTE, new THREE.BufferAttribute(values, 4));
    bytes += values.byteLength;
  });
  return { openings, bytes, doors };
}

/** Shared frame for glass and doors: the visible face, its horizontal axis and
 * the opening coordinates oriented along that axis (derivatives are taken in
 * uniform control flow, before any branch). */
const OPENING_FRAME = `
vec3 townOpenN = normalize(vTownArtNormal);
vec3 townOpenView = cameraPosition - vTownArtWorld;
if (dot(townOpenN, townOpenView) < 0.0) townOpenN = -townOpenN;
vec3 townOpenE = cross(vec3(0.0, 1.0, 0.0), townOpenN);
float townOpenEL = length(townOpenE);
townOpenE = townOpenEL > 0.25 ? townOpenE / townOpenEL : vec3(1.0, 0.0, 0.0);
vec3 townOpenUp = normalize(cross(townOpenN, townOpenE));
float townOpenDU = dFdx(vTownOpening.x) * dot(dFdx(vTownArtWorld), townOpenE) + dFdy(vTownOpening.x) * dot(dFdy(vTownArtWorld), townOpenE);
bool townOpenKnown = vTownOpening.z > 0.05 && vTownOpening.w > 0.05;
vec2 townOpenSize = vec2(vTownOpening.z, floor(vTownOpening.w * 100.0 + 0.0005) / 100.0);
float townOpenSeed = (floor(clamp(fract(vTownOpening.w * 100.0 + 0.0005) / 0.9, 0.0, 0.999) * 64.0) + 0.5) / 64.0;
vec2 townOpenUV = vec2(townOpenDU < 0.0 ? 1.0 - vTownOpening.x : vTownOpening.x, vTownOpening.y);
`;

/**
 * Replaces the glass finish. Each pane shows a room box with parallax: plaster
 * walls, a wood floor and pale ceiling, occasional doorways, low furniture and
 * pictures against the back wall, daylight falling off with depth, and
 * sometimes blinds or side curtains in the glass plane. The specular sky and
 * sun reflection is retained and the room shows through by (1 - Fresnel).
 */
export const WINDOW_INTERIOR_GLSL = `
${OPENING_FRAME}
vec3 townGlassDir = -normalize(townOpenView);
vec3 townRay = vec3(dot(townGlassDir, townOpenE), dot(townGlassDir, townOpenUp), -dot(townGlassDir, townOpenN));
townRay.z = max(townRay.z, 0.03);
townRay.x = abs(townRay.x) < 1e-4 ? 1e-4 : townRay.x;
townRay.y = abs(townRay.y) < 1e-4 ? 1e-4 : townRay.y;
vec2 townPane, townPaneSize;
float townRoomSeed;
if (townOpenKnown) {
  townPaneSize = townOpenSize;
  townPane = clamp(townOpenUV, 0.0, 1.0) * townPaneSize;
  townRoomSeed = townOpenSeed;
} else {
  // Glass without opening coordinates: a regular grid of rooms in the wall.
  vec2 townWallP = vec2(dot(vTownArtWorld, townOpenE), vTownArtWorld.y);
  vec2 townCell = floor(townWallP / vec2(3.2, 3.0));
  townPaneSize = vec2(1.4, 1.4);
  townPane = townWallP - townCell * vec2(3.2, 3.0) - vec2(0.9, 0.8);
  townRoomSeed = townArtHash(townCell + vec2(floor(dot(vTownArtWorld, townOpenN) * 0.5) * 0.37, 11.0));
}
float townH1 = townArtHash(vec2(townRoomSeed * 91.7, 1.3));
float townH2 = townArtHash(vec2(townRoomSeed * 57.3, 2.9));
float townH3 = townArtHash(vec2(townRoomSeed * 33.1, 4.7));
float townH4 = townArtHash(vec2(townRoomSeed * 71.9, 6.1));
float townH5 = townArtHash(vec2(townRoomSeed * 13.7, 8.3));
float townH6 = townArtHash(vec2(townRoomSeed * 29.3, 9.9));
float townStore = step(2.0, townPaneSize.y) * step(1.4, townPaneSize.x);
float townSill = mix(0.72 + 0.22 * townH1, 0.12, townStore);
float townRoomH = max(townSill + townPaneSize.y + 0.28 + 0.35 * townH2, 2.45);
float townMarginL = 0.35 + 1.3 * townH3;
float townRoomW = townPaneSize.x + townMarginL + 0.35 + 1.3 * townH4;
float townRoomD = mix(2.6 + 2.8 * townH5, 5.0 + 5.0 * townH5, townStore);
vec3 townEntry = vec3(townPane.x + townMarginL, townPane.y + townSill, 0.0);
vec3 townFar = (step(vec3(0.0), townRay) * vec3(townRoomW, townRoomH, townRoomD) - townEntry) / townRay;
float townT = min(min(townFar.x, townFar.y), townFar.z);
vec3 townHit = townEntry + townRay * townT;
float townOnBack = step(townFar.z, min(townFar.x, townFar.y));
float townOnSide = (1.0 - townOnBack) * step(townFar.x, townFar.y);
float townOnFlat = 1.0 - townOnBack - townOnSide;
vec3 townWallC = mix(vec3(0.60, 0.56, 0.49), vec3(0.73, 0.71, 0.67), townH1);
townWallC = mix(townWallC, mix(vec3(0.44, 0.52, 0.56), vec3(0.62, 0.50, 0.40), townH6), step(0.78, townH2) * 0.8);
vec3 townFloorC = mix(vec3(0.20, 0.12, 0.07), vec3(0.42, 0.33, 0.24), townH3);
vec3 townSurface = townWallC * mix(1.0, 0.86, townOnSide);
if (townOnFlat > 0.5) townSurface = townRay.y < 0.0 ? townFloorC : vec3(0.78, 0.77, 0.74);
float townBackX = townHit.x / townRoomW;
float townDoorway = townOnBack * step(0.55, townH5) * step(abs(townBackX - (0.15 + 0.7 * townH6)), 0.09) * step(townHit.y, 2.05);
float townFurniture = townOnBack * step(0.25, townH4) * step(abs(townBackX - (0.2 + 0.6 * townH1)), 0.16 + 0.12 * townH2) * step(townHit.y, 0.55 + 0.45 * townH3);
float townPicture = townOnBack * step(0.6, townH3) * step(abs(townBackX - (0.3 + 0.4 * townH4)), 0.1) * step(abs(townHit.y - 1.55), 0.22);
townSurface = mix(townSurface, vec3(0.035, 0.032, 0.03), townDoorway);
townSurface = mix(townSurface, mix(vec3(0.09, 0.07, 0.06), vec3(0.30, 0.22, 0.15), townH6), townFurniture);
townSurface = mix(townSurface, mix(vec3(0.15, 0.2, 0.25), vec3(0.45, 0.33, 0.2), townH5), townPicture);
float townDepthLight = mix(1.0, 0.28, clamp(townHit.z / townRoomD, 0.0, 1.0));
float townCorner = min(min(townHit.x, townRoomW - townHit.x), min(townHit.y, townRoomH - townHit.y));
float townRoomLight = townDepthLight * mix(0.55, 1.0, smoothstep(0.0, 0.6, townCorner));
townRoomLight *= mix(1.0, 1.25, townOnFlat * step(townRay.y, 0.0) * (1.0 - clamp(townHit.z / 2.0, 0.0, 1.0)));
float townLamp = step(0.93, townH6);
vec3 townInterior = townSurface * townRoomLight * (0.55 + townLamp * vec3(0.9, 0.55, 0.2));
vec2 townWin = clamp(townPane / townPaneSize, 0.0, 1.0);
float townTreatment = townArtHash(vec2(townRoomSeed * 17.3, 12.1));
if (townTreatment < 0.42) {
  float townBlindBottom = mix(0.25, 0.92, townArtHash(vec2(townRoomSeed * 5.1, 13.7)));
  if (townWin.y > townBlindBottom) {
    float townSlat = fract(townPane.y * 20.0);
    vec3 townBlind = mix(vec3(0.74, 0.72, 0.66), vec3(0.62, 0.55, 0.45), step(0.7, townH4));
    townInterior = townBlind * (0.62 + 0.3 * smoothstep(0.08, 0.5, townSlat)) * 0.85;
  }
} else if (townTreatment < 0.72) {
  float townCurtainW = 0.14 + 0.2 * townArtHash(vec2(townRoomSeed * 3.7, 14.9));
  if (townWin.x < townCurtainW || townWin.x > 1.0 - townCurtainW) {
    vec3 townFabric = mix(vec3(0.72, 0.68, 0.58), mix(vec3(0.42, 0.14, 0.12), vec3(0.30, 0.40, 0.34), townH2), step(0.55, townH5));
    townInterior = townFabric * (0.55 + 0.25 * sin(townPane.x * 38.0 + townH1 * 6.0));
  }
}
// Double glazing reflects about twice a single dielectric surface; interiors
// in daylight read several stops darker than the street, behind a faint tint.
vec3 townReflection = totalSpecular * 2.2;
townReflection = mix(vec3(dot(townReflection, vec3(0.2126, 0.7152, 0.0722))), townReflection, 0.72);
float townGlassCos = clamp(dot(townOpenN, normalize(townOpenView)), 0.0, 1.0);
float townFresnel = 0.08 + 0.92 * pow(1.0 - townGlassCos, 5.0);
outgoingLight = townReflection + townInterior * (1.0 - townFresnel) * 0.38 * vec3(0.92, 0.96, 0.98);
`;

/**
 * Door leaves: a six-panel layout (stiles, lock rail and raised fields) on
 * ordinary doors, horizontal sections on wide doors, a small knob on the
 * latch side and a period colour per door. Relief is a height field read by
 * the existing derivative bump. Colours are an authored New England palette.
 */
export const DOOR_PANEL_GLSL = `
${OPENING_FRAME}
if (townOpenKnown) {
  vec2 townDoor = clamp(townOpenUV, 0.0, 1.0) * townOpenSize;
  float townDoorW = townOpenSize.x, townDoorH = townOpenSize.y;
  // Black, barn red, navy, hunter green, white and stained wood.
  vec3 townDoorColor = townOpenSeed < 0.2 ? vec3(0.018,0.02,0.022) : townOpenSeed < 0.38 ? vec3(0.23,0.035,0.03)
    : townOpenSeed < 0.52 ? vec3(0.028,0.045,0.085) : townOpenSeed < 0.64 ? vec3(0.03,0.07,0.045)
    : townOpenSeed < 0.86 ? vec3(0.72,0.71,0.66) : vec3(0.16,0.08,0.035);
  diffuseColor.rgb = mix(diffuseColor.rgb, townDoorColor, 0.9);
  float townField = 0.0;
  if (townDoorW > 1.6) {
    // Sectional doors: four horizontal sections with shallow recessed panels.
    float townSection = fract(townDoor.y / (townDoorH / 4.0));
    townField = -0.004 * (1.0 - smoothstep(0.0, 0.035, townSection)) - 0.004 * (1.0 - smoothstep(0.965, 1.0, townSection));
  } else {
    float townS = townDoorH / 2.03;
    float townX = townDoor.x, townY = townDoor.y / townS;
    float townCol = step(townDoorW * 0.5, townX);
    float townX0 = mix(0.12, townDoorW * 0.5 + 0.05, townCol), townX1 = mix(townDoorW * 0.5 - 0.05, townDoorW - 0.12, townCol);
    vec2 townRow = townY < 0.9 ? vec2(0.2, 0.9) : townY < 1.58 ? vec2(1.1, 1.58) : vec2(1.7, 1.93);
    vec2 townIn = vec2(min(townX - townX0, townX1 - townX), min(townY - townRow.x, townRow.y - townY) * townS);
    float townInside = min(townIn.x, townIn.y);
    townField = townInside > 0.0 ? -0.009 + 0.007 * smoothstep(0.0, 0.035, townInside) : 0.0;
    diffuseColor.rgb *= townInside > 0.0 ? mix(0.9, 1.0, smoothstep(0.0, 0.035, townInside)) : 1.0;
    // Knob on the latch side, about 0.95 m up.
    float townKnob = 1.0 - smoothstep(0.022, 0.03, length(vec2(townX - (townDoorW - 0.075), townDoor.y - 0.95)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.42, 0.2), townKnob);
    townField += 0.012 * townKnob;
  }
  townArtHeight = townField;
}
`;

export const DOOR_PANEL_NORMAL = `
#include <normal_fragment_maps>
vec3 townDoorDx = dFdx(-vViewPosition), townDoorDy = dFdy(-vViewPosition);
vec3 townDoorR1 = cross(townDoorDy, normal), townDoorR2 = cross(normal, townDoorDx);
float townDoorDet = dot(townDoorDx, townDoorR1);
vec2 townDoorGrad = vec2(dFdx(townArtHeight), dFdy(townArtHeight));
if (abs(townDoorDet) > 1e-10) normal = normalize(abs(townDoorDet) * normal - sign(townDoorDet) * (townDoorGrad.x * townDoorR1 + townDoorGrad.y * townDoorR2));
`;
