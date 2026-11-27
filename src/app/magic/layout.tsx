// Audit H3: render per request so Next.js stamps the CSP nonce on its scripts.
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
