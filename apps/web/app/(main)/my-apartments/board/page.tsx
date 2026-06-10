import { notFound } from 'next/navigation';
import { BoardView } from '@/components/crm/dashboard/BoardView';
import { isCrmEnabled } from '@/lib/crm/feature-flag';

/**
 * "My Apartments" manual dashboard route. Server shell — gates on the CRM
 * visibility flag (404 when off, see lib/crm/feature-flag.ts) then renders the
 * client BoardView (pipeline / grid / compare + add-by-URL + detail drawer),
 * fed by the mock crm-client seam (NEXT_PUBLIC_CRM_MOCK).
 */
export default function MyApartmentsBoardPage() {
  if (!isCrmEnabled()) notFound();
  return <BoardView />;
}
