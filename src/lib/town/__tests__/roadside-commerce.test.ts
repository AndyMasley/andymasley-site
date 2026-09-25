// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RoadsideCommerce, ROADSIDE_COMMERCE, SIGN_STYLES, commerceTiles, lotCarGeometry, packFaces, priceSignFaces, roadsidePanels, styleFace, type Station } from '../roadside-commerce';

const data = ROADSIDE_COMMERCE;

/** Every word a sign may show: what a business sells or does, and the fuel
 * sign's own legends. Anything else (a name, a brand) fails. */
const GENERIC = new Set(`& AUTO BAKERY BANK BAR BARBER BOOKS BOWLING BREAKFAST BURGERS CABINETS CAFE CAR CARS CHICKEN CHINESE CHIROPRACTIC
COFFEE COLLISION COMPUTER CONTROL CONVENIENCE CREDIT DANCE DECOR DENTAL DIESEL DINER DISCOUNT DISPENSARY DONUTS DRIVE-THRU DRIVING FITNESS
FLORIST FOOD FUNERAL GAS GIFTS GRILL GROOMING HARDWARE HOME HOSPITAL ICE INSURANCE ITALIAN JEWELRY LIQUORS MARTIAL ARTS MART MASSAGE
MEXICAN NEW NUTRITION ORTHODONTICS OWN PAINTBALL PARTS PEST PET PHARMACY PHYSICAL PIZZA PREMIUM PRINTING REGULAR RENT REPAIR RESTAURANT
SALON SCHOOL SERVICE SHAKES SHELTER SIGNS SMOOTHIES SPA STAFFING STORE STUDIO SUBS SUPERMARKET SUPPLY SUSHI TACOS TAQUERIA THAI THERAPY
TIRES TO TRAVEL TRUCKS UNION USED VARIETY VETERINARY WASH WINE ANIMAL`.split(/\s+/));
/** Listed business names and brands near the signs; none may appear. */
const NAMES = ['MCDONALD', 'TACO BELL', 'KFC', 'WENDY', 'DUNKIN', 'BURGER KING', 'MOBIL', 'NOURIA', 'CVS', 'WALGREENS', 'SUBWAY', 'HONEY DEW',
  'PAPA GINO', "D'ANGELO", 'DOMINO', '7-ELEVEN', 'PRICE CHOPPER', 'PANERA', "O'REILLY", 'ADVANCE', 'AUTOZONE', 'DOLLAR TREE', 'JOB LOT', 'AUBUCHON',
  'TOWN FAIR', 'SANTANDER', 'RENT-A-CENTER', 'CORNERSTONE', 'WEBSTER', 'HOMETOWN', 'MAPFRE', 'SUBARU', 'FORD', 'ALLEY CAT', 'LEMONGRASS', 'HIMALAYA',
  'EMPIRE', 'MEXICALI', 'SALOON', 'CARLY', 'MONTE BIANCO', 'NORTHEAST', 'MONKEE', 'VARO', 'MIRRORED', 'CAKETTES', 'COUNTRY FARMS', 'SUNNYSIDE',
  'JIMMY', "MAC'S", 'HARBRO', 'PLACE MOTOR', 'SCANLON', 'SITKOWSKI', 'MAJERCIK', 'GIANARIS', 'CHARNIAK', "O'CONNOR", 'BIG BELLY', 'BOOKLOVERS', 'ROSE ROOM',
  'GOLDEN GREEK', 'HANK', "TED'S", 'MOHEGAN', 'CAPOEIRA', 'PRESTIGE', 'CITADEL', 'TABITHA', 'SIGUANABA', 'INSATION'];

const texts = () => [
  ...data.signs.flatMap(s => s.panels.map(p => p.text)),
  ...data.stations.flatMap(s => { const f = priceSignFaces(s); return [f.header.text, ...f.rows.map(r => r.label.text)]; }),
];

