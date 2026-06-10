import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UnitGrid } from '../UnitGrid';
import { UNITS, CRM_LIST } from '@/lib/crm/fixtures';

describe('UnitGrid', () => {
  it('renders one article per unit by default (All)', () => {
    render(<UnitGrid units={UNITS} onOpen={() => {}} />);
    expect(screen.getAllByRole('article').length).toBe(UNITS.length);
  });

  it('filters by status', () => {
    render(<UnitGrid units={UNITS} onOpen={() => {}} />);
    const all = screen.getAllByRole('article').length;
    fireEvent.click(screen.getByRole('tab', { name: /applied/i }));
    expect(screen.getAllByRole('article').length).toBeLessThanOrEqual(all);
  });

  it('Applied filter shows only the applied-stage unit', () => {
    render(<UnitGrid units={UNITS} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /applied/i }));
    expect(screen.getAllByRole('article').length).toBe(1);
    // The lone applied-stage unit is The Langdon · 1BR-C.
    expect(screen.getByRole('heading', { name: /1BR-C/i })).toBeInTheDocument();
  });

  it('exposes the filter tabs as a tablist', () => {
    render(<UnitGrid units={UNITS} onOpen={() => {}} />);
    for (const name of [/all/i, /saved/i, /toured/i, /applied/i, /declined/i]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('resolves the "added by" avatar from the members prop (not fixtures)', () => {
    render(<UnitGrid units={UNITS} members={CRM_LIST.members} onOpen={() => {}} />);
    // Maya added units in the fixtures; the All filter shows every unit, so her
    // avatar resolves from the prop.
    expect(screen.getAllByLabelText(/Added by Maya/i).length).toBeGreaterThan(0);
  });

  it('omits the "added by" avatar when no members are provided', () => {
    render(<UnitGrid units={UNITS} onOpen={() => {}} />);
    expect(screen.queryByLabelText(/Added by/i)).not.toBeInTheDocument();
  });

  it('forwards onOpen from a card', () => {
    const onOpen = vi.fn();
    render(<UnitGrid units={UNITS} onOpen={onOpen} />);
    // The first article's interactive SavedUnitCard (role="button") sits inside it.
    const firstCardButton = within(screen.getAllByRole('article')[0]!).getByRole('button');
    firstCardButton.click();
    expect(onOpen).toHaveBeenCalledWith(UNITS[0]!.id);
  });
});
