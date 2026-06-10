/**
 * Shared mock-builder helpers for /api/crm/* route tests (AIN-61).
 *
 * `createQueryBuilder` returns a chainable, thenable PostgREST-builder mock:
 * every chain method returns the builder itself, and awaiting the builder (or
 * any chained call) resolves to the supplied `{ data, error }` result. Method
 * mocks are exposed so tests can assert exact filter arguments (the unit-level
 * proxy for RLS scoping: `.eq('user_id', <authed user>)`).
 */
import { vi } from 'vitest';

export interface QueryBuilderMock {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (
    onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

export function createQueryBuilder(result: {
  data: unknown;
  error: unknown;
}): QueryBuilderMock {
  const builder = {} as QueryBuilderMock;
  const methods = [
    'select',
    'eq',
    'neq',
    'order',
    'range',
    'limit',
    'update',
    'insert',
    'maybeSingle',
    'single',
  ] as const;
  for (const method of methods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}
