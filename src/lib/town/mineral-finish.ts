export type MineralFamily = 'asphalt' | 'concrete' | 'granite' | 'foundation' | 'shoulder' | 'earth' | 'gravel' | 'chip-seal';

export const MINERAL_FINISH = {
  asphalt: { frequency: 110, relief: .00065, contrast: .22, resolved: [.003, .021], roughness: .06 },
  concrete: { frequency: 250, relief: .00018, contrast: .16, resolved: [.0015, .010], roughness: .025 },
  granite: { frequency: 140, relief: .00042, contrast: .32, resolved: [.0025, .016], roughness: .035 },
  foundation: { frequency: 190, relief: .00028, contrast: .19, resolved: [.002, .013], roughness: .025 },
  shoulder: { frequency: 40, relief: .0012, contrast: .28, resolved: [.006, .045], roughness: .025 },
  earth: { frequency: 18, relief: .0008, contrast: .18, resolved: [.01, .065], roughness: .025 },
  gravel: { frequency: 45, relief: .0015, contrast: .24, resolved: [.006, .045], roughness: .035 },
  'chip-seal': { frequency: 75, relief: .0010, contrast: .28, resolved: [.004, .032], roughness: .04 },
} as const;

/** Inferred construction finishes reuse two noise evaluations for reflectance,
 * shallow relief and roughness; this does not generate surface coverage. */
export function mineralFragment(family: MineralFamily): string {
  const spec = MINERAL_FINISH[family];
  return `
// Webster mineral family: ${family}
float townStoneGrain = townArtNoise(vTownArtWorld.xz*${spec.frequency.toFixed(1)} + vec2(vTownArtWorld.y*${(spec.frequency * .37).toFixed(2)}));
float townStoneAge = townArtNoise(vTownArtWorld.xz*0.24 + vec2(vTownArtWorld.y*0.17));
float townMineralResolved = townArtClose * (1.0-smoothstep(${spec.resolved[0]},${spec.resolved[1]},townArtFootprint));
diffuseColor.rgb *= mix(0.95,1.035,townStoneAge) * (1.0+(townStoneGrain-0.5)*${spec.contrast}*townMineralResolved);
townArtHeight = (townStoneGrain-0.5)*${spec.relief}*townMineralResolved;
float townMineralRoughness = (townStoneAge-0.5)*${spec.roughness} + (townStoneGrain-0.5)*0.025*townMineralResolved;
`;
}

export const MINERAL_ROUGHNESS = `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor+townMineralRoughness,0.88,1.0);
`;
