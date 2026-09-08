import directory from '../../../data/derived/town/place-directory.json';
import { LANDMARKS, type DriveEngine } from './engine';
import { drawNavigationBase, drawNavigationFurniture, drawNavigationPlaces, navigationBounds, navigationPoint, type NavigationView } from './navigation-map';

/** Drawn only when Explore is opened or a location changes, never in the frame loop. */
export function drawTownOverview(canvas: HTMLCanvasElement, engine: DriveEngine, selectedPlaceId?: string): void {
  const context = canvas.getContext('2d'); if (!context) return;
  const selected = directory.places.find(place => place.id === selectedPlaceId);
  const bounds = selected ? [selected.point[0] - 700, selected.point[1] - 550, selected.point[0] + 700, selected.point[1] + 550] : navigationBounds(engine.graph);
  const width = canvas.width, height = canvas.height, margin = 34;
  const view: NavigationView = { width, height, center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], scale: Math.min((width - margin * 2) / (bounds[2] - bounds[0]), (height - margin * 2) / (bounds[3] - bounds[1])) };
  drawNavigationBase(context, engine.graph, view);
  context.font = '12px system-ui'; context.textBaseline = 'middle'; context.textAlign = 'center';
  Object.values(LANDMARKS).forEach((landmark, i) => {
    const [x, y] = navigationPoint(landmark.xy, view);
    if (x < 12 || x > width - 12 || y < 35 || y > height - 40) return;
    context.fillStyle = '#21392d'; context.strokeStyle = '#b6c4a8'; context.lineWidth = 1.5; context.beginPath(); context.arc(x, y, 10, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = '#e0e4c7'; context.fillText(String(i + 1), x, y + .5);
  });
  drawNavigationPlaces(context, view, selectedPlaceId, Object.values(LANDMARKS).map(landmark => navigationPoint(landmark.xy, view)));
  const [x, y] = navigationPoint(engine.pose()[0], view);
  context.strokeStyle = '#ffffff'; context.lineWidth = 2; context.beginPath(); context.arc(x, y, 14, 0, Math.PI * 2); context.stroke();
  drawNavigationFurniture(context, view, true);
  context.fillStyle = '#e3e7d2'; context.font = '12px system-ui'; context.textAlign = 'left'; context.fillText(selected ? 'Local view · your position is circled when visible' : 'Circles 1–6: starting places · letters: places to explore', 20, height - 20);
}
