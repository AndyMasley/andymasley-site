export type MineralFamily = 'asphalt' | 'concrete' | 'granite' | 'foundation' | 'shoulder' | 'earth' | 'gravel' | 'chip-seal';

export const MINERAL_FINISH = {
  asphalt: { frequency: 110, relief: .00065, contrast: .22, resolved: [.003, .021], roughness: .06, aggregate: 24, aggregateContrast: .12, aggregateRelief: .00040 },
  concrete: { frequency: 250, relief: .00018, contrast: .16, resolved: [.0015, .010], roughness: .025, aggregate: 17, aggregateContrast: .085, aggregateRelief: .00012 },
  granite: { frequency: 140, relief: .00042, contrast: .32, resolved: [.0025, .016], roughness: .035, aggregate: 38, aggregateContrast: .16, aggregateRelief: .00026 },
  foundation: { frequency: 190, relief: .00028, contrast: .19, resolved: [.002, .013], roughness: .025, aggregate: 15, aggregateContrast: .075, aggregateRelief: .00015 },
  shoulder: { frequency: 40, relief: .0012, contrast: .28, resolved: [.006, .045], roughness: .025, aggregate: 8, aggregateContrast: .13, aggregateRelief: .00065 },
  earth: { frequency: 18, relief: .0008, contrast: .18, resolved: [.01, .065], roughness: .025, aggregate: 4.5, aggregateContrast: .11, aggregateRelief: .00055 },
  gravel: { frequency: 45, relief: .0015, contrast: .24, resolved: [.006, .045], roughness: .035, aggregate: 12, aggregateContrast: .17, aggregateRelief: .00080 },
  'chip-seal': { frequency: 75, relief: .0010, contrast: .28, resolved: [.004, .032], roughness: .04, aggregate: 21, aggregateContrast: .15, aggregateRelief: .00055 },
} as const;

/** Fine grains, small aggregate clusters and broad weathering remain separate
 * scales. All three noise reads feed color, submillimeter relief and roughness;
 * they add neither textures nor physical surface/marking geometry. */
export function mineralFragment(family: MineralFamily): string {
  const spec = MINERAL_FINISH[family];
  return `
// Webster mineral family: ${family}
float townStoneGrain = townArtNoise(vTownArtWorld.xz*${spec.frequency.toFixed(1)} + vec2(vTownArtWorld.y*${(spec.frequency * .37).toFixed(2)}));
float townStoneAggregate = townArtNoise(vTownArtWorld.xz*${spec.aggregate.toFixed(1)} + vec2(vTownArtWorld.y*${(spec.aggregate * .43).toFixed(2)}) + vec2(8.73,31.91));
float townStoneAge = townArtNoise(vTownArtWorld.xz*0.24 + vec2(vTownArtWorld.y*0.17));
float townMineralResolved = townArtClose * (1.0-smoothstep(${spec.resolved[0]},${spec.resolved[1]},townArtFootprint));
// The middle scale survives normal driving views after tiny grains vanish.
// Filtering uses the continuous world footprint, not a hashed cell derivative.
float townAggregateResolved = townArtClose * (1.0-smoothstep(0.25,1.05,townArtFootprint*${spec.aggregate.toFixed(1)}));
float townAggregateValue = (townStoneAggregate-0.5)*townAggregateResolved;
float townFineValue = (townStoneGrain-0.5)*townMineralResolved;
diffuseColor.rgb *= mix(vec3(0.955,0.962,0.968),vec3(1.045,1.032,1.015),townStoneAge)
  * (1.0+townFineValue*${spec.contrast}+townAggregateValue*${spec.aggregateContrast});
townArtHeight = townFineValue*${spec.relief}+townAggregateValue*${spec.aggregateRelief};
float townMineralRoughness = (townStoneAge-0.5)*${spec.roughness} + townFineValue*0.025 + townAggregateValue*0.018;
`;
}

export const MINERAL_ROUGHNESS = `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor+townMineralRoughness,0.88,1.0);
`;
