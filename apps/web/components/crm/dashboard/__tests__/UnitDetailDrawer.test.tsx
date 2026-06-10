import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UnitDetailDrawer } from '../UnitDetailDrawer';
import { UNITS } from '@/lib/crm/fixtures';

describe('UnitDetailDrawer', () => {
  it('shows the unit when open', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /S1/ })).toBeInTheDocument();
  });

  it('renders editable rent / status / notes synchronously', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    expect(screen.getByLabelText(/rent/i)).toHaveValue(UNITS[0]!.rent);
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it('shows the application document checklist', () => {
    render(<UnitDetailDrawer unit={UNITS[3]!} onClose={() => {}} />);
    // Langdon: 3 docs all done.
    expect(screen.getByText(/photo id/i)).toBeInTheDocument();
  });

  it('renders nothing when null', () => {
    const { container } = render(<UnitDetailDrawer unit={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onClose from the close control', () => {
    const onClose = vi.fn();
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
