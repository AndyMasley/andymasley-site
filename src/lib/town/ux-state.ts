import type { Quality } from './contracts';
import { DriveEngine, type RoadGraph } from './engine';

export type CameraMode = 'hood' | 'chase' | 'wide';
export type ComfortMode = 'system' | 'steady' | 'standard';
export interface DrivePreferences { camera: CameraMode; comfort: ComfortMode; engineVolume: number }
export const PREFERENCES_KEY = 'webster-drive-preferences-v1';
export const RESUME_KEY = 'webster-drive-resume-v1';
export const defaults: DrivePreferences = { camera: 'chase', comfort: 'system', engineVolume: 0.65 };
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readPreferences(storage?: StorageLike): DrivePreferences {
  try {
    const value = JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? 'null');
    return {
      camera: ['hood', 'chase', 'wide'].includes(value?.camera) ? value.camera : defaults.camera,
      comfort: ['system', 'steady', 'standard'].includes(value?.comfort) ? value.comfort : defaults.comfort,
      engineVolume: typeof value?.engineVolume === 'number' && Number.isFinite(value.engineVolume) ? Math.max(0, Math.min(1, value.engineVolume)) : defaults.engineVolume,
    };
  } catch { return { ...defaults }; }
}

export function writePreferences(value: DrivePreferences, storage?: StorageLike): void {
  try { storage?.setItem(PREFERENCES_KEY, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

export function qualityPixelRatio(quality: Quality, mobile: boolean, dpr: number): number {
  const device = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(device, quality === 'low' ? 1 : mobile ? 1.2 : quality === 'high' ? 1.8 : 1.6);
}

export interface DriveSnapshot { version: 1; network: string; edge: number; s: number; distance: number; elapsed: number; road: string; savedAt: number; position?: [number, number, number] }
export function snapshotDrive(engine: DriveEngine, network: string, now = Date.now()): DriveSnapshot | null {
  // A committed connector or temporary one-way reverse is never serialized as a new graph edge.
  if (engine.phase !== 'ROAD' || engine.edgeId < 0 || (engine.obstacleAhead() ?? Infinity) - engine.s < 0.5) return null;
  return { version: 1, network, edge: engine.edgeId, s: engine.s, distance: engine.distance, elapsed: engine.elapsed, road: engine.edge.name ?? '', savedAt: now, position: engine.pose()[0] };
}

export function readSnapshot(network: string, storage?: StorageLike): DriveSnapshot | null {
  try {
    const value = JSON.parse(storage?.getItem(RESUME_KEY) ?? 'null');
    if (value?.version !== 1 || value.network !== network || !Number.isInteger(value.edge) || value.edge < 0 || typeof value.road !== 'string') return null;
    if (![value.s, value.distance, value.elapsed, value.savedAt].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return null;
    if (value.position !== undefined && (!Array.isArray(value.position) || value.position.length !== 3 || !value.position.every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 100000))) return null;
    return value;
  } catch { return null; }
}

export function restoreSnapshot(graph: RoadGraph, snapshot: DriveSnapshot): DriveEngine | null {
  const path = graph.paths.get(snapshot.edge);
  if (!path || snapshot.s > path.length || snapshot.distance > 1e9 || snapshot.elapsed > 1e9) return null;
  const engine = new DriveEngine(graph, snapshot.edge, snapshot.s);
  if ((engine.obstacleAhead() ?? Infinity) - engine.s < 0.5) return null;
  engine.distance = snapshot.distance; engine.elapsed = snapshot.elapsed;
  engine.paused = true;
  return engine;
}

export function saveSnapshot(snapshot: DriveSnapshot | null, storage?: StorageLike): void {
  if (!snapshot) return;
  try { storage?.setItem(RESUME_KEY, JSON.stringify(snapshot)); } catch { /* Driving works without storage. */ }
}
