// Wikipedia player image fetcher: downloads HD photos into a local cache.
// Each player gets a query to the Wikipedia API for its main page image.
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { get } from 'node:https';

const THUMB_SIZE = 800;

function hashName(name) {
  return createHash('md5').update(name).digest('hex');
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'User-Agent': 'StudioBot/1.0 (content automation)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpsGet(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      get(u, { headers: { 'User-Agent': 'StudioBot/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const ws = createWriteStream(dest);
        res.pipe(ws);
        ws.on('finish', () => ws.close(resolve));
        ws.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

/**
 * Fetch a player photo URL from Wikipedia's pageimages API.
 * Returns the thumbnail URL or null.
 */
async function fetchWikiImage(playerName) {
  // Try direct title match first
  const title = playerName.replace(/ /g, '_');
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=${THUMB_SIZE}&format=json&redirects=1`;
  try {
    const buf = await httpsGet(url);
    const data = JSON.parse(buf.toString());
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    if (page?.thumbnail?.source) return page.thumbnail.source;
  } catch (e) {
    console.log(`  wiki title lookup failed for "${playerName}": ${e.message}`);
  }
  // Fallback: search Wikipedia for the player name
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(playerName)}&gsrlimit=1&prop=pageimages&pithumbsize=${THUMB_SIZE}&format=json`;
  try {
    const buf = await httpsGet(searchUrl);
    const data = JSON.parse(buf.toString());
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    return page?.thumbnail?.source ?? null;
  } catch (e) {
    console.log(`  wiki search failed for "${playerName}": ${e.message}`);
    return null;
  }
}

/**
 * For each player object, download their Wikipedia photo into cacheDir.
 * If the player has an `image:` field (manual override URL or local path), use that.
 * Returns a new array with `imagePath` (absolute path) added to each player.
 */
export async function fetchPlayerImages(players, cacheDir = 'out/.image-cache') {
  mkdirSync(cacheDir, { recursive: true });
  const results = [];

  for (const player of players) {
    const hash = hashName(player.name);
    const cached = join(cacheDir, `${hash}.jpg`);

    // Manual override
    if (player.image) {
      if (existsSync(player.image)) {
        results.push({ ...player, imagePath: player.image });
        console.log(`  ${player.name}: using manual image ${player.image}`);
        continue;
      }
      // Treat as URL
      try {
        if (!existsSync(cached)) {
          await download(player.image, cached);
        }
        results.push({ ...player, imagePath: cached });
        console.log(`  ${player.name}: downloaded manual URL`);
        continue;
      } catch (e) {
        console.log(`  ${player.name}: manual image failed (${e.message}), trying Wikipedia`);
      }
    }

    // Cache hit
    if (existsSync(cached)) {
      results.push({ ...player, imagePath: cached });
      console.log(`  ${player.name}: cached`);
      continue;
    }

    // Wikipedia lookup
    const thumbUrl = await fetchWikiImage(player.name);
    if (thumbUrl) {
      try {
        await download(thumbUrl, cached);
        results.push({ ...player, imagePath: cached });
        console.log(`  ${player.name}: downloaded from Wikipedia`);
      } catch (e) {
        console.log(`  ${player.name}: download failed (${e.message})`);
        results.push({ ...player, imagePath: null });
      }
    } else {
      console.log(`  ${player.name}: no Wikipedia image found`);
      results.push({ ...player, imagePath: null });
    }
  }

  return results;
}
