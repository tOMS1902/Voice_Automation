// Studio drawing engine (first made for Ball Knowledge ads): a miniature isometric world in the style of
// Airbnb's "Same Room" films (Buck Animation): warm off-white ground, toy figures,
// soft shadows, one simple idea per scene. Each ad in ads/ defines window.AD =
// { FPS, DURATION, render(t) } and draws with these helpers. Everything is a pure
// function of the time t, so render.mjs can record exact frames.
// See .claude/skills/ball-knowledge-ad/SKILL.md for the style rules.

const W = 1080, H = 1920;
const C30 = Math.cos(Math.PI / 6);

// ---- timing
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** 0 before a, 1 after b, linear between. */
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeBack = k => { const c1 = 1.70158, c3 = c1 + 1; return k <= 0 ? 0 : 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
/** A drop from above: falls, lands at 1, small bounce. */
const drop = k => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.6 ? Math.pow(k / 0.6, 2) : 1 - Math.sin((k - 0.6) / 0.4 * Math.PI) * 0.12 * (1 - (k - 0.6) / 0.4));

// ---- palette: the app's Classic Pitch colours, warmed up for the toy world
const PAL = {
  ink: '#1D3B2C', dim: '#4A5A50', red: '#C8102E', gold: '#E8B33A',
  tile: ['#62BB6C', '#57AE62'], tileL: '#3F8A4A', tileR: '#33753E',
  head: '#1F5A3A', headL: '#174730', headR: '#123A27',
  corner: '#C8102E', cornerL: '#9C0C23', cornerR: '#7E0A1C',
  base: '#2B6E45', baseL: '#1F5636', baseR: '#184A2D',
  track: '#DDD3C3', neutral: '#9AA7B0',
};
// Co-op colours, as in the app (src/lib/rooms.ts PLAYER_COLORS).
const PLAYER = { you: '#FFD23F', tom: '#3A86FF', sam: '#FF4D6D', ali: '#B983FF', joe: '#FF9F1C' };
const SKIN = { a: ['#E9B48A', '#2C1E14'], b: ['#F0C4A0', '#6B4A2B'], c: ['#C98C5E', '#1E1A16'], d: ['#8D5A3B', '#141010'], e: ['#F3D2B5', '#B5651D'] };

// ---- isometric camera: x runs down-right, y down-left, z up. Set ISO per scene.
const ISO = { ox: 540, oy: 900, s: 120 };
const P = (x, y, z = 0) => [ISO.ox + (x - y) * C30 * ISO.s, ISO.oy + (x + y) * 0.5 * ISO.s - z * ISO.s];
const pts = a => a.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');

/** A block: top face plus the two faces that show (x+w side on the right, y+d side on the left). */
function box(x, y, z, w, d, h, top, left, right, opacity = 1) {
  const T = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const R = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
  const L = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  return `<g opacity="${opacity}"><polygon points="${pts(L)}" fill="${left}"/><polygon points="${pts(R)}" fill="${right}"/><polygon points="${pts(T)}" fill="${top}"/></g>`;
}
/** Text lying flat on the floor plane, centred on (x, y). */
function floorText(x, y, z, text, size, color, opacity = 1) {
  const [sx, sy] = P(x, y, z);
  return `<text transform="matrix(${C30} 0.5 ${-C30} 0.5 ${sx} ${sy})" font-family="Bebas, Impact" font-size="${size}" fill="${color}" text-anchor="middle" opacity="${opacity}" letter-spacing="1">${text}</text>`;
}
/** Text on the left (y+d) face of a block, reading left to right. */
function sideText(x, y, z, text, size, color, opacity = 1) {
  const [sx, sy] = P(x, y, z);
  return `<text transform="matrix(${C30} 0.5 0 1 ${sx} ${sy})" font-family="Bebas, Impact" font-size="${size}" fill="${color}" text-anchor="middle" opacity="${opacity}">${text}</text>`;
}
/** Soft ground shadow under the whole scene. */
const groundShadow = (cx, cy, rx, ry, o = 0.35) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#CFC4B2" opacity="${o}" filter="url(#soft)"/>`;

// ---- props, standing upright with their base on a world point
const SHIRT = 'M30 8 L42 3 Q50 12 58 3 L70 8 L94 22 L83 42 L73 35 L73 94 L27 94 L27 35 L17 42 L6 22 Z';
/**
 * A shirt. opts: stripe colour (one down the middle), hoops / stripes colour (bands across
 * or down, the kit's second colour), sleeves colour, squash (landing), opacity, numColor.
 */
