import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TrafficComparison from '@/components/traffic/TrafficComparison';

describe('traffic comparison controls', () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('only models missing 2026 injuries after the reader selects the illustration', () => {
    render(<TrafficComparison />);
    fireEvent.click(screen.getByRole('button', { name: 'People injured' }));
    expect(screen.getByText('2026 total unavailable')).toBeTruthy();
    expect(screen.getByText('injury-crash reports, not injured people')).toBeTruthy();
    expect(screen.queryByText('≈1.64 million')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('≈1.64 million')).toBeTruthy();
    expect(screen.getByText('64')).toBeTruthy();
    expect(screen.queryByText('2026 total unavailable')).toBeNull();
  });

  it('includes animal unknowns without extrapolating a current-year animal count', () => {
    render(<TrafficComparison />);
    fireEvent.click(screen.getByRole('button', { name: 'Animals' }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText('≥ 3')).toBeTruthy();
    expect(screen.getByText('raccoon · outcome unknown')).toBeTruthy();
    expect(screen.getByText('deer · outcome unknown')).toBeTruthy();
    expect(screen.getByText('duck · killed')).toBeTruthy();
  });
});
