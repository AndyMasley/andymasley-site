import type { RoadGraph, Junction } from './engine';
import { displayChoices } from './road-display';

/** Preserve keyed button nodes and keyboard focus while selections/countdowns update. */
export function updateChoiceControls(container: HTMLElement, graph: RoadGraph, next: Junction | null): void {
  const rows = displayChoices(graph, next?.choices ?? []);
  const wanted = new Set(rows.map(row => String(row.choice.edgeId)));
  const active = container.ownerDocument.activeElement;
  const activeWasRemoved = active instanceof HTMLElement && container.contains(active) && !wanted.has(active.dataset.edge ?? '');
  let newlySelected: HTMLButtonElement | null = null;
  for (const old of container.querySelectorAll<HTMLButtonElement>('button[data-edge]')) if (!wanted.has(old.dataset.edge!)) old.remove();
  for (const { choice, name } of rows) {
    let button = container.querySelector<HTMLButtonElement>(`button[data-edge="${choice.edgeId}"]`);
    if (!button) {
      button = container.ownerDocument.createElement('button'); button.type = 'button'; button.dataset.edge = String(choice.edgeId); button.className = 'town-choice';
      const arrow = container.ownerDocument.createElement('span'); arrow.className = 'town-choice__arrow'; arrow.setAttribute('aria-hidden', 'true');
      const copy = container.ownerDocument.createElement('span'); copy.className = 'town-choice__copy';
      const label = container.ownerDocument.createElement('span'); label.className = 'town-choice__maneuver';
      const road = container.ownerDocument.createElement('span'); road.className = 'town-choice__name';
      copy.append(label, road); button.append(arrow, copy); container.append(button);
    }
    const selected = next?.selected?.edgeId === choice.edgeId;
    if (selected && button.getAttribute('aria-pressed') !== 'true') newlySelected = button;
    button.dataset.selected = String(selected); button.setAttribute('aria-pressed', String(selected));
    if (selected) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    button.setAttribute('aria-label', `${choice.label} onto ${name}${selected ? ', selected' : ''}`);
    button.title = `${choice.label} onto ${name}`;
    button.querySelector('.town-choice__arrow')!.textContent = { Left: '↰', Right: '↱', 'U-turn': '↶', Straight: '↑' }[choice.label];
    button.querySelector('.town-choice__maneuver')!.textContent = choice.label;
    button.querySelector('.town-choice__name')!.textContent = name;
  }
  // On narrow screens the choices form a scrollable row. Reveal a changed
  // selection without scrolling the page or disturbing a user's focus.
  if (newlySelected && container.scrollWidth > container.clientWidth) {
    const box = container.getBoundingClientRect(), selected = newlySelected.getBoundingClientRect();
    if (selected.right > box.right) container.scrollLeft += selected.right - box.right;
    else if (selected.left < box.left) container.scrollLeft -= box.left - selected.left;
  }
  if (activeWasRemoved) {
    const replacement = container.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? container.querySelector<HTMLButtonElement>('button');
    if (replacement) replacement.focus({ preventScroll: true });
    else { container.tabIndex = -1; container.focus({ preventScroll: true }); }
  }
}
