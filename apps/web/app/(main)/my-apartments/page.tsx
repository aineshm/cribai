'use client';

import { CrmWorkspace } from '@/components/crm/CrmWorkspace';

/**
 * "My Apartments" workspace route. Thin client shell — all behavior lives in
 * CrmWorkspace (chat-first thread + on-demand CrmCanvas), fed by the mock
 * crm-client seam (NEXT_PUBLIC_CRM_MOCK).
 */
export default function MyApartmentsPage() {
  return <CrmWorkspace />;
}
