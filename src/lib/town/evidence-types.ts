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
  /** The entry is the photographed front door of a house the map gave none: it takes its own steps. */
  entryFromPhoto?: boolean;
  /** Built as a split foyer (as a raised ranch) because its photograph shows one. */
  splitFoyer?: boolean;
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
  /** Street-facing garage doors in the house, as photographed: count, side as
   * seen from the street, colour. */
  garage?: { doors: number; side: 'left' | 'right' | 'center'; color?: string };
  /** The measured body's walls that stand back from the plan's (over porch and
   * wing roofs, between roof sections, dormer faces). */
  setbacks?: SetbackWall[];
  /** The street front's openings where its photograph shows them. */
  layout?: PhotoLayout;
  /** An open porch cut from the measured body: its front line (the plan
   * frame's inset wall, from u0 to u1), its strips (each the frame of the house
   * wall behind it and the porch's depth there) and its ceiling. */
  openPorch?: { front: Omit<Frame, 'structId' | 'tileId'> & { u0: number; u1: number }; strips: { u0: number; u1: number; depth: number; frameIndex?: number }[]; ceiling: number;
    /** Stacked porches: their levels, and the floor of the open part over an enclosed ground level. */
    levels?: number; from?: number };
  /** The measured roof, for what stands on it: origin, base, centimetre
   * vertices and roof triangles as in the packet, and its colour. */
  roofSurface?: { o: readonly [number, number] | readonly number[]; b: number; v: string; r: string; color?: string };
};

/** A street front's openings placed from its photograph, on the frames that
 * face the street: entrance doors, windows by storey (0 the ground floor, -1 a
 * raised ranch's lower level, the top one the attic or gable), garage doors,
 * the porch's extent, dormers, and how the roof meets the street. */
export type PhotoLayout = {
  frames: number[];
  doors: { frameIndex: number; u: number }[];
  windows: { frameIndex: number; u: number; width: number; level: number }[];
  garage: { frameIndex: number; u: number }[];
  porch?: { frameIndex: number; u0: number; u1: number };
  dormers: { frameIndex: number; u: number; kind: 'g' | 's' | 'h' | 'e'; width: number }[];
  roof?: string;
  /** The storeys that show (1.5 for a Cape's rooms in the roof). */
  storeys?: number;
  /** Its smaller features: covers over entrance doors (hood, portico, awning),
   * window awnings by storey, bay windows (the storeys they rise; 0 an oriel),
   * unroofed decks and balconies by storey, solar panels' stretch of the front
   * roof, an exterior stair's end of the front (as seen), and the porch's
   * roof, posts and railing with the railing's and awnings' colours. */
  covers?: { frameIndex: number; u: number; kind: 'h' | 'p' | 'a' }[];
  awnings?: { frameIndex: number; u: number; level: number }[];
  bays?: { frameIndex: number; u0: number; u1: number; levels: number }[];
  decks?: { frameIndex: number; u0: number; u1: number; level: number }[];
  solar?: { frameIndex: number; u0: number; u1: number };
  stair?: { frameIndex: number; at: 'start' | 'end' };
  trim?: { roof?: 'shed' | 'hip' | 'gable' | 'flat' | 'main'; posts?: 'square' | 'round' | 'turned' | 'metal'; rail?: 'b' | 's' | 'l' | 'm' | 'n'; railColor?: 'white' | 'house' | 'dark' | 'wood'; awning?: string; striped?: boolean };
};

/** A wall of a measured body standing back from every wall of the plan, as a
 * frame (east/north start at its left end seen from outside, tangent,
 * outward, width) with its outline as triangles, [u, height] per corner. */
export type SetbackWall = Omit<Frame, 'structId' | 'tileId'> & { width: number; outline: number[] };

export type EvidenceReport = {
  version: number;
  tileId: string;
  buildingIds: string[];
  /** Garages, sheds and other buildings rebuilt from their measurement or given doors and paint. */
  otherIds?: string[];
  documentedIds: string[];
  removedTriangles: number;
  recoloredTriangles: number;
  addedTriangles: number;
  addedMeshes: number;
  geometryBytes: number;
};
