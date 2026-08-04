import type { Metadata } from "next";
import { FrameStudio } from "@/components/frame-studio";
import { PageBack } from "@/components/page-back";

const site = "https://sol.new";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "#OPENTOSOLANA LinkedIn Frame | sol.new",
  description:
    "Free #OPENTOSOLANA LinkedIn profile frame. Upload a photo, download PNG — private, in-browser.",
  alternates: { canonical: "/frame" },
  openGraph: {
    title: "#OPENTOSOLANA Frame · sol.new",
    description: "LinkedIn profile frame with the #OPENTOSOLANA arc. Free on sol.new.",
    url: `${site}/frame`,
    siteName: "sol.new",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "#OPENTOSOLANA Frame · sol.new",
    description: "LinkedIn profile frame — upload photo, download PNG.",
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
        <header className="mb-6 space-y-1 text-center sm:text-left">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            #OPENTOSOLANA frame
          </h1>
          <p className="text-sm text-gray-600 dark:text-white/60">
            Upload your photo · download a LinkedIn-ready PNG. Nothing leaves your
            browser.
          </p>
        </header>
        <FrameStudio />
      </div>
    </main>
  );
}
