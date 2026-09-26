import type { Frame } from './crafted-frontages';

export type BuildingFrame = Omit<Frame, 'structId' | 'tileId'> & {
  width: number;
  front: boolean;
  eave?: number;
  groundMaximum?: number;
  groundAt?: number[];
  clearanceM?: number;
  /** Measured wall top along the frame, a polyline of [u, height]: level
   * under an eave, rising and falling under a gable, stepping at a wing. */
  profile?: readonly (readonly [number, number])[];
};

export type EvidenceRoof = {
  id: string; tileId: string; outline: number[][]; base: number;
  origin: number[];
  floor: number; eave: number; peak: number; stories: number;
  body: { role: string; position: string; normal: string; vertices: number }[];
  sourceMaximum: number;
  frameEaves?: number[];
  frameOutsets?: number[];
  dormers?: {
    frame: Omit<Frame, 'structId' | 'tileId'> & { width: number };
    bottom: number; eave: number; peak: number;
    window: { u: number; bottom: number; width: number; height: number };
  }[];
};

/** Local east/north metres and absolute source-local height. Evidence dates
 * describe the source; no record is presented as a 2026 photograph survey. */
export type EvidenceBuilding = {
  id: string;
  tileId: string;
  address: string;
  outline: number[][];
  frames: BuildingFrame[];
  base: number;
  floor: number;
  eave: number;
  peak: number;
  stories: number;
  style: string;
  year: number;
  material: 'siding' | 'brick' | 'stone' | 'stucco' | 'shingle';
  paint: string;
  roof: 'gable' | 'hip' | 'gambrel' | 'mansard' | 'flat' | 'retained';
  porch: 'none' | 'entry' | 'open' | 'enclosed' | 'wraparound' | 'stacked';
  documented: boolean;
  evidenceIds: string[];
  colorsDated: boolean;
  porchPlacement?: 'front' | 'rear' | 'side' | 'unspecified' | 'none';
  floorHeight?: number;
  entry?: {frameIndex:number;u:number;floor:number} | null;
  frontageBays?: number | null;
  eaveDetail?: 'dentils' | 'brick-dentils' | 'brackets' | null;
  historicalEvidenceIds?: string[];
  historicalWindowGroup?: {count:3;sash:'12-over-1'};
  materialBasis?: string;
  paintBasis?: string;
  /** Body measured from LiDAR: gutters follow its roofprint eaves. */
  measured?: boolean;
  /** Read from the assessor's street photograph: trim and door colours and
   * whether the front windows carry shutters, and in what colour. */
  trim?: string;
  door?: string;
  shutters?: boolean;
  shutterColor?: string;
  /** A photographed stacked porch: where it sits on the front as seen from
   * the street, and whether its ground and upper levels are open or enclosed. */
  porchSide?: 'left' | 'right' | 'center' | 'full';
  porchGround?: 'open' | 'enclosed';
  porchUpper?: 'open' | 'enclosed';
  porchLevels?: number;
  /** The photographed enclosed porch is the entry bay of the mapped plan. */
  porchInPlan?: boolean;
};

export type EvidenceReport = {
  version: number;
  tileId: string;
  buildingIds: string[];
  documentedIds: string[];
  removedTriangles: number;
  recoloredTriangles: number;
  addedTriangles: number;
  addedMeshes: number;
  geometryBytes: number;
};
