/**
 * POST /api/payment/webhook
 * Stripe webhook handler - triggers SOL transfer & token launch
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

    // Initialize Stripe (at request time, not build time)
    const key = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!key || !webhookSecret) {
      console.error('Stripe configuration missing');
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });

    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    // Handle payment success
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { wallet, solAmount, tokenParams } = paymentIntent.metadata;

      console.log('Payment succeeded:', {
        amount: paymentIntent.amount,
        wallet,
        solAmount,
      });

      // TODO: Trigger SOL transfer to wallet
      // TODO: If tokenParams, trigger token launch via Meteora
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
