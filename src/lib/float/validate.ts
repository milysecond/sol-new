const TICKER = /^[A-Za-z0-9]{1,10}$/;

export function tickerError(ticker: string): string | null {
  const t = ticker.trim();
  if (!t) return "Enter a ticker.";
  if (!TICKER.test(t)) return "Ticker must be 1–10 letters or digits.";
  return null;
}

export function nameError(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter a name.";
  if (n.length > 32) return "Name must be 32 characters or less.";
  return null;
}

export function metadataUriError(uri: string): string | null {
  const u = uri.trim();
  if (!u) return "Add an image or a metadata URI.";
  if (u.length > 200) return "Metadata URI is too long (200 characters max).";
  if (!/^https:\/\/.+/i.test(u)) return "Metadata URI must be an https link.";
  return null;
}
