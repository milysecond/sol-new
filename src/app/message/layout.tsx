import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign a Message — sol.new",
  description: "Sign a message with your wallet, or verify someone else's signature.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
