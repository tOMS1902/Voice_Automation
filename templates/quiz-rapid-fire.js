// Template "quiz-rapid-fire": N squares, 3 seconds each, easy to impossible. Viewers comment their score.
// Content comes from the episode (window.EPISODE), branding and voice from the product (window.PRODUCT).
// Episode fields: hook: [line1, line2], prompt, squares: [{ a, b, answers: [...], total, level, say? }],
//                 outro: [line1, line2], cta, voice_hook,
//                 style: { bg, accent, accent2, countdown, hookSize, revealSize, timerWidth, confetti, cd, music: { bpm, gain } }.
const EP = window.EPISODE;
const S = {
  bg: '#2A1236', accent: '#FFE14D', accent2: '#FFFFFF',
  countdown: 260, hookSize: 112, revealSize: 100, timerWidth: 600,
  confetti: ['#FFE14D', '#2ECC71', '#FFFFFF', '#B620E0', '#6CABDD'],
  cd: 3, music: { bpm: 128, gain: 0.8 },
  ...(EP.style ?? {}),
};
if (EP.style?.music) S.music = { bpm: 128, gain: 0.8, ...EP.style.music };
const QS = EP.squares.map((q, i, all) => ({ a: q.a, b: q.b, names: q.answers, n: q.total ?? q.answers.length, level: q.level ?? 'EASY', say: q.say, last: i === all.length - 1 }));
const HOOK = EP.hook ?? [`${QS.length} SQUARES. 3 SECONDS.`, `ONLY 1% GET ${QS.length}/${QS.length}`];
const OUTRO_TXT = EP.outro ?? ['HOW MANY', 'DID YOU GET?'];
const LEVEL = { EASY: Q.green, MEDIUM: '#F5A623', HARD: Q.red, IMPOSSIBLE: '#B620E0' };
const IN = 0.4, CD = S.cd, REVEAL = 1.2, OUT = 0.3;
let at = 2.0;
for (const q of QS) {
  q.start = at; q.cdAt = at + IN; q.revealAt = q.cdAt + CD;
  q.end = q.revealAt + (q.last ? 2.6 : REVEAL); at = q.end;
}
const OUTRO = at, END = OUTRO + 2.0, DURATION = END + 3.4;

/** Draws inner content inside the big square, moving with it. */
function inSq(k, out, inner) {
  if (k <= 0 || out >= 1) return '';
  const s = (0.5 + 0.5 * easeBack(clamp(k * 1.4))) * (1 - 0.3 * easeInOut(out)), dx = -easeInOut(out) * 700;
  return `<g transform="translate(${540 + dx} ${Q_SQ.y}) scale(${s.toFixed(3)})" opacity="${(clamp(k * 4) * (1 - out)).toFixed(3)}">${inner}</g>`;
}

function render(t) {
  let g = qBg(t, S.bg), ui = '';
  const pulse = 1 + 0.03 * Math.sin(t * 5);
  if (t < OUTRO) {
    g += qText(HOOK[0], 540, 240, S.hookSize, prog(t, 0.1, 0.5), { slam: true, pulse });
    g += qText(HOOK[1], 540, 370, S.hookSize, prog(t, 0.45, 0.85), { slam: true, pulse, fill: S.accent2 });
  } else if (t < END + 0.7) {
    g += qText(OUTRO_TXT[0], 540, 240, 120, prog(t, OUTRO, OUTRO + 0.4), { slam: true, pulse });
    g += qText(OUTRO_TXT[1], 540, 370, 120, prog(t, OUTRO + 0.15, OUTRO + 0.55), { slam: true, pulse, fill: S.accent2 });
  }
  if (t > 0.9 && t < QS[0].start + 0.2) {
    g += qText(EP.prompt ?? 'NAME A PLAYER WHO FITS BOTH', 540, 900, 70, prog(t, 0.9, 1.3), { fill: S.accent2, sw: 8, out: prog(t, QS[0].start - 0.1, QS[0].start + 0.2) });
  }

  for (const q of QS) {
    const k = prog(t, q.start, q.start + IN), out = prog(t, q.end - 0.05, q.end + OUT);
    if (k <= 0 || out >= 1) continue;
    const n = QS.indexOf(q) + 1, revealed = t >= q.revealAt, ft = 1 - prog(t, q.end - 0.25, q.end);
    g += qCard(t, q.a, q.b, k, out);
    const live = !revealed;
    g += qSquare(k, out, live ? Q.cellHi : Q.cell, live ? S.accent : null);
    if (live) {
      g += inSq(k, out, (t < q.cdAt ? `<text y="60" font-family="Bebas, Impact" font-size="220" text-anchor="middle" fill="${S.accent2}" opacity="0.25">?</text>` : '')
        + qCount(t, q.cdAt, CD, 0, 80, S.countdown));
      g += qPill(`${n}/${QS.length}  ${q.level}`, 540, 1335, 44, LEVEL[q.level], S.accent2, k * (1 - out));
      g += qTimerBar(240, 1395, S.timerWidth, prog(t, q.cdAt, q.revealAt));
    } else {
      const k2 = prog(t, q.revealAt, q.revealAt + 0.45);
      const kit = Q_CATS[q.a].kit;
      let inner = qShirt(0, -40, 220, kit, k2);
      const flash = 1 - prog(t, q.revealAt, q.revealAt + 0.35);
      if (flash > 0 && flash < 1) inner += qTile(-200, -200, 400, 400, '#FFFFFF', { r: 40, o: flash * 0.8 });
      g += inSq(k, out, inner);
      // names under the square
      q.names.forEach((name, i) => {
        const kn = prog(t, q.revealAt + i * 0.55, q.revealAt + i * 0.55 + 0.3) * ft;
        g += qText(name.toUpperCase(), 540, 1345 + i * 92, q.last ? 84 : S.revealSize, kn, { fill: i === 0 ? S.accent : S.accent2 });
      });
      if (!q.last) g += qText(`+${q.n - 1} MORE ANSWERS`, 540, 1440, 48, prog(t, q.revealAt + 0.25, q.revealAt + 0.5) * ft, { fill: S.accent2, sw: 6, ls: 1 });
      else {
        g += qText('THE ONLY 3 IN THE GAME', 540, 478, 58, prog(t, q.revealAt + 1.4, q.revealAt + 1.7) * ft, { fill: S.accent2, sw: 8 });
        g += confetti(540, 1000, prog(t, q.revealAt + 1.2, q.revealAt + 2.6), 7, S.confetti);
      }
    }
  }
  if (t >= OUTRO && t < END + 0.7) {
    g += qText(EP.cta ?? 'COMMENT YOUR SCORE', 540, 1000, 96, prog(t, OUTRO + 0.4, OUTRO + 0.8), { pulse: 1 + 0.04 * Math.sin(t * 8) });
    g += qText(`OUT OF ${QS.length}`, 540, 1110, 76, prog(t, OUTRO + 0.6, OUTRO + 1.0), { fill: S.accent2, sw: 8 });
  }
  ui += qEnd(t, END);
  paint(g, ui);
}

