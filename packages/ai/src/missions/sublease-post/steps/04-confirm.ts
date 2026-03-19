/**
 * Step 4: Confirm listing creation and return link.
 */
import type { MissionStep, StepContext, StepResult } from '../../types';

export const confirmStep: MissionStep = {
  id: 'confirm',
  label: 'Confirming listing',

  async run(ctx: StepContext): Promise<StepResult> {
    const listingId = ctx.state.listingId as string | undefined;
    const listingAddress = ctx.state.listingAddress as string | undefined;
    const error = ctx.state.error as string | undefined;

    if (error || !listingId) {
      return {
        output: {
          confirmed: false,
          message: error ?? 'Listing creation failed',
        },
        done: true,
      };
    }

    return {
      output: {
        confirmed: true,
        message: `Sublease published! View at /listing/${listingId}`,
        listingUrl: `/listing/${listingId}`,
        listingAddress,
      },
      done: true,
    };
  },
};
