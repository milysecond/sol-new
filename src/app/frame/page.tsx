import type { Metadata } from "next";
import { FrameStudio } from "@/components/frame-studio";
import { PageBack } from "@/components/page-back";

const site = "https://sol.new";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "LinkedIn Frame Generator | sol.new",
  description:
    "Free LinkedIn profile frame with circular text. Default #OPENTOSOLANA. Upload a photo, customize colors, download a PNG — private, in-browser, no signup.",
  alternates: { canonical: "/frame" },
  openGraph: {
    title: "LinkedIn Frame · sol.new",
    description:
      "Custom circular profile frames for LinkedIn. #OPENTOSOLANA and your own text — free on sol.new.",
    url: `${site}/frame`,
    siteName: "sol.new",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LinkedIn Frame · sol.new",
    description: "Circular profile frames with custom text. #OPENTOSOLANA.",
  },
  robots: { index: true, follow: true },
};

export default function FramePage() {
  return (
    <main className="min-h-[100dvh] bg-white text-black dark:bg-black dark:text-white">
      <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-3 sm:pt-5">
        <div className="mb-3 flex items-center gap-1">
          <PageBack />
        </div>
        <header className="mb-6 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
            Profile frame
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            LinkedIn frame
          </h1>
          <p className="text-sm text-gray-600 dark:text-white/60">
            Circular text around your photo. Runs fully in your browser — nothing
            is uploaded to sol.new.
          </p>
        </header>
        <FrameStudio />
      </div>
    </main>
  );
}
