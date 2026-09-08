// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DriveEngine, RoadGraph } from '../engine';
import { updateChoiceControls } from '../choice-controls';

describe('stable accessible branch controls', () => {
  it('retains the focused DOM node when selection changes and moves focus only if that branch disappears', () => {
    const graph = new RoadGraph({ edges: [
      { id: 0, from: 0, to: 1, points: [[0, -100, 0], [0, 0, 0]] },
      { id: 1, from: 1, to: 2, points: [[0, 0, 0], [-100, 0, 0]], name: 'MEMORIAL BEACH DRIVE' },
      { id: 2, from: 1, to: 3, points: [[0, 0, 0], [0, 100, 0]], name: 'MAIN STREET' },
    ] });
    const engine = new DriveEngine(graph), container = document.createElement('div'); document.body.append(container);
    updateChoiceControls(container, graph, engine.nextJunction());
    const first = container.querySelector<HTMLButtonElement>('[data-edge="1"]')!; first.focus();
    engine.queueChoice(1); updateChoiceControls(container, graph, engine.nextJunction());
    expect(container.querySelector('[data-edge="1"]')).toBe(first); expect(document.activeElement).toBe(first); expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(first.textContent).toContain('Memorial Beach Drive');
    const next = engine.nextJunction()!; next.choices = next.choices.filter(choice => choice.edgeId !== 1); next.selected = next.choices[0];
    updateChoiceControls(container, graph, next); expect(document.activeElement).toBe(container.querySelector('[data-edge="2"]'));
    updateChoiceControls(container, graph, null); expect(document.activeElement).toBe(container); container.remove();
  });
});
