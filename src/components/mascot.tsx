import { cn } from "@/lib/utils";

interface MascotProps {
  variant?: "fine" | "ngmi" | "wagmi" | "wen" | "gm";
  size?: number;
  className?: string;
}

// The purple sol.new dog — a "This is Fine" reimagining for DeFi
// Variants: classic room-of-candles, plus sticker poses
export function Mascot({ variant = "fine", size = 320, className }: MascotProps) {
  if (variant === "fine") return <MascotFine size={size} className={className} />;
  if (variant === "ngmi") return <MascotNgmi size={size} className={className} />;
  if (variant === "wagmi") return <MascotWagmi size={size} className={className} />;
  if (variant === "wen") return <MascotWen size={size} className={className} />;
  if (variant === "gm") return <MascotGm size={size} className={className} />;
  return null;
}

// ─── Shared dog head/body path component ───────────────────────────────────

function DogHead({ cx = 185, cy = 195, scale = 1, expression = "calm" }) {
  const s = scale;
  const x = (v: number) => cx + (v - 185) * s;
  const y = (v: number) => cy + (v - 195) * s;
  const r = (v: number) => v * s;

  return (
    <g>
      {/* Ears */}
      <ellipse cx={x(152)} cy={y(188)} rx={r(16)} ry={r(22)} fill="#a855f7" transform={`rotate(-8 ${x(152)} ${y(188)})`} />
      <ellipse cx={x(152)} cy={y(190)} rx={r(9)} ry={r(14)} fill="#c084fc" transform={`rotate(-8 ${x(152)} ${y(190)})`} />
      <ellipse cx={x(218)} cy={y(188)} rx={r(16)} ry={r(22)} fill="#a855f7" transform={`rotate(8 ${x(218)} ${y(188)})`} />
      <ellipse cx={x(218)} cy={y(190)} rx={r(9)} ry={r(14)} fill="#c084fc" transform={`rotate(8 ${x(218)} ${y(190)})`} />
      {/* Head */}
      <circle cx={x(185)} cy={y(195)} r={r(42)} fill="#c084fc" />
      {/* Snout */}
      <ellipse cx={x(185)} cy={y(210)} rx={r(20)} ry={r(15)} fill="#ddd6fe" />
      {/* Nose */}
      <ellipse cx={x(185)} cy={y(202)} rx={r(6)} ry={r(4.5)} fill="#4c1d95" />
      <circle cx={x(182)} cy={y(203)} r={r(1.5)} fill="#3b0764" />
      <circle cx={x(188)} cy={y(203)} r={r(1.5)} fill="#3b0764" />
      {/* Mouth */}
      {expression === "calm" && (
        <path d={`M${x(177)} ${y(213)} Q${x(185)} ${y(219)} ${x(193)} ${y(213)}`} stroke="#6d28d9" strokeWidth={r(2)} fill="none" strokeLinecap="round" />
      )}
      {expression === "sad" && (
        <path d={`M${x(177)} ${y(217)} Q${x(185)} ${y(212)} ${x(193)} ${y(217)}`} stroke="#6d28d9" strokeWidth={r(2)} fill="none" strokeLinecap="round" />
      )}
      {expression === "happy" && (
        <path d={`M${x(174)} ${y(211)} Q${x(185)} ${y(222)} ${x(196)} ${y(211)}`} stroke="#6d28d9" strokeWidth={r(2.5)} fill="none" strokeLinecap="round" />
      )}
      {expression === "shocked" && (
        <ellipse cx={x(185)} cy={y(217)} rx={r(6)} ry={r(7)} fill="#6d28d9" />
      )}
      {/* Eyes */}
      <circle cx={x(170)} cy={y(187)} r={r(7)} fill="#1e1b4b" />
      <circle cx={x(172)} cy={y(185)} r={r(2.5)} fill="white" />
      <circle cx={x(200)} cy={y(187)} r={r(7)} fill="#1e1b4b" />
      <circle cx={x(202)} cy={y(185)} r={r(2.5)} fill="white" />
      {/* Calm lids */}
      {expression === "calm" && (
        <>
          <path d={`M${x(163)} ${y(184)} Q${x(170)} ${y(180)} ${x(177)} ${y(184)}`} stroke="#9333ea" strokeWidth={r(5)} fill="none" strokeLinecap="round" />
          <path d={`M${x(193)} ${y(184)} Q${x(200)} ${y(180)} ${x(207)} ${y(184)}`} stroke="#9333ea" strokeWidth={r(5)} fill="none" strokeLinecap="round" />
        </>
      )}
      {expression === "happy" && (
        <>
          <path d={`M${x(163)} ${y(184)} Q${x(170)} ${y(178)} ${x(177)} ${y(184)}`} stroke="#9333ea" strokeWidth={r(4)} fill="none" strokeLinecap="round" />
          <path d={`M${x(193)} ${y(184)} Q${x(200)} ${y(178)} ${x(207)} ${y(184)}`} stroke="#9333ea" strokeWidth={r(4)} fill="none" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function SpeechBubble({ x, y, text, subtext }: { x: number; y: number; text: string; subtext?: string }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={78} ry={36} fill="white" />
      <polygon points={`${x + 40},${y + 30} ${x + 55},${y + 55} ${x + 22},${y + 34}`} fill="white" />
      <text x={x} y={y - 6} textAnchor="middle" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontSize={14} fontWeight={700} fill="#1e1b4b">{text}</text>
      {subtext && <text x={x} y={y + 12} textAnchor="middle" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontSize={11} fill="#7c3aed">{subtext}</text>}
    </g>
  );
}

// ─── Variant: "This is Fine" — room full of green candles ──────────────────

function MascotFine({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 380" width={size} height={size * (380 / 480)} className={cn(className)}>
      <defs>
        <radialGradient id="gGlow" cx="75%" cy="60%" r="55%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Room */}
      <rect width="480" height="380" fill="#0a0012" />
      <rect width="480" height="310" fill="#0d0018" />
      <rect y="310" width="480" height="70" fill="#110020" />
      <line x1="0" y1="310" x2="480" y2="310" stroke="#2d0050" strokeWidth="1.5" />

      {/* Candles */}
      <g opacity="0.9">
        <rect x="440" y="40" width="22" height="268" rx="2" fill="#16a34a" />
        <line x1="451" y1="10" x2="451" y2="42" stroke="#16a34a" strokeWidth="2" />
        <rect x="410" y="65" width="22" height="243" rx="2" fill="#15803d" />
        <line x1="421" y1="30" x2="421" y2="67" stroke="#15803d" strokeWidth="2" />
        <rect x="380" y="90" width="22" height="218" rx="2" fill="#22c55e" />
        <line x1="391" y1="55" x2="391" y2="92" stroke="#22c55e" strokeWidth="2" />
        <rect x="350" y="55" width="22" height="253" rx="2" fill="#16a34a" />
        <line x1="361" y1="18" x2="361" y2="57" stroke="#16a34a" strokeWidth="2" />
        <rect x="318" y="110" width="18" height="198" rx="2" fill="#4ade80" />
        <line x1="327" y1="80" x2="327" y2="112" stroke="#4ade80" strokeWidth="2" />
        <rect x="295" y="140" width="18" height="168" rx="2" fill="#22c55e" />
        <line x1="304" y1="105" x2="304" y2="142" stroke="#22c55e" strokeWidth="2" />
        <rect x="268" y="175" width="14" height="133" rx="1" fill="#15803d" opacity="0.7" />
        <line x1="275" y1="152" x2="275" y2="177" stroke="#15803d" strokeWidth="1.5" opacity="0.7" />
        <rect x="248" y="200" width="14" height="108" rx="1" fill="#16a34a" opacity="0.7" />
        <line x1="255" y1="178" x2="255" y2="202" stroke="#16a34a" strokeWidth="1.5" opacity="0.7" />
      </g>

      {/* Green glow */}
      <rect width="480" height="380" fill="url(#gGlow)" />

      {/* Gain labels */}
      <text x="352" y="48" fontFamily="monospace" fontSize={11} fill="#4ade80" opacity="0.7">+2,847%</text>
      <text x="376" y="88" fontFamily="monospace" fontSize={9} fill="#22c55e" opacity="0.5">+481%</text>
      <text x="295" y="95" fontFamily="monospace" fontSize={9} fill="#22c55e" opacity="0.5">100x</text>

      {/* Table */}
      <ellipse cx="185" cy="308" rx="85" ry="14" fill="#1c0030" />
      <rect x="100" y="296" width="170" height="14" fill="#1c0030" rx="3" />
      <rect x="178" y="320" width="14" height="34" fill="#180028" rx="2" />
      <ellipse cx="185" cy="296" rx="85" ry="6" fill="none" stroke="#3d005e" strokeWidth="1.5" />

      {/* Mug */}
      <rect x="216" y="274" width="24" height="22" rx="4" fill="#1e0032" />
      <path d="M240 279 Q250 279 250 285 Q250 291 240 291" stroke="#6d28d9" strokeWidth="2" fill="none" />
      <ellipse cx="228" cy="275" rx="10" ry="3" fill="#2e0048" />
      <path d="M222 270 Q224 263 221 257" stroke="#7c3aed" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M228 269 Q230 262 228 255" stroke="#7c3aed" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5" />

      {/* Dog body */}
      <ellipse cx="185" cy="265" rx="46" ry="36" fill="#9333ea" />
      <path d="M145 280 Q148 295 155 302 Q165 308 175 305" stroke="#9333ea" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M225 280 Q222 295 215 302 Q205 308 195 305" stroke="#9333ea" strokeWidth="18" fill="none" strokeLinecap="round" />
      <circle cx="163" cy="304" r="5" fill="#a855f7" />
      <circle cx="171" cy="306" r="5" fill="#a855f7" />
      <circle cx="179" cy="306" r="5" fill="#a855f7" />
      <circle cx="207" cy="306" r="5" fill="#a855f7" />
      <circle cx="199" cy="307" r="5" fill="#a855f7" />
      <circle cx="191" cy="307" r="5" fill="#a855f7" />
      <rect x="170" y="240" width="30" height="22" rx="8" fill="#9333ea" />

      {/* Dog head */}
      <DogHead cx={185} cy={195} expression="calm" />

      {/* Speech bubble */}
      <SpeechBubble x={95} y={128} text="this is fine" subtext="everything is fine 📈" />

      <text x="14" y="370" fontFamily="monospace" fontSize={11} fill="#7c3aed" opacity="0.4">sol.new</text>
    </svg>
  );
}

// ─── Variant: "ngmi" — dejected dog, red candles raining down ──────────────

function MascotNgmi({ size, className }: { size: number; className?: string }) {
  const w = 320, h = 320;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={size} height={size} className={cn(className)}>
      <rect width={w} height={h} fill="#0d0018" rx="16" />
      {/* Red candles falling */}
      {[40,80,120,160,200,240,270].map((x, i) => (
        <g key={i}>
          <rect x={x} y={20 + i * 8} width={14} height={80 + i * 5} rx="2" fill="#dc2626" opacity={0.7 - i * 0.05} />
          <line x1={x + 7} y1={20 + i * 8} x2={x + 7} y2={18 + i * 8} stroke="#dc2626" strokeWidth="2" opacity={0.7} />
        </g>
      ))}
      {/* Sad dog, sitting alone */}
      <ellipse cx="160" cy="240" rx="46" ry="36" fill="#9333ea" />
      <rect x="145" y="215" width="30" height="22" rx="8" fill="#9333ea" />
      <DogHead cx={160} cy={170} expression="sad" />
      {/* Tear */}
      <ellipse cx="152" cy="188" rx="3" ry="5" fill="#60a5fa" opacity="0.8" />
      {/* Speech bubble */}
      <ellipse cx="245" cy="100" rx="58" ry="28" fill="white" />
      <polygon points="192,120 182,142 205,125" fill="white" />
      <text x="245" y="95" textAnchor="middle" fontFamily="sans-serif" fontSize={13} fontWeight={700} fill="#1e1b4b">ngmi</text>
      <text x="245" y="112" textAnchor="middle" fontFamily="sans-serif" fontSize={10} fill="#dc2626">💀📉</text>
      <text x="10" y="312" fontFamily="monospace" fontSize={10} fill="#7c3aed" opacity="0.4">sol.new</text>
    </svg>
  );
}

// ─── Variant: "wagmi" — euphoric dog, launching like a rocket ─────────────

function MascotWagmi({ size, className }: { size: number; className?: string }) {
  const w = 320, h = 320;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={size} height={size} className={cn(className)}>
      <rect width={w} height={h} fill="#0d0018" rx="16" />
      {/* Stars */}
      {[[50,40],[100,25],[200,50],[260,30],[280,80],[30,100]].map(([sx,sy],i) => (
        <circle key={i} cx={sx} cy={sy} r={1.5} fill="white" opacity={0.6} />
      ))}
      {/* Rocket flame */}
      <path d="M148 295 Q160 340 172 295" fill="#f97316" opacity="0.8" />
      <path d="M152 292 Q160 325 168 292" fill="#fbbf24" opacity="0.9" />
      {/* Dog body as rocket pilot */}
      <ellipse cx="160" cy="240" rx="46" ry="36" fill="#9333ea" />
      <rect x="145" y="215" width="30" height="22" rx="8" fill="#9333ea" />
      <DogHead cx={160} cy={168} expression="happy" />
      {/* Raised arm/paw */}
      <path d="M200 230 Q220 215 215 195" stroke="#9333ea" strokeWidth="16" fill="none" strokeLinecap="round" />
      <circle cx="215" cy="193" r="8" fill="#a855f7" />
      {/* Helmet visor */}
      <circle cx="160" cy="168" r="48" fill="none" stroke="#a5b4fc" strokeWidth="3" opacity="0.5" />
      {/* Speech bubble */}
      <ellipse cx="255" cy="95" rx="52" ry="28" fill="white" />
      <polygon points="208,110 198,132 215,115" fill="white" />
      <text x="255" y="90" textAnchor="middle" fontFamily="sans-serif" fontSize={14} fontWeight={700} fill="#1e1b4b">wagmi</text>
      <text x="255" y="107" textAnchor="middle" fontFamily="sans-serif" fontSize={11} fill="#22c55e">🚀🌙</text>
      <text x="10" y="312" fontFamily="monospace" fontSize={10} fill="#7c3aed" opacity="0.4">sol.new</text>
    </svg>
  );
}

// ─── Variant: "wen" — dog staring intensely at a loading spinner ──────────

function MascotWen({ size, className }: { size: number; className?: string }) {
  const w = 320, h = 320;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={size} height={size} className={cn(className)}>
      <rect width={w} height={h} fill="#0d0018" rx="16" />
      {/* Phone/screen showing sol.new loading */}
      <rect x="195" y="130" width="100" height="160" rx="12" fill="#160024" />
      <rect x="198" y="134" width="94" height="152" rx="10" fill="#1a002e" />
      {/* Spinner arc on phone */}
      <circle cx="245" cy="210" r="28" fill="none" stroke="#2e0048" strokeWidth="5" />
      <path d="M245 182 A28 28 0 0 1 273 210" stroke="#a855f7" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* "wen" on phone screen */}
      <text x="245" y="155" textAnchor="middle" fontFamily="monospace" fontSize={12} fill="#7c3aed">sol.new</text>
      {/* Dog staring at phone */}
      <ellipse cx="140" cy="250" rx="46" ry="36" fill="#9333ea" />
      <rect x="125" y="225" width="30" height="22" rx="8" fill="#9333ea" />
      {/* Arm holding phone pointed at screen */}
      <path d="M178 240 Q195 220 200 200" stroke="#9333ea" strokeWidth="15" fill="none" strokeLinecap="round" />
      <DogHead cx={140} cy={175} expression="calm" />
      {/* Sweat drop */}
      <path d="M188 160 Q192 150 188 145 Q184 150 188 160" fill="#60a5fa" opacity="0.8" />
      {/* Speech bubble */}
      <ellipse cx="68" cy="90" rx="55" ry="28" fill="white" />
      <polygon points="103,112 115,132 92,116" fill="white" />
      <text x="68" y="85" textAnchor="middle" fontFamily="sans-serif" fontSize={14} fontWeight={700} fill="#1e1b4b">wen</text>
      <text x="68" y="102" textAnchor="middle" fontFamily="sans-serif" fontSize={11} fill="#7c3aed">🕐🕐🕐</text>
      <text x="10" y="312" fontFamily="monospace" fontSize={10} fill="#7c3aed" opacity="0.4">sol.new</text>
    </svg>
  );
}

