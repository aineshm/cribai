import { describe, it, expect } from 'vitest';
import { crmClient } from '../crm-client';

describe('crmClient (mock mode)', () => {
  it('listUnits returns the fixtures', async () => {
    const units = await crmClient.listUnits();
    expect(units.length).toBe(6);
  });
  it('addListing returns an AddListingResult', async () => {
    const r = await crmClient.addListing('https://www.chapteratmadison.com/floor-plan/studio-s1/');
    expect(r).toMatchObject({ listingId: expect.any(String), confidence: expect.any(Number) });
  });
  it('getAnalysis returns a FirstSaveAnalysis with fanout branches', async () => {
    const a = await crmClient.getAnalysis(crmClient.firstUnitId());
    expect(a.trueCost.status).toBeDefined();
  });
  it('rank returns a rank-mode result', async () => {
    const r = await crmClient.rank('rank');
    expect(r.mode).toBe('rank');
  });
});
