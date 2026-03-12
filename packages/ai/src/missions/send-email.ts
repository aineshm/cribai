import { Resend } from 'resend';

export interface SendEmailParams {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly from?: string;
}

export interface SendEmailResult {
  readonly id: string | null;
  readonly error: string | null;
}

/**
 * Thin wrapper around the Resend SDK.
 * Never throws — all errors are captured in the result's `error` field.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { id: null, error: 'RESEND_API_KEY not configured' };
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send(
    {
      from: params.from ?? 'CampusNest Concierge <onboarding@resend.dev>',
      to: params.to,
      subject: params.subject,
      text: params.text,
    },
    { idempotencyKey: params.idempotencyKey },
  );

  if (error) {
    return { id: null, error: error.message };
  }

  return { id: data?.id ?? null, error: null };
}
