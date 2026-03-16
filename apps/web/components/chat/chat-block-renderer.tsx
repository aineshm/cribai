'use client';

import { memo } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatBlock } from '@campusnest/types';
import { ChatListingCard } from './chat-listing-card';
import { ChatComparisonTable } from './chat-comparison-table';
import { ChatTourConfirmation } from './chat-tour-confirmation';
import { ChatLegalDisclaimer } from './chat-legal-disclaimer';
import { ChatToolIndicator } from './chat-tool-indicator';
import { ChatWebResult } from './chat-web-result';

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

export const ChatBlockRenderer = memo(function ChatBlockRenderer({ block, campusSlug }: ChatBlockRendererProps) {
  switch (block.type) {
    case 'text':
      return (
        <div className="prose prose-sm max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {block.content || '...'}
          </ReactMarkdown>
        </div>
      );

    case 'listing_card':
      return (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-1" role="list" aria-label="Search results">
          {block.listings.slice(0, 5).map((listing) => (
            <div key={listing.id} role="listitem" className="min-w-[240px] max-w-[240px] snap-start shrink-0">
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

    case 'web_result':
      return <ChatWebResult results={block.results} campusSlug={campusSlug} />;

    default:
      return assertUnreachable(block);
  }
});

export type { ChatBlock };