let shirtClip = 0;
function shirt(x, y, z, size, fill, number, opts = {}) {
  const [sx, sy] = P(x, y, z);
  const k = size / 100, sq = opts.squash ?? 1;
  let stripe = opts.stripe ? `<path d="M44 6 L56 6 L56 94 L44 94 Z" fill="${opts.stripe}"/>` : '';
  if (opts.hoops || opts.stripes) {
    const id = `shc${shirtClip++}`;
    const bands = opts.hoops
      ? [14, 34, 54, 74].map(y0 => `<rect x="0" y="${y0}" width="100" height="10" fill="${opts.hoops}"/>`).join('')
      : [22, 40, 58, 76].map(x0 => `<rect x="${x0}" y="0" width="9" height="100" fill="${opts.stripes}"/>`).join('');
    stripe += `<clipPath id="${id}"><path d="${SHIRT}"/></clipPath><g clip-path="url(#${id})">${bands}</g>`;
  }
  if (opts.sleeves) stripe += `<path d="M30 8 L6 22 L17 42 L27 35 Z M70 8 L94 22 L83 42 L73 35 Z" fill="${opts.sleeves}"/>`;
  const num = number != null ? `<text x="50" y="66" font-family="Bebas, Impact" font-size="38" text-anchor="middle" fill="${opts.numColor ?? PAL.ink}">${number}</text>` : '';
  return `<g transform="translate(${sx - 50 * k * (2 - sq)},${sy - 94 * k * sq}) scale(${k * (2 - sq)},${k * sq})" opacity="${opts.opacity ?? 1}">
    <path d="${SHIRT}" fill="${fill}" stroke="rgba(0,0,0,0.18)" stroke-width="3"/>${stripe}${num}</g>`;
}
function trophy(x, y, z, size, opacity = 1) {
  const [sx, sy] = P(x, y, z); const k = size / 100;
  return `<g transform="translate(${sx - 50 * k},${sy - 100 * k}) scale(${k})" opacity="${opacity}">
    <path d="M28 8 H72 V30 Q72 58 50 62 Q28 58 28 30 Z" fill="${PAL.gold}"/>
    <path d="M28 14 Q10 14 12 30 Q14 44 30 44 M72 14 Q90 14 88 30 Q86 44 70 44" fill="none" stroke="${PAL.gold}" stroke-width="6"/>
    <rect x="44" y="60" width="12" height="18" fill="#D19A25"/><rect x="30" y="78" width="40" height="16" rx="3" fill="#B98216"/></g>`;
}
function ball(x, y, z, size) {
  const [sx, sy] = P(x, y, z); const r = size / 2;
  return `<g transform="translate(${sx},${sy - r})"><circle r="${r}" fill="#fff" stroke="${PAL.ink}" stroke-width="3"/>
    <polygon points="0,${-r * 0.42} ${r * 0.4},${-r * 0.13} ${r * 0.25},${r * 0.34} ${-r * 0.25},${r * 0.34} ${-r * 0.4},${-r * 0.13}" fill="${PAL.ink}"/></g>`;
}
function padlock(x, y, z, size, opacity = 1) {
  const [sx, sy] = P(x, y, z); const k = size / 100;
  return `<g transform="translate(${sx - 50 * k},${sy - 110 * k}) scale(${k})" opacity="${opacity}">
    <path d="M28 50 V32 Q28 8 50 8 Q72 8 72 32 V50" fill="none" stroke="#7D8A84" stroke-width="12"/>
    <rect x="14" y="46" width="72" height="62" rx="12" fill="#E2A93B"/><rect x="14" y="46" width="72" height="14" rx="6" fill="#F0BE5A"/>
    <circle cx="50" cy="74" r="8" fill="#5B4115"/><rect x="46" y="76" width="8" height="18" rx="3" fill="#5B4115"/></g>`;
}
function crown(x, y, z, size, opacity = 1) {
  const [sx, sy] = P(x, y, z); const k = size / 100;
  return `<g transform="translate(${sx - 50 * k},${sy - 70 * k}) scale(${k})" opacity="${opacity}">
    <path d="M10 62 L16 18 L36 40 L50 8 L64 40 L84 18 L90 62 Z" fill="${PAL.gold}" stroke="#B98216" stroke-width="4" stroke-linejoin="round"/>
    <rect x="10" y="58" width="80" height="12" rx="4" fill="#D19A25"/><circle cx="50" cy="36" r="6" fill="${PAL.red}"/></g>`;
}
/** Burst of confetti around a screen point, k from 0 (start) to 1 (gone). */
function confetti(cx, cy, k, seed = 1, colors = [PAL.gold, PLAYER.you, PLAYER.sam, PLAYER.tom, '#FFFFFF']) {
  if (k <= 0 || k >= 1) return '';
  let out = '', r = seed * 9301;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, v = 260 + rnd() * 380, spin = rnd() * 720;
    const x = cx + Math.cos(a) * v * easeOut(k), y = cy + Math.sin(a) * v * easeOut(k) * 0.8 + 520 * k * k;
    out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="16" height="9" rx="2" fill="${colors[i % colors.length]}" opacity="${1 - k}" transform="rotate(${(spin * k).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return out;
}
/**
 * A toy figure: legs, rounded body in the player's colour, head, phone in hand.
 * opts: size, scale (pop in), bob (px, negative = hop), droop 0..1 (sad), glow (phone lit),
 * skin, hair, label (name tag above), opacity.
 */
