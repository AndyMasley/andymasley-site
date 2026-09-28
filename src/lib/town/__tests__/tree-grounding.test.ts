// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import release from '../../../../data/derived/town/release.json';
import { groundTreeRows, resolveTreeGroundGaps } from '../tree-grounding';
import { tileGround } from '../address-frontage';
import { surveyTreeRows } from '../measured-roofs';
import { treeForm, trunkMatrix, TRUNK_BURY_M } from '../vegetation';

function terrain(name: string, heights: number[]): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,heights[0],0, 0,heights[1],10, 10,heights[2],0],3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.name = name; return mesh;
}

describe('trees seated on final terrain', () => {
  it('translates legacy and surveyed crowns together without changing source identity or shape', () => {
    const origin = [250,70,-500], rows = [[2,35,-3,4,6,5,.7],[4,-20,-5,2,3,2,1.2]], original = structuredClone(rows);
    const placed = groundTreeRows(rows,origin,(e,n)=>e===252&&n===503?82:91);
    for (let i=0;i<rows.length;i++) {
      expect(placed[i].filter((_,j)=>j!==1)).toEqual(rows[i].filter((_,j)=>j!==1));
      const before=treeForm(rows[i],origin),after=treeForm(placed[i],origin);
      expect(after.groundY+origin[1]).toBeCloseTo(i===0?82:91,10);
      expect(after.crown.scale).toEqual(before.crown.scale);
      expect(after.trunk.scale[1]).toBeCloseTo(before.trunk.scale[1],10);
      expect(after.crownVariant).toBe(before.crownVariant);
      expect(after.topY-after.groundY).toBeCloseTo(before.topY-before.groundY,10);
    }
    expect(rows).toEqual(original);
  });
  it('leaves ungrounded and invalid rows intact without creating NaN transforms', () => {
    const rows=[[0,20,0,2,3,2,0],[2,20,0,2,3,2,0],[4,20,0,2,0,2,0]];
    expect(groundTreeRows(rows,[0,0,0],e=>e===0?undefined:NaN)).toEqual(rows);
  });
  it('excludes a true gap and restores seam trees only while neighboring terrain is available', () => {
    const origin=[250,70,-500],rows=[[2,30,-3,4,6,5,.7],[6,30,-3,4,6,5,.9]],gaps:number[]=[];
    const local=groundTreeRows(rows,origin,()=>undefined,index=>gaps.push(index));
    expect(gaps).toEqual([0,1]);
    const absent=resolveTreeGroundGaps(local,origin,gaps,[]);
    expect(absent.unsupported).toEqual([0,1]);expect(absent.rows).toBe(local);
    const support={bounds:{min:[251,0,-504],max:[254,100,-502]},ground:(e:number,n:number)=>e===252&&n===503?84:undefined};
    const loaded=resolveTreeGroundGaps(absent.rows,origin,gaps,[support]);
    expect(loaded.unsupported).toEqual([1]);expect(loaded.supported).toEqual([0]);
    expect(treeForm(loaded.rows[0],origin).groundY+70).toBeCloseTo(84,9);
    expect(loaded.rows[0].filter((_,i)=>i!==1)).toEqual(rows[0].filter((_,i)=>i!==1));
    expect(loaded.rows[1]).toBe(rows[1]);expect(rows[0][1]).toBe(30);
    const unloaded=resolveTreeGroundGaps(loaded.rows,origin,gaps,[]);
    expect(unloaded.unsupported).toEqual([0,1]);
    const changedLod=resolveTreeGroundGaps(unloaded.rows,origin,gaps,[{...support,ground:()=>83.8}]);
    expect(treeForm(changedLod.rows[0],origin).groundY+70).toBeCloseTo(83.8,9);
    expect(changedLod.rows).not.toBe(unloaded.rows);
    expect(resolveTreeGroundGaps(changedLod.rows,origin,gaps,[{...support,ground:()=>83.8}]).rows).toBe(changedLod.rows);
  });
  it('does not scan distant terrain or accept non-finite neighboring support', () => {
    const rows=[[0,20,0,2,3,2,0]],bounds={min:[-1,0,-1],max:[1,20,1]};
    const result=resolveTreeGroundGaps(rows,[0,0,0],[0],[{bounds:{min:[100,0,100],max:[110,20,110]},ground:()=>{throw Error('Unbounded neighbor scan');}},{bounds,ground:()=>NaN}]);
    expect(result.unsupported).toEqual([0]);expect(result.rows).toBe(rows);
  });
  it('samples steep terrain for trees while leaving grass slope limits unchanged and ignoring roofs', () => {
    const group=new THREE.Group(); group.add(terrain('terrain',[10,10,30]),terrain('house_roof',[80,80,80]));
    const origin=[250,70,-500]; group.position.fromArray(origin);
    expect(tileGround(group,origin)(252,497)).toBeUndefined();
    const ground=tileGround(group,origin,0);
    expect(ground(252,497)).toBeCloseTo(84,9);
    const packet={n:0,k:'',t:Buffer.from(new Int16Array([20,30,150,40]).buffer).toString('base64')};
    const placed=surveyTreeRows(packet,[],origin,ground)!;
    expect(treeForm(placed[0],origin).groundY+70).toBeCloseTo(84,9);
    const form=treeForm(placed[0],origin),matrix=trunkMatrix(form,{bottom:[0,-.8,0],top:[.02,-.4,.04],bottomRadius:.09,topRadius:.07},new THREE.Matrix4());
    const foot=new THREE.Vector3(0,-1,0).applyMatrix4(matrix);
    expect(foot.y+70).toBeCloseTo(84-TRUNK_BURY_M,9);
    expect(foot.x).toBeCloseTo(2,9); expect(foot.z).toBeCloseTo(3,9);
    group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
  });
  it('reports unsupported surveyed rows without removing or reordering source and evergreen indices', () => {
    const rows=[[1,20,2,3,4,3,0],[2,22,3,4,5,4,1]], packet={n:2,k:'Ag==',t:Buffer.from(new Int16Array([10,10,80,30,20,20,100,40,30,30,120,40]).buffer).toString('base64')};
    const missing:number[]=[], placed=surveyTreeRows(packet,rows,[0,0,0],e=>e===2?15:e===3?NaN:undefined,i=>missing.push(i))!;
    expect(placed).toHaveLength(4); expect(placed[0]).toEqual(rows[1]);
    expect(missing).toEqual([1,3]);
    expect(placed.every(row=>row.every(Number.isFinite))).toBe(true);
    const invalid:number[]=[];
    expect(surveyTreeRows({...packet,n:3},rows,[0,0,0],()=>undefined,i=>invalid.push(i))).toBeUndefined();
    expect(invalid).toEqual([]);
  });
  it.each([0,1,2])('recovers the native source seam anchor from the adjacent LOD%s terrain', async level => {
    const root=`public/town-assets/${release.directory}/`,manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
    const owner=manifest.tiles.find((t:{id:string})=>t.id==='-14_-14'),neighbor=manifest.tiles.find((t:{id:string})=>t.id==='-13_-14');
    const row=JSON.parse(readFileSync(root+owner.treeFile.url,'utf8'))[13];
    expect([row[0]+owner.origin[0],-row[2]-owner.origin[2]]).toEqual([-3251,-3361]);
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.register(()=>({name:'GEOMETRY_ONLY_TEXTURE_PLACEHOLDER',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}) as never);
    const groups:THREE.Group[]=[];
    for(const tile of [owner,neighbor]){const entry=tile.lods.find((l:{level:number})=>l.level===level),bytes=readFileSync(root+entry.url);groups.push((await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);}
    expect(tileGround(groups[0],owner.origin,0)(-3251,-3361)).toBeUndefined();
    const result=resolveTreeGroundGaps([row],owner.origin,[0],[{bounds:neighbor.bounds,ground:tileGround(groups[1],neighbor.origin,0)}]);
    expect(result.unsupported).toEqual([]);expect(result.supported).toEqual([0]);
    expect(treeForm(result.rows[0],owner.origin).groundY+owner.origin[1]).toBeCloseTo([22.302839597066246,22.28000926971436,22.314041137695316][level],6);
    for(const group of groups)group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){(m as THREE.MeshStandardMaterial).map?.dispose();m.dispose();}}});
  });
  it.each([0,1,2])('grounds the native Sutton Road legacy tree on LOD%s without resizing it', async level => {
    const root=`public/town-assets/${release.directory}/`,manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
    const tile=manifest.tiles.find((t:{id:string})=>t.id==='-4_2'),entry=tile.lods.find((l:{level:number})=>l.level===level);
    const rows=JSON.parse(readFileSync(root+tile.treeFile.url,'utf8')),row=rows[80];
    expect([row[0]+tile.origin[0],-row[2]-tile.origin[2]]).toEqual([-861,647]);
    const bytes=readFileSync(root+entry.url),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.register(()=>({name:'GEOMETRY_ONLY_TEXTURE_PLACEHOLDER',loadTexture:async()=>new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1)}) as never);
    const group=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
    const ground=tileGround(group,tile.origin,0),y=ground(-861,647)!;
    expect(row[1]-.71*row[4]/.30-y).toBeGreaterThan(.75);
    const placed=groundTreeRows([row],tile.origin,ground)[0];
    expect(treeForm(placed,tile.origin).groundY+tile.origin[1]).toBeCloseTo(y,8);
    expect(placed.filter((_:number,i:number)=>i!==1)).toEqual(row.filter((_:number,i:number)=>i!==1));
    group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){(m as THREE.MeshStandardMaterial).map?.dispose();m.dispose();}}});
  });
});
