export async function onRequest(context) {
  const cf = context.request.cf || {};
  return new Response(
    JSON.stringify({
      lat: cf.latitude ? parseFloat(cf.latitude) : null,
      lng: cf.longitude ? parseFloat(cf.longitude) : null,
      country: cf.country || null,
      region: cf.region || null,
      regionCode: cf.regionCode || null,
      city: cf.city || null,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
}
