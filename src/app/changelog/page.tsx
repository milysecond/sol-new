import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { CHANGELOG, formatChangelogDate } from "@/lib/changelog";
import { ScrollText } from "lucide-react";

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 app-shell py-8 sm:py-12 space-y-10">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-purple-400">
            <ScrollText size={28} />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Changelog
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-white/50">
            What shipped on sol.new. For live token launches see{" "}
            <Link href="/whats-new" className="text-purple-400 hover:underline">
              what&apos;s new
            </Link>
            .
          </p>
        </header>

        <ol className="space-y-10">
          {CHANGELOG.map((entry) => (
            <li key={`${entry.date}-${entry.title}`} className="relative pl-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                <time
                  dateTime={entry.date}
                  className="text-xs font-mono uppercase tracking-wider text-purple-400"
                >
                  {formatChangelogDate(entry.date)}
                </time>
                <h2 className="text-lg font-semibold tracking-tight">{entry.title}</h2>
              </div>
              <ul className="space-y-2 border-l border-black/10 dark:border-white/10 pl-4">
                {entry.items.map((item) => (
                  <li
                    key={item}
                    className="text-sm text-gray-600 dark:text-white/70 leading-relaxed list-disc ml-1"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <p className="text-xs text-gray-400 dark:text-white/30 pt-4">
          Older product history lives in the product itself — open{" "}
          <Link href="/features" className="text-purple-400 hover:underline">
            features
          </Link>{" "}
          for the full map.
        </p>
      </main>
    </div>
  );
}