function figure(x, y, z, color, opts = {}) {
  const [sx, sy] = P(x, y, z); const k = (opts.size ?? 1) * ISO.s / 120;
  const bob = opts.bob ?? 0, droop = opts.droop ?? 0, glow = opts.glow ?? 0, sc = opts.scale ?? 1;
  const skin = opts.skin ?? SKIN.a[0], hair = opts.hair ?? SKIN.a[1];
  return `<g transform="translate(${sx},${sy}) scale(${k * sc})" opacity="${opts.opacity ?? 1}">
    <ellipse cx="0" cy="0" rx="34" ry="12" fill="#000" opacity="0.18"/>
    <rect x="-17" y="${-46 + bob}" width="13" height="46" rx="6" fill="#2D3A44"/><rect x="4" y="${-46 + bob}" width="13" height="46" rx="6" fill="#2D3A44"/>
    <rect x="-26" y="${-118 + bob}" width="52" height="80" rx="22" fill="${color}"/>
    <g transform="translate(0,${-128 + bob}) rotate(${droop * 18})">
      <circle cx="0" cy="-22" r="25" fill="${skin}"/>
      <path d="M-25 -26 Q-24 -52 0 -50 Q24 -52 25 -26 Q12 -36 -25 -26 Z" fill="${hair}"/>
    </g>
    <rect x="-8" y="${-96 + bob + droop * 18}" width="30" height="40" rx="6" fill="#21272B"/>
    <rect x="-4" y="${-92 + bob + droop * 18}" width="22" height="30" rx="3" fill="${glow ? '#BFF5C6' : '#3C474F'}"/>
    <rect x="-30" y="${-86 + bob + droop * 18}" width="40" height="13" rx="6" fill="${color}" transform="rotate(-25 -10 ${-80 + bob})"/>
    ${opts.label ? `<g transform="translate(0,${-200 + bob})"><rect x="-64" y="-34" width="128" height="48" rx="24" fill="${color}"/><text y="2" font-family="Bebas, Impact" font-size="40" text-anchor="middle" fill="${PAL.ink}">${opts.label}</text></g>` : ''}
  </g>`;
}
/**
 * A cutaway room, dollhouse style: floor slab and the two back walls, open to the viewer.
 * wall: pastel colour. rise 0..1 slides it up from below.
 */
