'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Copy, Check, ArrowRight, Sparkles, Pencil } from 'lucide-react';
import { Navbar } from '@/components/navbar';
import { Spinner } from '@/components/spinner';
import { useWallet } from '@/lib/wallet-context';
import Link from 'next/link';

interface TokenData {
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  mint_address: string;
  wallet: string;
  created_at: string;
}

function ShareCopyButton({ text, icon }: { text: string; icon: 'tiktok' | 'instagram' }) {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); };
  return (
    <button onClick={copy} className="p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition cursor-pointer" title={`Copy for ${icon === 'tiktok' ? 'TikTok' : 'Instagram'}`}>
      {done ? (
        <Check className="w-5 h-5 text-green-400" />
      ) : icon === 'tiktok' ? (
        <svg className="w-5 h-5 text-gray-700 dark:text-white/70" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
      ) : (
        <svg className="w-5 h-5 text-gray-700 dark:text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
      )}
    </button>
  );
}

export default function LaunchPage() {
  const { mint } = useParams<{ mint: string }>();
  const { publicKey } = useWallet();
  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    const RETRY_MS = 1500;
    const TIMEOUT_MS = 12000;

    const tick = async () => {
      try {
        const res = await fetch(`/api/token/${mint}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data && data.mint_address) {
            setToken(data);
            setLoading(false);
            return;
          }
        }
      } catch {}
      if (cancelled) return;
      if (Date.now() - start >= TIMEOUT_MS) {
        setLoading(false);
        return;
      }
      setTimeout(tick, RETRY_MS);
    };
    tick();
    return () => { cancelled = true; };
  }, [mint]);

  function copyMint() {
    if (!token) return;
    navigator.clipboard.writeText(token.mint_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Spinner size={24} />
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-gray-500 dark:text-white/50">Token not found</p>
          <Link href="/token" className="text-purple-500 hover:text-purple-400 text-sm font-medium flex items-center gap-1">
            Launch your own <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-sm w-full space-y-6 relative">
          {/* Sparkle burst */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden -top-8">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="absolute sol-burst" style={{
                left: `${10 + (i * 47 + 13) % 80}%`,
                bottom: '-10px',
                animationDelay: `${i * 0.15}s`,
              }}>
                <Sparkles className="w-4 h-4" style={{
                  color: i % 3 === 0 ? '#14f195' : i % 3 === 1 ? '#9945ff' : '#f59e0b',
                  filter: `drop-shadow(0 0 4px ${i % 3 === 0 ? '#14f195' : i % 3 === 1 ? '#9945ff' : '#f59e0b'})`,
                }} />
              </div>
            ))}
          </div>
          {/* Token card */}
          <div className="flex flex-col items-center gap-4">
            {token.image_url && (
              <img
                src={token.image_url}
                alt={token.name}
                className="w-24 h-24 rounded-2xl object-cover shadow-lg"
              />
            )}
            <div className="text-center">
              <h1 className="text-2xl font-bold">{token.name}</h1>
              <p className="text-purple-500 dark:text-purple-400 font-mono text-lg">${token.symbol}</p>
            </div>
            {token.description && (
              <p className="text-center text-gray-500 dark:text-white/50 text-sm leading-relaxed">
                {token.description}
              </p>
            )}
          </div>

          {/* Mint address */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400 dark:text-white/30 text-center">Token address</p>
            <p className="text-center text-sm font-mono text-gray-600 dark:text-white/60 break-all px-2">
              {token.mint_address}
            </p>
            <a
              href={`https://jup.ag/tokens/${token.mint_address}?refId=yfgv2ibxy07v`}
              target="_blank"
              className="w-full flex items-center justify-center gap-2 bg-[#24AE8F] hover:bg-[#1d9a7e] text-white font-semibold rounded-xl px-4 py-3 transition active:scale-95"
            >
              Buy on Jup
            </a>
            <button
              onClick={copyMint}
              className="w-full flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 text-sm font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-gray-500 dark:text-white/50" />
                  <span className="text-gray-600 dark:text-white/60 text-sm font-medium">Copy address</span>
                </>
              )}
            </button>
          </div>

          {publicKey && publicKey === token.wallet && (
            <Link
              href={`/token/${token.mint_address}/edit`}
              className="flex items-center justify-center gap-2 w-full bg-orange-500/10 hover:bg-orange-500/15 border border-orange-400/30 text-orange-500 dark:text-orange-400 rounded-xl px-4 py-2.5 transition cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
              <span className="text-sm font-medium">Edit metadata</span>
            </Link>
          )}

          {/* MetaDAO governance */}
          <a
            href={`https://metadao.fi`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-500/5 hover:bg-green-500/10 border border-green-400/20 hover:border-green-400/40 text-green-500 dark:text-green-400 rounded-xl px-4 py-2.5 transition"
          >
            <ArrowRight className="w-4 h-4" />
            <span className="text-sm font-medium">Govern on MetaDAO</span>
          </a>

          {/* Share links */}
          {(() => {
            const url = `https://sol.new/token/${token.mint_address}`;
            const text = `${token.name} ($${token.symbol}) just launched on sol.new`;
            return (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 dark:text-white/30 text-center">Share</p>
                <div className="flex justify-center gap-3">
                  <a href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" className="p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition" title="Share on X">
                    <svg className="w-5 h-5 text-gray-700 dark:text-white/70" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                  <a href={`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`} target="_blank" className="p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition" title="Share on WhatsApp">
                    <svg className="w-5 h-5 text-gray-700 dark:text-white/70" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  </a>
                  <a href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" className="p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 transition" title="Share on Telegram">
                    <svg className="w-5 h-5 text-gray-700 dark:text-white/70" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                  </a>
                  <ShareCopyButton text={text + ' ' + url} icon="tiktok" />
                  <ShareCopyButton text={text + ' ' + url} icon="instagram" />
                </div>
              </div>
            );
          })()}

          {/* CTA */}
          <div className="pt-2">
            <Link
              href="/token"
              className="w-full flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3.5 transition"
            >
              Launch yours on sol.new
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-white/30">
            Launched on sol.new
          </p>
        </div>
      </main>
    </div>
  );
}
