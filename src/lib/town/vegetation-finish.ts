import type { Batch, Frame } from './crafted-frontages';

/** Regional interpretation only; neither source anchors nor the 2016 habitat
 * grid identify individual tree/flower species. No new planting locations. */
export const VEGETATION_FINISH_EVIDENCE = {
  tree: { id:'TER-024', source:'research/sections/terrain-ground-vegetation.md:319', basis:'Regional maple/oak/pine palette; bark ridges, muted gray-brown color and plate spacing are authored.' },
  flower: { id:'LGT-18', source:'research/sections/light-season-weather.md:442', url:'https://www.umass.edu/agriculture-food-environment/landscape/landscape-message-august-21-2026', basis:'Central Massachusetts late-August Joe-Pye bloom; sparse inferred flower form only inside existing registered wetland vegetation patches.' },
  addedTreeTriangles:0, addedTreeMaterials:0, addedTextures:0,
} as const;

/** Metre-scale, texture-free bark relief. Cross-axis blending avoids a blank
 * stripe around round trunks; derivative fading removes distant shimmer. */
export const BARK_FINISH_GLSL = `
float townBarkValue = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb,vec3(townBarkValue)*vec3(1.02,1.0,0.94),0.48);
vec3 townBarkFace = abs(normalize(cross(dFdx(vTownArtWorld),dFdy(vTownArtWorld))));
vec2 townBarkWeight = townBarkFace.xz / max(0.0001,townBarkFace.x+townBarkFace.z);
float townBarkWarp = townArtNoise(vTownArtWorld.xz*0.7+vec2(vTownArtWorld.y*0.43));
vec2 townBarkA = vec2(vTownArtWorld.z*15.0+townBarkWarp*0.75,vTownArtWorld.y*1.65);
vec2 townBarkB = vec2(vTownArtWorld.x*15.0+townBarkWarp*0.75,vTownArtWorld.y*1.65);
float townBarkGrain = dot(vec2(townArtNoise(townBarkA),townArtNoise(townBarkB)),townBarkWeight);
float townBarkFissure = 1.0-smoothstep(0.22,0.43,townBarkGrain);
float townBarkPlates = dot(vec2(townArtNoise(townBarkA*vec2(0.46,2.1)),townArtNoise(townBarkB*vec2(0.46,2.1))),townBarkWeight);
float townBarkDetail = (1.0-smoothstep(18.0,48.0,townArtDistance))*(1.0-smoothstep(0.015,0.060,townArtFootprint));
diffuseColor.rgb *= mix(0.95,1.06,townArtNoise(vTownArtWorld.xz*0.19+vec2(vTownArtWorld.y*0.12)));
diffuseColor.rgb *= 1.0+(0.12*(townBarkPlates-0.5)-0.29*townBarkFissure)*townBarkDetail;
townArtHeight = (0.0012*(townBarkPlates-0.5)-0.0032*townBarkFissure)*townBarkDetail;
`;

/** Replace one existing wetland shrub, never create a planting domain. Bounds
 * stay within its old 0.95m horizontal envelope. Flower counts/placement inferred. */
export function wetMarginFlowers(batch:Batch,frame:Frame,ground:number,seed:number):void {
  if(!Number.isFinite(ground)||!Number.isFinite(seed)||seed<0||seed>=1)return;
  const stems=batch.level===0?3:2,headSides=batch.level===0?7:4;
  for(let i=0;i<stems;i++){
    const angle=seed*Math.PI*2+i*2.4,u=Math.cos(angle)*.25,v=Math.sin(angle)*.25,h=1.45+((seed+i*.27)%1)*.26;
    batch.box(frame,'leaf',u,ground+h/2,v,.018,h,.018,'#586747');
    for(let tier=0;tier<(batch.level===0?2:1);tier++)for(let k=0;k<3;k++){
      const a=angle+k*Math.PI*2/3+.4*tier,c=Math.cos(a),s=Math.sin(a),y=ground+h*(.36+tier*.21),length=.29,width=.063;
      const leaf=[[u,y,v],[u+c*length*.52-s*width,y+.045,v+s*length*.52+c*width],[u+c*length,y+.085,v+s*length],[u+c*length*.52+s*width,y+.045,v+s*length*.52-c*width]];
      batch.polygon(frame,'leaf',leaf,'#64724b');batch.polygon(frame,'leaf',[...leaf].reverse(),'#5b6a43');
    }
    // Several small domed clusters read as a flower head instead of one orb.
    const lobes=batch.level===0?5:3;
    for(let l=0;l<lobes;l++){
      const a=l*Math.PI*2/lobes+angle,x=u+Math.cos(a)*.12,z=v+Math.sin(a)*.12,y=ground+h-.025*Math.abs(Math.sin(a)),radius=.085;
      // A closed, tapering twig actually connects each offset cluster to the
      // stalk. Four faces avoid floating heads without a cylinder per cluster.
      const sy=ground+h-.13,dx=x-u,dy=y-sy,dz=z-v,len=Math.hypot(dx,dy,dz),q=Math.hypot(dx,dz);
      const nx=-dz/q,nz=dx/q,bx=dy*nz/len,by=(dz*nx-dx*nz)/len,bz=-dy*nx/len;
      const ring=Array.from({length:3},(_,j)=>{const r=j*Math.PI*2/3;return[u+.004*(Math.cos(r)*nx+Math.sin(r)*bx),sy+.004*Math.sin(r)*by,v+.004*(Math.cos(r)*nz+Math.sin(r)*bz)];});
      batch.polygon(frame,'leaf',[ring[2],ring[1],ring[0]],'#586747');
      for(let j=0;j<3;j++)batch.polygon(frame,'leaf',[ring[j],ring[(j+1)%3],[x,y,z]],'#586747');
      for(let k=0;k<headSides;k++){
        const a0=k*Math.PI*2/headSides,a1=(k+1)*Math.PI*2/headSides;
        batch.polygon(frame,'leaf',[[x,y+.045,z],[x+Math.cos(a1)*radius,y,z+Math.sin(a1)*radius],[x+Math.cos(a0)*radius,y,z+Math.sin(a0)*radius]],l%2?'#9b7c89':'#ac8994');
      }
    }
  }
}