const ROOM_WALLS = { cream: ['#F3E3C8', '#E3CFAE', '#D6C09C'], sage: ['#CFE3D3', '#B6CFBB', '#A3BFA9'], peach: ['#F6D3C4', '#E6BBA8', '#D9AA95'], sky: ['#D3DDF0', '#BAC7E0', '#A8B6D3'] };
function room(x, y, z, w, d, h, wall = 'cream', rise = 1, opts = {}) {
  const [top, l, r] = ROOM_WALLS[wall] ?? ROOM_WALLS.cream;
  const zz = z - (1 - rise) * 1.5, o = clamp(rise * 2) * (opts.opacity ?? 1);
  const floor = opts.lit ? '#FFF1B8' : '#E9DCC6';
  let g = box(x, y, zz, w, d, 0.12, floor, '#CDBB9E', '#BCA98B', o);
  g += box(x, y, zz + 0.12, 0.08, d, h, top, l, r, o);          // back-left wall
  g += box(x, y, zz + 0.12, w, 0.08, h, top, l, r, o);          // back-right wall
  if (opts.sofa) g += box(x + 0.12, y + 0.2, zz + 0.12, 0.42, d * 0.6, 0.28, opts.sofa, shadeHex(opts.sofa, 0.85), shadeHex(opts.sofa, 0.7), o);
  if (opts.lamp) { g += box(x + w - 0.3, y + 0.15, zz + 0.12, 0.08, 0.08, 0.7, '#7D6E5B', '#6B5D4C', '#5E5243', o); g += box(x + w - 0.38, y + 0.07, zz + 0.82, 0.24, 0.24, 0.16, '#FFE7A3', '#F2D68A', '#E6C877', o); }
  return g;
}
/** A darker shade of a hex colour (for block sides). */
function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f)).join(',')})`;
}
/** A chat bubble above a world point, popping in with k (0..1); fades out with out (0..1). */
function bubble(x, y, z, text, k, opts = {}) {
  if (k <= 0) return '';
  const [sx, sy] = P(x, y, z);
  const size = opts.size ?? 34, wPx = Math.max(90, text.length * size * 0.52 + 44), hPx = size + 30;
  const s = easeBack(clamp(k * 2.5)), o = clamp(k * 6) * (1 - (opts.out ?? 0));
  const fill = opts.fill ?? '#FFFFFF', ink = opts.ink ?? PAL.ink;
  return `<g transform="translate(${sx},${sy}) scale(${s})" opacity="${o}">
    <rect x="${-wPx / 2}" y="${-hPx}" width="${wPx}" height="${hPx}" rx="${hPx / 2}" fill="${fill}" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>
    <path d="M -12 -2 L 0 18 L 12 -2 Z" fill="${fill}"/>
    <text y="${-hPx / 2 + size * 0.36}" font-family="'Segoe UI', Arial" font-weight="700" font-size="${size}" text-anchor="middle" fill="${ink}">${text}</text></g>`;
}
/** A message flying from one world point to another along an arc; k 0..1 travel. */
function arc(from, to, k, color = PAL.ink) {
  if (k <= 0) return '';
  const [ax, ay] = P(...from), [bx, by] = P(...to);
  const cx = (ax + bx) / 2, cy = Math.min(ay, by) - 180;
  const at = u => [(1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy + u * u * by];
  const head = easeInOut(clamp(k)), tail = clamp(head - 0.35);
  let d = '';
  for (let i = 0; i <= 24; i++) { const [px, py] = at(tail + (head - tail) * i / 24); d += `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)} `; }
  const [hx, hy] = at(head);
  const o = 1 - prog(k, 0.9, 1);
  return `<g opacity="${o}"><path d="${d}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 16"/>
    <circle cx="${hx}" cy="${hy}" r="16" fill="${color}" stroke="#fff" stroke-width="4"/></g>`;
}

/** A floating "+N" that rises and fades. k 0..1. */
function pointsPop(x, y, z, text, k, size = 64, color = PAL.ink) {
  if (k <= 0 || k >= 1) return '';
  const [sx, sy] = P(x, y, z);
  return `<text x="${sx}" y="${sy - easeOut(k) * 110}" font-family="Bebas, Impact" font-size="${size * (0.7 + 0.3 * easeBack(clamp(k * 3)))}" text-anchor="middle" fill="${color}" opacity="${clamp((1 - k) * 3)}" stroke="#F7F3EC" stroke-width="8" paint-order="stroke">${text}</text>`;
}

/**
 * The game grid: a 4x4 board (corner, 3 column headers, 3 row headers, 9 squares).
 * cols/rows: [{ key, icon: { shirt, stripe } | { trophy: true } }]. events: answers
 * [{ name, cells: [square index row*3+col], at: seconds, color }]. rise: when tiles rise.
 */
function board(t, { cols, rows, events = [], rise = 0, opacity = 1 }) {
  let g = '';
  const baseK = easeBack(prog(t, rise, rise + 0.6));
  g += box(-0.12, -0.12, -0.45, 4.36, 4.36, 0.35 * baseK, PAL.base, PAL.baseL, PAL.baseR, clamp(baseK * 2) * opacity);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const r = easeBack(prog(t, rise + 0.3 + (i + j) * 0.07, rise + 0.75 + (i + j) * 0.07));
    if (r <= 0) continue;
    const corner = i === 0 && j === 0, head = i === 0 || j === 0;
    g += box(i * 1.04, j * 1.04, -1.2 + r * 1.2, 0.96, 0.96, 0.24,
      corner ? PAL.corner : head ? PAL.head : PAL.tile[(i + j) % 2],
      corner ? PAL.cornerL : head ? PAL.headL : PAL.tileL,
      corner ? PAL.cornerR : head ? PAL.headR : PAL.tileR, clamp(r * 3) * opacity);
  }
  const labK = prog(t, rise + 0.9, rise + 1.3) * opacity;
  cols.forEach((c, n) => { g += floorText((n + 1) * 1.04 + 0.48, 0.86, 0.24, c.key, 26, '#FFFFFF', labK); });
  rows.forEach((r, n) => { g += floorText(0.48, (n + 1) * 1.04 + 0.86, 0.24, r.key, 26, '#FFFFFF', labK); });
  const icon = (o, x, y, a) => {
    const z = 0.24 + (1 - drop(prog(t, a, a + 0.5))) * 2;
    if (prog(t, a, a + 0.5) <= 0) return '';
    return o.icon.trophy ? trophy(x, y, z, 70, opacity) : shirt(x, y, z, 66, o.icon.shirt, null, { stripe: o.icon.stripe, hoops: o.icon.hoops, stripes: o.icon.stripes, sleeves: o.icon.sleeves, opacity });
  };
  if (prog(t, rise + 1.0, rise + 1.5) > 0) g += ball(0.5, 0.5, 0.24 + (1 - drop(prog(t, rise + 1.0, rise + 1.5))) * 2, 64);
  cols.forEach((c, n) => { g += icon(c, (n + 1) * 1.04 + 0.48, 0.42, rise + 1.0 + n * 0.08); });
  rows.forEach((r, n) => { g += icon(r, 0.48, (n + 1) * 1.04 + 0.42, rise + 1.2 + n * 0.08); });
  // answers: the latest shirt in each square, numbered with how many are in it
  const count = Array(9).fill(0), last = Array(9).fill(null);
  for (const e of events) {
    const k = prog(t, e.at, e.at + 0.45);
    if (k <= 0) continue;
    for (const c of e.cells) { count[c]++; last[c] = { e, k }; }
  }
  const items = [];
  for (let c = 0; c < 9; c++) {
    if (!last[c]) continue;
    const cx = 1 + (c % 3), cy = 1 + Math.floor(c / 3);
    const { e, k } = last[c];
    const sq = 1 - Math.sin(clamp(prog(k, 0.55, 0.8)) * Math.PI) * 0.18;
    const short = e.name.length > 9 ? e.name.split(' ').pop() : e.name;
    items.push({ d: cx + cy, s: shirt(cx * 1.04 + 0.48, cy * 1.04 + 0.4, 0.24 + (1 - drop(k)) * 2.2, 70, e.color ?? '#FFFFFF', count[c], { squash: sq, opacity }) });
    items.push({ d: cx + cy + 0.01, s: floorText(cx * 1.04 + 0.48, cy * 1.04 + 0.86, 0.24, short, 22, '#FFFFFF', clamp(k * 2) * opacity) });
  }
  items.sort((a, b) => a.d - b.d).forEach(x => { g += x.s; });
  return g;
}

// ---- type, as HTML over the world
/** Headline: pops in, fades out at the end of its window. k = prog over the window. */
function cap(text, y, size, k, color = PAL.ink) {
  const o = clamp(k * 3) * clamp((1 - k) * 4 + 0.0001);
  const s = 0.8 + 0.2 * easeBack(clamp(k * 3));
  return `<div class="cap" style="top:${y}px;font-size:${size}px;opacity:${o};transform:scale(${s});color:${color}">${text}</div>`;
}
/** Supporting line, slides up. */
function sub(text, y, k) {
  const o = clamp(k * 3) * clamp((1 - k) * 4 + 0.0001);
  return `<div class="sub" style="top:${y}px;opacity:${o};transform:translateY(${(1 - easeOut(clamp(k * 3))) * 30}px)">${text}</div>`;
}
/** Big stamped word ("NAH."). */
function stamp(text, y, size, k, color = PAL.red, tilt = -6) {
  if (k <= 0) return '';
  return `<div class="cap" style="top:${y}px;font-size:${size * (0.6 + 0.4 * easeBack(clamp(k * 3)))}px;opacity:${clamp(k * 4) * clamp((1 - k) * 5)};color:${color};transform:rotate(${tilt}deg)">${text}</div>`;
}
/** Live race bars, like the co-op table. rows: [{ who, value }], max for the full bar. */
function raceBars(rows, top, max, opacity) {
  const order = [...rows].sort((a, b) => b.value - a.value);
  return `<div style="position:absolute;left:150px;right:150px;top:${top}px;opacity:${opacity}">` + order.map((r, n) => `
    <div style="display:flex;align-items:center;gap:22px;height:72px;font-family:Bebas,Impact;font-size:48px;color:${PAL.ink}">
      <div style="width:30px">${n + 1}</div><div style="width:110px">${r.who.toUpperCase()}</div>
      <div style="flex:1;height:34px;background:${PAL.track};border-radius:17px;overflow:hidden"><div style="height:100%;width:${Math.max(4, r.value / max * 100)}%;background:${PLAYER[r.who]};border-radius:17px"></div></div>
      <div style="width:60px;text-align:right">${Math.round(r.value)}</div></div>`).join('') + '</div>';
}
/** The closing card: icon, name, line, pill. Starts at `at`. */
function endCard(t, at, line = PRODUCT.end_line, pill = PRODUCT.pill) {
  const k = prog(t, at, at + 0.8);
  if (k <= 0) return '';
  const s = 0.7 + 0.3 * easeBack(clamp(k * 1.5));
  return `<div style="position:absolute;left:0;right:0;top:1060px;display:flex;flex-direction:column;align-items:center;gap:26px;opacity:${clamp(k * 3)};transform:scale(${s})">
    <img src="${PRODUCT.icon}" style="width:230px;height:230px;border-radius:52px;box-shadow:0 24px 50px rgba(0,0,0,0.22)">
    <div style="font-family:Bebas,Impact;font-size:150px;color:${PAL.ink};letter-spacing:3px;line-height:1">${PRODUCT.name.toUpperCase()}</div>
    <div style="font-family:'Segoe UI',Arial;font-weight:600;font-size:48px;color:${PAL.dim}">${line}</div>
    <div style="margin-top:14px;font-family:Bebas,Impact;font-size:60px;color:#fff;background:${PAL.ink};padding:14px 46px;border-radius:999px;letter-spacing:2px">${pill}</div></div>`;
}

/** Writes a frame. g = SVG world, ui = HTML overlay. */
function paint(g, ui) {
  document.getElementById('world').innerHTML = g;
  document.getElementById('ui').innerHTML = ui;
}

// ===================================================================================
// ---- quiz kit: the "guess the player" quiz-channel look (dark, loud, timer, reveal).
// Flat 2D, all SVG. Used by the quiz-* ads. Same facts rule: every answer from check.ts.
const Q = { yellow: '#FFE14D', red: '#FF3B3B', green: '#2ECC71', grey: '#8A8F98', ink: '#0B0B0F', cell: '#16352A', cellHi: '#1F4A3A', head: '#0C3B2E' };
// Kits as in src/lib/kits.ts (colours and pattern only). Flags are plain bands.
// The product (products/<name>/product.yaml) is injected by the studio as window.PRODUCT.
const PRODUCT = window.PRODUCT ?? { name: 'PRODUCT', tagline: '', end_line: '', pill: '', icon: '', categories: {} };
// Quiz categories (header icons): from the product's `categories`.
const Q_CATS = PRODUCT.categories ?? {};

/** Dark background with slow light rays and a vignette. */
function qBg(t, tint = '#123326') {
  let g = `<defs><radialGradient id="qbg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="${tint}"/><stop offset="0.55" stop-color="#0A1511"/><stop offset="1" stop-color="#040706"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#qbg)"/>`;
  const rot = t * 6;
  let rays = '';
  for (let i = 0; i < 12; i++) rays += `<path d="M0 0 L-90 -1500 L90 -1500 Z" fill="#FFFFFF" opacity="0.035" transform="rotate(${i * 30})"/>`;
  return g + `<g transform="translate(540 860) rotate(${rot.toFixed(2)})">${rays}</g>`;
}
/** Loud outlined text (yellow fill, thick black stroke). k pops it in; out fades it. */
function qText(text, x, y, size, k = 1, opts = {}) {
  if (k <= 0) return '';
  const s = (opts.slam ? 1 + 0.6 * (1 - easeBack(clamp(k * 2.2))) : 0.7 + 0.3 * easeBack(clamp(k * 3))) * (opts.pulse ?? 1);
  const o = clamp(k * 5) * (1 - (opts.out ?? 0));
  return `<g transform="translate(${x} ${y}) rotate(${opts.tilt ?? 0}) scale(${s.toFixed(3)})" opacity="${o.toFixed(3)}">
    <text x="0" y="0" font-family="Bebas, Impact" font-size="${size}" text-anchor="${opts.anchor ?? 'middle'}" fill="${opts.fill ?? Q.yellow}"
      stroke="${opts.stroke ?? '#000'}" stroke-width="${opts.sw ?? size * 0.12}" stroke-linejoin="round" paint-order="stroke" letter-spacing="${opts.ls ?? 2}">${text}</text></g>`;
}
/** A rounded pill with a word in it. */
function qPill(text, x, y, size, fill, ink = '#FFFFFF', k = 1) {
  if (k <= 0) return '';
  const w = text.length * size * 0.5 + size * 1.1, h = size * 1.35, s = 0.6 + 0.4 * easeBack(clamp(k * 3));
  return `<g transform="translate(${x} ${y}) scale(${s.toFixed(3)})" opacity="${clamp(k * 5)}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>
    <text y="${size * 0.36}" font-family="Bebas, Impact" font-size="${size}" text-anchor="middle" fill="${ink}" letter-spacing="2">${text}</text></g>`;
}
/** A flat shirt centred on (cx, cy) in a kit [primary, secondary, pattern]. drop 0..1 falls in from above. */
let qClip = 0;
function qShirt(cx, cy, size, kit, k = 1) {
  if (k <= 0) return '';
  const [a, b, pat] = kit, s = size / 100, id = `qs${qClip++}`;
  const y = cy - (1 - drop(k)) * 260, sq = 1 - Math.sin(clamp(prog(k, 0.55, 0.8)) * Math.PI) * 0.15;
  let extra = '';
  if (pat === 'stripes') extra = [22, 40, 58, 76].map(x0 => `<rect x="${x0}" y="0" width="9" height="100" fill="${b}"/>`).join('');
  if (pat === 'hoops') extra = [14, 34, 54, 74].map(y0 => `<rect x="0" y="${y0}" width="100" height="10" fill="${b}"/>`).join('');
  if (pat === 'sleeves') extra = `<path d="M30 8 L6 22 L17 42 L27 35 Z M70 8 L94 22 L83 42 L73 35 Z" fill="${b}"/>`;
  if (pat === 'plain' && b && a.toUpperCase() === '#FFFFFF') extra = `<path d="M42 3 Q50 12 58 3 L56 9 Q50 16 44 9 Z" fill="${b}"/>`;
  return `<g transform="translate(${cx - 50 * s * (2 - sq)} ${y - 50 * s * sq}) scale(${s * (2 - sq)} ${s * sq})" opacity="${clamp(k * 4)}">
    <clipPath id="${id}"><path d="${SHIRT}"/></clipPath>
    <path d="${SHIRT}" fill="${a}"/><g clip-path="url(#${id})">${extra}</g>
    <path d="${SHIRT}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="3"/></g>`;
}
/** A flag of three plain bands, centred. */
function qFlag(cx, cy, w, flag, k = 1) {
  if (k <= 0) return '';
  const [dir, ...c] = flag, h = w * 0.66, s = 0.6 + 0.4 * easeBack(clamp(k * 3));
  const bands = c.map((col, i) => dir === 'v'
    ? `<rect x="${-w / 2 + i * w / 3}" y="${-h / 2}" width="${w / 3 + 0.5}" height="${h}" fill="${col}"/>`
    : `<rect x="${-w / 2}" y="${-h / 2 + i * h / 3}" width="${w}" height="${h / 3 + 0.5}" fill="${col}"/>`).join('');
  return `<g transform="translate(${cx} ${cy}) scale(${s})" opacity="${clamp(k * 4)}">${bands}<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="3" rx="4"/></g>`;
}
/** A gold ball (for awards). */
function qAward(cx, cy, r, k = 1) {
  if (k <= 0) return '';
  const s = 0.6 + 0.4 * easeBack(clamp(k * 3));
  return `<g transform="translate(${cx} ${cy}) scale(${s})" opacity="${clamp(k * 4)}"><circle r="${r}" fill="#E8B33A" stroke="#9C6B12" stroke-width="5"/>
    <polygon points="0,${-r * 0.42} ${r * 0.4},${-r * 0.13} ${r * 0.25},${r * 0.34} ${-r * 0.25},${r * 0.34} ${-r * 0.4},${-r * 0.13}" fill="#9C6B12"/>
    <ellipse cx="${-r * 0.35}" cy="${-r * 0.45}" rx="${r * 0.22}" ry="${r * 0.12}" fill="#FFF3C4" opacity="0.7"/></g>`;
}
/** The header icon for a category label. */
function qIcon(label, cx, cy, size, k = 1) {
  const c = Q_CATS[label];
  if (!c) throw new Error(`no quiz category "${label}"`);
  if (c.kit) return qShirt(cx, cy, size, c.kit, k);
  if (c.flag) return qFlag(cx, cy, size * 1.05, c.flag, k);
  return qAward(cx, cy, size * 0.42, k);
}
/** A rounded tile. */
const qTile = (x, y, w, h, fill, opts = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opts.r ?? 22}" fill="${fill}" ${opts.stroke ? `stroke="${opts.stroke}" stroke-width="${opts.sw ?? 8}"` : ''} opacity="${opts.o ?? 1}"/>`;
/** Countdown: a draining bar at y plus the seconds left (number drawn by the caller where it wants). */
function qTimerBar(x, y, w, k) {
  const left = 1 - clamp(k);
  const col = left > 0.5 ? Q.green : left > 0.25 ? Q.yellow : Q.red;
  return `<rect x="${x}" y="${y}" width="${w}" height="26" rx="13" fill="#FFFFFF" opacity="0.15"/>
    <rect x="${x}" y="${y}" width="${Math.max(0, w * left)}" height="26" rx="13" fill="${col}"/>`;
}
/** Seconds left as a big number, popping on each new second. */
function qCount(t, start, secs, x, y, size) {
  const e = t - start;
  if (e < 0 || e >= secs) return '';
  const n = Math.ceil(secs - e), f = e - Math.floor(e);
  return qText(String(n), x, y, size, 1, { pulse: 1 + 0.35 * (1 - easeOut(clamp(f * 4))), fill: n === 1 ? Q.red : '#FFFFFF' });
}
/** Short name for a cell: surname, or the whole name if it is one word. */
const qShort = name => (name.includes(' ') ? name.split(' ').pop() : name).toUpperCase();
/** Closing card on the dark background. */
function qEnd(t, at, line = PRODUCT.end_line) {
  const k = prog(t, at, at + 0.7);
  if (k <= 0) return '';
  const s = 0.7 + 0.3 * easeBack(clamp(k * 1.5));
  return `<div style="position:absolute;inset:0;background:rgba(4,7,6,${0.9 * clamp(k * 2)})"></div>
    <div style="position:absolute;left:0;right:0;top:330px;text-align:center;font-family:Bebas,Impact;font-size:96px;letter-spacing:2px;color:${Q.yellow};-webkit-text-stroke:0;text-shadow:0 6px 0 #000;opacity:${clamp(k * 3)}">${PRODUCT.end_title ?? ""}</div>
    <div style="position:absolute;left:0;right:0;top:560px;display:flex;flex-direction:column;align-items:center;gap:26px;opacity:${clamp(k * 3)};transform:scale(${s})">
    <img src="${PRODUCT.icon}" style="width:240px;height:240px;border-radius:54px;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
    <div style="font-family:Bebas,Impact;font-size:150px;color:#fff;letter-spacing:3px;line-height:1">${PRODUCT.name.toUpperCase()}</div>
    <div style="font-family:'Segoe UI',Arial;font-weight:600;font-size:46px;color:#C9D3CC">${line}</div>
    <div style="margin-top:14px;font-family:Bebas,Impact;font-size:62px;color:${Q.ink};background:${Q.yellow};padding:14px 50px;border-radius:999px;letter-spacing:2px">${PRODUCT.pill}</div></div>`;
}
/** One square on its own: two header tiles (a on the left, b on the right) and the big square below.
 *  k pops it in, out (0..1) slides it away. Returns the SVG; the square's centre is (540, Q_SQ.y). */
