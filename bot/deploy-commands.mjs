#!/usr/bin/env node
// Register slash commands with Discord — run once: npm run bot:deploy
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
const commandsDir = join(__dirname, 'commands');

for (const file of readdirSync(commandsDir).filter(f => f.endsWith('.mjs'))) {
  const command = await import(pathToFileURL(join(commandsDir, file)).href);
  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);

try {
  console.log(`Registering ${commands.length} commands...`);

  // Get application ID from token
  const me = await rest.get(Routes.user());
  const appId = me.id;

  // Register to guild (instant) rather than global (takes up to 1h)
  const data = await rest.put(
    Routes.applicationGuildCommands(appId, config.DISCORD_GUILD_ID),
    { body: commands },
  );

  console.log(`Registered ${data.length} commands to guild ${config.DISCORD_GUILD_ID}:`);
  for (const cmd of data) {
    console.log(`  /${cmd.name} — ${cmd.description}`);
  }
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
