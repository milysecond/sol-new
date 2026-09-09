/** StonkFun public launch API. No key. Wallet signature authorises the fee. */
export const STONKFUN_API = "https://www.stonkfun.xyz/api/public/v1";

export type StonkPair = {
  mint: string;
  symbol: string;
  name?: string;
  launchable?: boolean;
};

type StonkErrorBody = {
  error?: { code?: string; message?: string };
  message?: string;
};

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export async function stonkfunFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${STONKFUN_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text.slice(0, 240) };
  }
  if (!res.ok) {
    const err = json as StonkErrorBody;
    const msg =
      err?.error?.message ||
      err?.message ||
      `StonkFun ${res.status}`;
    throw new Error(msg);
  }
  return unwrap<T>(json);
}

export type StonkPrepareResult = {
  paymentTransaction: string;
  signedQuote: string;
  payment?: { lamports?: number | string };
  mint?: string;
};

export type StonkSubmitResult = {
  status?: string;
  mint?: string;
  paymentSignature?: string;
  charged?: boolean;
};
