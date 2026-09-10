/** Authored decomposing fragments within existing forest/soil cover only.
 * VC-0140/0146/0261 support the general vocabulary; location, density and leaf
 * shape are not a litter survey or species identification. No autumn carpet. */
export const FOREST_LITTER_LIMITS = {
  cellM: .38, jitterM: .085, minLengthM: .04, maxLengthM: .08,
  leafHalfWidthM: .011, needleHalfWidthM: .0012, maxShear: .10,
  maxAAM: .014, fadeStartM: .007, fadeEndM: .028,
  forestOccupancy: .30, soilOccupancy: .035, reliefM: .0012,
} as const;
const f = (value: number) => value.toFixed(6);
const L = FOREST_LITTER_LIMITS;

/** One cell hash, no texture reads, loops or screen derivatives. Every shape
 * ends well inside its cell even after jitter, rotation and AA; both color and
 * height therefore reach zero before any hashed coordinate can jump. */
export const FOREST_LITTER_GLSL = `
vec2 townLitterFragment(vec2 world,float pixelWidth,float occupancy) {
  float resolved=1.0-smoothstep(${f(L.fadeStartM)},${f(L.fadeEndM)},pixelWidth);
  if(resolved<=0.0)return vec2(0.0);
  vec2 cell=floor(world/${f(L.cellM)});
  float seed=townHash(cell+vec2(43.1,19.7));
  if(seed<1.0-occupancy)return vec2(0.0);
  vec3 variety=fract(seed*vec3(73.71,119.39,317.17));
  vec2 p=(fract(world/${f(L.cellM)})-.5)*${f(L.cellM)}-(variety.xy-.5)*${f(L.jitterM * 2)};
  vec2 direction=vec2(variety.z-.5,variety.x-.5);
  float directionLength=length(direction);
  if(directionLength<.025)return vec2(0.0);
  direction/=directionLength;
  vec2 q=vec2(dot(p,direction),dot(p,vec2(-direction.y,direction.x)));
  float halfLength=mix(${f(L.minLengthM * .5)},${f(L.maxLengthM * .5)},variety.y);
  float aa=max(.0006,min(${f(L.maxAAM)},pixelWidth*.7));
  float body,fold;
  if(variety.z>.30){
    float width=${f(L.leafHalfWidthM)}*(.7+.3*variety.x)*max(0.0,1.0-q.x*q.x/(halfLength*halfLength));
    float across=q.y-${f(L.maxShear)}*q.x;
    float distance=max(abs(q.x)-halfLength,abs(across)-width);
    body=1.0-smoothstep(-aa,aa,distance);
    fold=mix(.72,1.13,smoothstep(-aa,aa,across));
  }else{
    // A subdued two-needle fragment. Thin forms retire sooner than leaf pieces.
    float across=min(abs(q.y-.05*q.x),abs(q.y+.10*q.x-.0012));
    float distance=max(abs(q.x)-halfLength,across-${f(L.needleHalfWidthM)});
    body=(1.0-smoothstep(-aa,aa,distance))*(1.0-smoothstep(.002,.009,pixelWidth));
    fold=.86+.18*variety.x;
  }
  return vec2(body*resolved,fold);
}
`;
