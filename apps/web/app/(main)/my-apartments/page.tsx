import { notFound } from 'next/navigation';
import { CrmWorkspace } from '@/components/crm/CrmWorkspace';
import { isCrmEnabled } from '@/lib/crm/feature-flag';

/**
 * "My Apartments" workspace route. Server shell — gates on the CRM visibility
 * flag (404 when off, see lib/crm/feature-flag.ts) then renders the client
 * CrmWorkspace (chat-first thread + on-demand CrmCanvas), fed by the mock
 * crm-client seam (NEXT_PUBLIC_CRM_MOCK).
 */
export default function MyApartmentsPage() {
  if (!isCrmEnabled()) notFound();
  return <CrmWorkspace />;
}
