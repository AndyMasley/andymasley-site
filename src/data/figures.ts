// Opt-in map for figure.fullwidth: slug → S3 UUIDs of figures that break
// out rightward over the sidenote margin at ≥1280px (the Tufte fullwidth
// convention). A bare slug list cannot address one figure among many, so
// the key is the same stable UUID convention as alt-text.ts.

export const fullwidthFigures: Record<string, string[]> = {
  // '<slug>': ['<s3-uuid>'],
};

export function isFullwidth(slug: string, imageUrl: string): boolean {
  const uuids = fullwidthFigures[slug];
  if (!uuids || uuids.length === 0) return false;
  const uuid = imageUrl.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
  return uuid ? uuids.some(u => u.toLowerCase() === uuid.toLowerCase()) : false;
}
