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
});