describe('roadside commerce data', () => {
  it('builds the six measured fuel canopies at plausible canopy sizes and heights', () => {
    expect(data.stations.map(s => s.id).sort()).toEqual(['FUEL-137-EAST-MAIN', 'FUEL-144-THOMPSON', 'FUEL-188-GORE', 'FUEL-74-EAST-MAIN', 'FUEL-80-MAIN', 'FUEL-88-EAST-MAIN']);
    for (const s of data.stations) {
      expect(s.length).toBeGreaterThanOrEqual(s.width);
      expect(s.length).toBeGreaterThan(8); expect(s.length).toBeLessThan(40);
      expect(s.width).toBeGreaterThan(6); expect(s.width).toBeLessThan(25);
      expect(Math.hypot(...s.axis)).toBeCloseTo(1, 2);
      // Deck top above the adjacent street: a canopy, not a building or a sign.
      expect(s.top - s.priceSign.z).toBeGreaterThan(3.5);
      expect(s.top - s.priceSign.z).toBeLessThan(9);
      expect(s.lidarReturns).toBeGreaterThan(60);
      expect(s.rows).toBe(Math.max(1, Math.floor((s.width + 2) / 8)));
      expect(s.cols).toBe(Math.max(1, Math.floor((s.length + 1) / 7.2)));
      expect(s.tileId).toBe(`${Math.floor(s.centre[0] / 250)}_${Math.floor(s.centre[1] / 250)}`);
      // The price sign stands beside the canopy, never under it.
      const d = [s.priceSign.at[0] - s.centre[0], s.priceSign.at[1] - s.centre[1]];
      const u = Math.abs(d[0] * s.axis[0] + d[1] * s.axis[1]), v = Math.abs(-d[0] * s.axis[1] + d[1] * s.axis[0]);
      expect(u > s.length / 2 + 1 || v > s.width / 2 + 1).toBe(true);
    }
  });

  it('shows only generic words, never a business name or brand', () => {
    for (const text of texts()) {
      for (const word of text.split(/\s+/)) expect(GENERIC.has(word), `"${word}" in "${text}"`).toBe(true);
      for (const name of NAMES) expect(text.toUpperCase().includes(name), `${name} in ${text}`).toBe(false);
    }
    for (const s of data.signs) for (const p of s.panels) expect(p.style).toBeLessThan(SIGN_STYLES.length);
  });

  it('files every sign in the tile that holds it, with the fields its form needs', () => {
    const ids = new Set<string>();
    for (const s of data.signs) {
      expect(ids.has(s.id)).toBe(false); ids.add(s.id);
      expect(s.tileId).toBe(`${Math.floor(s.at[0] / 250)}_${Math.floor(s.at[1] / 250)}`);
      if (s.kind === 'wall') {
        expect(Math.hypot(...s.normal!)).toBeCloseTo(1, 2);
        expect(s.panels).toHaveLength(1);
        expect(s.panels[0].h!).toBeGreaterThan(0.4); expect(s.panels[0].h!).toBeLessThan(1.2);
        expect(s.panels[0].w!).toBeLessThanOrEqual(9);
      } else {
        expect(Math.hypot(...s.along!)).toBeCloseTo(1, 2);
        expect(Number.isFinite(s.z)).toBe(true);
        expect(s.panels.length).toBeGreaterThan(0); expect(s.panels.length).toBeLessThanOrEqual(4);
      }
    }
    // Roadside signs keep apart from one another.
    const roadside = data.signs.filter(s => s.kind !== 'wall').map(s => s.at).concat(data.stations.map(s => s.priceSign.at));
    for (let i = 0; i < roadside.length; i++) for (let j = i + 1; j < roadside.length; j++) {
      expect(Math.hypot(roadside[i][0] - roadside[j][0], roadside[i][1] - roadside[j][1])).toBeGreaterThanOrEqual(9 - 1e-6);
    }
    expect(commerceTiles().length).toBeGreaterThan(20);
  });
});

describe('sign atlas', () => {
  it('packs every face without overlap inside the atlas', () => {
    const faces = [...new Map(data.signs.flatMap(s => s.kind === 'wall' ? s.panels.map(p => styleFace(p.text, p.style, p.w!, p.h!)) : roadsidePanels(s).faces).map(f => [f.key, f])).values()];
    const { rects, height } = packFaces(faces);
    // One 2048 x 1024 single-channel atlas (2 MB) holds every legend.
    expect(height).toBeLessThanOrEqual(1024);
    const list = [...rects.values()];
    for (const [x, y, w, h] of list) { expect(x).toBeGreaterThanOrEqual(0); expect(x + w).toBeLessThanOrEqual(2048); expect(y + h).toBeLessThanOrEqual(height); }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [ax, ay, aw, ah] = list[i], [bx, by, bw, bh] = list[j];
      expect(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay).toBe(true);
    }
  });
});

