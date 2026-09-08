import data from '../../../data/derived/town/map-boundaries.json';
import type {RoadEdge} from './engine';

export const MAP_BOUNDARY_MESSAGE = 'Mapped town boundary. The drive stops here; turn around or choose another starting place.';
export const MAP_BOUNDARY_SETBACK = data.setbackM;
/** Exact endpoint/physical identity gates prevent applying town-specific limits
 * to synthetic tests, other maps, or a changed source road. */
export function isMappedBoundaryEdge(edge:RoadEdge):boolean {
 const row=data.rows.find(r=>r.edgeId===edge.id),point=edge.points.at(-1);
 return !!row&&edge.physical_id===row.physicalId&&!!point&&row.endpoint.every((n,i)=>Math.abs(n-(point[i]??0))<1e-6);
}
