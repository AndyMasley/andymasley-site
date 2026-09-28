import source from '../../../data/derived/town/non-street-island-routes.json';
import type {NetworkData} from './engine';
export const NON_STREET_ISLAND_ROUTES=source;
const cache=new WeakMap<NetworkData,NetworkData>();
/** Exclude only the six verified, isolated island-name records.
 * A source change or a newly connected road fails closed; no scene geometry changes. */
export function removeNonStreetIslandRoutes(network:NetworkData):NetworkData{
 const prior=cache.get(network);if(prior)return prior;
 const ids=new Set<number>(),nodes=new Set<number>();
 for(const route of source.routes){
  const expected=new Set(route.edges.map(e=>e.id)),ends=new Set(route.edges.flatMap(e=>[e.from,e.to]));
  const matches=route.edges.every(record=>{const edge=network.edges.find(e=>e.id===record.id);return edge&&edge.name===route.name&&edge.physical_id===route.physicalId&&edge.from===record.from&&edge.to===record.to&&edge.source_objectid===record.source_objectid&&edge.route_id===record.route_id&&JSON.stringify(edge.points)===JSON.stringify(record.points);});
  if(!matches||network.edges.some(e=>!expected.has(e.id)&&(ends.has(e.from)||ends.has(e.to))))continue;
  expected.forEach(id=>ids.add(id));ends.forEach(id=>nodes.add(id));
 }
 if(!ids.size)return network;
 const result={...network,edges:network.edges.filter(e=>!ids.has(e.id)),nodes:Array.isArray(network.nodes)?network.nodes.filter(n=>!nodes.has((n as {id:number}).id)):network.nodes,blocked_turns:network.blocked_turns?.filter(t=>!ids.has(t.from_edge)&&!ids.has(t.to_edge)),nonStreetIslandRoutes:{removedEdgeIds:[...ids],basis:source.evidence.basis}};
 cache.set(network,result);cache.set(result,result);return result;
}
