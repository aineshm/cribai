import { createGeminiClient } from '../gemini-client';
import { sendEmail } from './send-email';
import { getRegisteredTypes, registerMission } from './registry';
import type { MissionDefinition, MissionStep } from './types';

// ─── Input shape (stored in mission.input) ──────────────────────────────

interface TourOutreachInput {
  readonly listingIds: readonly string[];
  readonly studentName: string;
  readonly studentEmail: string;
  readonly availability: {
    readonly daysOfWeek: readonly string[];
    readonly timeWindows: readonly string[];
  };
  readonly customNote?: string;
}

interface ListingContact {
  readonly listingId: string;
  readonly address: string;
  readonly bedrooms: number | null;
  readonly rentMonthly: number | null;
  readonly pmEmail: string;
}

interface EmailDraft {
  readonly listingId: string;
  readonly address: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

// ─── Step 1: fetch PM contact info ──────────────────────────────────────

const fetchContacts: MissionStep = {
  id: 'fetch_contacts',
  label: 'Fetching PM contact info',
  run: async (ctx) => {
    const input = ctx.input as unknown as TourOutreachInput;
    const contacts: ListingContact[] = [];

    for (const listingId of input.listingIds) {
      const { data } = await ctx.supabase
        .from('listings')
        .select('id, address, bedrooms, rent_monthly, contact_email')
        .eq('id', listingId)
        .single();

      if (data?.contact_email) {
        contacts.push({
          listingId,
          address: data.address as string,
          bedrooms: data.bedrooms as number | null,
          rentMonthly: data.rent_monthly as number | null,
          pmEmail: data.contact_email as string,
        });
      }
      // Listings without contact_email are silently skipped —
      // executor logs step start/end already; no extra noise needed
    }

    return { output: { contacts } };
  },
};

// ─── Step 2: generate email drafts via Gemini ────────────────────────────

const generateDrafts: MissionStep = {
  id: 'generate_drafts',
  label: 'Generating email drafts with AI',
  run: async (ctx) => {
    const input = ctx.input as unknown as TourOutreachInput;
    const contacts = ctx.state.contacts as ListingContact[];
    const emailDrafts: EmailDraft[] = [];

    const availabilityStr = [
      input.availability.daysOfWeek.join('/'),
      input.availability.timeWindows.join(' or '),
    ]
      .filter(Boolean)
      .join(', ');

    for (const contact of contacts) {
      const bedroomStr = contact.bedrooms ? `${contact.bedrooms}BR unit` : 'unit';
      const priceStr = contact.rentMonthly ? ` at $${contact.rentMonthly}/mo` : '';
      const noteStr = input.customNote ? ` ${input.customNote}` : '';

      const prompt =
        `Write a friendly, concise email from ${input.studentName} to the property manager at ` +
        `${contact.address}. The student is interested in viewing the ${bedroomStr}${priceStr}. ` +
        `They are available ${availabilityStr}.${noteStr} Keep it under 120 words. ` +
        `Warm but professional. Do not be overly formal.`;

      try {
        const ai = createGeminiClient();
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        const text = response.text;
        if (text) {
          emailDrafts.push({
            listingId: contact.listingId,
            address: contact.address,
            to: contact.pmEmail,
            subject: `Tour Request — ${contact.address}`,
            text,
          });
        }
      } catch {
        // Gemini failure for one listing skips that draft silently
      }
    }

    return { output: { emailDrafts } };
  },
};

// ─── Step 3: pause for HITL approval ────────────────────────────────────

const awaitApproval: MissionStep = {
  id: 'await_approval',
  label: 'Waiting for your approval',
  run: async (ctx) => {
    const input = ctx.input as unknown as TourOutreachInput;
    const emailDrafts = ctx.state.emailDrafts as EmailDraft[] | undefined;

    // No emails generated — complete immediately, nothing to send
    if (!emailDrafts || emailDrafts.length === 0) {
      return { output: { sentCount: 0 }, done: true };
    }

    // Bundle all email drafts into one approval payload.
    // The executor will call insertMissionDraft and set status → waiting_approval.
    // On approve, executor resumes at send_approved (current_step_index already N+1).
    return {
      output: {},
      draft: {
        draftType: 'email_draft',
        payload: {
          emails: emailDrafts,
          count: emailDrafts.length,
          studentName: input.studentName,
          studentEmail: input.studentEmail,
        },
      },
    };
  },
};

// ─── Step 4: send approved emails via Resend ────────────────────────────

const sendApproved: MissionStep = {
  id: 'send_approved',
  label: 'Sending approved emails',
  run: async (ctx) => {
    const emailDrafts = ctx.state.emailDrafts as EmailDraft[] | undefined;

    if (!emailDrafts || emailDrafts.length === 0) {
      return { output: { sentCount: 0, failedCount: 0 }, done: true };
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const draft of emailDrafts) {
      const result = await sendEmail({
        to: draft.to,
        subject: draft.subject,
        text: draft.text,
        // Idempotency key ensures Resend deduplicates retries within 24 h
        idempotencyKey: `tour-${ctx.missionId}-${draft.listingId}`,
      });

      if (result.error) {
        failedCount++;
      } else {
        sentCount++;
      }
    }

    return { output: { sentCount, failedCount }, done: true };
  },
};

// ─── Definition ──────────────────────────────────────────────────────────

export const tourOutreachDefinition: MissionDefinition = {
  type: 'tour_outreach',
  steps: [fetchContacts, generateDrafts, awaitApproval, sendApproved],
};

// Register at module load time.
// Guard handles Next.js hot-reload where the module may be evaluated twice.
if (!getRegisteredTypes().includes('tour_outreach')) {
  registerMission(tourOutreachDefinition);
}
