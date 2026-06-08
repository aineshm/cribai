import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SavedUnitCard } from '../SavedUnitCard';
import { UNITS } from '@/lib/crm/fixtures';

describe('SavedUnitCard', () => {
  it('leads with the unit, shows building as context', () => {
    render(<SavedUnitCard unit={UNITS[0]!} />);
    expect(screen.getByText(/S1/)).toBeInTheDocument();
    expect(screen.getByText(/Chapter at Madison/i)).toBeInTheDocument();
    expect(screen.getByText(/395\s*sq/i)).toBeInTheDocument();
  });
});
