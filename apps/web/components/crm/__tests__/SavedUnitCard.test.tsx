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
});
