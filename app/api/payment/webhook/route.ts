/**
 * POST /api/payment/webhook
 * Stripe webhook handler - triggers SOL transfer & token launch
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

// Webhook secret (set via Stripe dashboard)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

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

      // For now, just log
      // Next step: integrate with Solana wallet to send SOL
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
