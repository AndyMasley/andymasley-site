import type { MeshStandardMaterial } from 'three';
import { mineralFragment } from './mineral-finish';

const asphaltNeutralization = `float townAsphaltValue = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb,vec3(townAsphaltValue)*vec3(0.94,1.0,1.07),0.96);`;

/** These are authored reflectance ranges, not surveyed pavement colors. Reuse
 * the pinned atlas for restrained variation rather than inheriting its dark
 * asphalt albedo. Source geometry, maps and the ordinary asphalt shader remain. */
export function applyInventoryRoadAppearance(material: MeshStandardMaterial, code: 1|2|5): void {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    if (!shader.fragmentShader.includes(asphaltNeutralization)) throw new Error('Inventory road asphalt shader anchor changed.');
    const ordinary = mineralFragment('asphalt');
    if (!shader.fragmentShader.includes(ordinary)) throw new Error('Inventory road mineral shader anchor changed.');
    shader.fragmentShader = shader.fragmentShader.replace(ordinary, mineralFragment(code === 1 ? 'earth' : code === 2 ? 'gravel' : 'chip-seal'));
    if (code !== 5) {
      const dark = code === 1 ? '0.185,0.131,0.080' : '0.115,0.117,0.102';
      const light = code === 1 ? '0.315,0.247,0.161' : '0.245,0.241,0.208';
      shader.fragmentShader = shader.fragmentShader.replace(asphaltNeutralization, `
float townInventorySource = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
float townInventoryVariation = smoothstep(0.012,0.16,townInventorySource);
diffuseColor.rgb = mix(vec3(${dark}),vec3(${light}),0.20+0.65*townInventoryVariation);
`);
    }
    if(code===2)shader.fragmentShader=shader.fragmentShader.replace('float townMineralRoughness =',`
// Small irregular aggregate is an authored material response, not extra stone
// geometry or a new pavement classification. Fade below the pixel footprint.
vec2 townGravelP=vTownArtWorld.xz*22.0,townGravelCell=floor(townGravelP),townGravelF=fract(townGravelP)-.5;
float townGravelSeed=townArtHash(townGravelCell),townGravelAngle=townGravelSeed*6.2831853;
townGravelF-=vec2(townArtHash(townGravelCell+vec2(41.2,8.1)),townArtHash(townGravelCell+vec2(7.3,79.1)))*.22-.11;
townGravelF=mat2(cos(townGravelAngle),-sin(townGravelAngle),sin(townGravelAngle),cos(townGravelAngle))*townGravelF;
float townGravelRadius=length(townGravelF*vec2(1.0,mix(1.12,1.65,townGravelSeed)));
float townGravelAA=max(townArtFootprint*22.0,.025);
float townGravelStone=1.0-smoothstep(.26-townGravelAA,.37+townGravelAA,townGravelRadius);
float townGravelResolved=1.0-smoothstep(.006,.045,townArtFootprint);
diffuseColor.rgb*=1.0+((townGravelStone-.54)*.20+(townGravelSeed-.5)*.13)*townGravelResolved;
townArtHeight+=townGravelStone*.0013*townGravelResolved;
float townMineralRoughness =`);
  };
  material.customProgramCacheKey = () => `${key}|inventory-surface-v3:${code}`;
  material.needsUpdate = true;
}
