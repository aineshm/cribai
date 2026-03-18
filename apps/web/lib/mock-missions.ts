/**
 * CribAI AI Concierge — Mock Mission Data
 *
 * Sample missions across all types and statuses for UI development.
 */

import type { LegacyMission } from '@/lib/concierge-types';

export const mockMissions: readonly LegacyMission[] = [
  {
    id: 'mission-1',
    type: 'tour_booking',
    title: 'Book tour at Maple Ridge Apartments',
    status: 'scheduled',
    listingTitle: 'Maple Ridge Apartments — 2BR/1BA',
    createdAt: '2026-03-10T09:15:00Z',
    updatedAt: '2026-03-10T09:22:00Z',
    summary:
      'Successfully scheduled a tour at Maple Ridge Apartments for March 14th at 2:00 PM. The leasing office confirmed the appointment and will send a reminder the day before.',
    logs: [
      {
        timestamp: '2026-03-10T09:15:00Z',
        action: 'Mission started',
        detail: 'User requested tour booking for Maple Ridge Apartments',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T09:16:30Z',
        action: 'Checking availability',
        detail: 'Queried leasing office schedule for next 7 days',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T09:18:00Z',
        action: 'Found available slots',
        detail: 'Mar 14 at 2:00 PM, Mar 15 at 10:00 AM, Mar 16 at 3:00 PM',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T09:20:00Z',
        action: 'Selected best slot',
        detail: 'Chose Mar 14 at 2:00 PM based on user calendar availability',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T09:22:00Z',
        action: 'Tour confirmed',
        detail: 'Booking confirmed with leasing office. Confirmation #TR-4892',
        status: 'success',
      },
    ],
    actionCard: {
      type: 'tour_scheduled',
      data: {
        date: '2026-03-14',
        time: '2:00 PM',
        address: '425 Maple Ridge Dr, Unit 204',
        confirmationId: 'TR-4892',
      },
    },
  },
  {
    id: 'mission-2',
    type: 'lease_review',
    title: 'Review lease for University Commons',
    status: 'waiting_approval',
    listingTitle: 'University Commons — Studio',
    createdAt: '2026-03-09T14:30:00Z',
    updatedAt: '2026-03-09T15:05:00Z',
    summary:
      'Drafted a response to the landlord regarding the early termination clause. The lease has a standard 60-day notice period, but the proposed amendment reduces it to 30 days with a one-month penalty.',
    logs: [
      {
        timestamp: '2026-03-09T14:30:00Z',
        action: 'Mission started',
        detail: 'User requested review of University Commons lease agreement',
        status: 'success',
      },
      {
        timestamp: '2026-03-09T14:35:00Z',
        action: 'Analyzing lease document',
        detail: 'Parsed 12-page lease agreement, identified 8 key clauses',
        status: 'success',
      },
      {
        timestamp: '2026-03-09T14:42:00Z',
        action: 'Flagged concerns',
        detail:
          'Early termination clause requires 60-day notice + 2-month penalty',
        status: 'success',
      },
      {
        timestamp: '2026-03-09T14:55:00Z',
        action: 'Drafting response',
        detail: 'Composed counter-proposal for early termination terms',
        status: 'success',
      },
      {
        timestamp: '2026-03-09T15:05:00Z',
        action: 'Awaiting approval',
        detail: 'Draft ready for your review before sending to landlord',
        status: 'pending',
      },
    ],
    actionCard: {
      type: 'draft_ready',
      data: {
        preview:
          'Dear Property Management, I would like to propose an amendment to the early termination clause (Section 8.2) of the lease agreement. Specifically, I request reducing the notice period to 30 days with a one-month rent penalty instead of the current 60-day notice with two-month penalty...',
        recipient: 'University Commons Property Management',
        subject: 'Lease Amendment Request — Early Termination Clause',
      },
    },
  },
  {
    id: 'mission-3',
    type: 'price_negotiation',
    title: 'Negotiate rent for Oakwood Terrace',
    status: 'active',
    listingTitle: 'Oakwood Terrace — 1BR/1BA',
    createdAt: '2026-03-10T08:00:00Z',
    updatedAt: '2026-03-10T10:30:00Z',
    summary:
      'Currently negotiating rent reduction for Oakwood Terrace. Comparable listings in the area average $1,150/mo — the listing is priced at $1,350/mo. Sent initial offer of $1,200/mo; landlord countered at $1,300/mo.',
    logs: [
      {
        timestamp: '2026-03-10T08:00:00Z',
        action: 'Mission started',
        detail: 'User requested rent negotiation for Oakwood Terrace ($1,350/mo)',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T08:15:00Z',
        action: 'Market analysis',
        detail:
          'Analyzed 12 comparable listings within 0.5mi. Average: $1,150/mo',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T08:30:00Z',
        action: 'Sent initial offer',
        detail: 'Proposed $1,200/mo with 12-month lease commitment',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T09:45:00Z',
        action: 'Landlord countered',
        detail: 'Counter-offer received: $1,300/mo with free parking',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T10:30:00Z',
        action: 'Preparing response',
        detail: 'Analyzing counter-offer and preparing next negotiation step',
        status: 'pending',
      },
    ],
    actionCard: {
      type: 'negotiation_update',
      data: {
        proposedPrice: 1200,
        counterPrice: 1300,
        originalPrice: 1350,
        extras: 'Free parking included in counter-offer',
      },
    },
  },
  {
    id: 'mission-4',
    type: 'listing_comparison',
    title: 'Compare top 3 listings near campus',
    status: 'completed',
    listingTitle: 'Multiple Listings',
    createdAt: '2026-03-08T16:00:00Z',
    updatedAt: '2026-03-08T16:25:00Z',
    summary:
      'Completed comparison of your top 3 saved listings. Maple Ridge offers the best value at $1,100/mo with in-unit laundry. University Commons is closest to campus (0.2mi) but $200/mo more. Oakwood Terrace has the newest renovations.',
    logs: [
      {
        timestamp: '2026-03-08T16:00:00Z',
        action: 'Mission started',
        detail: 'User requested comparison of top 3 saved listings',
        status: 'success',
      },
      {
        timestamp: '2026-03-08T16:05:00Z',
        action: 'Gathering listing data',
        detail: 'Retrieved details for 3 listings from saved collection',
        status: 'success',
      },
      {
        timestamp: '2026-03-08T16:12:00Z',
        action: 'Running analysis',
        detail:
          'Compared price, distance, amenities, fairness score, and reviews',
        status: 'success',
      },
      {
        timestamp: '2026-03-08T16:25:00Z',
        action: 'Comparison complete',
        detail: 'Generated side-by-side comparison with recommendations',
        status: 'success',
      },
    ],
    actionCard: {
      type: 'comparison_ready',
      data: {
        listings: [
          {
            name: 'Maple Ridge Apartments',
            price: 1100,
            distance: '0.8 mi',
            highlight: 'Best value',
          },
          {
            name: 'University Commons',
            price: 1300,
            distance: '0.2 mi',
            highlight: 'Closest to campus',
          },
          {
            name: 'Oakwood Terrace',
            price: 1350,
            distance: '0.5 mi',
            highlight: 'Newest renovations',
          },
        ],
      },
    },
  },
  {
    id: 'mission-5',
    type: 'landlord_outreach',
    title: 'Contact landlord about pet policy',
    status: 'failed',
    listingTitle: 'Pine Street Lofts — 2BR/2BA',
    createdAt: '2026-03-07T11:00:00Z',
    updatedAt: '2026-03-07T11:45:00Z',
    summary:
      'Unable to reach the landlord for Pine Street Lofts. After 3 contact attempts via email and phone, no response was received. The listing may be inactive or the contact information outdated.',
    logs: [
      {
        timestamp: '2026-03-07T11:00:00Z',
        action: 'Mission started',
        detail: 'User requested landlord contact about pet policy',
        status: 'success',
      },
      {
        timestamp: '2026-03-07T11:10:00Z',
        action: 'First contact attempt',
        detail: 'Sent email inquiry to listed contact address',
        status: 'success',
      },
      {
        timestamp: '2026-03-07T11:25:00Z',
        action: 'Second contact attempt',
        detail: 'Called listed phone number — no answer, left voicemail',
        status: 'success',
      },
      {
        timestamp: '2026-03-07T11:40:00Z',
        action: 'Third contact attempt',
        detail: 'Sent follow-up email with alternative contact request',
        status: 'success',
      },
      {
        timestamp: '2026-03-07T11:45:00Z',
        action: 'Mission failed',
        detail:
          'No response after 3 attempts. Contact information may be outdated.',
        status: 'error',
      },
    ],
  },
  {
    id: 'mission-6',
    type: 'tour_booking',
    title: 'Book tour at Elm Street Studios',
    status: 'active',
    listingTitle: 'Elm Street Studios — Studio',
    createdAt: '2026-03-10T10:45:00Z',
    updatedAt: '2026-03-10T10:50:00Z',
    summary:
      'Currently checking availability for Elm Street Studios. The leasing office opens at 9 AM — querying their scheduling system now.',
    logs: [
      {
        timestamp: '2026-03-10T10:45:00Z',
        action: 'Mission started',
        detail: 'User requested tour booking for Elm Street Studios',
        status: 'success',
      },
      {
        timestamp: '2026-03-10T10:50:00Z',
        action: 'Checking availability',
        detail: 'Querying leasing office schedule...',
        status: 'pending',
      },
    ],
  },
] as const;
