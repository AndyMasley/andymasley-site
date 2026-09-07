import type { MeshStandardMaterial } from 'three';

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
    if (code !== 5) {
      const dark = code === 1 ? '0.185,0.131,0.080' : '0.235,0.234,0.206';
      const light = code === 1 ? '0.315,0.247,0.161' : '0.395,0.385,0.333';
      shader.fragmentShader = shader.fragmentShader.replace(asphaltNeutralization, `
float townInventorySource = dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
float townInventoryVariation = smoothstep(0.012,0.16,townInventorySource);
diffuseColor.rgb = mix(vec3(${dark}),vec3(${light}),0.20+0.65*townInventoryVariation);
`);
    }
    // Millimetre relief only, within the existing derivative/distance fade.
    shader.fragmentShader = shader.fragmentShader
      .replace('vTownArtWorld.xz*37.0', `vTownArtWorld.xz*${code===1?'11.0':code===2?'23.0':'29.0'}`)
      .replace('(townStoneGrain-0.5)*0.00055', `(townStoneGrain-0.5)*${code===2?'0.0015':'0.0008'}`);
  };
  material.customProgramCacheKey = () => `${key}|inventory-surface-v1:${code}`;
  material.needsUpdate = true;
}
