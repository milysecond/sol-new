/**
 * POST /api/payment/webhook
 * Stripe webhook - handle payment success
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    // Init Stripe at request time
    const key = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!key || !webhookSecret) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });

    // Verify webhook
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    // Handle payment success
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { wallet, solAmount } = paymentIntent.metadata;

      console.log('Payment succeeded:', {
        amount: paymentIntent.amount,
        wallet,
        solAmount,
      });

      // TODO: Transfer SOL to wallet
      // TODO: Launch token if tokenParams provided
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook failed' },
      { status: 400 }
    );
  }
}
