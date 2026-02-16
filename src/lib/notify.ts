const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHANNEL = "@soldotnew";

export async function notifyTokenLaunch(data: {
  name: string;
  symbol: string;
  description?: string | null;
  imageUrl?: string | null;
  mintAddress: string;
}) {
  if (!TG_BOT_TOKEN) {
    console.error('[notify] TG_BOT_TOKEN not configured - skipping notification');
    return;
  }
  
  console.log('[notify] Sending token launch notification:', {
    name: data.name,
    symbol: data.symbol,
    mintAddress: data.mintAddress,
  });

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = [
    `<b>${esc(data.name)}</b> ($${esc(data.symbol)}) just launched on sol.new`,
  ];
  if (data.description) {
    lines.push('', esc(data.description));
  }
  lines.push(
    '',
    `<code>${data.mintAddress}</code>`,
    '',
    `<a href="https://sol.new/launch/${data.mintAddress}">View token</a>  ·  <a href="https://jup.ag/tokens/${data.mintAddress}?refId=yfgv2ibxy07v">Buy on Jup</a>  ·  <a href="https://sol.new">Launch yours</a>`,
  );

  const caption = lines.join('\n');

  const reply_markup = {
    inline_keyboard: [
      [
        { text: "View token", url: `https://sol.new/launch/${data.mintAddress}` },
        { text: "Buy on Jup", url: `https://jup.ag/tokens/${data.mintAddress}?refId=yfgv2ibxy07v` },
      ],
      [
        { text: "Launch yours", url: "https://sol.new" },
      ],
    ],
  };

  // Ensure image URL is HTTP (Telegram can't fetch ipfs:// directly)
  let photoUrl = data.imageUrl;
  if (photoUrl?.startsWith('ipfs://')) {
    photoUrl = photoUrl.replace('ipfs://', 'https://nftstorage.link/ipfs/');
  }

  try {
    // Try sending with photo first
    if (photoUrl) {
      console.log('[notify] Attempting to send with photo:', photoUrl);
      const photoRes = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TG_CHANNEL,
          photo: photoUrl,
          caption,
          parse_mode: 'HTML',
          reply_markup,
        }),
      });
      const photoJson = await photoRes.json();
      if (photoJson.ok) {
        console.log('[notify] ✓ Token launch posted to', TG_CHANNEL, '(with photo)');
        return;
      } else {
        console.warn('[notify] Photo send failed:', photoJson.description || photoJson);
      }
    }

    // Fallback to text-only
    console.log('[notify] Sending text-only notification');
    const textRes = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHANNEL,
        text: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        reply_markup,
      }),
    });
    const textJson = await textRes.json();
    if (textJson.ok) {
      console.log('[notify] ✓ Token launch posted to', TG_CHANNEL, '(text-only)');
    } else {
      console.error('[notify] Text send also failed:', textJson.description || textJson);
    }
  } catch (err) {
    // Log error but don't break token creation
    console.error('[notify] Telegram notification failed:', err);
  }
}
