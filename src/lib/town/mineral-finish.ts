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
${family === 'asphalt' ? ASPHALT_WEATHERING : family === 'chip-seal' ? CHIP_SEAL_LIFT : ''}`;
}

// Surface-treated (chip-seal) roads keep their registered tone relative to the
// lifted ordinary asphalt below.
const CHIP_SEAL_LIFT = `
diffuseColor.rgb *= 1.2;
`;

/** Ordinary asphalt only (inventory earth, gravel and chip-seal replace the
 * whole asphalt fragment). Broad paving fields and a crack-sealed block network
 * follow VC-0375, VC-0444/0445 and VC-0452: Webster's weathered roads carry
 * irregular dark sealant lines and patch-scale tone changes. Positions are
 * authored world-space patterns, not a survey of particular cracks. */
const ASPHALT_WEATHERING = `
// Weathered town asphalt reads mid-grey in sun (VC-0367, VC-0452); fresh
// blacktop is the exception. Lift every ordinary asphalt family together so
// roads, aprons, parking and repairs keep their registered relative tones.
diffuseColor.rgb *= 1.2;
// Paving laid and patched at different times: lighter and darker fields of
// roughly 15-60 m, from incommensurate waves (no texture or noise read).
vec2 townPaveP = vTownArtWorld.xz;
float townPaveField = 0.5 + 0.21*sin(dot(townPaveP,vec2(0.061,0.043))) + 0.17*sin(dot(townPaveP,vec2(-0.089,0.117))+1.9) + 0.12*sin(dot(townPaveP,vec2(0.201,-0.157))+4.1);
diffuseColor.rgb *= mix(0.87,1.09,smoothstep(0.15,0.85,townPaveField));
// Crack sealing: 4-6 cm dark bands along a sparse, meandering subset of a
// 3-5 m block network (whole cell edges are kept or dropped by a stable pair
// hash, so lines end and branch), present where a slow field says the surface
// has aged, and fading with distance before it can alias.
float townSealVisible = (1.0-smoothstep(28.0,70.0,townArtDistance)) * (1.0-smoothstep(0.035,0.11,townArtFootprint));
vec2 townSealP = townPaveP*0.26 + vec2(sin(townPaveP.y*0.53+1.3),sin(townPaveP.x*0.47+4.1))*0.22
  + vec2(sin(townPaveP.y*1.9+0.4),sin(townPaveP.x*2.1+2.2))*0.035;
// Derivatives are taken before the branch, in uniform control flow.
float townSealAA = max(length(fwidth(townSealP)), 0.003);
if (townSealVisible > 0.0) {
  vec2 townSealI = floor(townSealP), townSealF = fract(townSealP);
  float townSealD1 = 9.0, townSealD2 = 9.0;
  vec2 townSealC1 = vec2(0.0), townSealC2 = vec2(0.0);
  for (int townSealY = -1; townSealY <= 1; townSealY++) {
    for (int townSealX = -1; townSealX <= 1; townSealX++) {
      vec2 townSealG = vec2(float(townSealX), float(townSealY));
      vec2 townSealO = vec2(townArtHash(townSealI+townSealG), townArtHash(townSealI+townSealG+vec2(19.7,7.3)));
      vec2 townSealR = townSealG + 0.15 + 0.7*townSealO - townSealF;
      float townSealDist = dot(townSealR, townSealR);
      if (townSealDist < townSealD1) { townSealD2 = townSealD1; townSealC2 = townSealC1; townSealD1 = townSealDist; townSealC1 = townSealI+townSealG; }
      else if (townSealDist < townSealD2) { townSealD2 = townSealDist; townSealC2 = townSealI+townSealG; }
    }
  }
  float townSealEdge = sqrt(townSealD2) - sqrt(townSealD1);
  float townSealKept = step(townArtHash(townSealC1+townSealC2+abs(townSealC1-townSealC2)*7.13), 0.42);
  float townSealAged = smoothstep(0.5, 0.78, 0.5 + 0.32*sin(dot(townPaveP,vec2(0.0131,0.0207))+0.7) + 0.2*sin(dot(townPaveP,vec2(-0.0313,0.0171))+2.3));
  float townSealLine = (1.0 - smoothstep(0.012, 0.012 + townSealAA, townSealEdge)) * townSealKept * townSealAged * townSealVisible;
  diffuseColor.rgb *= 1.0 - 0.42*townSealLine;
  townMineralRoughness -= 0.05*townSealLine;
}
`;

export const MINERAL_ROUGHNESS = `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor+townMineralRoughness,0.88,1.0);
`;
