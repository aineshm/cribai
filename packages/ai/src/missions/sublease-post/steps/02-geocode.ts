/**
 * Step 2: Geocode the address via Google Places.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';
import { geocodeAddress } from '../../../tools/lib/geocode-address';

interface ValidatedInput {
  readonly address: string;
}

export const geocodeAddressStep: MissionStep = {
  id: 'geocode_address',
  label: 'Geocoding address',

  async run(ctx: StepContext): Promise<StepResult> {
    const validatedInput = ctx.state.validatedInput as ValidatedInput | undefined;
    if (!validatedInput) {
      return { output: { geocoded: false, locationSql: null } };
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return {
        output: {
          geocoded: false,
          locationSql: null,
          geocodeNote: 'Geocoding unavailable — listing will be published without map location',
        },
      };
    }

    const coords = await geocodeAddress(validatedInput.address, apiKey);
    if (!coords) {
      return {
        output: {
          geocoded: false,
          locationSql: null,
          geocodeNote: 'Could not verify exact location — listing will still be published',
        },
      };
    }

    return {
      output: {
        geocoded: true,
        locationSql: `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`,
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
    };
  },
};
