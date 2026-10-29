// Sound for the ads, synthesised from scratch (no samples, so nothing to license).
// An ad declares window.AD.SOUND = { music: { from, to, bpm }, cues: [{ at, type, gain }] };
// render.mjs calls mix() and muxes the WAV into the MP4.
// Cue types: pop, thud, whoosh, rise, chime, blip, coin, confetti, stamp, tick, lock, sad, send, cheer.
import { writeFileSync } from 'node:fs';

const SR = 44100;
const TAU = Math.PI * 2;

/** Deterministic noise, so every render sounds the same. */
function noise(seed = 1) {
  let s = seed * 15485863;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
}
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** Adds a sound to the buffer, where fn(t) gives the sample at t seconds into the sound. */
function add(buf, at, length, fn, gain = 1) {
  const start = Math.floor(at * SR), n = Math.floor(length * SR);
  for (let i = 0; i < n && start + i < buf.length; i++) if (start + i >= 0) buf[start + i] += fn(i / SR) * gain;
}

// One-pole low-pass, for whooshes and soft noise.
function lowpass(src, cutoffAt) {
  let y = 0;
  return t => { const c = cutoffAt(t), a = 1 - Math.exp(-TAU * c / SR); y += a * (src(t) - y); return y; };
}

const SFX = {
  // UI pop: quick upward blip
  pop: buf => (at, g) => add(buf, at, 0.12, t => Math.sin(TAU * (500 + 2600 * t) * t) * env(t, 0.004, 0.035), 0.5 * g),
  // landing: soft low thud with a click on top
  thud: buf => (at, g) => {
    const n = noise(at * 1000);
    add(buf, at, 0.25, t => Math.sin(TAU * (150 - 260 * Math.min(t, 0.2)) * t) * env(t, 0.002, 0.07) + n() * env(t, 0.001, 0.006) * 0.4, 0.7 * g);
  },
  // air moving past: filtered noise sweep
  whoosh: buf => (at, g) => {
    const n = noise(at * 77), f = lowpass(() => n(), t => 300 + 3500 * Math.sin(Math.PI * Math.min(t / 0.45, 1)));
    add(buf, at, 0.5, t => f(t) * Math.sin(Math.PI * Math.min(t / 0.5, 1)), 0.9 * g);
  },
  // building up: rising tone under a noise swell
  rise: buf => (at, g) => {
    const n = noise(at * 13), f = lowpass(() => n(), t => 400 + 6000 * t);
    add(buf, at, 0.7, t => (Math.sin(TAU * (200 * Math.pow(4, t / 0.7)) * t) * 0.3 + f(t) * 0.6) * (t / 0.7) * env(Math.max(0, t - 0.6), 0.001, 0.05), 0.5 * g);
  },
  // success: bright arpeggio (C E G C)
  chime: buf => (at, g) => [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
    add(buf, at + i * 0.07, 1.0, t => (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.01 * t)) * env(t, 0.003, 0.28), 0.22 * g)),
  // small score: two-tone blip
  blip: buf => (at, g) => {
    add(buf, at, 0.08, t => Math.sign(Math.sin(TAU * 988 * t)) * 0.3 * env(t, 0.002, 0.03), 0.4 * g);
    add(buf, at + 0.06, 0.12, t => Math.sign(Math.sin(TAU * 1319 * t)) * 0.3 * env(t, 0.002, 0.05), 0.4 * g);
  },
  // big score: coin plus shimmer
  coin: buf => (at, g) => {
    add(buf, at, 0.1, t => Math.sin(TAU * 1568 * t) * env(t, 0.002, 0.05), 0.4 * g);
    add(buf, at + 0.08, 0.6, t => (Math.sin(TAU * 2093 * t) + 0.5 * Math.sin(TAU * 3136 * t)) * env(t, 0.002, 0.18), 0.35 * g);
  },
  // confetti: a shower of tiny pops
  confetti: buf => (at, g) => {
    const n = noise(at * 31);
    for (let i = 0; i < 26; i++) {
      const dt = Math.abs(n()) * 0.8, f = 1800 + Math.abs(n()) * 3500;
      add(buf, at + dt, 0.04, t => Math.sin(TAU * f * t) * env(t, 0.001, 0.008), 0.18 * g * (1 - dt));
    }
  },
  // big stamp: boom plus slap
  stamp: buf => (at, g) => {
    const n = noise(at * 5);
    add(buf, at, 0.6, t => Math.sin(TAU * (90 - 40 * Math.min(t, 0.3)) * t) * env(t, 0.002, 0.18) + n() * env(t, 0.001, 0.03) * 0.6, 0.9 * g);
  },
  tick: buf => (at, g) => { const n = noise(at * 3); add(buf, at, 0.02, t => n() * env(t, 0.0005, 0.004), 0.35 * g); },
  // padlock: metallic clunk
  lock: buf => (at, g) => {
    const n = noise(at * 9);
    add(buf, at, 0.4, t => (Math.sin(TAU * 220 * t) * 0.5 + Math.sin(TAU * 663 * t) * 0.3 + Math.sin(TAU * 1197 * t) * 0.2) * env(t, 0.001, 0.09) + n() * env(t, 0.001, 0.01) * 0.5, 0.6 * g);
  },
  // the sad trombone: three falling notes, the last one wobbles
  sad: buf => (at, g) => [[293.7, 0.32], [277.2, 0.32], [261.6, 0.32], [246.9, 0.9]].forEach(([f, len], i) => {
    const t0 = [0, 0.32, 0.64, 0.96][i];
    add(buf, at + t0, len, t => {
      const wob = i === 3 ? 1 + 0.02 * Math.sin(TAU * 6 * t) : 1;
      let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(TAU * f * wob * h * t) / h;
      return s * env(t, 0.02, len * 0.7) * 0.25;
    }, 0.6 * g);
  }),
  // a message going out: soft "bloop"
  send: buf => (at, g) => add(buf, at, 0.18, t => Math.sin(TAU * (700 + 900 * Math.sin(Math.PI * Math.min(t / 0.18, 1))) * t) * env(t, 0.005, 0.06), 0.45 * g),
  // crowd-ish cheer: band-limited noise swell with a bright top
  cheer: buf => (at, g) => {
    const n = noise(at * 17), f = lowpass(() => n(), () => 2500);
    add(buf, at, 1.4, t => f(t) * Math.sin(Math.PI * Math.min(t / 1.4, 1)) * (1 + 0.3 * Math.sin(TAU * 7 * t)), 0.5 * g);
  },
};

