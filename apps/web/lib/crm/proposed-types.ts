// PROPOSED EXTENSIONS — NOT in the @campusnest/ai contract. Mock-only until the
// backend implements them (see engineering/mockups/crm-frontend/CONTRACT-DELTAS.md).

import type { CrmListingRow } from '@campusnest/ai';

export interface ApplicationDocument {
  readonly name: string;
  readonly done: boolean;
}

export interface ApplicationState {
  readonly stage: 'saved' | 'toured' | 'applied' | 'decision';
  readonly deadline: string | null; // ISO date
  readonly deadlineLabel: string | null; // e.g. "Apply within 48h — signing fees waived"
  readonly submittedAt: string | null;
  readonly documents: readonly ApplicationDocument[];
}

export interface ProposedUnitFields {
  readonly unit: { readonly building: string; readonly floorPlan: string; readonly unitLabel: string };
  readonly amenitySplit: { readonly unit: readonly string[]; readonly building: readonly string[] };
  readonly application: ApplicationState;
  readonly addedBy: string; // member id
}

export interface CrmListMember {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly color: string;
}

export interface CrmList {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly members: readonly CrmListMember[];
}

/** A saved unit as the UI consumes it: the real contract row + mock-only extras. */
export interface CrmUnit extends CrmListingRow {
  readonly _proposed: ProposedUnitFields;
}
