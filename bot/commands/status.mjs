// /status — show bot status, queue info, recent posts
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.mjs';
import { getRecentPosts } from '../buffer.mjs';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show bot status and recent post activity');

export async function execute(interaction) {
  await interaction.deferReply();

  const uptime = formatUptime(process.uptime());
  const embed = new EmbedBuilder()
    .setTitle('Bot Status')
    .setColor(0x4CAF50)
    .addFields(
      { name: 'Uptime', value: uptime, inline: true },
      { name: 'Guilds', value: String(interaction.client.guilds.cache.size), inline: true },
      { name: 'Buffer', value: config.BUFFER_API_KEY ? 'Connected' : 'Not configured', inline: true },
    );

  // Recent posts from Buffer
  if (config.BUFFER_API_KEY && config.BUFFER_CHANNEL_ID) {
    try {
      const posts = await getRecentPosts(3);
      if (posts.length) {
        const lines = posts.map(p => {
          const date = p.sentAt ? new Date(p.sentAt).toLocaleDateString() : p.status;
          const label = p.text?.slice(0, 50) ?? p.id;
          return `${date} — ${label}`;
        });
        embed.addFields({ name: 'Recent Posts', value: lines.join('\n') });
      }
    } catch {
      embed.addFields({ name: 'Recent Posts', value: 'Failed to fetch' });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}
