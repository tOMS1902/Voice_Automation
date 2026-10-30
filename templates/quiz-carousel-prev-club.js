// Template "quiz-carousel-prev-club": 10-slide photo carousel — "Guess the Previous Club".
// Slides: hook, 4x (question, answer), CTA end card. Each slide is one second (t = slide index).
// Content from window.EPISODE.players, branding from window.PRODUCT.
const EP = window.EPISODE;
const PLAYERS = EP.players ?? [];
// W and H (1080x1920) are already declared in engine.js

// Colours
const CC = {
  bg: '#0A1511', tint: '#123326', yellow: '#FFE14D', white: '#FFFFFF',
  accent: '#2ECC71', dim: '#8A8F98', dark: '#0B0B0F',
  overlay: 'rgba(10,21,17,0.75)', overlayStrong: 'rgba(10,21,17,0.88)',
};

/** Dark background with slow light rays. */
function bg(t) {
  const rot = t * 6;
  let rays = '';
  for (let i = 0; i < 12; i++) rays += `<path d="M0 0 L-90 -1500 L90 -1500 Z" fill="#FFFFFF" opacity="0.035" transform="rotate(${i * 30})"/>`;
  return `<defs><radialGradient id="cbg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="${CC.tint}"/><stop offset="0.55" stop-color="#0A1511"/><stop offset="1" stop-color="#040706"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#cbg)"/>
    <g transform="translate(540 860) rotate(${rot.toFixed(2)})">${rays}</g>`;
}

/** Player photo as an HTML img element, covering the upper portion of the slide. */
function photoHtml(player) {
  if (!player?.imagePath) {
    // Placeholder: dark box with player name
    return `<div style="position:absolute;top:180px;left:0;right:0;height:900px;display:flex;align-items:center;justify-content:center;background:${CC.overlayStrong}">
      <div style="font-family:Bebas,Impact;font-size:120px;color:${CC.dim};letter-spacing:4px">${player.name.toUpperCase()}</div></div>`;
  }
  // Use file:// protocol for local images in Puppeteer
  const src = player.imagePath.replace(/\\/g, '/');
  return `<div style="position:absolute;top:180px;left:0;right:0;height:900px;overflow:hidden">
    <img src="file:///${src}" style="width:100%;height:100%;object-fit:cover;object-position:top center">
  </div>`;
}

/** Gradient overlay at bottom of photo for text readability. */
function gradientOverlay() {
  return `<div style="position:absolute;top:680px;left:0;right:0;height:400px;background:linear-gradient(to bottom, transparent 0%, ${CC.bg} 100%)"></div>`;
}

/** Renders slide index i (0-9). */
function render(t) {
  const i = Math.floor(t);
  let g = bg(t), ui = '';

  if (i === 0) {
    // Hook slide
    g += qText('GUESS THE', 540, 620, 130, 1, { fill: CC.white, sw: 14 });
    g += qText('PREVIOUS CLUB', 540, 770, 140, 1, { fill: CC.yellow, sw: 16 });
    g += qPill('SWIPE TO PLAY', 540, 960, 52, CC.yellow, CC.dark, 1);
    // Product branding at bottom
    ui += `<div style="position:absolute;bottom:200px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:16px">
      <img src="${PRODUCT.icon}" style="width:120px;height:120px;border-radius:28px;box-shadow:0 12px 30px rgba(0,0,0,0.4)">
      <div style="font-family:Bebas,Impact;font-size:64px;color:${CC.white};letter-spacing:2px">${PRODUCT.name.toUpperCase()}</div></div>`;
  } else if (i >= 1 && i <= 8) {
    // Player slides: odd = question, even = answer
    const playerIdx = Math.floor((i - 1) / 2);
    const isQuestion = i % 2 === 1;
    const player = PLAYERS[playerIdx];
    if (!player) { paint(g, ui); return; }

    const currentCat = Q_CATS[player.current_club];
    const prevCat = Q_CATS[player.previous_club];

    // Photo + gradient
    ui += photoHtml(player);
    ui += gradientOverlay();

    // Player name bar
    ui += `<div style="position:absolute;top:100px;left:0;right:0;text-align:center">
      <div style="display:inline-block;background:${CC.yellow};padding:12px 48px;border-radius:999px">
        <span style="font-family:Bebas,Impact;font-size:56px;color:${CC.dark};letter-spacing:2px">${player.name.toUpperCase()}</span>
      </div></div>`;

    if (isQuestion) {
      // Question slide: current club icon + "WHERE DID THEY SIGN FROM?"
      const clubKit = currentCat?.kit;
      if (clubKit) {
        g += qShirt(540, 1250, 180, clubKit, 1);
      } else if (currentCat?.flag) {
        g += qFlag(540, 1250, 180, currentCat.flag, 1);
      }
      const clubShort = currentCat?.short ?? player.current_club.toUpperCase();
      g += qText(clubShort, 540, 1400, 64, 1, { fill: CC.white, sw: 8 });
      g += qText('WHERE DID THEY', 540, 1560, 80, 1, { fill: CC.yellow, sw: 10 });
      g += qText('SIGN FROM?', 540, 1660, 100, 1, { fill: CC.yellow, sw: 12 });

      // Question mark overlay
      g += qText('?', 540, 1780, 120, 1, { fill: CC.white, sw: 6 });
    } else {
      // Answer slide: previous club revealed
      const prevKit = prevCat?.kit;
      if (prevKit) {
        g += qShirt(540, 1250, 200, prevKit, 1);
      } else if (prevCat?.flag) {
        g += qFlag(540, 1250, 200, prevCat.flag, 1);
      }
      const prevShort = prevCat?.short ?? player.previous_club.toUpperCase();
      g += qText(prevShort, 540, 1420, 80, 1, { fill: CC.yellow, sw: 10 });

      // "SIGNED FROM" label
      g += qPill('SIGNED FROM', 540, 1140, 42, CC.accent, CC.dark, 1);

      // Swipe prompt (not on last answer)
      if (playerIdx < PLAYERS.length - 1) {
        ui += `<div style="position:absolute;bottom:120px;left:0;right:0;text-align:center;font-family:'Segoe UI',Arial;font-weight:600;font-size:36px;color:${CC.dim}">SWIPE FOR NEXT &rarr;</div>`;
      }
    }
  } else if (i === 9) {
    // CTA end card
    ui += qEnd(t, 0);
  }

  paint(g, ui);
}

window.AD = { FPS: 1, DURATION: 10, CAROUSEL: true, SLIDES: 10, render, VOICE: null, SOUND: null };
