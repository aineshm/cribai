import { describe, it, expectTypeOf } from 'vitest';
import type { ApplicationState, CrmList, ProposedUnitFields } from '@/lib/crm/proposed-types';

describe('proposed-types', () => {
  it('ApplicationState has the pipeline shape', () => {
    expectTypeOf<ApplicationState['stage']>().toEqualTypeOf<'saved' | 'toured' | 'applied' | 'decision'>();
  });
  it('CrmList carries members', () => {
    // members is an (immutable) array — toBeArray() rejects readonly arrays,
    // so assert array-ness via toExtend against a readonly array type.
    expectTypeOf<CrmList['members']>().toExtend<readonly unknown[]>();
  });
  it('ProposedUnitFields splits amenities', () => {
    expectTypeOf<ProposedUnitFields['amenitySplit']>().toMatchTypeOf<{
      unit: readonly string[];
      building: readonly string[];
    }>();
  });
});
