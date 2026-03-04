'use client';

import { ChatListingCard } from './chat-listing-card';
import { ChatComparisonTable } from './chat-comparison-table';
import { ChatTourConfirmation } from './chat-tour-confirmation';
import { ChatLegalDisclaimer } from './chat-legal-disclaimer';
import { ChatToolIndicator } from './chat-tool-indicator';

// Inline block types to avoid import issues before integration
interface TextBlock { readonly type: 'text'; readonly content: string }
interface ListingCardBlock { readonly type: 'listing_card'; readonly listings: readonly ListingSummary[] }
interface ComparisonBlock { readonly type: 'comparison'; readonly listings: readonly ListingSummary[] }
interface TourConfirmationBlock { readonly type: 'tour_confirmation'; readonly tourRequestId: string; readonly listingAddress: string; readonly status: string }
interface LegalDisclaimerBlock { readonly type: 'legal_disclaimer'; readonly term: string; readonly explanation: string; readonly disclaimer: string }
interface ToolLoadingBlock { readonly type: 'tool_loading'; readonly toolName: string }

interface ListingSummary {
  readonly id: string;
  readonly address: string;
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly fairnessScore: number | null;
  readonly trueCostTotal: number | null;
  readonly amenities: readonly string[];
  readonly campusSlug?: string;
}

type ChatBlock =
  | TextBlock
  | ListingCardBlock
  | ComparisonBlock
  | TourConfirmationBlock
  | LegalDisclaimerBlock
  | ToolLoadingBlock;

interface ChatBlockRendererProps {
  readonly block: ChatBlock;
  readonly campusSlug: string;
}

export function ChatBlockRenderer({ block, campusSlug }: ChatBlockRendererProps) {
  switch (block.type) {
    case 'text':
      return (
        <p className="whitespace-pre-wrap text-sm">{block.content || '...'}</p>
      );

    case 'listing_card':
      return (
        <div className="grid gap-2 sm:grid-cols-2" role="list" aria-label="Search results">
          {block.listings.slice(0, 5).map((listing) => (
            <ChatListingCard
              key={listing.id}
              listing={listing}
              campusSlug={campusSlug}
            />
          ))}
        </div>
      );

    case 'comparison':
      return (
        <ChatComparisonTable
          listings={block.listings}
          campusSlug={campusSlug}
        />
      );

    case 'tour_confirmation':
      return (
        <ChatTourConfirmation
          tourRequestId={block.tourRequestId}
          listingAddress={block.listingAddress}
          status={block.status}
        />
      );

    case 'legal_disclaimer':
      return (
        <ChatLegalDisclaimer
          term={block.term}
          explanation={block.explanation}
          disclaimer={block.disclaimer}
        />
      );

    case 'tool_loading':
      return <ChatToolIndicator toolName={block.toolName} />;

    default:
      return null;
  }
}

export type { ChatBlock };
