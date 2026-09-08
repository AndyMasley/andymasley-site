/** Test-only attribution of Three's unconditional texture-error log. Never changes a result or hides console output. */
export function installTextureFailureProbe() {
  const smoke = window.__townSmoke, world = window.__webster.world;
  smoke.textureProbe ??= { worlds: [], errors: [] };
  const probe = smoke.textureProbe;
  if (probe.worlds.includes(world)) return;
  const generation = probe.worlds.push(world);
  world.loader.register(parser => {
    const original = parser.loadImageSource;
    parser.loadImageSource = function (sourceIndex, ...args) {
      const uri = parser.json.images[sourceIndex]?.uri;
      return original.call(this, sourceIndex, ...args).catch(error => {
        probe.errors.push({ generation, uri, url: uri ? new URL(uri, parser.options.path).href : null,
          time: Date.now(), name: error?.name, message: error?.message,
          retired: world.disposed === true, aborted: world.sharedAbort.signal.aborted,
          imageCacheDisposed: world.sourceImages.disposed === true });
        throw error;
      });
    };
    return { name: 'WEBSTER_SMOKE_TEXTURE_FAILURE_PROBE' };
  });
}

export function collectTextureFailureProbe() {
  const probe = window.__townSmoke?.textureProbe;
  if (!probe) return { errors: [], generations: [] };
  return { errors: probe.errors, generations: probe.worlds.map((world, index) => {
    const resources = world.residentResources(), streaming = world.streamingResources();
    return { generation: index + 1, retired: world.disposed === true, aborted: world.sharedAbort.signal.aborted,
      children: world.root.children.length, loaded: world.loaded.size, inflight: world.inflight.size,
      resources, cacheBytes: streaming.estimatedCacheBytes,
      activeDetailRequests: streaming.detailRequests.active, queuedDetailRequests: streaming.detailRequests.queued,
      imageResources: streaming.caches.sourceImages };
  }) };
}

export function retiredTextureDiagnostic(entry, probe) {
  if (entry.type !== 'error') return null;
  return probe.errors.find(error => {
    const generation = probe.generations.find(value => value.generation === error.generation);
    return error.uri && entry.text === `THREE.GLTFLoader: Couldn't load texture ${error.uri}` &&
      Math.abs(entry.time - error.time) <= 2000 && error.name === 'AbortError' &&
      error.retired && error.aborted && error.imageCacheDisposed &&
      generation?.retired && generation.aborted && generation.children === 0 && generation.loaded === 0 &&
      generation.inflight === 0 && Object.values(generation.resources).every(value => value === 0) &&
      generation.cacheBytes === 0 && generation.activeDetailRequests === 0 && generation.queuedDetailRequests === 0 &&
      generation.imageResources.pending === 0 && generation.imageResources.objectURLs === 0;
  }) ?? null;
}
