/**
 * mission-types.test.ts — Zod schema validation tests for the mission type system.
 *
 * Verifies that all enum schemas accept valid values and reject invalid ones,
 * that table schemas parse valid DB rows, reject extra/missing fields,
 * and that nullable fields behave correctly. Uses strict() schemas so
 * any unrecognised fields (e.g. mock-only camelCase fields) cause failures.
 */

import { describe, it, expect } from 'vitest';
import {
  missionStatusSchema,
  missionTypeSchema,
  missionSchema,
  missionLogSchema,
  missionDraftSchema,
  missionSteeringSchema,
  draftTypeSchema,
  userDecisionSchema,
  executionLogStatusSchema,
} from '../mission';
import type {
  Mission,
  MissionLog,
  MissionDraft,
  MissionSteering,
  MissionStatus,
  MissionType,
  DraftType,
  UserDecision,
} from '../mission';

// ─── MissionStatus enum ──────────────────────────────────────────

describe('missionStatusSchema', () => {
  const ALL_STATUSES: readonly MissionStatus[] = [
    'queued',
    'pending',
    'running',
    'retrying',
    'active',
    'paused',
    'waiting_approval',
    'scheduled',
    'completed',
    'failed',
    'cancelled',
    'expired',
  ];

  it('accepts all valid statuses', () => {
    for (const status of ALL_STATUSES) {
      expect(missionStatusSchema.parse(status)).toBe(status);
    }
  });

  it('includes executor statuses (pending, running)', () => {
    expect(missionStatusSchema.parse('pending')).toBe('pending');
    expect(missionStatusSchema.parse('running')).toBe('running');
  });

  it('rejects invalid status', () => {
    expect(() => missionStatusSchema.parse('unknown')).toThrow();
  });

  it('has exactly 12 members', () => {
    expect(missionStatusSchema.options).toHaveLength(12);
  });
});

// ─── MissionType enum ──────────────────────────────────────────

describe('missionTypeSchema', () => {
  const ALL_TYPES: readonly MissionType[] = [
    'tour_booking',
    'lease_review',
    'landlord_outreach',
    'price_negotiation',
    'listing_comparison',
    'housing_search',
    'tour_outreach',
    'listing_deep_dive',
    'sublease_post',
  ];

  it('accepts all valid types', () => {
    for (const type of ALL_TYPES) {
      expect(missionTypeSchema.parse(type)).toBe(type);
    }
  });

  it('has exactly 9 members', () => {
    expect(missionTypeSchema.options).toHaveLength(9);
  });

  it('rejects invalid type', () => {
    expect(() => missionTypeSchema.parse('invalid_type')).toThrow();
  });
});

// ─── DraftType enum ──────────────────────────────────────────

describe('draftTypeSchema', () => {
  const ALL_DRAFT_TYPES: readonly DraftType[] = [
    'tour_schedule',
    'email_draft',
    'negotiation_offer',
    'search_report',
  ];

  it('accepts all 4 valid draft types', () => {
    for (const dt of ALL_DRAFT_TYPES) {
      expect(draftTypeSchema.parse(dt)).toBe(dt);
    }
  });

  it('has exactly 4 members', () => {
    expect(draftTypeSchema.options).toHaveLength(4);
  });
});

// ─── UserDecision enum ──────────────────────────────────────────

describe('userDecisionSchema', () => {
  const ALL_DECISIONS: readonly UserDecision[] = [
    'approved',
    'edited',
    'rejected',
  ];

  it('accepts all 3 valid decisions', () => {
    for (const d of ALL_DECISIONS) {
      expect(userDecisionSchema.parse(d)).toBe(d);
    }
  });

  it('has exactly 3 members', () => {
    expect(userDecisionSchema.options).toHaveLength(3);
  });
});

// ─── Mission schema ──────────────────────────────────────────

describe('missionSchema', () => {
  const validMission = {
    id: '11111111-1111-1111-1111-111111111111',
    user_id: '22222222-2222-2222-2222-222222222222',
    type: 'tour_booking',
    title: 'Book tour at Maple Ridge',
    status: 'active',
    goal: 'Schedule a tour for next week',
    listing_id: '33333333-3333-3333-3333-333333333333',
    idempotency_key: 'key-123',
    input: { preferred_date: '2026-03-14' },
    state: {},
    result: null,
    current_step_index: 0,
    attempt_count: 0,
    leased_until: null,
    last_heartbeat_at: null,
    last_error: null,
    step_attempts: {},
    campus_id: '44444444-4444-4444-4444-444444444444',
    expires_at: '2026-03-11T09:00:00Z',
    created_at: '2026-03-10T09:00:00Z',
    updated_at: '2026-03-10T09:00:00Z',
  };

  it('accepts a valid mission with snake_case fields', () => {
    const result = missionSchema.parse(validMission);
    expect(result.user_id).toBe(validMission.user_id);
    expect(result.listing_id).toBe(validMission.listing_id);
    expect(result.idempotency_key).toBe(validMission.idempotency_key);
    expect(result.expires_at).toBe(validMission.expires_at);
    expect(result.created_at).toBe(validMission.created_at);
    expect(result.updated_at).toBe(validMission.updated_at);
  });

  it('accepts null for nullable fields', () => {
    const result = missionSchema.parse({
      ...validMission,
      listing_id: null,
      idempotency_key: null,
      result: null,
      leased_until: null,
      last_heartbeat_at: null,
      last_error: null,
      campus_id: null,
      expires_at: null,
    });
    expect(result.listing_id).toBeNull();
    expect(result.idempotency_key).toBeNull();
    expect(result.result).toBeNull();
    expect(result.leased_until).toBeNull();
    expect(result.last_heartbeat_at).toBeNull();
    expect(result.last_error).toBeNull();
    expect(result.campus_id).toBeNull();
    expect(result.expires_at).toBeNull();
  });

  it('rejects an object with camelCase listingTitle (mock-only field)', () => {
    expect(() =>
      missionSchema.parse({
        ...validMission,
        listingTitle: 'Some listing',
      })
    ).toThrow();
  });

  it('does NOT have mock-only fields (listingTitle, summary, logs, actionCard)', () => {
    const result = missionSchema.parse(validMission);
    expect(result).not.toHaveProperty('listingTitle');
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('logs');
    expect(result).not.toHaveProperty('actionCard');
  });
});

