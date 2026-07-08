/**
 * Tests for `resolveZillowUnit` (AIN-98 Task 2) — the deterministic
 * zpid → SelectedUnit projection off a Zillow building page's
 * `building.floorPlans[].units[]` blob.
 *
 * Uses the SAME real EO Madison Yards fixture as zillow-floor-plans.test.ts
 * (`zillow-madison-building.html`), whose `building.floorPlans[]` carries a
 * real `units[]` array. Real zpid picked from that fixture (verified via a
 * one-off JSON parse during recon): plan "S1", unit "Unit 1405",
 * zpid "2056051402", price 1825, beds 0, baths 1, sqft 547,
 * availableFrom epoch ms 1784358000000 → "2026-07-18".
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { resolveZillowUnit } from '../sites/zillow';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

const BUILDING_FIXTURE = 'zillow-madison-building.html';
const REAL_ZPID = '2056051402';

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(FIXTURES_DIR, name), 'utf8');
}

describe('resolveZillowUnit — real EO Madison Yards fixture', () => {
  it('projects the matching unit, including the owning plan name', async () => {
    const html = await loadFixture(BUILDING_FIXTURE);
    const unit = resolveZillowUnit(html, REAL_ZPID);

    expect(unit).not.toBeNull();
    expect(unit!.zpid).toBe(REAL_ZPID);
    expect(unit!.unit_number).toBe('Unit 1405');
    expect(unit!.plan_name).toBe('S1');
    expect(unit!.price).toBe(1825);
    expect(unit!.bedrooms).toBe(0);
    expect(unit!.bathrooms).toBe(1);
    expect(unit!.sqft).toBe(547);
    expect(unit!.availability).toBe('2026-07-18');
  });

  it('returns null when the zpid does not match any unit', async () => {
    const html = await loadFixture(BUILDING_FIXTURE);
    expect(resolveZillowUnit(html, 'not-a-real-zpid-999999')).toBeNull();
  });

  it('returns null for a single-unit /homedetails/ page (no building blob)', async () => {
    const html = await loadFixture('zillow-madison-single-unit.html');
    expect(resolveZillowUnit(html, REAL_ZPID)).toBeNull();
  });

  it('returns null when there is no __NEXT_DATA__ at all, never throws', () => {
    expect(resolveZillowUnit('<html><body>no data</body></html>', REAL_ZPID)).toBeNull();
  });

  it('returns null on malformed units[] entries rather than throwing', () => {
    const html = `<!doctype html><html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          componentProps: {
            initialReduxState: {
              gdp: {
                building: {
                  buildingName: 'Malformed Towers',
                  floorPlans: [
                    { name: 'A1', units: [{ notAZpid: true }, null, 'garbage'] },
                  ],
                },
              },
            },
          },
        },
      },
    })}</script></head><body></body></html>`;
    expect(resolveZillowUnit(html, REAL_ZPID)).toBeNull();
  });
});
