import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnitDetailDrawer } from '../UnitDetailDrawer';
import { UNITS } from '@/lib/crm/fixtures';

// ---------------------------------------------------------------------------
// Mock crmClient so async getAnalysis is fully controlled in tests.
// ---------------------------------------------------------------------------
vi.mock('@/lib/crm-client', () => ({
  crmClient: {
    getAnalysis: vi.fn(() => new Promise(() => { /* never resolves by default */ })),
  },
}));

// Import after mocking so we get the mocked version.
import { crmClient } from '@/lib/crm-client';
const mockGetAnalysis = vi.mocked(crmClient.getAnalysis);

// ---------------------------------------------------------------------------
// Mock fmtDate dependency via locale-stable data-testid approach.
// fmtDate hard-codes 'en-US' in the component — we verify date text via
// data-testid attributes added to the date spans to avoid flaky /aug/i matches.
// Instead we mock the module to get deterministic output.
// ---------------------------------------------------------------------------

describe('UnitDetailDrawer', () => {
  beforeEach(() => {
    // Default: getAnalysis never resolves (loading state).
    mockGetAnalysis.mockReturnValue(new Promise(() => { /* pending */ }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

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

  // Fix 5: deterministic date tests — scoped to element with data-testid.
  // We don't assert an exact date string because UTC-vs-local offset can shift
  // the day by ±1. Instead assert the month abbreviation within the scoped
  // element, which is unambiguous and locale-stable (fmtDate hard-codes en-US).
  it('renders move-in date when available_from is set', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    // available_from: '2026-08-23' → en-US → month is Aug regardless of TZ
    const moveInEl = screen.getByTestId('move-in-date');
    expect(moveInEl.textContent).toMatch(/\bAug\b/);
    // Scoped: does NOT match other text (saved-date shows Jun)
    expect(moveInEl.textContent).not.toMatch(/\bJun\b/);
  });

  it('renders saved date when saved_at is set', () => {
    render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
    // saved_at: '2026-06-08T14:22:00Z' → en-US → month is Jun regardless of TZ
    const savedAtEl = screen.getByTestId('saved-at-date');
    expect(savedAtEl.textContent).toMatch(/\bJun\b/);
    // Scoped: does NOT bleed into move-in (which shows Aug)
    expect(savedAtEl.textContent).not.toMatch(/\bAug\b/);
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

  // ---------------------------------------------------------------------------
  // Fix 2: Drawer a11y — aria-modal + Escape key handler
  // ---------------------------------------------------------------------------
  describe('a11y', () => {
    it('aside has aria-modal="true"', () => {
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
      const aside = screen.getByRole('complementary');
      expect(aside).toHaveAttribute('aria-modal', 'true');
    });

    it('pressing Escape calls onClose', () => {
      const onClose = vi.fn();
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={onClose} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking the scrim calls onClose (regression guard)', () => {
      const onClose = vi.fn();
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={onClose} />);
      // The scrim is the aria-hidden div before the aside
      const scrim = document.querySelector('[aria-hidden="true"]');
      expect(scrim).not.toBeNull();
      fireEvent.click(scrim!);
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Fix 4: Analysis tri-state — error state shows "No analysis yet" copy
  // ---------------------------------------------------------------------------
  describe('analysis tri-state', () => {
    it('shows loading hints while analysis is pending', () => {
      // mockGetAnalysis returns a never-resolving promise by default
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
      expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
    });

    it('shows "No analysis yet" when getAnalysis rejects — not a perpetual loader', async () => {
      mockGetAnalysis.mockRejectedValue(new Error('network error'));
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
      await waitFor(() => {
        // Error state renders "No analysis yet" in each of the 4 analysis blocks.
        const errorEls = screen.getAllByText(/no analysis yet/i);
        expect(errorEls.length).toBeGreaterThan(0);
      });
      // Loading text should be gone once error state is resolved
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });
});
