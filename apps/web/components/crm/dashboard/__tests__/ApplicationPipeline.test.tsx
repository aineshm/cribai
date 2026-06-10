import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ApplicationPipeline } from '../ApplicationPipeline';
import { UNITS, CRM_LIST } from '@/lib/crm/fixtures';

describe('ApplicationPipeline', () => {
  it('places units in their stage column', () => {
    render(<ApplicationPipeline units={UNITS} onOpen={() => {}} />);
    const applied = screen.getByRole('group', { name: /applied/i });
    expect(within(applied).getAllByRole('article').length).toBeGreaterThan(0);
  });

  it('renders all four stage columns as named groups', () => {
    render(<ApplicationPipeline units={UNITS} onOpen={() => {}} />);
    for (const name of [/saved/i, /toured/i, /applied/i, /decision/i]) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
  });

  it('shows document progress for an applied unit', () => {
    render(<ApplicationPipeline units={UNITS} onOpen={() => {}} />);
    // Langdon (applied) has 3/3 docs done.
    expect(screen.getByText(/3\/3 docs/i)).toBeInTheDocument();
  });

  it('resolves the "added by" avatar from the members prop (not fixtures)', () => {
    render(<ApplicationPipeline units={UNITS} members={CRM_LIST.members} onOpen={() => {}} />);
    // Maya added units in the fixtures → her avatar resolves from the prop.
    expect(screen.getAllByLabelText(/Added by Maya/i).length).toBeGreaterThan(0);
  });

  it('omits the "added by" avatar when the roster is empty', () => {
    render(<ApplicationPipeline units={UNITS} members={[]} onOpen={() => {}} />);
    expect(screen.queryByLabelText(/Added by/i)).not.toBeInTheDocument();
  });

  it('calls onOpen with the unit id when a card is activated', () => {
    const onOpen = vi.fn();
    render(<ApplicationPipeline units={UNITS} onOpen={onOpen} />);
    const applied = screen.getByRole('group', { name: /applied/i });
    const card = within(applied).getAllByRole('article')[0];
    expect(card).toBeDefined();
    card!.click();
    expect(onOpen).toHaveBeenCalledWith('crm_langdon_1brc');
  });
});
