type Point = readonly [number, number];
type Polygon = Point[];
const cross = (a: Point, b: Point, c: Point) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area = (p: Polygon) => Math.abs(p.reduce((sum,a,i) => {const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;

function hull(points: Polygon): Polygon {
  const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const half=(ps: Polygon)=>{const out:Polygon=[];for(const p of ps){while(out.length>1&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}return out;};
  return [...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)];
}

function clip(p: Polygon,a: Point,b: Point,inside: boolean): Polygon {
  const out:Polygon=[];
  for(let i=0;i<p.length;i++){
    const v=p[i],w=p[(i+1)%p.length],dv=cross(a,b,v),dw=cross(a,b,w),iv=inside?dv>=0:dv<=0,iw=inside?dw>=0:dw<=0;
    if(iv)out.push(v);
    if(iv!==iw){const t=dv/(dv-dw);out.push([v[0]+t*(w[0]-v[0]),v[1]+t*(w[1]-v[1])]);}
  }
  return out;
}

/** Rectangle coverage by a measured wall's triangle union. The source rounds
 * vertices to centimetres: a 1 cm square buffer closes rounding seams, while
 * bounding every admitted point to at most sqrt(2) cm from the measured face.
 * Subtracting convex polygons checks the complete area, including thin holes
 * that corner/centre sampling cannot see. */
export function wallCoverage(outline: readonly number[], tolerance=.01): (u0:number,u1:number,z0:number,z1:number)=>boolean {
  const polygons:{points:Polygon;left:number;right:number;low:number;high:number}[]=[];
  const pad=Math.max(0,Number.isFinite(tolerance)?tolerance:0);
  for(let i=0;i+5<outline.length;i+=6){
    const tri:Polygon=[[outline[i],outline[i+1]],[outline[i+2],outline[i+3]],[outline[i+4],outline[i+5]]];
    if(tri.some(p=>!p.every(Number.isFinite))||Math.abs(cross(...tri as [Point,Point,Point]))<1e-9)continue;
    const points=hull(tri.flatMap(([x,y])=>[[-pad,-pad],[-pad,pad],[pad,-pad],[pad,pad]].map(([dx,dy])=>[x+dx,y+dy] as Point)));
    polygons.push({points,left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),low:Math.min(...points.map(p=>p[1])),high:Math.max(...points.map(p=>p[1]))});
  }
  return (u0,u1,z0,z1)=>{
    if(![u0,u1,z0,z1].every(Number.isFinite)||u1<=u0||z1<=z0)return false;
    let uncovered:Polygon[]=[[[u0,z0],[u1,z0],[u1,z1],[u0,z1]]];
    for(const polygon of polygons){
      if(polygon.right<u0||polygon.left>u1||polygon.high<z0||polygon.low>z1)continue;
      const next:Polygon[]=[];
      for(const piece of uncovered){
        let remaining=piece;
        for(let i=0;i<polygon.points.length&&remaining.length>=3;i++){
          const a=polygon.points[i],b=polygon.points[(i+1)%polygon.points.length],outside=clip(remaining,a,b,false);
          if(outside.length>=3&&area(outside)>1e-8)next.push(outside);
          remaining=clip(remaining,a,b,true);
        }
      }
      uncovered=next;
      if(!uncovered.length)return true;
      // Pathological overlapping source meshes fail conservatively, keeping
      // the per-opening work bounded rather than accepting unchecked gaps.
      if(uncovered.length>256)return false;
    }
    return false;
  };
}
