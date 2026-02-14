import { Coins, ArrowLeft } from "lucide-react";

export default async function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <a href="/" className="text-2xl font-bold tracking-tight inline-block">
          sol<span className="text-purple-400">.new</span>
        </a>
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-8 space-y-4">
          <div className="w-16 h-16 bg-purple-500/20 rounded-full mx-auto flex items-center justify-center">
            <Coins size={24} className="text-purple-400" />
          </div>
          <h1 className="text-xl font-semibold">Token {id}</h1>
          <p className="text-gray-500 dark:text-white/40 text-sm">
            Token details coming soon.
          </p>
        </div>
        <a href="/" className="text-purple-400 text-sm hover:text-purple-300 transition inline-block flex items-center gap-1 justify-center">
          <ArrowLeft className="w-4 h-4 inline mr-1" /> Launch your own
        </a>
      </div>
    </div>
  );
}
