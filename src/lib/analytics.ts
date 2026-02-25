/**
 * Analytics utility for custom event tracking
 * Supports both PostHog and Vercel Analytics
 */

import { track as vercelTrack } from '@vercel/analytics';

// PostHog tracking (global posthog function is injected via script)
declare global {
  interface Window {
    posthog?: {
      capture: (eventName: string, eventData?: Record<string, any>) => void;
    };
  }
}

type AnalyticsEvent = 
  | 'token_created'
  | 'nft_created'
  | 'wallet_created'
  | 'multisig_created'
  | 'payment_link_created'
  | 'dao_created'
  | 'launch_initiated'
  | 'launch_completed'
  | 'network_switched'
  | 'wallet_connected'
  | 'theme_toggled'
  | 'share_clicked';

interface EventData {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Track custom event to both PostHog and Vercel Analytics
 */
export function track(event: AnalyticsEvent, data?: EventData): void {
  // Vercel Analytics
  vercelTrack(event, data);
  
  // PostHog Analytics
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(event, data);
  }
}

/**
 * Track page view (PostHog auto-tracks, this is for programmatic tracking)
 */
export function trackPageView(path?: string): void {
  if (typeof window !== 'undefined' && window.posthog && path) {
    window.posthog.capture('$pageview', { $current_url: path });
  }
}

/**
 * Track error events
 */
export function trackError(error: string, context?: EventData): void {
  track('error' as AnalyticsEvent, { error, ...context });
}

// Convenience functions for common events
export const analytics = {
  tokenCreated: (mint: string, symbol?: string) => 
    track('token_created', { mint, symbol }),
  
  nftCreated: (mint: string, collection?: string) => 
    track('nft_created', { mint, collection }),
  
  walletCreated: (address: string) => 
    track('wallet_created', { address }),
  
  multisigCreated: (address: string, threshold: number, members: number) => 
    track('multisig_created', { address, threshold, members }),
  
  paymentLinkCreated: (amount: number, token: string) => 
    track('payment_link_created', { amount, token }),
  
  daoCreated: (address: string) => 
    track('dao_created', { address }),
  
  launchInitiated: (token: string, curveType: string) => 
    track('launch_initiated', { token, curveType }),
  
  launchCompleted: (token: string, raised: number) => 
    track('launch_completed', { token, raised }),
  
  networkSwitched: (network: string) => 
    track('network_switched', { network }),
  
  walletConnected: (walletType: string) => 
    track('wallet_connected', { walletType }),
  
  themeToggled: (theme: 'light' | 'dark') => 
    track('theme_toggled', { theme }),
  
  shareClicked: (type: string, url: string) => 
    track('share_clicked', { type, url }),
};
