import { track } from "@vercel/analytics";

// Custom event tracking for sol.new
export const analytics = {
  // Wallet events
  walletConnected: (method: "passkey" | "recovery") => {
    track("wallet_connected", { method });
  },

  walletCreated: () => {
    track("wallet_created");
  },

  walletRecovered: () => {
    track("wallet_recovered");
  },

  // Token events
  tokenCreated: (metadata: {
    hasImage: boolean;
    meteora: boolean;
    network: string;
  }) => {
    track("token_created", metadata);
  },

  tokenImageGenerated: (prompt: string) => {
    track("token_image_generated", { promptLength: prompt.length });
  },

  // NFT events
  nftMinted: (metadata: {
    compressed: boolean;
    hasImage: boolean;
    network: string;
  }) => {
    track("nft_minted", metadata);
  },

  nftImageGenerated: (prompt: string) => {
    track("nft_image_generated", { promptLength: prompt.length });
  },

  // Multisig events
  multisigCreated: (metadata: {
    threshold: number;
    members: number;
    network: string;
  }) => {
    track("multisig_created", metadata);
  },

  // Payment events
  solPurchased: (metadata: {
    amount: number;
    provider: "stripe";
    network: string;
  }) => {
    track("sol_purchased", metadata);
  },

  solSent: (metadata: {
    amount: number;
    network: string;
  }) => {
    track("sol_sent", metadata);
  },

  // Network events
  networkSwitched: (network: "mainnet" | "devnet") => {
    track("network_switched", { network });
  },

  // Error tracking
  error: (context: string, message: string) => {
    track("error", { context, message });
  },

  // Feature usage
  featureUsed: (feature: string, metadata?: Record<string, any>) => {
    track(`feature_${feature}`, metadata);
  },
};
