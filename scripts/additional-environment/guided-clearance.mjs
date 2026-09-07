/** Conservative sweep of actual rounded/offset road paths and legal connectors.
 * A .99m half-width body and 1.2m half-width mirrors exceed the driven car.
 * Mirror height is checked separately so a low adjoining apron is not a barrier.
 * Body bottom .25m is below the authored car shell's .275m minimum; road/tire
 * contact below that plane is intentionally not classified as a scenery barrier.
 * This checks the renderer's triangle geometry, not inferred object centers.
 */
export function guidedClearance(graph){
 const bins=new Map(),rows=[],cell=12,key=(x,y)=>`${x},${y}`;
 const add=(path,id)=>{for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],row={a,b,id},index=rows.length;rows.push(row);for(let x=Math.floor((Math.min(a[0],b[0])-1.2)/cell);x<=Math.floor((Math.max(a[0],b[0])+1.2)/cell);x++)for(let y=Math.floor((Math.min(a[1],b[1])-1.2)/cell);y<=Math.floor((Math.max(a[1],b[1])+1.2)/cell);y++){const k=key(x,y);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(index);}}};
 for(const[id,path]of graph.paths){add(path,id);for(const choice of graph.choices(id))add(graph.connector(id,choice.edgeId).path,`${id}>${choice.edgeId}`);}
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const pointDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
 const inside=(p,t)=>{const a=cross(t[0],t[1],p),b=cross(t[1],t[2],p),c=cross(t[2],t[0],p),area=Math.abs(cross(...t));return area>1e-9&&(a>=0&&b>=0&&c>=0||a<=0&&b<=0&&c<=0);};
 const distance=(a,b,t)=>{if(inside(a,t)||inside(b,t))return 0;let d=Infinity;for(let i=0;i<3;i++){const p=t[i],q=t[(i+1)%3],aa=cross(a,b,p),ab=cross(a,b,q),ba=cross(p,q,a),bb=cross(p,q,b);if(aa*ab<0&&ba*bb<0)return 0;d=Math.min(d,pointDistance(p,a,b),pointDistance(a,p,q),pointDistance(b,p,q));}return d;};
 return {segments:rows.length,check(triangle){const t=triangle.map(p=>[p[0],-p[2]]),ys=triangle.map(p=>p[1]),minY=Math.min(...ys),maxY=Math.max(...ys),hits=[],seen=new Set();for(let x=Math.floor(Math.min(...t.map(p=>p[0]))/cell);x<=Math.floor(Math.max(...t.map(p=>p[0]))/cell);x++)for(let y=Math.floor(Math.min(...t.map(p=>p[1]))/cell);y<=Math.floor(Math.max(...t.map(p=>p[1]))/cell);y++)for(const index of bins.get(key(x,y))??[]){if(seen.has(index))continue;seen.add(index);const {a,b,id}=rows[index];if(maxY<Math.min(a[2],b[2])+.25||minY>Math.max(a[2],b[2])+2.05)continue;const d=distance(a,b,t);const body=d<.99,mirror=d<1.2&&maxY>=Math.min(a[2],b[2])+1.0&&minY<=Math.max(a[2],b[2])+1.5;if(body||mirror)hits.push({edge:id,horizontalDistanceM:d,roadSegment:[a,b],surfaceHeightRange:[minY,maxY]});}return hits;}};
}