const cues = [{ at: 0.1, type: 'stamp', gain: 0.8 }, { at: 0.45, type: 'stamp', gain: 0.7 }, { at: 0.9, type: 'pop', gain: 0.6 }];
for (const q of QS) {
  cues.push({ at: q.start, type: 'whoosh', gain: 0.7 });
  for (let s = 0; s < CD; s++) cues.push({ at: q.cdAt + s, type: 'tick', gain: s === CD - 1 ? 1.4 : 1 }, { at: q.cdAt + s, type: 'blip', gain: 0.25 });
  if (q.last) cues.push({ at: q.revealAt - 0.7, type: 'rise', gain: 0.7 });
  cues.push({ at: q.revealAt, type: 'chime', gain: 0.9 }, { at: q.revealAt + 0.27, type: 'thud', gain: 0.8 });
  if (q.last) cues.push({ at: q.revealAt + 0.55, type: 'pop' }, { at: q.revealAt + 1.1, type: 'pop' }, { at: q.revealAt + 1.2, type: 'coin' }, { at: q.revealAt + 1.25, type: 'confetti' }, { at: q.revealAt + 1.3, type: 'cheer', gain: 0.7 });
}
cues.push({ at: OUTRO, type: 'whoosh' }, { at: OUTRO + 0.4, type: 'stamp', gain: 0.7 }, { at: END, type: 'whoosh' }, { at: END + 0.3, type: 'chime' });

// Voiceover, timed from the squares: the two headers when a square comes in, quiet for the
// countdown, the answer on the reveal. Voice, pronunciations and sign-off come from the product.
const spoken = cat => (Q_CATS[cat]?.say ?? Q_CATS[cat]?.short ?? cat).toLowerCase().replace(/(^|[\s.])([a-z])/g, (m, p, c) => p + c.toUpperCase());
const V = PRODUCT.voice ?? null;
const VOICE = V && EP.voice !== false ? {
  ...V,
  lines: [
    { at: 0.1, text: EP.voice_hook ?? `[excited] Only one percent get all ${QS.length}!` },
    ...QS.flatMap((q, i) => [
      { at: q.start + (i === 0 ? 0.4 : 0.1), text: `${q.last ? 'Last one. ' : ''}${spoken(q.a)}. ${spoken(q.b)}.` },
      { at: q.revealAt + 0.1, text: `[excited] ${q.say ?? q.names.map(n => n.split(' ').pop()).join(', ')}!` },
    ]),
    { at: OUTRO + 0.1, text: 'How many did you get?' },
    { at: END + 0.3, text: V.sign_off ?? `${PRODUCT.name}.` },
  ],
} : null;

window.AD = { FPS: 30, DURATION, render, VOICE, SOUND: { music: { from: 0.3, to: DURATION - 0.2, bpm: S.music.bpm, gain: S.music.gain }, cues } };
