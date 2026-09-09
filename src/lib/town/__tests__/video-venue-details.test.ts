// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batch, type Frame } from '../crafted-frontages';
import { buildVideoVenueFacade, VIDEO_VENUE_DETAILS } from '../video-venue-details';
import { applyCommercialCompletion } from '../commercial-completion';
const row=VIDEO_VENUE_DETAILS.venues[0],f:Frame={...row.frame,tileId:row.tileId,structId:row.facadeId};
const input={nativeId:row.id,facadeId:row.facadeId,frame:f,width:row.frame.width,floor:row.frame.floor,top:row.frame.top};
const origin=new THREE.Vector3(...row.origin);
function dispose(group:THREE.Object3D){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
function local(point:THREE.Vector3):THREE.Vector3 {const x=point.x+origin.x-f.start[0],n=-point.z-origin.z-f.start[1];return new THREE.Vector3(x*f.tangent[0]+n*f.tangent[1],point.y+origin.y,x*f.outward[0]+n*f.outward[1]);}

describe('Video-observed Eastern Pearl facade',()=>{
  it.each([0,1,2])('builds bounded, outward-facing geometry at LOD %i',level=>{
    const b=new Batch(origin,level);expect(buildVideoVenueFacade(b,input)).toBe(true);const result=b.finish();
    try{
      expect(result.triangles).toBeGreaterThan(200);expect(result.triangles).toBeLessThan(2000);expect(result.group.children.length).toBeLessThan(12);
      let projectedGlass=0,upwardRoof=0,pedimentFaces=0;
      result.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),n=o.geometry.getAttribute('normal'),role=(o.material as THREE.Material).userData.surfaceRole;
        for(let i=0;i<p.count;i+=3){
          const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,i+k)),cross=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
          expect(cross.length()).toBeGreaterThan(.0000001);cross.normalize();expect(cross.dot(new THREE.Vector3().fromBufferAttribute(n,i))).toBeGreaterThan(.99);
          for(const point of points){const a=local(point);expect(a.x).toBeGreaterThan(-.051);expect(a.x).toBeLessThan(row.frame.width+.051);expect(a.y).toBeGreaterThanOrEqual(row.frame.floor-.00001);expect(a.y).toBeLessThan(row.frame.top+.02);expect(a.z).toBeGreaterThan(.209);expect(a.z).toBeLessThan(.99);}
          const center=local(points.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/3));
          if(role==='glass'&&center.z>.7)projectedGlass++;
          if(role==='metal'&&center.y<row.frame.floor+3&&cross.y>.1)upwardRoof++;
          if(role==='trim'&&Math.abs(center.z-.57)<.001&&center.y>row.frame.floor+3.2&&center.y<row.frame.floor+3.82){
            expect(cross.dot(new THREE.Vector3(f.outward[0],0,-f.outward[1]))).toBeGreaterThan(.99);pedimentFaces++;
          }
        }
      });
      expect(projectedGlass).toBeGreaterThan(0);expect(upwardRoof).toBeGreaterThan(0);expect(pedimentFaces).toBeGreaterThanOrEqual(4);
    }finally{dispose(result.group);}
  });

  it('rejects nearby buildings, wrong facades and drifted native registration without appending geometry',()=>{
    for(const change of [{nativeId:'neighbor'},{facadeId:'other'},{width:input.width+.01},{floor:input.floor+.01},{frame:{...f,start:[f.start[0]+.01,f.start[1]]}}]){
      const b=new Batch(origin,0);expect(buildVideoVenueFacade(b,{...input,...change})).toBe(false);expect(b.finish().triangles).toBe(0);
    }
  });

  it('keeps the native source guard before the specialized commercial facade',()=>{
    const scene=new THREE.Group(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));const m=new THREE.MeshStandardMaterial();m.name='V2 inferred | siding';scene.add(new THREE.Mesh(g,m));
    const report=applyCommercialCompletion(scene,row.tileId,row.origin,0,'a'.repeat(64));expect(report?.status).toBe('source-mismatch');expect(scene.children).toHaveLength(1);dispose(scene);
  });

  it('records video observations and unresolved ground placement separately from fitted dimensions',()=>{
    expect(row.source.url).toBe('https://www.youtube.com/watch?v=feZq1WgvtoA');expect(row.source.observedAtSeconds).toBe(75.1548);
    expect(row.address).toBe('290 Main Street');expect(row.inferred).toContain('Widths');expect(row.deferred.some(s=>s.includes('Terrace'))).toBe(true);
    expect(VIDEO_VENUE_DETAILS.unplacedVideoSites[0].status).toBe('placement-review');
  });
});
