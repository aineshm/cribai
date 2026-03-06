'use client';

import dynamic from 'next/dynamic';
import type { ChatBlock } from '@campusnest/types';
import { ChatListingCard } from './chat-listing-card';
import { ChatComparisonTable } from './chat-comparison-table';
import { ChatTourConfirmation } from './chat-tour-confirmation';
import { ChatLegalDisclaimer } from './chat-legal-disclaimer';
import { ChatToolIndicator } from './chat-tool-indicator';

const ChatMapBlock = dynamic(
  () => import('./chat-map-block').then((mod) => ({ default: mod.ChatMapBlock })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] animate-pulse rounded-lg bg-gray-100" />
    ),
  }
);

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled block type: ${(value as { type: string }).type}`);
}

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
            <div key={listing.id} role="listitem">
              <ChatListingCard
                listing={listing}
                campusSlug={campusSlug}
              />
            </div>
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

    case 'map':
      return <ChatMapBlock block={block} campusSlug={campusSlug} />;

    default:
      return assertUnreachable(block);
  }
}

export type { ChatBlock };
