// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import homeIndex from '../../../../data/derived/town/residential-evidence-index.json';
import roofIndex from '../../../../data/derived/town/evidence-roofs-index.json';
import release from '../../../../data/derived/town/release.json';
import sourceOwners from '../../../../data/derived/town/residential-source-owners.json';
import type { EvidenceBuilding, EvidenceRoof } from '../evidence-types';

type Asset={url:string;count:number;bytes:number;sha256:string};
const owners=new Map(Object.entries(sourceOwners.owners));

function boundaryDistance(point:readonly number[],outline:readonly (readonly number[])[]):number{
  let nearest=Infinity;
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
    const t=length2?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2)):0;
    nearest=Math.min(nearest,Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy));
  }
  return nearest;
}

function payload(asset:Asset):any{
  const bytes=readFileSync(resolve('public',asset.url.slice(1)));
  expect(bytes.byteLength,asset.url).toBe(asset.bytes);
  expect(createHash('sha256').update(bytes).digest('hex'),asset.url).toBe(asset.sha256);
  expect(basename(asset.url),asset.url).toContain(`.${asset.sha256.slice(0,12)}.json`);
  return JSON.parse(bytes.toString('utf8'));
}
function noStaleFiles(folder:string,assets:Record<string,Asset>):void{
  const indexed=Object.values(assets).map(asset=>basename(asset.url)).sort();
  const emitted=readdirSync(resolve('public/town-evidence/v1',folder)).filter(file=>file.endsWith('.json')).sort();
  expect(emitted,`${folder}: stale or missing emitted payload`).toEqual(indexed);
}

describe('published building evidence asset integrity',()=>{
  it('matches every residential hash, byte count, immutable source owner and entry frame',()=>{
    expect(sourceOwners.sourceManifestSha256).toBe(release.manifestSha256);
    expect(sourceOwners.count).toBe(homeIndex.count);expect(owners.size).toBe(sourceOwners.count);
    const errors:string[]=[],profiles=new Map<string,EvidenceBuilding>();let count=0,documented=0,totalBytes=0;
    const check=(ok:boolean,id:string,detail:string)=>{if(!ok)errors.push(`${id}: ${detail}`);};
    for(const[tileId,asset]of Object.entries(homeIndex.tiles)){
      const envelope=payload(asset),rows=envelope.buildings as EvidenceBuilding[];
      expect(envelope.version).toBe(homeIndex.version);expect(envelope.tileId).toBe(tileId);expect(rows).toHaveLength(asset.count);totalBytes+=asset.bytes;
      for(const row of rows){
        count++;if(row.documented)documented++;
        check(!profiles.has(row.id),row.id,'duplicate profile');profiles.set(row.id,row);
        check(row.tileId===tileId&&owners.get(row.id)===tileId,row.id,'wrong source-owned tile');
        check(row.outline.length>=4&&row.outline.flat().every(Number.isFinite),row.id,'invalid outline');
        check([row.base,row.floor,row.eave,row.peak].every(Number.isFinite)&&row.base<=row.floor&&row.floor<row.peak,row.id,'invalid vertical bounds');
        for(const frame of row.frames){
          check([...frame.start,...frame.tangent,...frame.outward,frame.width,frame.eave??row.eave,frame.groundMaximum??row.floor,...frame.groundAt??[]].every(Number.isFinite),row.id,'nonfinite frame');
          check(frame.width>0&&Math.abs(Math.hypot(...frame.tangent)-1)<.00001&&Math.abs(Math.hypot(...frame.outward)-1)<.00001,row.id,'invalid frame width or direction');
          check(Math.abs(frame.tangent[0]*frame.outward[0]+frame.tangent[1]*frame.outward[1])<.00001,row.id,'nonorthogonal wall frame');
          check((frame.eave??row.eave)<=row.peak+.001,row.id,'frame above roof');
          // Lower roof wings split a continuous source boundary into frames.
          check(boundaryDistance(frame.start,row.outline)<.005,row.id,'frame detached from source outline');
          check(boundaryDistance(frame.start.map((v,i)=>v+frame.tangent[i]*frame.width),row.outline)<.005,row.id,'frame endpoint detached from source outline');
        }
        check(row.entry!==undefined,row.id,'entry must be explicit, including null');
        if(row.entry){const entry=row.entry,frame=row.frames[entry.frameIndex];
          check(Number.isInteger(entry.frameIndex)&&!!frame,row.id,'entry frame outside bounds');
          if(frame){check(Number.isFinite(entry.u)&&entry.u>=0&&entry.u<=frame.width,row.id,'entry outside wall');check(frame.front,row.id,'entry on unmarked front');}
          // Retained split-level entries can sit above the principal floor.
          check(Number.isFinite(entry.floor)&&entry.floor>=row.base-.001&&entry.floor<row.peak,row.id,'entry outside retained vertical bounds');
        }
      }
    }
    expect(errors.slice(0,30)).toEqual([]);expect(count).toBe(homeIndex.count);expect(documented).toBe(homeIndex.documentedCount);expect(totalBytes).toBe(homeIndex.bytes);
    noStaleFiles('residential',homeIndex.tiles);
  });
  it('matches every roof hash, byte count, tile and eligible residential owner without stale files',()=>{
    const ids=new Set<string>();let count=0;
    // Read independently so this check also runs correctly in isolation.
    const eligible=new Map<string,string>();for(const[tile,asset]of Object.entries(homeIndex.tiles)){
      const rows=JSON.parse(readFileSync(resolve('public',asset.url.slice(1)),'utf8')).buildings as EvidenceBuilding[];
      for(const row of rows)eligible.set(row.id,tile);
    }
    for(const[tileId,asset]of Object.entries(roofIndex.tiles)){
      const rows=payload(asset) as EvidenceRoof[];expect(rows).toHaveLength(asset.count);
      for(const row of rows){expect(ids.has(row.id),row.id).toBe(false);ids.add(row.id);count++;
        expect(row.tileId,row.id).toBe(tileId);expect(eligible.get(row.id),row.id).toBe(tileId);expect(owners.get(row.id),row.id).toBe(tileId);
      }
    }
    expect(count).toBe(roofIndex.count);noStaleFiles('roofs',roofIndex.tiles);
  });
});
