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

  // AIN-74: expanded unit detail — new fields
  it('renders additional photo thumbnails when multiple photo_urls present', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    // UNITS[0] has 2 photo_urls; gallery should render both
    const imgs = screen.getAllByRole('img');
    expect(imgs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the listing description when present', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    expect(screen.getByText(/murphy-style bed nook/i)).toBeInTheDocument();
  });

  it('renders a source link pointing to source_url', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    const link = screen.getByRole('link', { name: /view original/i });
    expect(link).toHaveAttribute('href', UNITS[0]!.source_url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders move-in date when available_from is set', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    // available_from: '2026-08-23'
    expect(screen.getByText(/aug/i)).toBeInTheDocument();
  });

  it('renders saved date when saved_at is set', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    // saved_at: '2026-06-08T14:22:00Z'
    expect(screen.getByText(/jun/i)).toBeInTheDocument();
  });

  it('renders nearby places section label', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    expect(screen.getByText(/nearby/i)).toBeInTheDocument();
  });

  it('renders steering question section label', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    expect(screen.getByText(/question/i)).toBeInTheDocument();
  });

  it('omits description section when description is null', () => {
    const noDesc = { ...UNITS[0]!, description: null };
    render(<UnitDetailDrawer unit={noDesc} onClose={() => {}} />);
    // No description paragraph — heading still present
    expect(screen.getByRole('heading', { name: /S1/ })).toBeInTheDocument();
    expect(screen.queryByText(/murphy-style/i)).not.toBeInTheDocument();
  });

  it('omits source link when source_url is null', () => {
    const noUrl = { ...UNITS[0]!, source_url: null };
    render(<UnitDetailDrawer unit={noUrl} onClose={() => {}} />);
    expect(screen.queryByRole('link', { name: /view original/i })).not.toBeInTheDocument();
  });
});
