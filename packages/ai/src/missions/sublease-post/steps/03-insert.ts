/**
 * Step 3: Insert listing into database.
 */
import { createHash } from 'node:crypto';
import type { MissionStep, StepContext, StepResult } from '../../types';

interface ValidatedInput {
  readonly address: string;
  readonly bedrooms_total: number;
  readonly bedrooms_available: number;
  readonly rent_monthly: number | null;
  readonly bathrooms: number | null;
  readonly available_from: string | null;
  readonly available_to: string | null;
  readonly description: string | null;
  readonly amenities: readonly string[];
  readonly contact_email: string | null;
  readonly furnished: boolean | null;
  readonly parking: boolean | null;
  readonly property_type: string | null;
  readonly unit_number: string | null;
}

export const insertListingStep: MissionStep = {
  id: 'insert_listing',
  label: 'Creating listing',

  async run(ctx: StepContext): Promise<StepResult> {
    const validatedInput = ctx.state.validatedInput as ValidatedInput | undefined;
    if (!validatedInput) {
      return { output: { error: 'No validated input' }, done: true };
    }

    const locationSql = ctx.state.locationSql as string | null;

    // Resolve contact email
    let contactEmail = validatedInput.contact_email;
    if (!contactEmail && ctx.userId) {
      const { data: authData } = await ctx.supabase.auth.admin.getUserById(ctx.userId);
      contactEmail = authData?.user?.email ?? null;
    }

    // Idempotency key
    const addressHash = createHash('sha256')
      .update(`${ctx.userId}-${validatedInput.address}-${validatedInput.available_from ?? 'open'}`)
      .digest('hex')
      .slice(0, 12);
    const externalId = `sublease-${ctx.userId}-${addressHash}`;

    const insertData: Record<string, unknown> = {
      campus_id: ctx.campusId,
      address: validatedInput.address,
      rent_monthly: validatedInput.rent_monthly,
      bedrooms: validatedInput.bedrooms_total,
      bathrooms: validatedInput.bathrooms,
      amenities: [...validatedInput.amenities],
      available_date: validatedInput.available_from,
      description: validatedInput.description,
      contact_email: contactEmail,
      source: 'sublease',
      external_id: externalId,
      creator_id: ctx.userId,
      is_active: true,
      last_embedded_at: null,
      photo_urls: [],
      raw_data: {
        submitted_by: ctx.userId,
        is_sublease: true,
        bedrooms_available: validatedInput.bedrooms_available,
        lease_end: validatedInput.available_to,
        furnished: validatedInput.furnished,
        parking: validatedInput.parking,
        property_type: validatedInput.property_type,
        unit_number: validatedInput.unit_number,
      },
    };

    if (locationSql) {
      insertData.location = locationSql;
    }

    const { data: listing, error: insertError } = await ctx.supabase
      .from('listings')
      .insert(insertData)
      .select('id, address')
      .single();

    if (insertError) {
      // SECURITY: Log full error server-side, return generic message to user
      console.error('[03-insert] DB insert error:', insertError);
      if (insertError.code === '23505') {
        return { output: { error: 'A listing with this address already exists.' }, done: true };
      }
      return { output: { error: 'Failed to create listing. Please try again.' }, done: true };
    }

    return {
      output: {
        listingId: listing.id,
        listingAddress: listing.address,
        inserted: true,
      },
    };
  },
};
