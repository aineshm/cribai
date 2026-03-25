'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlusCircle, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@campusnest/supabase/client';

interface MissionLauncherProps {
  readonly searchParams: Record<string, string | string[] | undefined>;
}

type MissionType = 'housing_search' | 'listing_deep_dive' | 'sublease_post' | 'tour_outreach';

const VALID_INTENTS: readonly MissionType[] = ['housing_search', 'listing_deep_dive', 'sublease_post', 'tour_outreach'];

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function buildAutoGoal(intent: MissionType, fields: {
  bedrooms: string;
  budget: string;
  location: string;
  moveInDate: string;
}): string {
  if (intent === 'listing_deep_dive') return 'Deep dive analysis on a specific listing';
  if (intent === 'tour_outreach') return 'Schedule tours for listings I\'m interested in';
  if (intent === 'sublease_post') {
    const parts: string[] = ['Post sublease'];
    if (fields.location) parts.push(`at ${fields.location}`);
    if (fields.budget) parts.push(`$${fields.budget}/mo`);
    return parts.join(' — ');
  }

  // housing_search
  const parts: string[] = ['Find'];
  if (fields.bedrooms) parts.push(`${fields.bedrooms}-bedroom`);
  parts.push('apartments');
  if (fields.budget) parts.push(`under $${fields.budget}`);
  if (fields.location) parts.push(`near ${fields.location}`);
  if (fields.moveInDate) parts.push(`available by ${fields.moveInDate}`);
  return parts.join(' ');
}

const INPUT_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none w-full';

