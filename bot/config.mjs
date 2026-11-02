// Bot configuration — loads env vars from .env.local or environment
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env.local if present
const envFile = resolve(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function required(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing required env var: ${name}`); process.exit(1); }
  return v;
}

export const config = {
  ROOT,
  DISCORD_BOT_TOKEN: required('DISCORD_BOT_TOKEN'),
  DISCORD_GUILD_ID: required('DISCORD_GUILD_ID'),
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID ?? null,
  BUFFER_API_KEY: process.env.BUFFER_API_KEY ?? process.env.BUFFER_TOKEN ?? null,
  BUFFER_CHANNEL_ID: process.env.BUFFER_CHANNEL_ID ?? null,
};
