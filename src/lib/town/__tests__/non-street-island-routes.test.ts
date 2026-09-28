// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {removeNonStreetIslandRoutes,NON_STREET_ISLAND_ROUTES as catalog} from '../non-street-island-routes';
import {RoadGraph,type NetworkData} from '../engine';
const source=JSON.parse(gunzipSync(readFileSync('data/derived/town/engine-network.json.gz')).toString()) as NetworkData;
it('removes exactly twelve isolated phantom directions without closing genuine island roads',()=>{
 const before=JSON.stringify(source),result=removeNonStreetIslandRoutes(source),removed=catalog.routes.flatMap(r=>r.edges.map(e=>e.id));
 expect(removed).toHaveLength(12);expect(removed).toContain(1745);expect(removed).toContain(1746);expect(source.edges.filter(e=>!result.edges.includes(e)).map(e=>e.id).sort((a,b)=>a-b)).toEqual(removed.sort((a,b)=>a-b));expect(JSON.stringify(source)).toBe(before);
 expect(result.edges.filter(e=>/TREASURE ISLAND ROAD|KILLDEER ISLAND ROAD|CHECKERBERRY ISLAND/.test(e.name??''))).toEqual(source.edges.filter(e=>/TREASURE ISLAND ROAD|KILLDEER ISLAND ROAD|CHECKERBERRY ISLAND/.test(e.name??'')));
 const graph=new RoadGraph(result),nodes=new Set((result.nodes as {id:number}[]).map(n=>n.id));for(const e of graph.edges.values()){expect(nodes.has(e.from)).toBe(true);expect(nodes.has(e.to)).toBe(true);}expect(removeNonStreetIslandRoutes(result)).toBe(result);
});
it('retains an island component if its source position changes or a true road connects',()=>{
 const record=catalog.routes[0].edges[0],changed={...source,edges:source.edges.map(e=>e.id===record.id?{...e,points:e.points.map((p,i)=>i===0?[p[0]+1,...p.slice(1)]:p)}:e)};
 expect(removeNonStreetIslandRoutes(changed).edges.some(e=>e.id===record.id)).toBe(true);
 const connected={...source,edges:[...source.edges,{id:99999,physical_id:99999,from:record.from,to:source.edges[0].from,points:[[0,0,0],[1,1,1]]}]};expect(removeNonStreetIslandRoutes(connected).edges.some(e=>e.id===record.id)).toBe(true);
});

it('keeps the Long Island directions if an authentic connected road is added',()=>{
 const extra={id:99999,physical_id:99999,from:910,to:source.edges[0].from,points:[[0,0,0],[1,1,1]]};
 const result=removeNonStreetIslandRoutes({...source,edges:[...source.edges,extra]});
 expect(result.edges.some(e=>e.id===1745)).toBe(true);expect(result.edges.some(e=>e.id===1746)).toBe(true);
});
