import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Phase 2: Implement Stripe webhook verification + event handling
  // 1. Verify webhook signature
  // 2. Handle checkout.session.completed → update subscription_tier
  // 3. Handle customer.subscription.updated/deleted

  console.log('Stripe webhook received', body.length, 'bytes');

  return NextResponse.json({ received: true });
}
