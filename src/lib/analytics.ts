/**
 * Strip anything that can carry a link secret (audit H4): the fragment and
 * secret-bearing query params. Gift, pay and float links keep keys there.
 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url, "https://sol.new");
    u.hash = "";
    for (const k of ["g", "s", "k", "key", "secret", "t", "token"]) u.searchParams.delete(k);
    const out = `${u.pathname}${u.search}`;
    return /^https?:/i.test(url) ? `${u.origin}${out}` : out;
  } catch {
    return url.split(/[?#]/)[0] || "";
  }
}

// Sends custom events to the GA4 tag loaded in layout.tsx (gtag.js).
function sendEvent(event: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (data) {
    data = { ...data };
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && (k === "url" || /^https?:\/\//i.test(v) || (v.startsWith("/") && /[#?]/.test(v)))) {
        data[k] = redactUrl(v);
      }
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, data);
  }
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (gtag) gtag("event", event, data);
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
  | 'launch_failed'
  | 'wallet_tracked'
  | 'network_switched'
  | 'wallet_connected'
  | 'theme_toggled'
  | 'share_clicked'
  | 'gift_link_created'
  | 'gift_claimed';

interface EventData {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Track a custom behavior event in GA4.
 */
export function track(event: AnalyticsEvent, data?: EventData): void {
  sendEvent(event, data);
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

  launchCompleted: (mint: string, token: string, curveType: string) =>
    track('launch_completed', { mint, token, curveType }),

  launchFailed: (token: string, reason: string) =>
    track('launch_failed', { token, reason }),

  walletTracked: (wallet: string, netWorthUsd: number, protocols: number) =>
    track('wallet_tracked', { wallet, netWorthUsd, protocols }),

  networkSwitched: (network: string) =>
    track('network_switched', { network }),
  
  walletConnected: (walletType: string) => 
    track('wallet_connected', { walletType }),
  
  themeToggled: (theme: 'light' | 'dark') => 
    track('theme_toggled', { theme }),
  
  shareClicked: (type: string, url: string) =>
    track('share_clicked', { type, url }),

  giftLinkCreated: (amount: number) =>
    track('gift_link_created', { amount }),

  giftClaimed: (amount: number) =>
    track('gift_claimed', { amount }),
};
