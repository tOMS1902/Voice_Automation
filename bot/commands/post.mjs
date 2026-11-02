// /post <episode> — render + post to Buffer (TikTok)
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from '../config.mjs';
import { createPost } from '../buffer.mjs';

export const data = new SlashCommandBuilder()
  .setName('post')
  .setDescription('Render an episode and post to Buffer (TikTok)')
  .addStringOption(opt =>
    opt.setName('episode').setDescription('Episode name (e.g. carousel-prev-club-01)').setRequired(true)
  );

export async function execute(interaction) {
  const episode = interaction.options.getString('episode');
  const yamlPath = findEpisode(episode);

  if (!yamlPath) {
    return interaction.reply({ content: `Episode not found: \`${episode}\``, ephemeral: true });
  }
  if (!config.BUFFER_API_KEY || !config.BUFFER_CHANNEL_ID) {
    return interaction.reply({ content: 'Buffer API key or channel ID not configured.', ephemeral: true });
  }

  await interaction.deferReply();

  // Step 1: Render
  try {
    await new Promise((resolve, reject) => {
      execFile('node', ['studio.mjs', 'render', yamlPath], {
        cwd: config.ROOT,
        timeout: 300_000,
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout + stderr);
      });
    });
  } catch (err) {
    return interaction.editReply(`Render failed for \`${episode}\`:\n\`\`\`\n${err.message.slice(0, 1500)}\n\`\`\``);
  }

  // Step 2: Gather output files
  const product = findProduct(episode);
  const outDir = join(config.ROOT, 'out', product, episode);
  const slides = readdirSync(outDir).filter(f => f.startsWith('slide-') && f.endsWith('.png')).sort();
  const videoFile = join(outDir, 'video.mp4');
  const captionFile = join(outDir, 'caption.txt');
  const caption = existsSync(captionFile) ? readFileSync(captionFile, 'utf8').trim() : episode;

  // Determine media type
  let mediaUrls = [];
  if (slides.length > 0) {
    mediaUrls = slides.map(s => `file://${resolve(outDir, s)}`);
  } else if (existsSync(videoFile)) {
    mediaUrls = [`file://${resolve(videoFile)}`];
  }

  // Step 3: Post to Buffer
  try {
    const post = await createPost({ text: caption, mediaUrls });

    const embed = new EmbedBuilder()
      .setTitle('Posted to Buffer')
      .setColor(0x00C853)
      .addFields(
        { name: 'Episode', value: `\`${episode}\``, inline: true },
        { name: 'Status', value: post.status ?? 'queued', inline: true },
        { name: 'Post ID', value: `\`${post.id}\``, inline: true },
        { name: 'Media', value: `${slides.length || 1} file(s)` },
      );

    await interaction.editReply({ embeds: [embed] });

    // Notify channel if configured
    if (config.DISCORD_CHANNEL_ID && interaction.channelId !== config.DISCORD_CHANNEL_ID) {
      const channel = interaction.client.channels.cache.get(config.DISCORD_CHANNEL_ID);
      if (channel) {
        await channel.send({ content: `New post queued: **${episode}**`, embeds: [embed] });
      }
    }
  } catch (err) {
    await interaction.editReply(`Render succeeded but posting failed:\n\`\`\`\n${err.message.slice(0, 1500)}\n\`\`\``);
  }
}

function findEpisode(name) {
  const episodesDir = join(config.ROOT, 'episodes');
  if (!existsSync(episodesDir)) return null;
  for (const product of readdirSync(episodesDir)) {
    const candidate = join('episodes', product, `${name}.yaml`);
    if (existsSync(join(config.ROOT, candidate))) return candidate;
  }
  return null;
}

function findProduct(name) {
  const episodesDir = join(config.ROOT, 'episodes');
  for (const product of readdirSync(episodesDir)) {
    if (existsSync(join(episodesDir, product, `${name}.yaml`))) return product;
  }
  return 'unknown';
}
