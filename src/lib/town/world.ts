import { foundationWallAsset, validFoundationWallPacket } from './foundation-wall-finish';
import * as THREE from 'three';
import release from '../../../data/derived/town/release.json';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { boundsDistanceSquared, chooseLod, type Quality, type TownTile, type V3, type WorldManifest, type WorldMetrics } from './contracts';
import { TownSurfaces } from './surfaces';
import { decodeCoverPNG } from './cover-data';
import { applyArtMaterial, treeArtColor } from './art-materials';
import { installLeafAtlasOverride, leafAtlasTextureURL } from './leaf-atlas-loader';
import { installSourceTextureAliases, sourceTextureLoadedURL } from './source-texture-aliases';
import { SourceImageCache } from './source-image-cache';
import { sourceImageHints } from './source-image-hints';
import { additionalEnvironmentAsset, validAdditionalEnvironmentPacket, applyAdditionalEnvironment } from './additional-environment';
import { roadsideAsset, validRoadsidePacket, applyRoadsideDetails } from './roadside-details';
import { environmentGroundAsset, validEnvironmentGroundPacket, applyEnvironmentGround, type EnvironmentGroundPacket } from './environment-ground';
import { roadMaterialAsset, validRoadMaterialPacket, applyRoadMaterialFinish, type RoadMaterialPacket } from './road-material-finish';
import { environmentFacilitiesAsset, validEnvironmentFacilitiesPacket, applyEnvironmentFacilities } from './environment-facilities';
import { treeForm, createConiferPrototype, disposeConiferPrototype, createOpenBroadleafPrototype, disposeOpenBroadleafPrototype, createBroadleafPrototype, disposeBroadleafPrototype } from './vegetation';
import { excludedTreeAnchors } from './tree-exclusions';
import { readSceneBuffer } from './asset-transfer';
import { readCriticalJson, withLoadDeadline } from './critical-load';
import { TextureLifetime } from './texture-lifetime';
import { TEXTURE_SLOTS, textureIdentity, materialIdentity } from './material-identity';
import { ByteCache } from './byte-cache';
import { RequestQueue } from './request-queue';
import { assembleTile } from './tile-assembly';
import { streetCornerAsset, validStreetCornerPacket } from './street-corners';
import { streetCornerGroundAsset, validStreetCornerGroundPacket, type StreetCornerGroundPacket } from './street-corner-ground';
import { roadCurveAsset, validRoadCurvePacket, type RoadCurvePacket } from './road-curve-finish';
import { roadDashAsset, validRoadDashPacket, type RoadDashPacket } from './road-dash-finish';
import { EvidenceStream } from './evidence-stream';
import { RoadFinishStream, applyRoadFinish } from './road-finish';
import { terrainFinishAsset, validTerrainFinishPacket, applyTerrainFinish, type TerrainFinishPacket } from './terrain-finish';
import { parkingFinishAsset, pavedMaskReference } from './paved-surfaces';
import { applyParkingFinish, validParkingPacket } from './parking-finish';
import { beginOptionalDetail, TileDetailStream } from './optional-detail';
import { BoundaryContext } from './boundary-context';
import { propertyTerrainAsset, validPropertyTerrainPacket, type PropertyTerrainPacket } from './property-terrain-finish';
import { createDistantCanopyPrototype, disposeDistantCanopyPrototype } from './distant-canopy';
import { createTrunkContactPrototype, disposeTrunkContactPrototype, TRUNK_CONTACT_SOURCE_SHA256 } from './trunk-contact';

type TreePlan = { near: Set<number>; shadows: Set<number>; excluded: Set<number>; key: string };
type LoadedTile = { group: THREE.Group; level: number; lastUsed: number; trees?: THREE.Group; treeRows?: number[][]; treeExcluded?: Set<number>; treePlan?: TreePlan; occluders?: THREE.Mesh[]; geometryBytes?: number; detailRetryAt?: number; detailAttempts?: number };
type MaterialEntry = { material: THREE.Material; refs: number; textures: string[] };


/** Leafy streets read through broken tree shade (VC-0369, VC-0377, VC-0427).
 * Desktop shadows cover the nearest crowns ahead of and around the car. */
export const TREE_SHADOW_CAP = 64;
const TREE_SHADOW_ENTER_M = 110;

export class TownWorld {
  readonly metrics: WorldMetrics = { pending: 0, loaded: 0, triangles: 0, bytes: 0, errors: 0 };
  readonly root = new THREE.Group();
  readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  readonly loaded = new Map<string, LoadedTile>();
  private inflight = new Map<string, AbortController>();
  private wanted = new Map<string, number>();
  private materialPool = new Map<string, MaterialEntry>();
  private texturePool = new Map<string, { texture: THREE.Texture; refs: number }>();
  private textureLifetime = new TextureLifetime();
  private detailRequests = new RequestQueue(3);
  private sourceRetryCache = new ByteCache<ArrayBuffer>(24 * 1024 * 1024, 8);
  private leases = new WeakMap<THREE.Object3D, Set<string>>();
  private releasedGroups = new WeakSet<THREE.Object3D>();
  private prototypes: THREE.Group[] = [];
  private coniferPrototypes = new Map<number, THREE.Group>();
  private broadleafPrototypes = new Map<number, THREE.Group>();
  private openBroadleafPrototypes = new Map<number, THREE.Group>();
  private distantCanopyPrototypes = new Map<number, { broadleaf: THREE.Group; conifer: THREE.Group }>();
  private trunkContactPrototypes = new Map<number, THREE.Group>();
  private backdropMaterials: THREE.Material[] = [];
  private failures = new Map<string, number>();
  private disposed = false;
  private generation = 0;
  private low = false;
  private mobile = false;
  private treeShadows = true;
  private position: V3 = [0, 0, 0];
  private preparingAt: V3 | null = null;
  private sharedAbort = new AbortController();
  private initialization?: Promise<void>;
  private surfaces?: TownSurfaces;
  private readonly stageTimings: Record<string, number> = {};
  private readonly timings = { tiles: 0, parseMs: 0, assemblyMs: 0, maxParseMs: 0, maxAssemblyMs: 0, detailRetries: 0, detailRecovered: 0 };
  private readonly artClock = { value: 0 };
  private readonly boundaryContext: BoundaryContext;
  private readonly sourceImages: SourceImageCache;
  private readonly foundationWalls = new TileDetailStream(foundationWallAsset, validFoundationWallPacket, (url, signal) => this.fetchJson(url, signal), 512 * 1024);
  private readonly evidence = new EvidenceStream(<T>(url:string,signal:AbortSignal)=>this.fetchJson<T>(url,signal));
  private readonly roadFinish = new RoadFinishStream(<T>(url:string,signal:AbortSignal)=>this.fetchJson<T>(url,signal));
  private readonly terrainFinish = new TileDetailStream(
    key=>{const[id,level]=key.split('@');return terrainFinishAsset(id,Number(level));},
    (value,key):value is TerrainFinishPacket=>{const[id,level]=key.split('@');return validTerrainFinishPacket(value,id)&&value.levels.length===1&&value.levels[0].level===Number(level);},
    (url,signal)=>this.fetchJson(url,signal));
  private readonly parkingFinish = new TileDetailStream(parkingFinishAsset,validParkingPacket,(url,signal)=>this.fetchJson(url,signal));

