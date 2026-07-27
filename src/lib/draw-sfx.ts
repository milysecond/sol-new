/**
 * Lightweight Web Audio SFX for Fair Draw (no external audio files).
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.08,
  when = 0,
) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst(duration: number, gain = 0.05, when = 0) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const n = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1200;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

export const drawSfx = {
  unlock() {
    getCtx();
  },

  tick() {
    tone(880 + Math.random() * 200, 0.04, "square", 0.035);
  },

  coinFlip() {
    tone(1200, 0.06, "triangle", 0.06);
    tone(1800, 0.08, "sine", 0.04, 0.05);
  },

  diceRattle() {
    noiseBurst(0.06, 0.07);
    tone(400 + Math.random() * 300, 0.05, "triangle", 0.03, 0.02);
  },

  wheelTick() {
    tone(640 + Math.random() * 80, 0.03, "square", 0.028);
  },

  land() {
    tone(523.25, 0.12, "sine", 0.07); // C5
    tone(659.25, 0.14, "sine", 0.06, 0.08); // E5
    tone(783.99, 0.2, "sine", 0.05, 0.16); // G5
  },

  win() {
    tone(523.25, 0.1, "triangle", 0.06);
    tone(659.25, 0.12, "triangle", 0.055, 0.1);
    tone(783.99, 0.14, "triangle", 0.05, 0.2);
    tone(1046.5, 0.28, "sine", 0.06, 0.32);
  },
};
