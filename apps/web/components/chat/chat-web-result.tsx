'use client';

import Link from 'next/link';

interface WebResultItem {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly listingId: string | null;
}

interface ChatWebResultProps {
  readonly results: readonly WebResultItem[];
  readonly campusSlug: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function truncateSnippet(snippet: string, maxLength = 150): string {
  if (snippet.length <= maxLength) return snippet;
  return snippet.slice(0, maxLength).trimEnd() + '...';
}

export function ChatWebResult({ results, campusSlug }: ChatWebResultProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" role="list" aria-label="Web search results">
      {results.map((item) => (
        <div
          key={item.url}
          role="listitem"
          className="rounded-lg border border-[var(--surface-200)] p-3 transition-colors hover:border-[var(--primary-400)]"
        >
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--primary-600)] hover:underline"
          >
            {item.title}
          </a>
          <p className="mt-0.5 text-xs text-[var(--surface-400)]">{extractDomain(item.url)}</p>
          <p className="mt-1 text-xs text-[var(--surface-600)]">{truncateSnippet(item.snippet)}</p>
          {item.listingId != null && (
            <Link
              href={`/${campusSlug}/listings/${item.listingId}`}
              className="mt-1.5 inline-block text-xs text-[var(--primary-600)] hover:underline"
            >
              View in CampusNest
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