/** A flat terrain patch covering a whole tile, in tile-local coordinates. */
function tileWithGround(tileId: string, ground: number): { group: THREE.Group; origin: [number, number, number] } {
  const [ix, iy] = tileId.split('_').map(Number);
  const origin: [number, number, number] = [ix * 250, 0, -iy * 250];
  const group = new THREE.Group(); group.position.fromArray(origin);
  const terrain = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    -20, ground, 20, 270, ground, 20, 270, ground, -270, -20, ground, 20, 270, ground, -270, -20, ground, -270], 3)));
  terrain.name = 'terrain'; group.add(terrain);
  group.updateMatrixWorld(true);
  return { group, origin };
}

function meshBounds(group: THREE.Group, role: string): THREE.Box3 {
  const box = new THREE.Box3();
  group.traverse(o => { if (o instanceof THREE.Mesh && o.name === `Roadside commerce | ${role}`) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox!); } });
  return box;
}

describe('station geometry', () => {
  const station = data.stations.find(s => s.id === 'FUEL-137-EAST-MAIN')! as Station;
  const ground = station.priceSign.z;

  it('stands the canopy on columns from the ground, with clearance beneath the deck', () => {
    const { group, origin } = tileWithGround(station.tileId, ground);
    const commerce = new RoadsideCommerce();
    const report = commerce.apply(group, station.tileId, origin, 0)!;
    expect(report.stations).toBe(1);
    expect(report.islands).toBe(station.rows * station.cols);
    expect(report.triangles).toBeGreaterThan(200);
    const deck = meshBounds(group, 'fascia'), columns = meshBounds(group, 'column'), islands = meshBounds(group, 'concrete');
    expect(deck.max.y).toBeCloseTo(station.top, 2);
    expect(deck.min.y - ground).toBeGreaterThanOrEqual(3.9 - 1e-6);
    expect(columns.min.y).toBeCloseTo(ground + 0.15, 2);
    expect(columns.max.y).toBeCloseTo(deck.min.y, 2);
    expect(islands.max.y).toBeCloseTo(ground + 0.15, 2);
    // Every column stands within the canopy footprint.
    const probe = new THREE.Vector3();
    group.traverse(o => {
      if (!(o instanceof THREE.Mesh) || o.name !== 'Roadside commerce | column') return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        probe.fromBufferAttribute(p, i);
        const e = probe.x + origin[0] - station.centre[0], n = -(probe.z + origin[2]) - station.centre[1];
        expect(Math.abs(e * station.axis[0] + n * station.axis[1])).toBeLessThanOrEqual(station.length / 2 + 0.01);
        expect(Math.abs(-e * station.axis[1] + n * station.axis[0])).toBeLessThanOrEqual(station.width / 2 + 0.01);
      }
    });
    // Applying twice is a no-op.
    expect(commerce.apply(group, station.tileId, origin, 0)).toBe(report);
    commerce.dispose();
  });

  it('keeps distant canopies to the deck and its columns', () => {
    const { group, origin } = tileWithGround(station.tileId, ground);
    const report = new RoadsideCommerce().apply(group, station.tileId, origin, 2)!;
    expect(meshBounds(group, 'concrete').isEmpty()).toBe(true);
    expect(meshBounds(group, 'column').isEmpty()).toBe(false);
    expect(meshBounds(group, 'dispenser').isEmpty()).toBe(true);
    // The whole far tile (canopy, signs, light poles) stays a few thousand triangles.
    expect(report.cars).toBe(0); expect(report.stalls).toBe(0);
    expect(report.triangles).toBeLessThan(3000);
  });

  it('raises roadside cabinets clear of drivers and walls signs on their storefront', () => {
    const pylon = data.signs.find(s => s.kind === 'pylon')!;
    const { group, origin } = tileWithGround(pylon.tileId, pylon.z!);
    new RoadsideCommerce().apply(group, pylon.tileId, origin, 0);
    const frames = meshBounds(group, 'signFrame');
    expect(frames.isEmpty()).toBe(false);
    const posts = meshBounds(group, 'signPost');
    expect(posts.min.y).toBeLessThan(pylon.z!);
    // A lone pylon's cabinet starts above head height.
    const own = new THREE.Box3();
    group.traverse(o => { if (o instanceof THREE.Mesh && o.name === 'Roadside commerce | signFrame') { const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); if (Math.hypot(v.x + origin[0] - pylon.at[0], -(v.z + origin[2]) - pylon.at[1]) < 2.5) own.expandByPoint(v); } } });
    expect(own.min.y - pylon.z!).toBeGreaterThan(2.2);
  });
});

