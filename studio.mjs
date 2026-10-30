#!/usr/bin/env node
// Studio: animated, voiced, ready-to-post vertical videos for any product.
//
//   node studio.mjs render <episode.yaml> [--take take.mp3] [--no-voice] [--stills 2,5,9]
//   node studio.mjs check  <episode.yaml>        fact-check the squares in the product's own repo
//   node studio.mjs new    <product> <template> <name>   start an episode from the latest one
//   node studio.mjs list                         products, templates and episodes
//
// An episode (episodes/<product>/<name>.yaml) = content. A product (products/<name>/product.yaml)
// = branding, voice, categories, and where its repo is. A template (templates/<name>.js) = the
// animation. Output goes to out/<product>/<name>/: video.mp4 (voiced, post this), music.mp4, silent.mp4.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { mix } from './engine/audio.mjs';
import { voice } from './engine/voice.mjs';
import { fetchPlayerImages } from './engine/images.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT);
const [cmd, ...rest] = process.argv.slice(2);
const flag = name => { const i = rest.indexOf(name); if (i < 0) return null; const v = rest[i + 1]; rest.splice(i, 2); return v ?? true; };
const has = name => { const i = rest.indexOf(name); if (i < 0) return false; rest.splice(i, 1); return true; };

const ffmpeg = process.env.FFMPEG ?? (await import('ffmpeg-static').then(m => m.default).catch(() => null)) ?? 'ffmpeg';
const run = args => execFileSync(ffmpeg, ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

function loadEpisode(path) {
  if (!path || !existsSync(path)) die(`Episode file not found: ${path ?? '(none given)'}`);
  const ep = YAML.parse(readFileSync(path, 'utf8'));
  const pdir = join('products', ep.product ?? '');
  if (!ep.product || !existsSync(join(pdir, 'product.yaml'))) die(`Episode needs "product:" matching a folder in products/ (got "${ep.product}")`);
  if (!existsSync(join('templates', `${ep.template}.js`))) die(`No template "${ep.template}" in templates/`);
  const product = YAML.parse(readFileSync(join(pdir, 'product.yaml'), 'utf8'));
  return { ep, product, pdir, name: basename(path).replace(/\.ya?ml$/, '') };
}
function die(msg) { console.error(msg); process.exit(1); }

async function render(path) {
  const { ep, product, pdir, name } = loadEpisode(path);
  const take = flag('--take'), stills = flag('--stills'), noVoice = has('--no-voice');
  const OUT = join('out', ep.product, name);
  mkdirSync(OUT, { recursive: true });
  mkdirSync('out/.page', { recursive: true });
  // Prefetch player images for carousel templates
  if (ep.players?.length) {
    console.log('Fetching player images...');
    ep.players = await fetchPlayerImages(ep.players);
    // Convert to absolute paths for Puppeteer file:// access
    ep.players = ep.players.map(p => ({ ...p, imagePath: p.imagePath ? resolve(p.imagePath) : null }));
  }
  // what the page sees: product (icon relative to engine/page.html), episode, template
  const P = { ...product, icon: product.icon ? relative('engine', join(pdir, product.icon)).replaceAll('\\', '/') : '' };
  writeFileSync('out/.page/data.js', `window.PRODUCT = ${JSON.stringify(P)};\nwindow.EPISODE = ${JSON.stringify(ep)};\nwindow.TEMPLATE = ${JSON.stringify(ep.template)};\n`);

  const pptr = await import('puppeteer').then(m => m.default).catch(() => import('puppeteer-core').then(m => m.default));
  const browser = await pptr.launch({
    headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--allow-file-access-from-files', ...(process.getuid?.() === 0 || process.env.CI ? ['--no-sandbox'] : [])],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('page error:', String(e)));
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve('engine/page.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.AD_READY === true, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  const stage = await page.$('#stage');
  const { FPS, DURATION, SOUND, VOICE } = await page.evaluate(() => ({ FPS: window.AD.FPS, DURATION: window.AD.DURATION, SOUND: window.AD.SOUND ?? null, VOICE: window.AD.VOICE ?? null }));

  if (stills) {
    for (const t of String(stills).split(',').map(Number)) {
      await page.evaluate(x => window.AD.render(x), t);
      await stage.screenshot({ path: join(OUT, `still-${t.toFixed(1)}.png`) });
    }
    await browser.close();
    return console.log(`stills in ${OUT}`);
  }

  // Carousel mode: output individual slide PNGs, skip video/audio
  const { CAROUSEL, SLIDES } = await page.evaluate(() => ({ CAROUSEL: window.AD.CAROUSEL ?? false, SLIDES: window.AD.SLIDES ?? 0 }));
  if (CAROUSEL && SLIDES > 0) {
    console.log(`${product.name} / ${name}: ${SLIDES} slides, template ${ep.template} (carousel)`);
    for (let i = 0; i < SLIDES; i++) {
      await page.evaluate(x => window.AD.render(x), i);
      const slideName = `slide-${String(i + 1).padStart(2, '0')}.png`;
      await stage.screenshot({ path: join(OUT, slideName) });
      console.log(`  ${slideName}`);
    }
    await browser.close();
    if (ep.caption) writeFileSync(join(OUT, 'caption.txt'), ep.caption.trim() + '\n');
    console.log(`\nCarousel ready: ${OUT} (${SLIDES} slides)`);
    return;
  }

  console.log(`${product.name} / ${name}: ${DURATION.toFixed(1)}s, template ${ep.template}`);
  const FRAMES = join(OUT, '.frames');
  rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true });
  const total = Math.round(FPS * DURATION);
  for (let i = 0; i < total; i++) {
    await page.evaluate(x => window.AD.render(x), i / FPS);
    await stage.screenshot({ path: join(FRAMES, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
    if (i % 150 === 0) console.log(`  frame ${i}/${total}`);
  }
  await browser.close();
  const silent = join(OUT, 'silent.mp4'), music = join(OUT, 'music.mp4'), final = join(OUT, 'video.mp4');
  run(['-framerate', String(FPS), '-i', join(FRAMES, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', silent]);
  rmSync(FRAMES, { recursive: true });

  const sfx = join(OUT, '.sound.wav');
  if (SOUND) {
    mix(SOUND, DURATION, sfx);
    run(['-i', silent, '-i', sfx, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', music]);
  }
  const vo = join(OUT, '.voice.wav');
  if (!noVoice && await voice(VOICE, DURATION, vo, { ffmpeg, take })) {
    const bg = SOUND ? ['-i', sfx] : ['-f', 'lavfi', '-t', String(DURATION), '-i', 'anullsrc=r=44100:cl=mono'];
    run(['-i', silent, ...bg, '-i', vo, '-filter_complex',
      // music and effects duck under the voice, then everything to TikTok/Reels loudness
      '[2:a]highpass=f=80,acompressor=threshold=-20dB:ratio=3,asplit[v][key];' +
      '[1:a]volume=0.55[bg];[bg][key]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=300[duck];' +
      '[duck][v]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-2,alimiter=limit=0.79:level=false[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
    rmSync(vo);
  } else if (existsSync(music)) copyFileSync(music, final);
  else copyFileSync(silent, final);
  rmSync(sfx, { force: true });
  if (ep.caption) writeFileSync(join(OUT, 'caption.txt'), ep.caption.trim() + '\n');
  console.log(`\nReady to post: ${final}\n  also: ${existsSync(music) ? music + ', ' : ''}${silent} (for a trending sound)`);
}

function check(path) {
  const { ep, product } = loadEpisode(path);
  const src = product.source;
  if (!src?.check) die(`products/${ep.product}/product.yaml has no source.check command`);
  const repo = resolve(process.env[src.local_path_env] ?? src.local_path ?? '');
  if (!existsSync(repo)) die(`Clone ${src.repo} to ${repo} (or set ${src.local_path_env}) to fact-check.`);
  for (const q of ep.squares ?? []) {
    const c = src.check.replaceAll('{a}', q.a).replaceAll('{b}', q.b);
    console.log(`\n== ${q.a} x ${q.b}  (episode shows: ${q.answers.join(', ')}, total ${q.total ?? '?'})`);
    try { console.log(execSync(c, { cwd: repo, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }).trim().split('\n').slice(0, 15).join('\n')); }
    catch (e) { console.log(`  check failed: ${e.message.split('\n')[0]}`); }
  }
}

function newEpisode([product, template, name]) {
  if (!product || !template || !name) die('usage: node studio.mjs new <product> <template> <name>');
  const dir = join('episodes', product);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${name}.yaml`);
  if (existsSync(target)) die(`${target} already exists`);
  const prev = readdirSync(dir).filter(f => f.endsWith('.yaml')).map(f => join(dir, f))
    .find(f => YAML.parse(readFileSync(f, 'utf8')).template === template);
  writeFileSync(target, prev ? readFileSync(prev, 'utf8') : `product: ${product}\ntemplate: ${template}\nsquares: []\n`);
  console.log(`${target} (copied from ${prev ?? 'blank'}). Edit it, then: node studio.mjs check ${target} && node studio.mjs render ${target}`);
}

function list() {
  console.log('products:  ' + readdirSync('products').join(', '));
  console.log('templates: ' + readdirSync('templates').map(f => f.replace(/\.js$/, '')).join(', '));
  for (const p of existsSync('episodes') ? readdirSync('episodes') : []) console.log(`episodes/${p}: ` + readdirSync(join('episodes', p)).join(', '));
}

if (cmd === 'render') await render(rest.shift());
else if (cmd === 'check') check(rest.shift());
else if (cmd === 'new') newEpisode(rest);
else if (cmd === 'list') list();
else console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