export function MissionLauncher({ searchParams }: MissionLauncherProps) {
  const router = useRouter();
  const hasLaunchParam = param(searchParams.launch) === 'true';

  const [expanded, setExpanded] = useState(hasLaunchParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawIntent = param(searchParams.intent);
  const [intent, setIntent] = useState<MissionType>(
    VALID_INTENTS.includes(rawIntent as MissionType) ? (rawIntent as MissionType) : 'housing_search',
  );
  const [budget, setBudget] = useState(param(searchParams.budget));
  const [bedrooms, setBedrooms] = useState(param(searchParams.bedrooms));
  const [location, setLocation] = useState(param(searchParams.location));
  const [moveInDate, setMoveInDate] = useState(param(searchParams.move_in_date));
  const [listingId, setListingId] = useState(param(searchParams.listing_id));
  const [goal, setGoal] = useState('');
  const goalTouchedRef = useRef(false);

  // Auto-generate goal text when fields change (unless user manually edited)
  useEffect(() => {
    if (!goalTouchedRef.current) {
      setGoal(buildAutoGoal(intent, { bedrooms, budget, location, moveInDate }));
    }
  }, [intent, bedrooms, budget, location, moveInDate]);

  const handleGoalChange = useCallback((value: string) => {
    goalTouchedRef.current = true;
    setGoal(value);
  }, []);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('sign_in_required');
        setLoading(false);
        return;
      }

      const intentLabel = intent.replace(/_/g, ' ');
      const title = intentLabel.charAt(0).toUpperCase() + intentLabel.slice(1);
      // Ensure goal is never empty — fall back to title
      const finalGoal = goal.trim() || title;

      const input = intent === 'housing_search'
        ? {
            // All fields optional — allows broad searches with no filters
            ...(budget ? { maxRent: Number(budget) } : {}),
            ...(bedrooms ? { bedrooms: Number(bedrooms) } : {}),
            ...(location ? { preferences: `near ${location}` } : {}),
            ...(moveInDate ? { moveInDate } : {}),
          }
        : intent === 'listing_deep_dive'
          ? { listingId }
          : intent === 'tour_outreach'
            ? {
                ...(location ? { preferences: location } : {}),
                ...(budget ? { maxRent: Number(budget) } : {}),
              }
            : intent === 'sublease_post'
              ? {
                  ...(location ? { address: location } : {}),
                  ...(bedrooms ? { bedrooms_total: Number(bedrooms), bedrooms_available: Number(bedrooms) } : {}),
                  ...(budget ? { rent_monthly: Number(budget) } : {}),
                }
              : {};

      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: intent,
          title,
          goal: finalGoal,
          campus_slug: 'uw-madison',
          input,
        }),
      });

      if (res.ok) {
        toast.success('Mission started! Your agent is on it.');
        router.replace('/messages');
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Failed to start mission. Please try again.');
      }
    } catch (err) {
      console.error('[MissionLauncher] submit failed:', err);
      setError('Failed to start mission. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [intent, budget, bedrooms, location, listingId, moveInDate, goal, router]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-800 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors w-full"
      >
        <PlusCircle className="size-4" />
        New Mission
      </button>
    );
  }

  const showHousingFields = intent === 'housing_search' || intent === 'sublease_post' || intent === 'tour_outreach';

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/30 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-red-700" />
          <h3 className="text-sm font-bold text-gray-900">Start a Mission</h3>
        </div>
        <button
          type="button"
          aria-label="Collapse mission form"
          onClick={() => setExpanded(false)}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="size-4 text-gray-500" />
        </button>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 col-span-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-600">Mission Type</span>
          <select
            value={intent}
            onChange={(e) => { setIntent(e.target.value as MissionType); goalTouchedRef.current = false; }}
            className={INPUT_CLASS}
          >
            <option value="housing_search">Housing Search</option>
            <option value="tour_outreach">Tour Outreach</option>
            <option value="listing_deep_dive">Listing Deep Dive</option>
            <option value="sublease_post">Post Sublease</option>
          </select>
        </label>

        {intent === 'listing_deep_dive' && (
          <label className="space-y-1 col-span-1 sm:col-span-2">
            <span className="text-xs font-medium text-gray-600">Listing ID (UUID)</span>
            <input
              type="text"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              placeholder="Paste listing UUID from the listing page URL"
              className={INPUT_CLASS}
            />
          </label>
        )}

        {/* Housing/sublease fields — all optional for broad searches */}
        {showHousingFields && (
          <>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">
                Max monthly rent <span className="text-gray-400">(optional)</span>
              </span>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g., 1200"
                className={INPUT_CLASS}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">
                Bedrooms <span className="text-gray-400">(optional)</span>
              </span>
              <input
                type="number"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                placeholder="e.g., 2"
                min={0}
                className={INPUT_CLASS}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">
                {intent === 'sublease_post' ? 'Address' : 'Location'} <span className="text-gray-400">(optional)</span>
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={intent === 'sublease_post' ? 'e.g., 535 W Johnson St' : 'e.g., near Engineering Hall'}
                className={INPUT_CLASS}
              />
            </label>

            {(intent === 'housing_search' || intent === 'tour_outreach') && (
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">
                  Move-in Date <span className="text-gray-400">(optional)</span>
                </span>
                <input
                  type="date"
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                  className={INPUT_CLASS}
                />
              </label>
            )}
          </>
        )}

        <label className="space-y-1 col-span-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-600">
            What should the agent do? <span className="text-gray-400">(optional — auto-generated from filters)</span>
          </span>
          <textarea
            value={goal}
            onChange={(e) => handleGoalChange(e.target.value)}
            rows={2}
            placeholder="Describe your search in your own words, or leave blank for a broad search"
            className={INPUT_CLASS + ' resize-none'}
          />
        </label>
      </div>

      {/* Error */}
      {error && error !== 'sign_in_required' && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Sign-in prompt */}
      {error === 'sign_in_required' && (
        <p className="text-sm text-gray-600">
          <a
            href="/login?returnTo=/messages"
            className="font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
          >
            Sign in
          </a>{' '}
          to start a mission.
        </p>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-red-800 hover:bg-red-900 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Starting...
          </>
        ) : (
          'Start Mission'
        )}
      </button>
    </div>
  );
}
