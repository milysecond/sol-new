'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

// Load Stripe publishable key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentButtonProps {
  amountUsd: number; // Amount in USD cents (e.g. 1000 = $10)
  wallet?: string;
  tokenParams?: any;
  onSuccess?: () => void;
}

export default function PaymentButton({
  amountUsd,
  wallet,
  tokenParams,
  onSuccess,
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePayment() {
    setLoading(true);
    setError(null);

    try {
      // Create payment intent
      const res = await fetch('/api/payment/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd, wallet, tokenParams }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Payment setup failed');
      }

      const { clientSecret, solAmount, solPrice } = data;

      // Load Stripe
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe failed to load');

      // Redirect to payment (Apple Pay / Google Pay auto-shows if supported)
      const { error: stripeError } = await stripe.confirmPayment({
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/success`,
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Processing...' : `Pay $${(amountUsd / 100).toFixed(2)}`}
      </button>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
          {error}
        </div>
      )}

      <div className="text-xs text-gray-500 text-center">
        Apple Pay & Google Pay supported
      </div>
    </div>
  );
}
