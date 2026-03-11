'use client';

import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  MapPin,
  Send,
  Edit3,
  Check,
  X,
  ArrowLeftRight,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fadeIn } from '@/lib/animations';
import type { ActionCard } from '@/lib/concierge-types';

function showMockToast(message: string) {
  toast.success(message);
}

function TourScheduledCard({ data }: { readonly data: Record<string, unknown> }) {
  const date = String(data.date ?? '');
  const time = String(data.time ?? '');
  const address = String(data.address ?? '');
  const parsedDate = new Date(date);
  const isValidDate = !Number.isNaN(parsedDate.getTime());

  return (
    <Card className="border-none bg-blue-50 ring-1 ring-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-blue-900">
          <Calendar className="size-4" />
          Tour Scheduled
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <Clock className="size-3.5" />
            <span>
              {isValidDate
                ? parsedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Date TBD'}{' '}
              at {time || 'Time TBD'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <MapPin className="size-3.5" />
            <span>{address}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => showMockToast('Added to calendar')}
          >
            <Calendar className="size-3.5" />
            Add to Calendar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => showMockToast('Reschedule request sent')}
          >
            Reschedule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DraftReadyCard({ data }: { readonly data: Record<string, unknown> }) {
  const preview = String(data.preview ?? '');
  const subject = String(data.subject ?? '');

  return (
    <Card className="border-none bg-amber-50 ring-1 ring-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-amber-900">
          <Edit3 className="size-4" />
          Draft Ready for Review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs font-medium text-amber-700">{subject}</p>
          <p className="mt-1 text-xs text-amber-800 leading-relaxed line-clamp-3">
            {preview}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-amber-600 text-white hover:bg-amber-700"
            onClick={() => showMockToast('Draft approved and sent')}
          >
            <Send className="size-3.5" />
            Approve & Send
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => showMockToast('Opening draft editor')}
          >
            <Edit3 className="size-3.5" />
            Edit Draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NegotiationUpdateCard({
  data,
}: {
  readonly data: Record<string, unknown>;
}) {
  const proposedPrice = Number(data.proposedPrice ?? 0);
  const counterPrice = Number(data.counterPrice ?? 0);
  const originalPrice = Number(data.originalPrice ?? 0);
  const extras = String(data.extras ?? '');

  return (
    <Card className="border-none bg-green-50 ring-1 ring-green-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-green-900">
          <DollarSign className="size-4" />
          Negotiation Update
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Your offer</p>
            <p className="text-lg font-semibold text-green-700">
              ${proposedPrice.toLocaleString()}
            </p>
          </div>
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Counter</p>
            <p className="text-lg font-semibold text-amber-600">
              ${counterPrice.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Original</p>
            <p className="text-sm text-muted-foreground line-through">
              ${originalPrice.toLocaleString()}
            </p>
          </div>
        </div>
        {extras && (
          <p className="text-xs text-green-700 italic">{extras}</p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => showMockToast('Counter-offer accepted')}
          >
            <Check className="size-3.5" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => showMockToast('Counter-offer form opening')}
          >
            <ArrowLeftRight className="size-3.5" />
            Counter
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:bg-red-50"
            onClick={() => showMockToast('Negotiation declined')}
          >
            <X className="size-3.5" />
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ComparisonListing {
  readonly name: string;
  readonly price: number;
  readonly distance: string;
  readonly highlight: string;
}

function ComparisonReadyCard({
  data,
}: {
  readonly data: Record<string, unknown>;
}) {
  const listings = (data.listings ?? []) as readonly ComparisonListing[];

  return (
    <Card className="border-none bg-purple-50 ring-1 ring-purple-200">
      <CardHeader>
        <CardTitle className="text-sm text-purple-900">
          Comparison Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {listings.map((listing) => (
          <div
            key={listing.name}
            className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-purple-900">
                {listing.name}
              </p>
              <p className="text-xs text-purple-600">{listing.distance}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">
                {listing.highlight}
              </Badge>
              <span className="text-sm font-semibold text-purple-900">
                ${listing.price.toLocaleString()}/mo
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface MissionActionCardProps {
  readonly actionCard: ActionCard;
}

export function MissionActionCard({ actionCard }: MissionActionCardProps) {
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate">
      {actionCard.type === 'tour_scheduled' && (
        <TourScheduledCard data={actionCard.data as Record<string, unknown>} />
      )}
      {actionCard.type === 'draft_ready' && (
        <DraftReadyCard data={actionCard.data as Record<string, unknown>} />
      )}
      {actionCard.type === 'negotiation_update' && (
        <NegotiationUpdateCard data={actionCard.data as Record<string, unknown>} />
      )}
      {actionCard.type === 'comparison_ready' && (
        <ComparisonReadyCard data={actionCard.data as Record<string, unknown>} />
      )}
    </motion.div>
  );
}