// ─── Variant: "gm" — dog with morning coffee, sunrise ────────────────────

function MascotGm({ size, className }: { size: number; className?: string }) {
  const w = 320, h = 320;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={size} height={size} className={cn(className)}>
      <defs>
        <radialGradient id="sunrise" cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#1e0048" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0d0018" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={w} height={h} fill="#0d0018" rx="16" />
      {/* Sunrise gradient */}
      <rect width={w} height={h} fill="url(#sunrise)" rx="16" />
      {/* Sun peeking from bottom */}
      <circle cx="160" cy="340" r="80" fill="#a855f7" opacity="0.3" />
      <circle cx="160" cy="340" r="55" fill="#7c3aed" opacity="0.2" />
      {/* Stars fading */}
      {[[40,30],[120,20],[220,35],[280,55]].map(([sx,sy],i) => (
        <circle key={i} cx={sx} cy={sy} r={1.5} fill="white" opacity={0.4} />
      ))}
      {/* Dog with mug, sitting, looking at horizon */}
      <ellipse cx="160" cy="250" rx="46" ry="36" fill="#9333ea" />
      <rect x="145" y="225" width="30" height="22" rx="8" fill="#9333ea" />
      {/* Arm with mug */}
      <path d="M200 240 Q215 235 218 225" stroke="#9333ea" strokeWidth="16" fill="none" strokeLinecap="round" />
      <rect x="208" y="208" width="22" height="20" rx="4" fill="#1e0032" />
      <path d="M230 213 Q238 213 238 218 Q238 223 230 223" stroke="#6d28d9" strokeWidth="2" fill="none" />
      <path d="M213 205 Q215 199 213 194" stroke="#7c3aed" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M218 204 Q220 198 218 193" stroke="#7c3aed" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5" />
      <DogHead cx={160} cy={175} expression="calm" />
      {/* Speech bubble */}
      <ellipse cx="68" cy="85" rx="52" ry="28" fill="white" />
      <polygon points="108,106 120,128 96,110" fill="white" />
      <text x="68" y="80" textAnchor="middle" fontFamily="sans-serif" fontSize={16} fontWeight={700} fill="#1e1b4b">gm</text>
      <text x="68" y="97" textAnchor="middle" fontFamily="sans-serif" fontSize={11} fill="#7c3aed">☀️ ser</text>
      <text x="10" y="312" fontFamily="monospace" fontSize={10} fill="#7c3aed" opacity="0.4">sol.new</text>
    </svg>
  );
}