// ─── MissionLog schema ──────────────────────────────────────────

describe('missionLogSchema', () => {
  const validLog = {
    id: '11111111-1111-1111-1111-111111111111',
    mission_id: '22222222-2222-2222-2222-222222222222',
    action: 'Mission started',
    detail: 'User requested tour booking',
    status: 'success',
    tool_name: 'search_listings',
    tool_input: { query: 'apartments' },
    tool_output: { results: [] },
    created_at: '2026-03-10T09:00:00Z',
  };

  it('accepts a valid log with tool fields', () => {
    const result = missionLogSchema.parse(validLog);
    expect(result.tool_name).toBe('search_listings');
    expect(result.tool_input).toEqual({ query: 'apartments' });
    expect(result.tool_output).toEqual({ results: [] });
  });

  it('requires action, detail, and status', () => {
    expect(() =>
      missionLogSchema.parse({
        id: '11111111-1111-1111-1111-111111111111',
        mission_id: '22222222-2222-2222-2222-222222222222',
        created_at: '2026-03-10T09:00:00Z',
      })
    ).toThrow();
  });

  it('accepts null tool fields', () => {
    const result = missionLogSchema.parse({
      ...validLog,
      tool_name: null,
      tool_input: null,
      tool_output: null,
    });
    expect(result.tool_name).toBeNull();
    expect(result.tool_input).toBeNull();
    expect(result.tool_output).toBeNull();
  });
});

// ─── MissionDraft schema ──────────────────────────────────────────

describe('missionDraftSchema', () => {
  const validDraft = {
    id: '11111111-1111-1111-1111-111111111111',
    mission_id: '22222222-2222-2222-2222-222222222222',
    draft_type: 'tour_schedule',
    payload: { date: '2026-03-14', time: '2:00 PM' },
    draft_version: 1,
    is_current: true,
    user_decision: null,
    decided_at: null,
    created_at: '2026-03-10T09:00:00Z',
  };

  it('requires draft_version as a number', () => {
    const result = missionDraftSchema.parse(validDraft);
    expect(typeof result.draft_version).toBe('number');
  });

  it('requires is_current as a boolean', () => {
    const result = missionDraftSchema.parse(validDraft);
    expect(typeof result.is_current).toBe('boolean');
  });

  it('accepts valid user_decision values', () => {
    const result = missionDraftSchema.parse({
      ...validDraft,
      user_decision: 'approved',
      decided_at: '2026-03-10T10:00:00Z',
    });
    expect(result.user_decision).toBe('approved');
  });

  it('rejects invalid draft_version type', () => {
    expect(() =>
      missionDraftSchema.parse({
        ...validDraft,
        draft_version: 'one',
      })
    ).toThrow();
  });
});

// ─── MissionSteering schema ──────────────────────────────────────────

describe('missionSteeringSchema', () => {
  const validSteering = {
    id: '11111111-1111-1111-1111-111111111111',
    mission_id: '22222222-2222-2222-2222-222222222222',
    raw_input: 'Actually, try a different time slot',
    parsed_intent: { action: 'reschedule', slot: 'afternoon' },
    applied_at: null,
    created_at: '2026-03-10T09:00:00Z',
  };

  it('requires raw_input as a string', () => {
    const result = missionSteeringSchema.parse(validSteering);
    expect(result.raw_input).toBe('Actually, try a different time slot');
  });

  it('accepts nullable parsed_intent', () => {
    const result = missionSteeringSchema.parse({
      ...validSteering,
      parsed_intent: null,
    });
    expect(result.parsed_intent).toBeNull();
  });

  it('accepts object parsed_intent', () => {
    const result = missionSteeringSchema.parse(validSteering);
    expect(result.parsed_intent).toEqual({ action: 'reschedule', slot: 'afternoon' });
  });

  it('rejects missing raw_input', () => {
    const { raw_input: _, ...withoutRawInput } = validSteering;
    expect(() => missionSteeringSchema.parse(withoutRawInput)).toThrow();
  });
});

// ─── ExecutionLogStatus enum ──────────────────────────────────────────

describe('executionLogStatusSchema', () => {
  it('accepts success, pending, error, running', () => {
    expect(executionLogStatusSchema.parse('success')).toBe('success');
    expect(executionLogStatusSchema.parse('pending')).toBe('pending');
    expect(executionLogStatusSchema.parse('error')).toBe('error');
    expect(executionLogStatusSchema.parse('running')).toBe('running');
  });
});