/** A light, upbeat loop: kick, clap, hats, bass and chords (C, Am, F, G), between from and to seconds. */
function music(buf, { from = 0, to = 999, bpm = 112, gain = 1 }) {
  const beat = 60 / bpm, end = Math.min(to, buf.length / SR);
  const chords = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
  const roots = [65.4, 55.0, 87.3, 98.0];
  const fade = t => Math.min(1, (t - from) / 0.4) * Math.min(1, (end - t) / 0.6);
  for (let b = 0; from + b * beat < end; b++) {
    const at = from + b * beat, bar = Math.floor(b / 4) % 4, f = fade(at);
    if (f <= 0) continue;
    add(buf, at, 0.3, t => Math.sin(TAU * (130 * Math.exp(-t * 18) + 45) * t) * env(t, 0.001, 0.09), 0.55 * gain * f); // kick
    if (b % 4 === 1 || b % 4 === 3) { const n = noise(b + 1); add(buf, at, 0.2, t => (n() * 0.7 + Math.sin(TAU * 190 * t) * 0.3) * env(t, 0.001, 0.05), 0.22 * gain * f); } // clap
    for (const half of [0, 0.5]) { const n = noise(b * 2 + half * 10 + 3); add(buf, at + half * beat, 0.05, t => n() * env(t, 0.0005, 0.012), 0.07 * gain * f); } // hats
    add(buf, at, beat * 0.9, t => { const r = roots[bar]; return (Math.sin(TAU * r * t) + 0.35 * Math.sin(TAU * r * 2 * t)) * env(t, 0.005, beat * 0.5); }, 0.3 * gain * f); // bass
    if (b % 4 === 0) chords[bar].forEach(fr => add(buf, at, beat * 4, t => Math.sin(TAU * fr * t) * env(t, 0.08, beat * 2.2) * 0.5 + Math.sin(TAU * fr * 2 * t) * env(t, 0.02, beat * 0.6) * 0.15, 0.12 * gain * f)); // chords
  }
}

/** Renders the ad's sound to a 16-bit mono WAV. */
export function mix(sound, duration, path) {
  const buf = new Float32Array(Math.ceil(duration * SR));
  for (const m of [].concat(sound.music ?? [])) music(buf, m);
  for (const c of sound.cues ?? []) {
    const make = SFX[c.type];
    if (!make) throw new Error(`unknown sound "${c.type}"`);
    make(buf)(c.at, c.gain ?? 1);
  }
  // gentle limiter so overlapping sounds never clip
  const pcm = Buffer.alloc(44 + buf.length * 2);
  for (let i = 0; i < buf.length; i++) pcm.writeInt16LE(Math.round(Math.tanh(buf[i] * 0.9) * 32000), 44 + i * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + buf.length * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(buf.length * 2, 40);
  writeFileSync(path, pcm);
}

export const SOUND_TYPES = Object.keys(SFX);
