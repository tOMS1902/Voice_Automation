// Voiceover for the ads, in an ElevenLabs voice (by default Tom's clone).
// An ad declares window.AD.VOICE = { voice_id, model, pronunciations, lines: [{ at, text }] };
// render.mjs calls voice() and mixes it over the music, which ducks under the voice.
//
// Each line is generated on its own (ELEVENLABS_API_KEY in the environment or .env.local)
// and cached in out/voice-cache, so re-renders after a timing change cost no credits.
// Or pass a take made in the ElevenLabs app (lines separated by [long pause]): it is split on
// its pauses into the ad's lines.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SR = 44100;
const CACHE = 'out/voice-cache';

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1];
  }
  return null;
}

/** Decodes any audio file to mono float samples at SR. */
function decode(ffmpeg, path) {
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4).slice();
}

const peak = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Cuts leading and trailing silence, keeping a little air. */
function trim(a) {
  const th = peak(a) * 0.02;
  let s = 0, e = a.length - 1;
  while (s < e && Math.abs(a[s]) < th) s++;
  while (e > s && Math.abs(a[e]) < th) e--;
  return a.slice(Math.max(0, s - 0.05 * SR), Math.min(a.length, e + 0.1 * SR));
}

function say(text, prons = {}) {
  for (const [word, as] of Object.entries(prons)) text = text.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), as);
  return text;
}

async function tts(ffmpeg, text, v, key) {
  mkdirSync(CACHE, { recursive: true });
  const file = `${CACHE}/${createHash('sha1').update(JSON.stringify([v.voice_id, v.model, v.settings ?? null, text])).digest('hex')}.mp3`;
  if (!existsSync(file)) {
    if (!key) throw new Error('No ELEVENLABS_API_KEY (environment or .env.local). Or pass --take <file.mp3>.');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: v.model ?? 'eleven_v3', ...(v.settings ? { voice_settings: v.settings } : {}) }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  voiced: ${text}`);
  } else console.log(`  cached: ${text}`);
  return trim(decode(ffmpeg, file));
}

/** Splits one take into n lines: finds the spoken parts, then joins across the shortest gaps
 * until n are left (pauses inside a line are shorter than the [long pause] between lines). */
function split(a, n) {
  const w = Math.round(SR * 0.02), env = [];
  for (let i = 0; i + w < a.length; i += w) { let s = 0; for (let j = i; j < i + w; j++) s += a[j] * a[j]; env.push(Math.sqrt(s / w)); }
  const th = Math.max(...env) * 0.04, segs = [];
  let start = null, last = 0;
  env.forEach((v, i) => {
    if (v > th) { if (start === null) start = i; last = i; }
    else if (start !== null && (i - last) * 0.02 > 0.3) { segs.push([start, last]); start = null; }
  });
  if (start !== null) segs.push([start, last]);
  if (segs.length < n) throw new Error(`The take has ${segs.length} spoken parts but the ad has ${n} lines. Leave a clear pause between lines.`);
  while (segs.length > n) {
    let best = 0;
    for (let i = 1; i < segs.length - 1; i++) if (segs[i + 1][0] - segs[i][1] < segs[best + 1][0] - segs[best][1]) best = i;
    segs[best] = [segs[best][0], segs[best + 1][1]]; segs.splice(best + 1, 1);
  }
  return segs.map(([s, e]) => a.slice(Math.max(0, Math.round((s * 0.02 - 0.06) * SR)), Math.round((e * 0.02 + 0.12) * SR)));
}

/** Writes the voice track for the ad to a WAV. Returns false if the ad has no VOICE. */
export async function voice(VOICE, duration, path, { ffmpeg = 'ffmpeg', take = null } = {}) {
  if (!VOICE?.lines?.length) return false;
  const lines = VOICE.lines;
  const clips = take
    ? split(decode(ffmpeg, take), lines.length)
    : await (async () => { const key = apiKey(), out = []; for (const l of lines) out.push(await tts(ffmpeg, say(l.text, VOICE.pronunciations), VOICE, key)); return out; })();

  const buf = new Float32Array(Math.ceil(duration * SR));
  let prev = 0;
  console.log('voice timeline:');
  lines.forEach((l, i) => {
    const c = clips[i], f = Math.min(Math.round(0.01 * SR), c.length >> 1), end = l.at + c.length / SR;
    const warn = (l.at < prev ? '  <-- overlaps the line before' : '') + (end > duration ? '  <-- runs past the end' : '');
    console.log(`  ${l.at.toFixed(2).padStart(6)}-${end.toFixed(2).padStart(6)}  ${l.text}${warn}`);
    const s0 = Math.max(0, Math.round((l.at - 0.06) * SR));
    for (let j = 0; j < c.length && s0 + j < buf.length; j++) {
      const fade = j < f ? j / f : j > c.length - f ? (c.length - j) / f : 1;
      buf[s0 + j] += c[j] * fade;
    }
    prev = end;
  });
  const p = peak(buf) || 1, pcm = Buffer.alloc(44 + buf.length * 2);
  for (let i = 0; i < buf.length; i++) pcm.writeInt16LE(Math.round((buf[i] / p) * 0.9 * 32000), 44 + i * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + buf.length * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(buf.length * 2, 40);
  writeFileSync(path, pcm);
  return true;
}
