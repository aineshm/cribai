import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SavedUnitCard } from '../SavedUnitCard';
import { UNITS, CRM_LIST } from '@/lib/crm/fixtures';

const heroAddedBy = CRM_LIST.members.find((m) => m.id === UNITS[0]!._proposed.addedBy)!;

describe('SavedUnitCard', () => {
  it('leads with the unit, shows building as context', () => {
    render(<SavedUnitCard unit={UNITS[0]!} />);
    expect(screen.getByText(/S1/)).toBeInTheDocument();
    expect(screen.getByText(/Chapter at Madison/i)).toBeInTheDocument();
    expect(screen.getByText(/395\s*sq/i)).toBeInTheDocument();
  });

  it('renders the resolved "added by" member name + initials (not the id)', () => {
    render(<SavedUnitCard unit={UNITS[0]!} addedByMember={heroAddedBy} />);
    // usr_badger resolves to Ainesh / AM — never "BA" / "badger".
    expect(screen.getByText(/added by Ainesh/i)).toBeInTheDocument();
    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(screen.queryByText(/badger/i)).not.toBeInTheDocument();
  });

  it('omits the "added by" line when no member is resolved', () => {
    render(<SavedUnitCard unit={UNITS[0]!} />);
    expect(screen.queryByText(/added by/i)).not.toBeInTheDocument();
  });

  // AIN-83 — honest "from" pricing for a building-page save whose rent is
  // the cheapest-plan price, not one unit's actual rent.
  describe('"from" pricing (AIN-83)', () => {
    it('prefixes rent with "from" when priceIsFrom is true', () => {
      const unit = { ...UNITS[0]!, priceIsFrom: true };
      const { container } = render(<SavedUnitCard unit={unit} />);
      expect(screen.getByText(/^from/i)).toBeInTheDocument();
      expect(container.textContent).toMatch(/from\s*\$1,495/i);
    });

    it('does NOT show "from" when priceIsFrom is false (a real unit-level save)', () => {
      const unit = { ...UNITS[0]!, priceIsFrom: false };
      render(<SavedUnitCard unit={unit} />);
      expect(screen.queryByText(/^from/i)).not.toBeInTheDocument();
    });
  });

  // AIN-98 — "you viewed Unit X — $Y" line for the most recently viewed unit.
  describe('units viewed (AIN-98)', () => {
    it('shows a "you viewed" line with the latest unit_number and price when unitsOfInterest is non-empty', () => {
      const unit = {
        ...UNITS[0]!,
        unitsOfInterest: [
          { zpid: '1', unit_number: 'Unit 101', plan_name: 'S1', price: 1500, viewed_at: '2026-07-01T00:00:00.000Z' },
          { zpid: '2', unit_number: 'Unit 504', plan_name: 'A2', price: 1800, viewed_at: '2026-07-18T07:00:00.000Z' },
        ],
      };
      render(<SavedUnitCard unit={unit} />);
      expect(screen.getByText(/you viewed/i)).toBeInTheDocument();
      // The LATEST entry (Unit 504 / $1,800), not the first.
      expect(screen.getByText(/Unit 504/)).toBeInTheDocument();
      expect(screen.getByText(/1,800/)).toBeInTheDocument();
      expect(screen.queryByText(/Unit 101/)).not.toBeInTheDocument();
    });

    it('omits the "you viewed" line entirely when unitsOfInterest is empty', () => {
      const unit = { ...UNITS[0]!, unitsOfInterest: [] };
      render(<SavedUnitCard unit={unit} />);
      expect(screen.queryByText(/you viewed/i)).not.toBeInTheDocument();
    });

    it('escapes/renders a hostile unit_number as inert text (React text-node escaping, no injection)', () => {
      const unit = {
        ...UNITS[0]!,
        unitsOfInterest: [
          {
            zpid: '1',
            unit_number: '<script>alert(1)</script>',
            plan_name: null,
            price: 1200,
            viewed_at: '2026-07-01T00:00:00.000Z',
          },
        ],
      };
      const { container } = render(<SavedUnitCard unit={unit} />);
      expect(container.querySelector('script')).toBeNull();
      expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    });
  });
});
