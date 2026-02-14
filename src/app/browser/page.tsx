'use client';

import { Globe, ExternalLink, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export default function BrowserPage() {
  const [copied, setCopied] = useState(false);
  const url = 'https://sol.new';

  function copyUrl() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Globe className="w-10 h-10 text-purple-600 dark:text-purple-400" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Open in your browser</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
            sol.new uses passkeys to secure your wallet. Passkeys only work in a full web browser like <strong>Safari</strong> or <strong>Chrome</strong> — not inside app browsers like Telegram or Twitter.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Copy the link below and paste it into your browser:
          </p>

          <button
            onClick={copyUrl}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-lg transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-5 h-5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                Copy sol.new
              </>
            )}
          </button>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 font-medium transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Try opening directly
          </a>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-600 leading-relaxed">
          Why? In-app browsers don't support the security features needed to create and use passkeys. Your browser (Safari, Chrome, Firefox) does.
        </p>
      </div>
    </div>
  );
}
