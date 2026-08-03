/** Global sol.new usernames (one per wallet, unique). */

export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

export const RESERVED_USERNAMES = new Set([
  "admin",
  "address",
  "api",
  "app",
  "claim",
  "creator",
  "creators",
  "dir",
  "docs",
  "draw",
  "earn",
  "edit",
  "features",
  "frame",
  "gift",
  "help",
  "home",
  "id",
  "l",
  "launch",
  "link",
  "links",
  "loan",
  "me",
  "new",
  "nft",
  "nfts",
  "null",
  "official",
  "pay",
  "privacy",
  "profile",
  "receipt",
  "root",
  "scan",
  "settings",
  "sol",
  "solana",
  "soldotnew",
  "stake",
  "starter",
  "support",
  "swap",
  "terms",
  "token",
  "u",
  "user",
  "username",
  "wallet",
  "www",
  "you",
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

export function isValidUsername(username: string): boolean {
  if (!USERNAME_RE.test(username)) return false;
  if (RESERVED_USERNAMES.has(username)) return false;
  return true;
}

export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (!u) return "Enter a username";
  if (u.length < 3) return "At least 3 characters";
  if (u.length > 20) return "Max 20 characters";
  if (!/^[a-z]/.test(u)) return "Must start with a letter";
  if (!/^[a-z0-9_]+$/.test(u)) return "Only letters, numbers, underscore";
  if (RESERVED_USERNAMES.has(u)) return "That username is reserved";
  if (!USERNAME_RE.test(u)) return "Invalid username";
  return null;
}

export function displayUsername(username: string | null | undefined): string | null {
  if (!username) return null;
  return `@${normalizeUsername(username)}`;
}