const Q_SQ = { y: 1060, size: 400 };
function qCard(t, a, b, k, out = 0) {
  if (k <= 0 || out >= 1) return '';
  const s = (0.5 + 0.5 * easeBack(clamp(k * 1.4))) * (1 - 0.3 * easeInOut(out)), o = clamp(k * 4) * (1 - out);
  const dx = -easeInOut(out) * 700;
  let g = `<g transform="translate(${540 + dx} 860) scale(${s.toFixed(3)}) translate(-540 -860)" opacity="${o.toFixed(3)}">`;
  for (const [label, x] of [[a, 300], [b, 780]]) {
    g += qTile(x - 170, 540, 340, 260, Q.head, { r: 30 });
    g += qIcon(label, x, 640, 130, 1);
    g += `<text x="${x}" y="772" font-family="Bebas, Impact" font-size="48" text-anchor="middle" fill="#FFFFFF" letter-spacing="1">${Q_CATS[label].short}</text>`;
  }
  g += qText('X', 540, 700, 110, 1, { sw: 12 });
  g += '</g>';
  return g;
}
/** The big square under the card (drawn separately so the ad controls what is inside). */
function qSquare(k, out, fill = Q.cell, stroke = null) {
  if (k <= 0 || out >= 1) return '';
  const s = (0.5 + 0.5 * easeBack(clamp(k * 1.4))) * (1 - 0.3 * easeInOut(out)), z = Q_SQ.size;
  const dx = -easeInOut(out) * 700;
  return `<g transform="translate(${540 + dx} ${Q_SQ.y}) scale(${s.toFixed(3)})" opacity="${(clamp(k * 4) * (1 - out)).toFixed(3)}">
    ${qTile(-z / 2, -z / 2, z, z, fill, { r: 40, stroke, sw: 10 })}</g>`;
}
