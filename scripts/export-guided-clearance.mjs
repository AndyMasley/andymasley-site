import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import z from 'node:zlib';
import { build } from 'esbuild';
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.WEBSTER_STREET_AUDIT ?? '/private/tmp/webster-finished-game/roads';
fs.mkdirSync(out, { recursive: true });
await build({ entryPoints: [site + '/src/lib/town/engine.ts'], outfile: out + '/engine.mjs', bundle: true, format: 'esm', platform: 'node' });
const { RoadGraph } = await import(pathToFileURL(out + '/engine.mjs').href);
const raw = z.gunzipSync(fs.readFileSync(site + '/data/derived/town/engine-network.json.gz')), graph = new RoadGraph(JSON.parse(raw));
const lines = [], poses = [];
const full = process.env.WEBSTER_FULL_CLEARANCE === '1';
const footprint = (path, s) => {
  const [p, direction] = path.sample(s), n = Math.hypot(direction[0], direction[1]), d = [direction[0] / n, direction[1] / n];
  return [[2.6, 1.2], [-2.6, 1.2], [-2.6, -1.2], [2.6, -1.2]].map(([along, across]) => [p[0] + d[0] * along - d[1] * across, p[1] + d[1] * along + d[0] * across]);
};
for (const [id, p] of graph.paths) {
  lines.push({ edge: id, points: p.points.filter((_, i) => i % 2 === 0 || i === p.points.length - 1) });
  for (const start of full ? [0] : [0, Math.max(0, p.length - 30)]) for (let s = start; s <= Math.min(p.length, start + (full ? p.length : 30)); s += .75) poses.push(footprint(p, s));
  if (full) poses.push(footprint(p, p.length));
  if (graph.obstacleStops.has(id)) continue;
  for (const choice of graph.choices(id)) {
    const connector = graph.connector(id, choice.edgeId).path;
    lines.push({ from: id, to: choice.edgeId, points: connector.points });
    for (let s = 0; s <= connector.length; s += .5) poses.push(footprint(connector, s));
    poses.push(footprint(connector, connector.length));
  }
}
fs.writeFileSync(out + '/clearance-paths.json.gz', z.gzipSync(JSON.stringify(lines)));
fs.writeFileSync(out + '/clearance-car-poses.json.gz', z.gzipSync(JSON.stringify(poses)));
console.log(JSON.stringify({ paths: lines.length, sweptCarPoses: poses.length, envelope: '5.2 × 2.4m, sampled at 0.5m on every connector and 0.75m ' + (full ? 'along every road' : 'near road ends') }));
