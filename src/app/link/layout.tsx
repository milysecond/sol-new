import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Short links — sol.new",
  description: "Create short sol.new/l/… links. Stored on Turso, free to use.",
  openGraph: {
    title: "Short links — sol.new",
    description: "Turn any URL into a short sol.new link.",
    url: "https://sol.new/link",
  },
};

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
