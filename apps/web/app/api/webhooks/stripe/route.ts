import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  // TODO Phase 2: Implement Stripe webhook verification + event handling
  // 1. Verify webhook signature using stripe.webhooks.constructEvent(body, signature, webhookSecret)
  // 2. Handle checkout.session.completed → update subscription_tier
  // 3. Handle customer.subscription.updated/deleted
  //
  // SECURITY: Until signature verification is implemented, reject all requests
  // to prevent processing of spoofed webhook events.
  return NextResponse.json(
    { error: 'Webhook signature verification not yet implemented' },
    { status: 501 },
  );
}