describe('storefront parking', () => {
  it('lays square stall rows out from a storefront, capped per tile', async () => {
    const { parkedCars, PARKED_CAP, STALL } = await import('../roadside-commerce');
    expect(data.parking.length).toBeGreaterThan(20);
    for (const row of data.parking) {
      expect(Math.hypot(...row.t)).toBeCloseTo(1, 2);
      expect(Math.hypot(...row.o)).toBeCloseTo(1, 2);
      expect(Math.abs(row.t[0] * row.o[0] + row.t[1] * row.o[1])).toBeLessThan(0.01);
      expect([1, -1]).toContain(row.facing);
      expect(row.count).toBeGreaterThanOrEqual(1);
      expect(row.occupancy).toBeGreaterThan(0); expect(row.occupancy).toBeLessThan(1);
      const centre = [row.a[0] + row.t[0] * STALL.width / 2 + row.o[0] * STALL.depth / 2, row.a[1] + row.t[1] * STALL.width / 2 + row.o[1] * STALL.depth / 2];
      expect(row.tileId).toBe(`${Math.floor(centre[0] / 250)}_${Math.floor(centre[1] / 250)}`);
    }
    const byTile = new Map<string, typeof data.parking>();
    for (const row of data.parking) byTile.set(row.tileId, [...(byTile.get(row.tileId) ?? []), row]);
    const [tile, rows] = [...byTile.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const flat = () => rows[0].z;
    const near = parkedCars(rows, PARKED_CAP[0], flat), mid = parkedCars(rows, PARKED_CAP[1], flat);
    expect(near.length).toBeLessThanOrEqual(PARKED_CAP[0]); expect(mid.length).toBeLessThanOrEqual(PARKED_CAP[1]);
    expect(parkedCars(rows, PARKED_CAP[2], flat)).toHaveLength(0);
    expect(parkedCars(rows, PARKED_CAP[0], flat)).toEqual(near);
    // Every car sits inside one of its tile's stalls.
    for (const car of near) {
      const inStall = rows.some(row => {
        const d = [car.center[0] - row.a[0], car.center[1] - row.a[1]];
        const u = d[0] * row.t[0] + d[1] * row.t[1], v = d[0] * row.o[0] + d[1] * row.o[1];
        return u > 0 && u < row.count * STALL.width && v > 0 && v < STALL.depth;
      });
      expect(inStall, tile).toBe(true);
    }
  });

  it('paints the stall lines just above the ground', () => {
    const row = data.parking[0];
    const { group, origin } = tileWithGround(row.tileId, row.z);
    const report = new RoadsideCommerce().apply(group, row.tileId, origin, 0)!;
    expect(report.stalls).toBeGreaterThan(0);
    const lines = meshBounds(group, 'stall lines');
    expect(lines.isEmpty()).toBe(false);
    expect(lines.min.y).toBeCloseTo(row.z + 0.018, 3);
    expect(lines.max.y).toBeCloseTo(row.z + 0.018, 3);
    const far = tileWithGround(row.tileId, row.z);
    expect(new RoadsideCommerce().apply(far.group, row.tileId, far.origin, 2)!.stalls).toBe(0);
  });
});

describe('stores traced over their canopies', () => {
  it('replaces only that store body with walls and a roof clear of the canopy', () => {
    const station = data.stations.find(s => s.carve)! as Station;
    const carve = station.carve!;
    const { group, origin } = tileWithGround(station.tileId, carve.base);
    // A source body triangle inside the traced footprint, and one on a neighbour 20 m off.
    const tri = (e: number, n: number, name: string) => {
      const p = [e, carve.base + 2, n].map((v, i) => i === 2 ? -v - origin[2] : v - origin[i]);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([p[0], p[1], p[2], p[0] + 0.5, p[1], p[2], p[0], p[1] + 0.5, p[2]], 3)), new THREE.MeshStandardMaterial({ name }));
      group.add(mesh); return mesh;
    };
    const inside = tri(carve.outline[0][0] - 0.2, carve.outline[0][1] - 0.2, 'V2 inferred | brick');
    const neighbour = tri(carve.outline[0][0] - 20, carve.outline[0][1] - 20, 'V2 inferred | brick');
    // Foundation shrubs laid along the traced footprint: one under the canopy, one well clear.
    const shrubs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 2);
    shrubs.name = 'House dressing | foundation shrubs';
    const at = (e: number, n: number) => new THREE.Matrix4().makeTranslation(e - origin[0], carve.base - origin[1], -n - origin[2]);
    shrubs.setMatrixAt(0, at(station.centre[0], station.centre[1]));
    shrubs.setMatrixAt(1, at(station.centre[0] + 40, station.centre[1] + 40));
    group.add(shrubs);
    group.updateMatrixWorld(true);
    const report = new RoadsideCommerce().apply(group, station.tileId, origin, 0)!;
    const m = new THREE.Matrix4(), scale = new THREE.Vector3(), q = new THREE.Quaternion(), pos = new THREE.Vector3();
    shrubs.getMatrixAt(0, m); m.decompose(pos, q, scale); expect(scale.length()).toBe(0);
    shrubs.getMatrixAt(1, m); m.decompose(pos, q, scale); expect(scale.length()).toBeCloseTo(Math.sqrt(3), 5);
    expect(report.carvedTriangles).toBe(1);
    expect(inside.parent).toBeNull();
    expect(neighbour.parent).toBe(group);
    const walls = meshBounds(group, 'block'), roof = meshBounds(group, 'rebuilt roof');
    expect(walls.max.y).toBeCloseTo(carve.eave, 2);
    expect(roof.min.y).toBeCloseTo(carve.eave - 0.02, 2);
    // No rebuilt wall enters the canopy.
    const probe = new THREE.Vector3();
    group.traverse(o => {
      if (!(o instanceof THREE.Mesh) || o.name !== 'Roadside commerce | block') return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        probe.fromBufferAttribute(p, i);
        const e = probe.x + origin[0] - station.centre[0], n = -(probe.z + origin[2]) - station.centre[1];
        const u = Math.abs(e * station.axis[0] + n * station.axis[1]), v = Math.abs(-e * station.axis[1] + n * station.axis[0]);
        expect(u < station.length / 2 - 0.05 && v < station.width / 2 - 0.05).toBe(false);
      }
    });
  });
});

describe('lot cars', () => {
  it('are closed, outward-facing forms of a car size, a few hundred triangles at most', () => {
    const parts = lotCarGeometry();
    let triangles = 0;
    const box = new THREE.Box3();
    for (const g of Object.values(parts)) {
      const p = g.getAttribute('position');
      let volume = 0;
      for (let i = 0; i < p.count; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
        volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
      }
      expect(volume).toBeGreaterThan(0);
      triangles += p.count / 3;
      // Every face of these convex parts looks away from its part: faces are
      // grouped by part (body, cabin, roof; each tyre) through their nearest centre.
      g.computeBoundingBox();
      g.computeBoundingBox(); box.union(g.boundingBox!);
    }
    expect(triangles).toBeLessThan(220);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(4.6, 1); expect(size.x).toBeGreaterThan(1.7); expect(size.x).toBeLessThan(1.9);
    expect(box.min.y).toBeGreaterThanOrEqual(0); expect(box.max.y).toBeCloseTo(1.4, 1);
    // The hood leads: the front is at -Z, as for the drive car.
    const glass = parts.glass.boundingBox!;
    expect((glass.min.z + glass.max.z) / 2).toBeGreaterThan(0);
  });
});