  private readonly additionalEnvironment = new TileDetailStream(additionalEnvironmentAsset,validAdditionalEnvironmentPacket,(url,signal)=>this.fetchJson(url,signal));
  private readonly roadside = new TileDetailStream(roadsideAsset,validRoadsidePacket,(url,signal)=>this.fetchJson(url,signal));
  private readonly facilities = new TileDetailStream(environmentFacilitiesAsset,validEnvironmentFacilitiesPacket,(url,signal)=>this.fetchJson(url,signal));
  private readonly environmentGround = new TileDetailStream(
    key=>{const[id,level]=key.split('@');return environmentGroundAsset(id,Number(level));},
    (value,key):value is EnvironmentGroundPacket=>{const[id,level]=key.split('@');return validEnvironmentGroundPacket(value,id)&&value.levels.length===1&&value.levels[0].level===Number(level);},
    (url,signal)=>this.fetchJson(url,signal));

  private readonly roadMaterials = new TileDetailStream(
    key=>{const[id,level]=key.split('@');return roadMaterialAsset(id,Number(level));},
    (value,key):value is RoadMaterialPacket=>{const[id,level]=key.split('@');return validRoadMaterialPacket(value,id,Number(level));},
    (url,signal)=>this.fetchJson(url,signal));

  private readonly streetCorners = new TileDetailStream(streetCornerAsset, validStreetCornerPacket, (url, signal) => this.fetchJson(url, signal));

  private readonly streetCornerGround = new TileDetailStream(
    key => { const [id, level] = key.split('@'); return streetCornerGroundAsset(id, Number(level)); },
    (value, key): value is StreetCornerGroundPacket => { const [id, level] = key.split('@'); return validStreetCornerGroundPacket(value, id) && value.levels.length === 1 && value.levels[0].level === Number(level); },
    (url, signal) => this.fetchJson(url, signal));

  private readonly roadCurve = new TileDetailStream(
    key => { const [id, level] = key.split('@'); return roadCurveAsset(id, Number(level)); },
    (value, key): value is RoadCurvePacket => { const [id, level] = key.split('@'); return validRoadCurvePacket(value, id, Number(level)); },
    (url, signal) => this.fetchJson(url, signal), 2 * 1024 * 1024);

  private readonly roadDash = new TileDetailStream(
    key => { const [id, level] = key.split('@'); return roadDashAsset(id, Number(level)); },
    (value, key): value is RoadDashPacket => { const [id, level] = key.split('@'); return validRoadDashPacket(value, id, Number(level)); },
    (url, signal) => this.fetchJson(url, signal), 512 * 1024);

  private readonly propertyTerrain = new TileDetailStream(
    key => { const [id, level] = key.split('@'); return propertyTerrainAsset(id, Number(level)); },
    (value, key): value is PropertyTerrainPacket => { const [id, level] = key.split('@'); return validPropertyTerrainPacket(value, id) && value.levels.length === 1 && value.levels[0].level === Number(level); },
    (url, signal) => this.fetchJson(url, signal), 2 * 1024 * 1024);

