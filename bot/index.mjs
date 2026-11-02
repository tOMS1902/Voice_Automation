#!/usr/bin/env node
// Discord bot entry point — loads commands, handles interactions, daily summary
import { Client, Collection, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './config.mjs';
import { getAggregatedMetrics } from './buffer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load all command files
const commandsDir = join(__dirname, 'commands');
for (const file of readdirSync(commandsDir).filter(f => f.endsWith('.mjs'))) {
  const command = await import(pathToFileURL(join(commandsDir, file)).href);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

// Handle slash command interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Command /${interaction.commandName} failed:`, err);
    const reply = { content: 'Something went wrong.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.once('ready', () => {
  console.log(`Bot online as ${client.user.tag}`);
  console.log(`Commands: ${[...client.commands.keys()].join(', ')}`);

  // Schedule daily analytics summary (every 24h)
  if (config.DISCORD_CHANNEL_ID && config.BUFFER_API_KEY && config.BUFFER_CHANNEL_ID) {
    scheduleDailySummary();
  }
});

async function scheduleDailySummary() {
  // Run first summary at next midnight, then every 24h
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight - now;

  setTimeout(() => {
    sendDailySummary();
    setInterval(sendDailySummary, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(`Daily summary scheduled for ${nextMidnight.toLocaleTimeString()}`);
}

async function sendDailySummary() {
  try {
    const channel = client.channels.cache.get(config.DISCORD_CHANNEL_ID);
    if (!channel) return;

    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const metrics = await getAggregatedMetrics(start, end);
    if (!metrics) return;

    const embed = new EmbedBuilder()
      .setTitle('Weekly Analytics Summary')
      .setColor(0xFF9800)
      .addFields(
        { name: 'Posts', value: String(metrics.postCount ?? 0), inline: true },
        { name: 'Total Views', value: (metrics.totalViews ?? 0).toLocaleString(), inline: true },
        { name: 'Avg Engagement', value: metrics.averageEngagementRate != null ? `${(metrics.averageEngagementRate * 100).toFixed(1)}%` : '—', inline: true },
        { name: 'Reactions', value: (metrics.totalReactions ?? 0).toLocaleString(), inline: true },
        { name: 'Comments', value: (metrics.totalComments ?? 0).toLocaleString(), inline: true },
        { name: 'Shares', value: (metrics.totalShares ?? 0).toLocaleString(), inline: true },
      )
      .setFooter({ text: `${start} to ${end}` });

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Daily summary failed:', err.message);
  }
}

client.login(config.DISCORD_BOT_TOKEN);
