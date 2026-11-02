// /render <episode> — trigger local render of an episode
import { SlashCommandBuilder } from 'discord.js';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.mjs';

export const data = new SlashCommandBuilder()
  .setName('render')
  .setDescription('Render an episode locally')
  .addStringOption(opt =>
    opt.setName('episode').setDescription('Episode name (e.g. carousel-prev-club-01)').setRequired(true)
  );

export async function execute(interaction) {
  const episode = interaction.options.getString('episode');
  const yamlPath = findEpisode(episode);

  if (!yamlPath) {
    return interaction.reply({ content: `Episode not found: \`${episode}\``, ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const output = await new Promise((resolve, reject) => {
      execFile('node', ['studio.mjs', 'render', yamlPath], {
        cwd: config.ROOT,
        timeout: 300_000,
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout + stderr);
      });
    });

    const lines = output.trim().split('\n').slice(-5).join('\n');
    await interaction.editReply(`Rendered \`${episode}\`:\n\`\`\`\n${lines}\n\`\`\``);
  } catch (err) {
    await interaction.editReply(`Render failed for \`${episode}\`:\n\`\`\`\n${err.message.slice(0, 1500)}\n\`\`\``);
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
