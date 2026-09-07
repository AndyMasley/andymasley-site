// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import source from '../../../../data/derived/town/landmark-evidence.json';
import { Batch } from '../crafted-frontages';
import { buildEvidenceLandmarks, LANDMARK_EVIDENCE_ROWS, landmarkRows } from '../evidence-landmarks';

const signatures=LANDMARK_EVIDENCE_ROWS.filter(row=>row.replaceBody);
const byId=(id:string)=>LANDMARK_EVIDENCE_ROWS.find(row=>row.id===id)!;
function build(id:string,level=0){const batch=new Batch(new THREE.Vector3(),level);buildEvidenceLandmarks(batch,[byId(id)]);return batch;}

describe('dated landmark evidence',()=>{
  it('joins only measured generic assets and records protected assets separately',()=>{
    expect(LANDMARK_EVIDENCE_ROWS).toHaveLength(35);
    expect(new Set(LANDMARK_EVIDENCE_ROWS.map(row=>row.id)).size).toBe(35);
    expect(signatures.map(row=>row.signature).sort()).toEqual(['first-baptist','kelly-library','sacred-heart','saint-louis']);
    for(const row of LANDMARK_EVIDENCE_ROWS){expect(row.evidenceIds.length).toBeGreaterThan(0);expect(landmarkRows(row.tileId)).toContain(row);expect(row.peak).toBeGreaterThan(row.floor);expect(row.floor).toBeGreaterThanOrEqual(row.base);expect(row.currentExteriorVerified).toBe(false);}
    expect(landmarkRows('not-a-tile')).toEqual([]);
    expect(source.retainedProtected.some(row=>row.structId==='168510_866616')).toBe(true);
    const noReplacement=new Batch(new THREE.Vector3(),0);buildEvidenceLandmarks(noReplacement,LANDMARK_EVIDENCE_ROWS.filter(row=>!row.replaceBody));expect(noReplacement.chunks.size).toBe(0);
  });
  it('preserves conflicting shared commercial facades instead of applying one material to all of them',()=>{
    for(const id of ['168247_866622','168341_866602']){const row=byId(id);expect(row.sharedOutline).toBe(true);expect(row.material).toBeNull();expect(row.paint).toBeNull();expect(row.applicationIds.length).toBeGreaterThan(1);expect(row.replaceBody).toBe(false);}
  });
  it('uses the new library identity and dates its construction-era footprint',()=>{
    const row=source.rows.find(r=>r.id==='168571_866677')!;
    expect(row.signature).toBe('kelly-library');expect(row.footprintSource.SOURCEDATE).toBe(20170500);expect(row.footprintSource.EDIT_DATE).toBe('20191205');
    expect(row.cautions.join(' ')).toContain('construction-era');
    expect(row.name).not.toMatch(/^Corbin/);
  });
  it('has consistent right-handed Three.js facade frames',()=>{
    for(const row of signatures)for(const f of [row.frame,...row.frames]){expect(Math.hypot(...f.tangent)).toBeCloseTo(1,9);expect(Math.hypot(...f.outward)).toBeCloseTo(1,9);expect(f.tangent[0]*f.outward[1]-f.tangent[1]*f.outward[0]).toBeCloseTo(-1,9);}
  });
});

describe('signature landmark geometry',()=>{
  it('builds finite, outward-normal triangles within source height bounds at every LOD',()=>{
    for(const row of signatures)for(let level=0;level<3;level++){
      const batch=build(row.id,level);let triangles=0,min=Infinity,max=-Infinity;
      for(const chunk of batch.chunks.values()){
        expect(chunk.positions.every(Number.isFinite),row.name).toBe(true);expect(chunk.normals.every(Number.isFinite),row.name).toBe(true);
        expect(chunk.positions.length).toBe(chunk.normals.length);
        for(let i=0;i<chunk.positions.length;i+=9){
          const a=new THREE.Vector3().fromArray(chunk.positions,i),b=new THREE.Vector3().fromArray(chunk.positions,i+3),c=new THREE.Vector3().fromArray(chunk.positions,i+6),n=new THREE.Vector3().fromArray(chunk.normals,i),cross=b.clone().sub(a).cross(c.clone().sub(a));
          expect(cross.length(),`${row.name} ${chunk.role} triangle ${i/9}`).toBeGreaterThan(1e-8);
          expect(n.length(),`${row.name} ${chunk.role}`).toBeCloseTo(1,5);
          expect(cross.dot(n),`${row.name} ${chunk.role} triangle ${i/9}`).toBeGreaterThan(0);
          min=Math.min(min,a.y,b.y,c.y);max=Math.max(max,a.y,b.y,c.y);triangles++;
        }
      }
      expect(triangles).toBeGreaterThan(500);expect(triangles).toBeLessThan(30000);expect(min).toBeGreaterThanOrEqual(row.base-1e-6);expect(max).toBeLessThanOrEqual(row.peak+.001);
    }
  });
  it('restores the distinct granite church silhouettes up to their measured maxima',()=>{
    for(const id of ['168813_867173','168919_867319']){
      const row=byId(id),batch=build(id),chunks=[...batch.chunks.values()];expect(row.material).toBe('stone');expect(chunks.some(c=>c.role==='stone')).toBe(true);expect(chunks.some(c=>c.role==='brick')).toBe(false);
      const top=Math.max(...chunks.flatMap(c=>c.positions.filter((_,i)=>i%3===1)));expect(top).toBeCloseTo(row.peak,6);expect(top-row.eave).toBeGreaterThan(8);
    }
    expect([...build('168813_867173').chunks.values()].some(c=>c.role==='metal'&&c.color==='#68847b')).toBe(true);
  });
  it('keeps modern St Louis low and rectangular, with no Gothic spire',()=>{
    const row=byId('168700_866663'),chunks=[...build(row.id).chunks.values()];expect(row.material).toBe('brick');
    expect(chunks.some(c=>c.role==='stone')).toBe(false);
    const roof=chunks.filter(c=>c.role==='roof');expect(Math.max(...roof.flatMap(c=>c.positions.filter((_,i)=>i%3===1)))).toBeLessThanOrEqual(row.eave+.17);
    expect(Math.max(...chunks.flatMap(c=>c.positions.filter((_,i)=>i%3===1)))).toBeLessThan(row.eave+.4);
  });
  it('retains modern library glass and roof lantern while reducing small distant details',()=>{
    const row=byId('168571_866677'),near=build(row.id),far=build(row.id,2),chunks=[...near.chunks.values()];
    const glass=chunks.filter(c=>c.role==='glass');expect(glass.length).toBeGreaterThan(0);expect(Math.max(...glass.flatMap(c=>c.positions.filter((_,i)=>i%3===1)))).toBeGreaterThan(row.eave+1);
    expect(chunks.reduce((n,c)=>n+c.positions.length,0)).toBeGreaterThan([...far.chunks.values()].reduce((n,c)=>n+c.positions.length,0));
  });
});
