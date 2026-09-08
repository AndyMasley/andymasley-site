import directory from '../../../data/derived/town/place-directory.json';
import { LANDMARKS, type DriveEngine } from './engine';

/** Drawn only when Explore is opened or a location changes, never in the frame loop. */
export function drawTownOverview(canvas: HTMLCanvasElement, engine: DriveEngine, selectedPlaceId?: string): void {
  const context = canvas.getContext('2d'); if (!context) return;
  const paths = [...engine.graph.edges.values()].filter(edge => edge.id >= 0);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const edge of paths) for (const p of edge.points) { bounds[0] = Math.min(bounds[0], p[0]); bounds[1] = Math.min(bounds[1], p[1]); bounds[2] = Math.max(bounds[2], p[0]); bounds[3] = Math.max(bounds[3], p[1]); }
  const selected = directory.places.find(place => place.id === selectedPlaceId);
  if (selected) { bounds[0] = selected.point[0] - 700; bounds[1] = selected.point[1] - 550; bounds[2] = selected.point[0] + 700; bounds[3] = selected.point[1] + 550; }
  const width = canvas.width, height = canvas.height, margin = 34;
  const scale = Math.min((width - margin * 2) / (bounds[2] - bounds[0]), (height - margin * 2) / (bounds[3] - bounds[1]));
  const point = (p: readonly number[]) => [width / 2 + (p[0] - (bounds[0] + bounds[2]) / 2) * scale, height / 2 - (p[1] - (bounds[1] + bounds[3]) / 2) * scale];
  context.fillStyle = '#142a25'; context.fillRect(0, 0, width, height);
  context.lineCap = 'round'; const drawn = new Set<number | string>();
  for (const edge of paths) {
    const physical = edge.physical_id ?? edge.id; if (drawn.has(physical)) continue; drawn.add(physical);
    context.beginPath(); edge.points.forEach((p, i) => { const [x, y] = point(p); if (!i) context.moveTo(x, y); else context.lineTo(x, y); });
    context.strokeStyle = edge.name === 'INTERSTATE 395' ? '#beccbd' : '#91aaa27a'; context.lineWidth = edge.name === 'INTERSTATE 395' ? 2 : 1; context.stroke();
  }
  context.font = '14px system-ui'; context.textBaseline = 'middle';
  Object.values(LANDMARKS).forEach((landmark, i) => {
    const [x, y] = point(landmark.xy); context.fillStyle = '#ebd89f'; context.beginPath(); context.arc(x, y, 10, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#142a25'; context.textAlign = 'center'; context.fillText(String(i + 1), x, y + 0.5);
  });
  for (const place of directory.places) {
    const [px, py] = point(place.point); context.fillStyle = place === selected ? '#fff1ad' : '#d4c38a'; context.beginPath(); context.rect(px - (place === selected ? 9 : 3), py - (place === selected ? 9 : 3), place === selected ? 18 : 6, place === selected ? 18 : 6); context.fill();
    if (place === selected) { context.fillStyle = '#142a25'; context.textAlign = 'center'; context.fillText(place.label, px, py); context.fillStyle = '#fff7e8'; context.fillText(place.title, px, py - 22); }
  }
  const [x, y] = point(engine.pose()[0]); context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.beginPath(); context.arc(x, y, 14, 0, Math.PI * 2); context.stroke();
  context.fillStyle = '#fff7e8'; context.textAlign = 'left'; context.fillText('N ↑', 20, 24); context.fillText(selected ? 'Local view · your position is circled when visible' : 'Your position is circled · squares mark places to explore', 20, height - 20);
}