  constructor(readonly manifest: WorldManifest, readonly manifestUrl: string, readonly onChange: () => void) {
    this.root.name = 'Webster scenery';
    this.sourceImages = new SourceImageCache(new URL(manifestUrl).origin, async (url, signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Scenery image could not load (${response.status}).`);
      const blob = await response.blob(); this.metrics.bytes += Number(response.headers.get('content-length')) || blob.size; return blob;
    });
    this.sourceImages.install(this.loader);
    this.boundaryContext = new BoundaryContext(new URL(manifestUrl).pathname.endsWith(`/${release.directory}/manifest.json`) ? release.manifestSha256 : undefined,
      (url, signal) => this.fetchJson(url, signal), {
        adopt: group => { this.acquireMaterials(group); if (!this.boundaryContext.root.parent) this.root.add(this.boundaryContext.root); }, release: group => this.releaseGroup(group),
        trees: (rows, origin) => this.buildTrees(rows, origin, { near: new Set(), shadows: new Set(), excluded: new Set(), key: 'non-drivable context' }),
        releaseTrees: group => this.releaseTrees(group), changed: () => this.onChange(),
      });
    installLeafAtlasOverride(this.loader);
    installSourceTextureAliases(this.loader);
    if (manifest.surfaces) this.surfaces = new TownSurfaces(manifest.surfaces, (asset, color, parentSignal, data = false) => withLoadDeadline(parentSignal, async signal => {
      const response = await fetch(this.url(asset.url), { signal });
      if (!response.ok) throw new Error(`Ground surface could not load (${response.status}).`);
      if (data) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        this.metrics.bytes += Number(response.headers.get('content-length')) || bytes.length;
        if (this.disposed || signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
        const mask = decodeCoverPNG(bytes);
        const texture = new THREE.DataTexture(mask.data, mask.width, mask.height);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
      }
      const blob = await response.blob();
      this.metrics.bytes += Number(response.headers.get('content-length')) || blob.size;
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (this.disposed || signal.aborted) {
        bitmap.close();
        throw new DOMException('Loading cancelled', 'AbortError');
      }
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      return texture;
    }, { label: 'Ground textures', timeoutMs: 25000 }, texture => this.textureLifetime.release(texture)));
  }

  url(path: string): string { return new URL(path, this.manifestUrl).href; }

  private ownsCell(tile: TownTile, position: V3): boolean {
    const size = this.manifest.tileSizeM ?? 250;
    return position[0] >= tile.origin[0] && position[0] < tile.origin[0] + size &&
      position[2] <= tile.origin[2] && position[2] > tile.origin[2] - size;
  }

  async fetchJson<T>(path: string, signal: AbortSignal = this.sharedAbort.signal): Promise<T> {
    let received = 0;
    return this.detailRequests.run(signal, () => readCriticalJson<T>(this.url(path), signal, { label: 'Town detail', timeoutMs: 25000,
      onProgress: progress => { this.metrics.bytes += Math.max(0, progress.receivedBytes - received); received = progress.receivedBytes; },
    }));
  }

  async loadGlb(path: string, signal: AbortSignal = this.sharedAbort.signal, tile?: TownTile, level = 0): Promise<THREE.Group> {
    return withLoadDeadline(signal, s => this.readGlb(path, s, tile, level), { label: 'Town scenery', timeoutMs: 45000 }, group => this.releaseGroup(group));
  }

  private async readGlb(path: string, signal: AbortSignal, tile?: TownTile, level = 0): Promise<THREE.Group> {
    const url = this.url(path);
    this.sourceImages.prefetch(sourceImageHints(url));
    const cachedSource = this.sourceRetryCache.get(url);
    const base = cachedSource ? Promise.resolve(cachedSource) : readSceneBuffer(url, signal, bytes => { this.metrics.bytes += bytes; });
    const foundationWallsRequest=tile?beginOptionalDetail(signal,s=>this.foundationWalls.tile(tile.id,s)):undefined;
    const roadRequest=tile?beginOptionalDetail(signal,s=>this.roadFinish.tile(tile.id,s)):undefined;
    const terrainRequest=tile?beginOptionalDetail(signal,s=>this.terrainFinish.tile(`${tile.id}@${level}`,s)):undefined;
    const parkingRequest=tile?beginOptionalDetail(signal,s=>this.parkingFinish.tile(tile.id,s)):undefined;
    const additionalRequest=tile?beginOptionalDetail(signal,s=>this.additionalEnvironment.tile(tile.id,s)):undefined;
    const roadsideRequest=tile?beginOptionalDetail(signal,s=>this.roadside.tile(tile.id,s)):undefined;
    const environmentGroundRequest=tile?beginOptionalDetail(signal,s=>this.environmentGround.tile(tile.id+'@'+level,s)):undefined;
    const facilitiesRequest=tile?beginOptionalDetail(signal,s=>this.facilities.tile(tile.id,s)):undefined;
    const roadMaterialsRequest=tile?beginOptionalDetail(signal,s=>this.roadMaterials.tile(tile.id+'@'+level,s)):undefined;
    const streetCornersRequest=tile?beginOptionalDetail(signal,s=>this.streetCorners.tile(tile.id,s)):undefined;
    const streetCornerGroundRequest=tile?beginOptionalDetail(signal,s=>this.streetCornerGround.tile(tile.id+'@'+level,s)):undefined;
    const roadCurveRequest=tile?beginOptionalDetail(signal,s=>this.roadCurve.tile(tile.id+'@'+level,s)):undefined;
    const propertyTerrainRequest=tile?beginOptionalDetail(signal,s=>this.propertyTerrain.tile(tile.id+'@'+level,s)):undefined;
    const roadDashRequest=tile?beginOptionalDetail(signal,s=>this.roadDash.tile(tile.id+'@'+level,s)):undefined;
    // Begin GLTF texture reads as soon as the source bytes arrive. Optional
    // families get the same post-source grace in parallel, never serial grace
    // windows that delay source parsing. The scene remains unpublished.
    const parsed = base.then(async data => {
      const parseStarted = performance.now();
      const gltf = await withLoadDeadline(signal, () => this.loader.parseAsync(data, new URL('.', url).href), { label: 'Town textures', timeoutMs: 30000 }, gltf => this.disposeRaw(gltf.scene));
      const parseMs = performance.now() - parseStarted;
      this.timings.parseMs += parseMs; this.timings.maxParseMs = Math.max(this.timings.maxParseMs, parseMs);
      return gltf;
    });
    const finishes = base.then(() => Promise.all([roadRequest?.finish(),terrainRequest?.finish(),parkingRequest?.finish(),additionalRequest?.finish(),roadsideRequest?.finish(),environmentGroundRequest?.finish(),facilitiesRequest?.finish(),roadMaterialsRequest?.finish(),streetCornersRequest?.finish(),streetCornerGroundRequest?.finish(),roadCurveRequest?.finish(),roadDashRequest?.finish(),propertyTerrainRequest?.finish(),foundationWallsRequest?.finish()]));
    const complete = Promise.all([base, tile?this.evidence.tile(tile.id,signal,base):Promise.resolve(undefined), finishes, parsed]);
    let loaded: Awaited<typeof complete>;
    try { loaded = await complete; }
    catch(error) {
      roadRequest?.cancel();terrainRequest?.cancel();parkingRequest?.cancel();additionalRequest?.cancel();roadsideRequest?.cancel();environmentGroundRequest?.cancel();facilitiesRequest?.cancel();roadMaterialsRequest?.cancel();streetCornersRequest?.cancel();streetCornerGroundRequest?.cancel();roadCurveRequest?.cancel();roadDashRequest?.cancel();propertyTerrainRequest?.cancel();foundationWallsRequest?.cancel();
      // A different family can fail after parsing already succeeded. Retire it
      // here, including a late parse result; release is idempotent.
      void parsed.then(gltf => this.disposeRaw(gltf.scene), () => {});
      throw error;
    }
    const [data,evidence,[road,terrain,parking,additional,roadside,environmentGround,facilities,roadMaterials,streetCorners,streetCornerGround,roadCurve,roadDash,propertyTerrain,foundationWalls],gltf] = loaded;
    if (this.disposed || signal.aborted) {
      this.disposeRaw(gltf.scene);
      throw new DOMException('Loading cancelled', 'AbortError');
    }
    const sourceTextures = this.trackTextures(gltf.scene);
    if (tile) {
      const assemblyStarted = performance.now();
      const missing = [
        this.foundationWalls.hasAsset(tile.id) && !foundationWalls && 'foundationWalls',
        this.evidence.hasAsset(tile.id) && (!evidence || evidence.failures > 0) && 'buildings',
        this.roadFinish.hasAsset(tile.id) && !road?.length && 'roadPaint',
        this.terrainFinish.hasAsset(tile.id+'@'+level) && !terrain && 'terrain',
        this.parkingFinish.hasAsset(tile.id) && !parking && 'parking',
        this.additionalEnvironment.hasAsset(tile.id) && !additional && 'environment',
        this.roadside.hasAsset(tile.id) && !roadside && 'roadside',
        this.environmentGround.hasAsset(tile.id+'@'+level) && !environmentGround && 'shoreline',
        this.facilities.hasAsset(tile.id) && !facilities && 'facilities',
        this.roadMaterials.hasAsset(tile.id+'@'+level) && !roadMaterials && 'roadMaterials',
        this.streetCorners.hasAsset(tile.id) && !streetCorners && 'streetCorners',
        this.streetCornerGround.hasAsset(tile.id+'@'+level) && !streetCornerGround && 'streetCornerGround',
        this.roadCurve.hasAsset(tile.id+'@'+level) && !roadCurve && 'roadCurve',
        this.propertyTerrain.hasAsset(tile.id+'@'+level) && !propertyTerrain && 'propertyTerrain',
        this.roadDash.hasAsset(tile.id+'@'+level) && !roadDash && 'roadDash',
      ].filter(Boolean) as string[];
      gltf.scene.userData.optionalDetailMissing = missing;
      try {
        const stages = await assembleTile(gltf.scene, tile, level, { evidence, road, terrain, parking, additional, roadside, environmentGround, facilities, roadMaterials, streetCorners, streetCornerGround, roadCurve, roadDash, propertyTerrain, foundationWalls }, signal);
        for (const [name, ms] of Object.entries(stages)) this.stageTimings[name] = Math.max(this.stageTimings[name] ?? 0, ms);
      }
      catch (error) { this.disposeRaw(gltf.scene); sourceTextures.forEach(texture => this.textureLifetime.release(texture)); throw error; }
      if (gltf.scene.userData.optionalDetailMissing?.length) this.sourceRetryCache.set(url, data, data.byteLength); else this.sourceRetryCache.delete(url);
      const assemblyMs = performance.now() - assemblyStarted; this.timings.tiles++;
      this.timings.assemblyMs += assemblyMs; this.timings.maxAssemblyMs = Math.max(this.timings.maxAssemblyMs, assemblyMs);
    }
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const slot of TEXTURE_SLOTS) {
          const texture = (material as THREE.MeshStandardMaterial)[slot];
          if (!texture) continue;
          const authoredImageURL = leafAtlasTextureURL(texture) ?? sourceTextureLoadedURL(texture);
          if (authoredImageURL) { texture.userData.sourceUrl = authoredImageURL; continue; }
          const reference = gltf.parser.associations.get(texture);
          if (!reference && texture.userData.sourceUrl) continue;
          const definition = gltf.parser.json.textures?.[reference?.textures ?? -1];
          const imageIndex = definition?.extensions?.KHR_texture_basisu?.source ?? definition?.source;
          const uri = gltf.parser.json.images?.[imageIndex]?.uri;
          texture.userData.sourceUrl = uri ? new URL(uri, url).href : `${url}#image-${imageIndex ?? texture.uuid}`;
        }
      }
    });
    const retainedTextures = this.trackTextures(gltf.scene);
    sourceTextures.forEach(texture => { if (!retainedTextures.has(texture)) this.textureLifetime.release(texture); });
    this.acquireMaterials(gltf.scene);
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.receiveShadow = true;
        if (!object.userData.townCrafted) object.castShadow = /building|landmark|car|roof|facade/i.test(object.name);
      }
    });
    return gltf.scene;
  }

  async initialize(initialPosition?: V3): Promise<void> {
    const shared = this.initialization ??= this.initializeShared();
    // Fetch the starting street while shared scenery downloads. Its materials
    // and trees still wait for the shared resources before the tile is exposed.
    if (initialPosition) await Promise.all([shared, this.prepareAt(initialPosition)]);
    else await shared;
  }

  private async initializeShared(): Promise<void> {
    const results = await Promise.allSettled([
      this.surfaces?.initialize(this.sharedAbort.signal),
      this.loadGlb(this.manifest.fallback.url),
      ...(this.manifest.trees?.prototypes ?? []).map(prototype => this.loadGlb(prototype.url)),
    ]);
    const groups = results.slice(1).flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
    const failure = results.find(result => result.status === 'rejected');
    if (this.disposed || this.sharedAbort.signal.aborted || failure) {
      groups.forEach(group => this.releaseGroup(group));
      this.surfaces?.dispose();
      if (failure?.status === 'rejected') throw failure.reason;
      throw new DOMException('Loading cancelled', 'AbortError');
    }
    // allSettled keeps prototype order stable even when downloads finish in a
    // different order, and lets us release every successful sibling on failure.
    const [fallback, ...prototypes] = groups;
    fallback.name = 'Town landscape overview';
    fallback.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.renderOrder = -100;
      object.castShadow = false;
      object.receiveShadow = false;
      const backdrop = (material: THREE.Material): THREE.Material => {
        const copy = material.clone();
        copy.depthWrite = false;
        this.backdropMaterials.push(copy);
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(backdrop) : backdrop(object.material);
    });
    this.root.add(fallback);
    this.prototypes.push(...prototypes);
    // Borrow pooled leaf materials; shared variants are allocated once for the
    // entire town, independent of the number of anchors or visible tiles.
    try {
      this.manifest.trees.prototypes.forEach((definition, index) => {
        if (definition.role === 'trunk' && definition.sha256 === TRUNK_CONTACT_SOURCE_SHA256) this.trunkContactPrototypes.set(index, createTrunkContactPrototype(prototypes[index]));
        if (definition.role === 'crown') this.coniferPrototypes.set(index, createConiferPrototype(prototypes[index]));
        if (definition.role === 'crown' && definition.level === 0) this.broadleafPrototypes.set(index, createBroadleafPrototype(prototypes[index]));
        if (definition.role === 'crown' && definition.level === 0) this.openBroadleafPrototypes.set(index, createOpenBroadleafPrototype(prototypes[index]));
        if (definition.role === 'crown' && definition.level === 1) {
          const broadleaf = createDistantCanopyPrototype(prototypes[index]);
          try {
            const conifer = createDistantCanopyPrototype(this.coniferPrototypes.get(index)!);
            this.distantCanopyPrototypes.set(index, { broadleaf, conifer });
          } catch (error) { disposeDistantCanopyPrototype(broadleaf); throw error; }
        }
      });
    } catch (error) {
      for (const variant of this.coniferPrototypes.values()) disposeConiferPrototype(variant);
      this.coniferPrototypes.clear();
      for (const variant of this.broadleafPrototypes.values()) disposeBroadleafPrototype(variant);
      this.broadleafPrototypes.clear();
      for (const variant of this.openBroadleafPrototypes.values()) disposeOpenBroadleafPrototype(variant);
      this.openBroadleafPrototypes.clear();
      this.dispose();
      throw error;
    }
  }

  setQuality(quality: Quality, mobile: boolean): void {
    this.mobile = mobile;
    this.low = quality === 'low' || (quality === 'auto' && mobile);
    this.boundaryContext.setLow(this.low || mobile);
    this.sourceImages.setLow(this.low || mobile);
    this.treeShadows = !this.low && !mobile;
    this.generation++;
    this.detailRequests.limit = mobile ? 2 : 3;
    const mib = 1024 * 1024, scale = mobile ? .5 : 1;
    this.terrainFinish.setBudget(12 * mib * scale);
    this.evidence.setBudget(8 * mib * scale); this.roadFinish.setBudget(4 * mib * scale);
    for (const stream of [this.parkingFinish, this.additionalEnvironment, this.roadside, this.facilities, this.environmentGround, this.roadMaterials, this.streetCorners, this.streetCornerGround]) stream.setBudget(4 * mib * scale);
    this.roadCurve.setBudget(2 * mib * scale); this.roadDash.setBudget(.5 * mib * scale); this.propertyTerrain.setBudget(2 * mib * scale); this.foundationWalls.setBudget(.5 * mib * scale);
    this.sourceRetryCache.maxBytes = (mobile ? 12 : 24) * mib; this.sourceRetryCache.trim();
  }

  updatePresentation(timeSeconds: number, position: V3 = this.position): void {
    if (Number.isFinite(timeSeconds)) this.artClock.value = timeSeconds;
    this.surfaces?.refine(this.sharedAbort.signal);
    this.surfaces?.update(position, this.low || this.mobile, timeSeconds);
  }

  presentationResources() {
    return this.surfaces?.grassResources() ?? { tufts: 0, triangles: 0, bytes: 0, indexedTiles: 0, bins: 0, rebuilds: 0, materials: 0 };
  }

  evidenceResources() {
    let buildings=0,documented=0,triangles=0;
    for(const tile of this.loaded.values()){
      const report=tile.group.userData.evidenceBuildings;
      if(report){buildings+=report.buildingIds.length;documented+=report.documentedIds.length;triangles+=report.addedTriangles;}
    }
    return{buildings,documented,triangles,optionalFailures:this.evidence.failures};
  }

  researchResources() {
    let bridges=0,memorials=0,civicWindows=0,landmarkForms=0,institutions=0,commercialFacades=0,environmentObjects=0,roadsideObjects=0,facilities=0,utilityBasins=0,lakeVessels=0,campStructures=0,triangles=0;
    for(const {group} of this.loaded.values()) {
      const bridge=group.userData.bridgeDetails,memorial=group.userData.townMemorialDetails;
      const civic=group.userData.civicDetails,environment=group.userData.townAdditionalEnvironment;
      bridges+=bridge?.featureIds.length??0;memorials+=memorial?.ids.length??0;
      landmarkForms+=group.userData.landmarkCompletion?.ids.length??0;
      civicWindows+=civic?.windows??0;environmentObjects+=environment?.ids.length??0;
      roadsideObjects+=group.userData.roadsideDetails?.ids.length??0;
      utilityBasins+=group.userData.utilitySiteDetails?.ids.length??0;lakeVessels+=group.userData.lakeLife?.ids.length??0;
      triangles+=(group.userData.utilitySiteDetails?.triangles??0)+(group.userData.lakeLife?.triangles??0);
      institutions+=group.userData.institutionalCompletion?.ids.length??0;commercialFacades+=group.userData.commercialCompletion?.facades??0;
      facilities+=group.userData.environmentFacilities?.ids.length??0;
      campStructures+=group.userData.campStructures?.ids.length??0;
      triangles+=group.userData.campStructures?.triangles??0;
      triangles+=(bridge?.addedTriangles??0)+(memorial?.addedTriangles??0)+(civic?.triangles??0)+(environment?.addedTriangles??0)+(group.userData.landmarkCompletion?.triangles??0)+(group.userData.roadsideDetails?.addedTriangles??0);
      triangles+=(group.userData.institutionalCompletion?.triangles??0)+(group.userData.commercialCompletion?.triangles??0)+(group.userData.environmentGround?.waterTriangles??0)+(group.userData.environmentGround?.addedTriangles??0);
      triangles+=group.userData.environmentFacilities?.triangles??0;
    }
    return{campStructures,utilityBasins,lakeVessels,bridges,memorials,civicWindows,landmarkForms,institutions,commercialFacades,environmentObjects,roadsideObjects,facilities,triangles,optionalFailures:this.additionalEnvironment.failures+this.roadside.failures+this.environmentGround.failures+this.facilities.failures+this.roadMaterials.failures+this.streetCorners.failures+this.streetCornerGround.failures+this.roadCurve.failures+this.roadDash.failures+this.propertyTerrain.failures+this.foundationWalls.failures};
  }

  finishResources() {
    let roadTriangles=0,roadSurfaceTriangles=0,terrainTriangles=0,parkingTriangles=0,parkingBays=0,pavedMasks=0,rejectedTerrain=0,parkedCars=0,parkedDraws=0,parkedTriangles=0;
    const streetGeometry: unknown[] = [];
    for(const {group} of this.loaded.values()) {
      if (group.userData.streetGeometry) streetGeometry.push(group.userData.streetGeometry);
      roadTriangles+=group.userData.roadFinish?.addedTriangles??0;roadSurfaceTriangles+=group.userData.roadMaterialFinish?.triangles??0;
      terrainTriangles+=group.userData.terrainFinish?.addedTriangles??0;
      parkingTriangles+=group.userData.parkingFinish?.triangles??0;
      parkingBays+=group.userData.parkingFinish?.bays??0;
      parkedCars+=group.userData.parkedLife?.cars??0;
      parkedDraws+=group.userData.parkedLife?.draws??0;
      parkedTriangles+=group.userData.parkedLife?.triangles??0;
      pavedMasks+=Number(!!group.userData.pavedSurfaceMask);
      rejectedTerrain+=Number(!!group.userData.terrainFinish?.rejected);
    }
    return{roadDash:[...this.loaded.values()].flatMap(({group})=>group.userData.roadDashResult?[group.userData.roadDashResult]:[]),roadCurve:[...this.loaded.values()].flatMap(({group})=>group.userData.roadCurveResult?[group.userData.roadCurveResult]:[]),arrivalGrounds:[...this.loaded.values()].flatMap(({group})=>group.userData.arrivalGrounds?[group.userData.arrivalGrounds]:[]),parkedCars,parkedDraws,parkedTriangles,streetCornerGround:[...this.loaded.values()].flatMap(({group})=>group.userData.streetCornerGroundResult?[group.userData.streetCornerGroundResult]:[]),streetCorners:[...this.loaded.values()].flatMap(({group})=>group.userData.streetCorners?[group.userData.streetCorners]:[]),streetGeometry,roadTriangles,roadSurfaceTriangles,terrainTriangles,parkingTriangles,parkingBays,pavedMasks,rejectedTerrain,optionalFailures:this.roadFinish.failures+this.terrainFinish.failures+this.parkingFinish.failures+this.additionalEnvironment.failures+this.roadside.failures+this.environmentGround.failures+this.facilities.failures+this.roadMaterials.failures+this.streetCorners.failures+this.streetCornerGround.failures+this.roadCurve.failures+this.roadDash.failures+this.propertyTerrain.failures+this.foundationWalls.failures};
  }

  update(position: V3, lookAhead: V3, force = false): void {
    if (this.disposed) return;
    const preparing = this.preparingAt;
    if (preparing) position = lookAhead = preparing;
    this.position = position;
    const radius = this.low ? 620 : 950;
    const time = performance.now();
    let selected = (preparing ? this.readinessTiles(position) : this.manifest.tiles)
      .map((tile) => ({ tile, distance: Math.sqrt(boundsDistanceSquared(tile.bounds, position)), ahead: Math.sqrt(boundsDistanceSquared(tile.bounds, lookAhead)) }))
      .filter(({ distance, ahead }) => preparing || distance < radius || ahead < (this.low ? 240 : 350))
      .sort((a, b) => Number(this.ownsCell(b.tile, position)) - Number(this.ownsCell(a.tile, position)) || Math.min(a.distance, a.ahead + 80) - Math.min(b.distance, b.ahead + 80));
    if (!preparing) selected = selected.slice(0, this.low ? 26 : 48);
    const desired = new Map<string, number>();
    const treePlans = this.planTrees(selected.map(({ tile }) => tile));
    for (const { tile, distance } of selected) {
      let level = chooseLod(tile, distance, this.low);
      const cached = this.loaded.get(tile.id);
      if (cached) {
        cached.lastUsed = time;
        const boundary = Math.min(cached.level, level) === 0 ? (this.low ? 160 : 280) : (this.low ? 430 : 650);
        if (!force && cached.level !== level && Math.abs(distance - boundary) < 35) level = cached.level;
        cached.group.visible = true;
        const treePlan = treePlans.get(tile.id);
        if (cached.treeRows && treePlan && cached.treePlan?.key !== treePlan.key) {
          if (cached.trees) this.releaseTrees(cached.trees);
          cached.trees = this.buildTrees(cached.treeRows, tile.origin, treePlan);
          cached.treePlan = treePlan;
          this.root.add(cached.trees);
        }
        if (cached.trees) cached.trees.visible = distance < (this.low ? 500 : 800);
      }
      desired.set(tile.id, level);
    }
    this.wanted = desired;
    for (const [id, controller] of this.inflight) if (!desired.has(id)) controller.abort();
    for (const [id, cached] of this.loaded) {
      if (!desired.has(id)) {
        cached.group.visible = false;
        if (cached.trees) cached.trees.visible = false;
        if (time - cached.lastUsed > 8000 || this.loaded.size > (this.low ? 32 : 56)) this.evict(id);
      }
    }
    this.trimHiddenGeometry();
    for (const { tile } of selected) {
      if (this.inflight.size >= 2) break;
      if (this.inflight.has(tile.id)) continue;
      const current = this.loaded.get(tile.id);
      const retry = !!current && current.level === desired.get(tile.id) && !!current.group.userData.optionalDetailMissing?.length && time >= (current.detailRetryAt ?? Infinity);
      if (current?.level === desired.get(tile.id) && !retry) continue;
      // Ready streets take precedence over a second attempt at optional detail.
      if (retry && selected.some(({tile: next}) => !this.loaded.has(next.id) && !this.inflight.has(next.id) && time - (this.failures.get(next.id) ?? -Infinity) >= 10000)) continue;
      if (retry) this.timings.detailRetries++;
      if (time - (this.failures.get(tile.id) ?? -Infinity) < 10000) continue;
      void this.loadTile(tile, desired.get(tile.id)!);
    }
    this.metrics.pending = this.inflight.size;
    this.metrics.loaded = this.loaded.size;
    this.boundaryContext.update(position, !preparing && this.prototypes.length > 0 && this.isReadyAt(position));
  }

  /** Explicit player retry resets only nearby failure backoff, not the town. */
  retryAt(position: V3): void {
    this.surfaces?.retryRefinement(this.sharedAbort.signal);
    if (this.disposed) return;
    this.boundaryContext.retry();
    for (const tile of this.manifest.tiles) if (this.ownsCell(tile, position) || boundsDistanceSquared(tile.bounds, position) < 100 * 100) {
      this.failures.delete(tile.id);
      const loaded = this.loaded.get(tile.id);
      if (loaded) { loaded.detailRetryAt = 0; loaded.detailAttempts = 0; }
    }
    this.update(position, position, true);
  }

  /** Cached once at tile adoption; callers can raycast nearby actual solid
   * meshes without traversing trees, grass, transparent water or the backdrop. */
  cameraOccluders(position: V3, radius = 30): readonly THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const tile of this.manifest.tiles) {
      const loaded = this.loaded.get(tile.id);
      if (loaded?.group.visible && boundsDistanceSquared(tile.bounds, position) <= radius * radius) meshes.push(...(loaded.occluders ?? []));
    }
    return meshes;
  }

  private collectOccluders(group: THREE.Group): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      let name = object.name;
      for (let parent = object.parent; parent && parent !== group; parent = parent.parent) name += ' ' + parent.name;
      name += ' ' + materials.map(material => material.name).join(' ');
      if (object instanceof THREE.InstancedMesh && !/parked/i.test(name)) return;
      if (/grass|water|foliage|leaf|leaves|canopy|crown|shrub|flower|shadow|paint|window|glass/i.test(name)) return;
      if (!/terrain|ground|building|facade|roof|bridge|wall|foundation|asphalt|road|stone|brick|parked/i.test(name)) return;
      if (materials.every(material => material.transparent || material.opacity < .98 || material.alphaTest > 0)) return;
      if (object instanceof THREE.InstancedMesh) { if (!object.boundingBox) object.computeBoundingBox(); }
      else if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      meshes.push(object);
    });
    return meshes;
  }

  private geometryBytes(group: THREE.Object3D): number {
    const buffers = new Set<ArrayBufferLike>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const attribute of Object.values(object.geometry.attributes) as (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[]) buffers.add((attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array).buffer);
      if (object.geometry.index) buffers.add(object.geometry.index.array.buffer);
      if (object instanceof THREE.InstancedMesh) {
        buffers.add(object.instanceMatrix.array.buffer);
        if (object.instanceColor) buffers.add(object.instanceColor.array.buffer);
      }
    });
    return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  }

  private trimHiddenGeometry(): void {
    const budget = (this.mobile ? 192 : 384) * 1024 * 1024;
    let bytes = [...this.loaded.values()].reduce((sum, tile) => sum + (tile.geometryBytes ?? 0), 0);
    const hidden = [...this.loaded.entries()].filter(([, tile]) => !tile.group.visible).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id, tile] of hidden) {
      if (bytes <= budget) break;
      bytes -= tile.geometryBytes ?? 0; this.evict(id);
    }
  }

  streamingResources() {
    const caches = { evidence: this.evidence.resources(), roadPaint: this.roadFinish.resources(), terrain: this.terrainFinish.resources(),
      parking: this.parkingFinish.resources(), environment: this.additionalEnvironment.resources(), roadside: this.roadside.resources(),
      shoreline: this.environmentGround.resources(), facilities: this.facilities.resources(), roadMaterials: this.roadMaterials.resources(), streetCorners: this.streetCorners.resources(), streetCornerGround: this.streetCornerGround.resources(), roadCurve: this.roadCurve.resources(), roadDash: this.roadDash.resources(), propertyTerrain: this.propertyTerrain.resources(), foundationWalls: this.foundationWalls.resources(), boundaryContext: this.boundaryContext.resources(), retrySources: this.sourceRetryCache.resources(), sourceImages: this.sourceImages.resources() };
    const geometryBudgetBytes = (this.mobile ? 192 : 384) * 1024 * 1024;
    const retainedTileGeometryBytes = [...this.loaded.values()].reduce((sum, tile) => sum + (tile.geometryBytes ?? 0), 0);
    return { ...this.timings, groundTextures: this.surfaces?.detailResources(), maxStageMs: { ...this.stageTimings }, detailRequests: { active: this.detailRequests.active, queued: this.detailRequests.queued, peakActive: this.detailRequests.peakActive, cancelled: this.detailRequests.cancelled }, caches, estimatedCacheBytes: Object.values(caches).reduce((sum, cache) => sum + cache.estimatedBytes, 0),
      geometryBudgetBytes, retainedTileGeometryBytes, geometryBudgetExceeded: retainedTileGeometryBytes > geometryBudgetBytes,
      incompleteTiles: [...this.loaded.entries()].filter(([,tile]) => tile.group.userData.optionalDetailMissing?.length).map(([id,tile]) => ({ id, missing: tile.group.userData.optionalDetailMissing as string[], attempts: tile.detailAttempts ?? 0 })),
    };
  }

  private readinessTiles(position: V3): TownTile[] {
    const owner = this.manifest.tiles.find((tile) => this.ownsCell(tile, position));
    if (owner?.lods.length) return [owner];
    return this.manifest.tiles.filter((tile) => tile.lods.length && boundsDistanceSquared(tile.bounds, position) < 1);
  }

  isReadyAt(position: V3): boolean {
    return this.readinessTiles(position).every((tile) => this.loaded.has(tile.id));
  }

  async prepareAt(position: V3, timeoutMs = 25000): Promise<void> {
    if (this.preparingAt) throw new Error('Another street is already loading.');
    const target: V3 = [...position];
    this.preparingAt = target;
    const start = performance.now();
    try {
      do {
        if (this.disposed) throw new DOMException('Loading cancelled', 'AbortError');
        this.update(target, target, true);
        if (this.isReadyAt(target)) return;
        await new Promise((resolve) => setTimeout(resolve, 80));
      } while (performance.now() - start < timeoutMs);
      throw new Error('This street is taking longer to load. Check your connection and try again.');
    } finally {
      this.preparingAt = null;
    }
  }

  private async loadTile(tile: TownTile, level: number): Promise<void> {
    const abort = new AbortController();
    this.inflight.set(tile.id, abort);
    const lod = tile.lods.find((item) => item.level === level)!;
    let group: THREE.Group | undefined;
    let treeRows: number[][] | undefined;
    try {
      group = lod ? await this.loadGlb(lod.url, abort.signal, tile, level) : new THREE.Group();
      group.position.fromArray(tile.origin);
      group.updateMatrixWorld(true);
      await this.initialization;
      if (this.disposed || abort.signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
      await this.surfaces?.apply(group, tile.id, abort.signal);
      const cover = this.manifest.surfaces?.masks[tile.id];
      if (cover && pavedMaskReference(tile.id, cover) && !group.userData.pavedSurfaceMask) {
        group.userData.optionalDetailMissing = [...(group.userData.optionalDetailMissing ?? []), 'coverMask'];
      }
      if (tile.treeFile && this.prototypes.length) {
        const rows = await this.fetchJson<number[][] | { rows: number[][] }>(tile.treeFile.url, abort.signal);
        treeRows = Array.isArray(rows) ? rows : rows.rows;
      }
      if (this.disposed || abort.signal.aborted || !this.wanted.has(tile.id)) {
        this.releaseGroup(group);
        return;
      }
      const previous = this.loaded.get(tile.id);
      const previousMissing: string[] = previous?.group.userData.optionalDetailMissing ?? [];
      const missing: string[] = group.userData.optionalDetailMissing ?? [];
      const attempts = previous?.detailAttempts ?? 0;
      if (previous?.level === level && previousMissing.length) {
        // A retry is atomic. Never discard already visible corrections because
        // a different optional sibling was slower on this request.
        if (missing.some(name => !previousMissing.includes(name)) || missing.length >= previousMissing.length) {
          previous.detailAttempts = attempts + 1;
          previous.detailRetryAt = performance.now() + Math.min(120000, 10000 * 2 ** Math.min(attempts, 4));
          this.releaseGroup(group); group = undefined; return;
        }
        this.timings.detailRecovered++;
      }
      this.evict(tile.id);
      this.root.add(group);
      // The final update allocates tree instances once, after global shadow selection.
      const treeExcluded = treeRows ? excludedTreeAnchors(treeRows, tile.origin, group.userData.environmentTreeExclusions ?? []) : new Set<number>();
      group.userData.environmentTreeExclusionsReport = { sourceAnchors: treeRows?.length ?? 0, excluded: treeExcluded.size };
      this.loaded.set(tile.id, { group, treeRows, treeExcluded, level, lastUsed: performance.now(),
        detailAttempts: missing.length ? attempts + 1 : 0,
        detailRetryAt: missing.length ? performance.now() + Math.min(120000, 10000 * 2 ** Math.min(attempts, 4)) : undefined,
        occluders: this.collectOccluders(group), geometryBytes: this.geometryBytes(group),
      });
      this.trimHiddenGeometry();
      this.failures.delete(tile.id);
    } catch (error) {
      if (group) this.releaseGroup(group);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.failures.set(tile.id, performance.now());
        this.metrics.errors++;
        console.warn('Webster section will retry:', tile.id, error);
      }
    } finally {
      this.inflight.delete(tile.id);
      this.metrics.pending = this.inflight.size;
      this.metrics.loaded = this.loaded.size;
      this.onChange();
      if (!this.disposed) this.update(this.position, this.position);
    }
  }

  private planTrees(tiles: TownTile[]): Map<string, TreePlan> {
    const plans = new Map<string, TreePlan>();
    const candidates: { id: string; index: number; score: number }[] = [];
    const nearRadius = this.low ? 120 : 200;
    for (const tile of tiles) {
      const cached = this.loaded.get(tile.id);
      if (!cached?.treeRows) continue;
      const plan: TreePlan = { near: new Set(), shadows: new Set(), excluded: cached.treeExcluded ?? new Set(), key: '' };
      cached.treeRows.forEach((row, index) => {
        if (plan.excluded.has(index)) return;
        const distance = Math.hypot(row[0] + tile.origin[0] - this.position[0], row[2] + tile.origin[2] - this.position[2]);
        // Per-anchor LOD, with a 20m exit band to avoid rebuilding at the boundary.
        const wasNear = cached.treePlan?.near.has(index);
        if (distance < nearRadius + (wasNear ? 20 : 0)) plan.near.add(index);
        const wasShadow = cached.treePlan?.shadows.has(index);
        // Enter/leave with a 10m band; the global cap is across all visible tiles.
        if (this.treeShadows && distance < TREE_SHADOW_ENTER_M + (wasShadow ? 10 : 0)) {
          candidates.push({ id: tile.id, index, score: distance - (wasShadow ? 8 : 0) });
        }
      });
      plans.set(tile.id, plan);
    }
    candidates.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id) || a.index - b.index);
    for (const candidate of candidates.slice(0, TREE_SHADOW_CAP)) plans.get(candidate.id)!.shadows.add(candidate.index);
    for (const plan of plans.values()) {
      plan.key = `${Number(!this.low)}:${Number(this.treeShadows)}:${[...plan.near].join(',')}|${[...plan.shadows].sort((a, b) => a - b).join(',')}|${[...plan.excluded].join(',')}`;
    }
    return plans;
  }

  private buildTrees(rows: number[][], origin: V3, plan: TreePlan): THREE.Group {
    const group = new THREE.Group();
    group.position.fromArray(origin);
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const treeTint = new THREE.Color();
    const definitions = this.manifest.trees.prototypes;
    const near = definitions.findIndex((definition) => definition.role === 'crown' && definition.level === 0);
    const far = definitions.findIndex((definition) => definition.role === 'crown' && definition.level === 1);
    const trunk = definitions.findIndex((definition) => definition.role === 'trunk');
    const bands = [{ index: near < 0 ? 0 : near, kind: 'near' }, { index: far < 0 ? Math.max(0, near) : far, kind: 'far' }, { index: trunk, kind: 'trunk' }];
    for (const band of bands) {
      const base = this.prototypes[band.index];
      if (!base) continue;
      const isTrunk = band.kind === 'trunk';
      const forms = rows.map(row => treeForm(row, origin, band.kind === 'far'));
      const splitBroadleaf = band.kind === 'near' && this.openBroadleafPrototypes.has(band.index);
      const cohorts = isTrunk ? ['trunk'] as const : splitBroadleaf ? ['broadleaf', 'open', 'conifer'] as const : ['broadleaf', 'conifer'] as const;
      for (const castShadow of [false, true]) {
        for (const family of cohorts) {
          const distant = band.kind === 'far' ? this.distantCanopyPrototypes.get(band.index) : undefined;
          const prototype = isTrunk ? this.trunkContactPrototypes.get(band.index) ?? base : family === 'conifer' ? distant?.conifer ?? this.coniferPrototypes.get(band.index) ?? base : family === 'open' ? this.openBroadleafPrototypes.get(band.index) ?? base : distant?.broadleaf ?? this.broadleafPrototypes.get(band.index) ?? base;
          prototype.updateMatrixWorld(true);
          const indices = rows.map((_, index) => index).filter((index) =>
            !plan.excluded.has(index) && (isTrunk || (plan.near.has(index) === (band.kind === 'near') && forms[index].renderFamily === (family === 'open' ? 'broadleaf' : family) && (!splitBroadleaf || forms[index].renderFamily !== 'broadleaf' || (forms[index].crownVariant === 'open') === (family === 'open')))) && plan.shadows.has(index) === castShadow);
          if (!indices.length) continue;
          prototype.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            // Geometry/materials are shared with the prototypes; only instance matrices are allocated.
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
              if (material.alphaTest > 0) material.alphaToCoverage = true;
            }
            const mesh = new THREE.InstancedMesh(object.geometry, object.material, indices.length);
            mesh.name = `Webster trees | ${band.kind} | ${family} | ${castShadow ? 'shadow' : 'ordinary'}`;
            mesh.userData.treeKind = band.kind;
            mesh.userData.treeFamily = family === 'open' ? 'broadleaf' : family;
            mesh.userData.treeVariant = family === 'open' ? 'open' : 'standard';
            mesh.userData.sourceRows = indices;
            mesh.castShadow = castShadow;
            mesh.receiveShadow = !this.low && this.treeShadows;
            indices.forEach((rowIndex, index) => {
              const row = rows[rowIndex];
              const form = forms[rowIndex];
              point.fromArray(isTrunk ? form.trunk.position : form.crown.position);
              scale.fromArray(isTrunk ? form.trunk.scale : form.crown.scale);
              quaternion.setFromAxisAngle(up, isTrunk ? 0 : form.yaw);
              matrix.compose(point, quaternion, scale).multiply(object.matrixWorld);
              mesh.setMatrixAt(index, matrix);
              if (!isTrunk) mesh.setColorAt(index, treeArtColor(row[0] + origin[0], row[2] + origin[2], treeTint));
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
            group.add(mesh);
          });
        }
      }
    }
    return group;
  }

  private trackTextures(group: THREE.Object3D): Set<THREE.Texture> {
    const textures = new Set<THREE.Texture>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        for (const slot of TEXTURE_SLOTS) { const texture = (material as THREE.MeshStandardMaterial)[slot]; if (texture) textures.add(texture); }
    });
    textures.forEach(texture => this.textureLifetime.register(texture)); return textures;
  }

  private acquireMaterials(group: THREE.Object3D): void {
    const keys = new Set<string>();
    this.trackTextures(group);
    const local = new Map<THREE.Material, THREE.Material>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const replace = (input: THREE.Material): THREE.Material => {
        if (local.has(input)) return local.get(input)!;
        const standard = input as THREE.MeshStandardMaterial;
        const textureKeys = TEXTURE_SLOTS.map((slot) => {
          const texture = standard[slot];
          if (!texture) return '';
          return textureIdentity(texture);
        });
        const key = materialIdentity(input, textureKeys);
        let entry = this.materialPool.get(key);
        if (!entry) {
          const textures: string[] = [];
          TEXTURE_SLOTS.forEach((slot, index) => {
            const texture = standard[slot];
            if (!texture) return;
            const textureKey = textureKeys[index];
            const shared = this.texturePool.get(textureKey);
            if (shared) {
              if (shared.texture !== texture) this.textureLifetime.release(texture);
              standard[slot] = shared.texture;
              shared.refs++;
            } else {
              texture.anisotropy = 4;
              this.texturePool.set(textureKey, { texture, refs: 1 });
            }
            textures.push(textureKey);
          });
          if (standard.isMeshStandardMaterial) {
            if (!standard.userData.townCrafted) standard.envMapIntensity = 0.12;
            applyArtMaterial(standard, this.artClock);
          }
          entry = { material: input, refs: 0, textures };
          this.materialPool.set(key, entry);
        } else if (entry.material !== input) {
          TEXTURE_SLOTS.forEach((slot) => {
            const texture = standard[slot];
            if (texture && ![...this.texturePool.values()].some((value) => value.texture === texture)) this.textureLifetime.release(texture);
          });
          input.dispose();
        }
        if (!keys.has(key)) entry.refs++;
        keys.add(key);
        local.set(input, entry.material);
        return entry.material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
    });
    this.leases.set(group, keys);
  }

  releaseGroup(group: THREE.Object3D): void {
    if (this.releasedGroups.has(group)) return;
    this.releasedGroups.add(group);
    group.removeFromParent();
    this.surfaces?.release(group);
    const geometries = new Set<THREE.BufferGeometry>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    for (const key of this.leases.get(group) ?? []) {
      const entry = this.materialPool.get(key);
      if (entry && --entry.refs <= 0) {
        entry.material.dispose();
        this.materialPool.delete(key);
        for (const textureKey of entry.textures) {
          const texture = this.texturePool.get(textureKey);
          if (texture && --texture.refs <= 0) { this.textureLifetime.release(texture.texture); this.texturePool.delete(textureKey); }
        }
      }
    }
    this.leases.delete(group);
  }

  private releaseTrees(group: THREE.Group): void {
    group.removeFromParent();
    group.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    group.clear();
  }

  private disposeRaw(group: THREE.Object3D): void {
    if (this.releasedGroups.has(group)) return;
    this.releasedGroups.add(group);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      if (object instanceof THREE.InstancedMesh) object.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const slot of TEXTURE_SLOTS) { const texture = (material as THREE.MeshStandardMaterial)[slot]; if (texture) textures.add(texture); }
      }
    });
    textures.forEach(texture => this.textureLifetime.register(texture));
    textures.forEach(texture => this.textureLifetime.release(texture));
    materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
  }

  private evict(id: string): void {
    const entry = this.loaded.get(id);
    if (!entry) return;
    this.releaseGroup(entry.group);
    if (entry.trees) this.releaseTrees(entry.trees);
    this.loaded.delete(id);
  }

  residentResources(): { materialCount: number; textureCount: number; estimatedTextureBytes: number; estimatedGeometryBytes: number } {
    const buffers = new Set<ArrayBufferLike>();
    const inspect = (object: THREE.Object3D): void => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const attribute of Object.values(object.geometry.attributes) as (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[]) {
        const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
        buffers.add(array.buffer);
      }
      if (object.geometry.index) buffers.add(object.geometry.index.array.buffer);
      if (object instanceof THREE.InstancedMesh) {
        buffers.add(object.instanceMatrix.array.buffer);
        if (object.instanceColor) buffers.add(object.instanceColor.array.buffer);
      }
    };
    this.root.traverse(inspect);
    for (const prototype of this.prototypes) prototype.traverse(inspect);
    for (const prototype of this.coniferPrototypes.values()) prototype.traverse(inspect);
    for (const prototype of this.broadleafPrototypes.values()) prototype.traverse(inspect);
    for (const prototype of this.openBroadleafPrototypes.values()) prototype.traverse(inspect);
    for (const pair of this.distantCanopyPrototypes.values()) { pair.broadleaf.traverse(inspect); pair.conifer.traverse(inspect); }
    for (const prototype of this.trunkContactPrototypes.values()) prototype.traverse(inspect);
    let estimatedTextureBytes = 0;
    for (const { texture } of this.texturePool.values()) {
      const image = texture.image;
      if (image?.width && image?.height) estimatedTextureBytes += image.width * image.height * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
    }
    const surfaces = this.surfaces?.resources() ?? { materials: 0, textures: 0, bytes: 0 };
    return { materialCount: this.materialPool.size + surfaces.materials, textureCount: this.texturePool.size + surfaces.textures, estimatedTextureBytes: Math.round(estimatedTextureBytes + surfaces.bytes), estimatedGeometryBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) };
  }

  dispose(): void {
    this.sourceImages.dispose();
    this.boundaryContext.dispose();
    this.sourceRetryCache.clear();
    this.evidence.dispose();
    this.roadFinish.dispose();this.terrainFinish.dispose();this.parkingFinish.dispose();this.additionalEnvironment.dispose();this.roadside.dispose();this.environmentGround.dispose();this.facilities.dispose();this.roadMaterials.dispose();this.streetCorners.dispose();this.streetCornerGround.dispose();this.roadCurve.dispose();this.roadDash.dispose();this.propertyTerrain.dispose();this.foundationWalls.dispose();
    if (this.disposed) return;
    this.disposed = true;
    this.sharedAbort.abort();
    for (const controller of this.inflight.values()) controller.abort();
    for (const id of [...this.loaded.keys()]) this.evict(id);
    for (const object of [...this.root.children]) this.releaseGroup(object);
    for (const prototype of this.coniferPrototypes.values()) disposeConiferPrototype(prototype);
    this.coniferPrototypes.clear();
    for (const prototype of this.broadleafPrototypes.values()) disposeBroadleafPrototype(prototype);
    this.broadleafPrototypes.clear();
    for (const prototype of this.openBroadleafPrototypes.values()) disposeOpenBroadleafPrototype(prototype);
    this.openBroadleafPrototypes.clear();
    for (const pair of this.distantCanopyPrototypes.values()) { disposeDistantCanopyPrototype(pair.broadleaf); disposeDistantCanopyPrototype(pair.conifer); }
    this.distantCanopyPrototypes.clear();
    for (const prototype of this.trunkContactPrototypes.values()) disposeTrunkContactPrototype(prototype);
    this.trunkContactPrototypes.clear();
    for (const prototype of this.prototypes) this.releaseGroup(prototype);
    this.prototypes = [];
    for (const material of this.backdropMaterials) material.dispose();
    this.backdropMaterials = [];
    this.wanted.clear(); this.failures.clear();
    this.surfaces?.dispose();
    this.root.removeFromParent();
  }
}
