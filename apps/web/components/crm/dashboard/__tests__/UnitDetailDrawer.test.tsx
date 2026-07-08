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

  // ---------------------------------------------------------------------------
  // AIN-83: read-only "Floor plans" section — plan list for a building-page
  // save. Absent entirely for legacy rows / single-unit saves with no plans.
  // ---------------------------------------------------------------------------
  describe('floor plans section (AIN-83)', () => {
    const FLOOR_PLANS = [
      { name: 'A11', bedrooms: 1, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 799, availability: null },
      { name: 'S1', bedrooms: 0, bathrooms: 1, rent_min: 1825, rent_max: 1825, sqft: 547, availability: '2026-08-15' },
    ];

    it('renders nothing for a legacy row with no floor plans', () => {
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
      expect(screen.queryByText(/floor plans/i)).not.toBeInTheDocument();
    });

    it('renders the "Floor plans" section label when plans are present', () => {
      const unit = { ...UNITS[0]!, floorPlans: FLOOR_PLANS };
      render(<UnitDetailDrawer unit={unit} onClose={() => {}} />);
      expect(screen.getByText(/floor plans/i)).toBeInTheDocument();
    });

    it('renders one row per plan with name, beds/baths, price range, and sqft', () => {
      const unit = { ...UNITS[0]!, floorPlans: FLOOR_PLANS };
      const { container } = render(<UnitDetailDrawer unit={unit} onClose={() => {}} />);
      expect(screen.getByText('A11')).toBeInTheDocument();
      expect(screen.getByText('S1')).toBeInTheDocument();
      expect(container.textContent).toMatch(/\$1,819\s*[–-]\s*\$2,118/);
      expect(container.textContent).toMatch(/799/);
      expect(container.textContent).toMatch(/547/);
    });

    it('renders availability when present, omits it when null (no fabricated text)', () => {
      const unit = { ...UNITS[0]!, floorPlans: FLOOR_PLANS };
      render(<UnitDetailDrawer unit={unit} onClose={() => {}} />);
      // S1 has an availability date — it must render.
      const s1Row = screen.getByText('S1').closest('div');
      expect(s1Row?.textContent).toContain('2026-08-15');
      // A11 has availability: null — its row must show NO date-like text
      // (no fabricated availability), scoped so S1's date doesn't leak in.
      const a11Row = screen.getByText('A11').closest('div');
      expect(a11Row?.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('renders plan text as plain escaped text, not raw markup (XSS guard)', () => {
      const unit = {
        ...UNITS[0]!,
        floorPlans: [{ name: '<img src=x onerror=alert(1)>', bedrooms: 1, bathrooms: 1, rent_min: 900, rent_max: null, sqft: null, availability: null }],
      };
      const { container } = render(<UnitDetailDrawer unit={unit} onClose={() => {}} />);
      expect(container.querySelector('img[onerror]')).toBeNull();
      expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // AIN-98: read-only "Units you viewed" block — every accumulated
  // units_of_interest entry, next to Floor plans. Mirrors that section's own
  // absence/XSS-guard tests.
  // ---------------------------------------------------------------------------
  describe('units you viewed section (AIN-98)', () => {
    const UNITS_VIEWED = [
      { zpid: '1', unit_number: 'Unit 101', plan_name: 'S1', price: 1500, bedrooms: 0, bathrooms: 1, sqft: 400, floor: null, availability: '2026-08-01', viewed_at: '2026-07-01T00:00:00.000Z' },
      { zpid: '2', unit_number: 'Unit 504', plan_name: 'A2', price: 1800, bedrooms: 1, bathrooms: 1, sqft: 650, floor: null, availability: null, viewed_at: '2026-07-18T07:00:00.000Z' },
    ];

    it('renders nothing for a legacy row with no units viewed', () => {
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
      expect(screen.queryByText(/units you viewed/i)).not.toBeInTheDocument();
    });

    it('renders the "Units you viewed" section label when entries are present', () => {
      const unit = { ...UNITS[0]!, unitsOfInterest: UNITS_VIEWED };
      render(<UnitDetailDrawer unit={unit} onClose={() => {}} />);
      expect(screen.getByText(/units you viewed/i)).toBeInTheDocument();
    });

    it('renders one row per unit with unit number and price', () => {
      const unit = { ...UNITS[0]!, unitsOfInterest: UNITS_VIEWED };
      const { container } = render(<UnitDetailDrawer unit={unit} onClose={() => {}} />);
      expect(screen.getByText(/Unit 101/)).toBeInTheDocument();
      expect(screen.getByText(/Unit 504/)).toBeInTheDocument();
      expect(container.textContent).toMatch(/1,500/);
      expect(container.textContent).toMatch(/1,800/);
    });

    it('renders plain escaped text, not raw markup (XSS guard)', () => {
      const unit = {
        ...UNITS[0]!,
        unitsOfInterest: [
          { zpid: '1', unit_number: '<img src=x onerror=alert(1)>', plan_name: null, price: 900, bedrooms: null, bathrooms: null, sqft: null, floor: null, availability: null, viewed_at: '2026-07-01T00:00:00.000Z' },
        ],
      };
      const { container } = render(<UnitDetailDrawer unit={unit} onClose={() => {}} />);
      expect(container.querySelector('img[onerror]')).toBeNull();
      expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    });
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

  // ---------------------------------------------------------------------------
  // AIN-95: inline nickname rename (pencil → input → PATCH → refetch)
  // ---------------------------------------------------------------------------
  describe('inline rename', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      mockFetch.mockReset();
      vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function jsonResponse(body: unknown, status = 200): Response {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }

    it('renders an edit affordance next to the display name', () => {
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
      expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument();
    });

    it('clicking the edit affordance swaps to a text input prefilled with the current name', () => {
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /rename/i }));
      const input = screen.getByRole('textbox', { name: /listing name/i });
      expect(input).toHaveValue(UNITS[0]!.nickname ?? UNITS[0]!._proposed.unit.building);
    });

    it('saving calls PATCH /api/crm/listings/:id with the nickname body and exits edit mode', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ listing: { id: UNITS[0]!.id, nickname: 'The Regent gem' } }),
      );
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('button', { name: /rename/i }));
      const input = screen.getByRole('textbox', { name: /listing name/i });
      fireEvent.change(input, { target: { value: 'The Regent gem' } });
      fireEvent.click(screen.getByRole('button', { name: /save name/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/crm/listings/${UNITS[0]!.id}`,
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ nickname: 'The Regent gem' }),
          }),
        );
      });

      await waitFor(() => {
        expect(screen.queryByRole('textbox', { name: /listing name/i })).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('listing-display-name')).toHaveTextContent('The Regent gem');
    });

    it('disables the save control while the request is in flight', async () => {
      let resolveFetch!: (value: Response) => void;
      mockFetch.mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
      );
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('button', { name: /rename/i }));
      fireEvent.click(screen.getByRole('button', { name: /save name/i }));

      expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled();

      resolveFetch(jsonResponse({ listing: { id: UNITS[0]!.id, nickname: 'x' } }));
      await waitFor(() => {
        expect(screen.queryByRole('textbox', { name: /listing name/i })).not.toBeInTheDocument();
      });
    });

    it('Escape while editing restores the original display value and exits edit mode without closing the drawer', () => {
      const onClose = vi.fn();
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: /rename/i }));
      const input = screen.getByRole('textbox', { name: /listing name/i });
      fireEvent.change(input, { target: { value: 'Some draft text' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByRole('textbox', { name: /listing name/i })).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('listing-display-name')).toHaveTextContent(
        UNITS[0]!.nickname ?? UNITS[0]!._proposed.unit.building,
      );
    });

    it('Cancel button restores the original display value and exits edit mode', () => {
      render(<UnitDetailDrawer unit={UNITS[0]!} onClose={() => {}} />);

      fireEvent.click(screen.getByRole('button', { name: /rename/i }));
      const input = screen.getByRole('textbox', { name: /listing name/i });
      fireEvent.change(input, { target: { value: 'Some draft text' } });
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('textbox', { name: /listing name/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('listing-display-name')).toHaveTextContent(
        UNITS[0]!.nickname ?? UNITS[0]!._proposed.unit.building,
      );
    });
  });
});
