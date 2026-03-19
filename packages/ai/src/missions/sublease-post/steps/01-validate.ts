/**
 * Step 1: Validate sublease fields.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';

export const validateFieldsStep: MissionStep = {
  id: 'validate_fields',
  label: 'Validating fields',

  async run(ctx: StepContext): Promise<StepResult> {
    const input = ctx.input;

    const address = input.address as string | undefined;
    const bedroomsTotal = input.bedrooms_total as number | undefined;
    const bedroomsAvailable = input.bedrooms_available as number | undefined;

    const errors: string[] = [];

    if (!address || address.length < 5) {
      errors.push('Address is required (minimum 5 characters)');
    }
    if (bedroomsTotal == null || bedroomsTotal < 0 || bedroomsTotal > 10) {
      errors.push('Total bedrooms must be 0-10');
    }
    if (bedroomsAvailable == null || bedroomsAvailable < 0 || bedroomsAvailable > 10) {
      errors.push('Available bedrooms must be 0-10');
    }
    if (bedroomsTotal != null && bedroomsAvailable != null && bedroomsTotal > 0 && bedroomsAvailable > bedroomsTotal) {
      errors.push('Available bedrooms cannot exceed total bedrooms');
    }

    const rentMonthly = input.rent_monthly as number | undefined;
    if (rentMonthly != null && (rentMonthly <= 0 || rentMonthly > 10000)) {
      errors.push('Rent must be $1-$10,000/month');
    }

    if (errors.length > 0) {
      return {
        output: { validationErrors: errors, validated: false },
        done: true,
      };
    }

    return {
      output: {
        validated: true,
        validatedInput: {
          address,
          bedrooms_total: bedroomsTotal,
          bedrooms_available: bedroomsAvailable,
          rent_monthly: rentMonthly ?? null,
          bathrooms: input.bathrooms ?? null,
          available_from: input.available_from ?? null,
          available_to: input.available_to ?? null,
          description: input.description ?? null,
          amenities: input.amenities ?? [],
          contact_email: input.contact_email ?? null,
          furnished: input.furnished ?? null,
          parking: input.parking ?? null,
          property_type: input.property_type ?? null,
          unit_number: input.unit_number ?? null,
        },
      },
    };
  },
};
