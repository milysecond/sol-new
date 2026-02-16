/**
 * POST /api/payment/create-intent
 * Create Stripe PaymentIntent for Apple Pay / Google Pay
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent, getSolPrice, calculateSolAmount } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amountUsd, wallet, tokenParams } = body;

    if (!amountUsd || amountUsd < 100) {
      return NextResponse.json(
        { error: 'Minimum payment is $1.00' },
        { status: 400 }
      );
    }

    const solPrice = await getSolPrice();
    const solAmount = calculateSolAmount(amountUsd, solPrice);

    const paymentIntent = await createPaymentIntent(amountUsd, {
      wallet: wallet || 'none',
      solAmount: solAmount.toFixed(4),
      tokenParams: tokenParams ? JSON.stringify(tokenParams) : 'none',
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      solAmount,
      solPrice,
    });
  } catch (error: any) {
    console.error('Payment intent failed:', error);
    return NextResponse.json(
      { error: error.message || 'Payment setup failed' },
      { status: 500 }
    );
  }
}
