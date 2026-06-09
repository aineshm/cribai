'use client';

import { BoardView } from '@/components/crm/dashboard/BoardView';

/**
 * "My Apartments" manual dashboard route. Thin client shell — all behavior lives
 * in BoardView (pipeline / grid / compare + add-by-URL + detail drawer), fed by
 * the mock crm-client seam (NEXT_PUBLIC_CRM_MOCK).
 */
export default function MyApartmentsBoardPage() {
  return <BoardView />;
}
