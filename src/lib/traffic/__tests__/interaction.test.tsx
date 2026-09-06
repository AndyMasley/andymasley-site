import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TrafficComparison from '@/components/traffic/TrafficComparison';

describe('traffic comparison controls', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders all three sections together, with casualty units and no mode switch', () => {
    render(<TrafficComparison />);
    expect(screen.getByRole('heading', { name: 'People killed' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'People injured' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Animals' })).toBeTruthy();
    expect(screen.getByText('≈24,900')).toBeTruthy();
    expect(screen.getByText('≈1.64 million')).toBeTruthy();
    expect(screen.getByText('≥ 83')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('link', { name: 'Skip to animals ↓' }).getAttribute('href')).toBe('#animals');
  });

  it('separates historical animal context and unresolved cases from the casualty minimum', () => {
    render(<TrafficComparison />);
    expect(screen.getByText('The national toll is not counted.')).toBeTruthy();
    expect(screen.getByText('A 2014 U.S. estimate, for birds alone')).toBeTruthy();
    expect(screen.getByText('5 injury reports without a headcount')).toBeTruthy();
    expect(screen.getByText('raccoon · outcome unknown')).toBeTruthy();
    expect(screen.getByText('deer · outcome unknown')).toBeTruthy();
    expect(screen.getByText('duck · killed')).toBeTruthy();
  });

  it('keeps all accounts in normal flow if canvas is unavailable, including count evidence', () => {
    const { container } = render(<TrafficComparison />);
    expect(container.querySelector('.has-canvas')).toBeNull();
    for (const plot of container.querySelectorAll<HTMLElement>('.casualty-plot')) {
      expect(plot.style.height).toBe('');
    }
    expect(container.querySelector('#case-30270-13543 .case-quote')?.textContent).toBe('A passenger in the Waymo AV alleged a minor injury.');
    expect(container.querySelectorAll('#injuries .casualty-case')).toHaveLength(66);
  });
});
