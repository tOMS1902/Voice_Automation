// /list — show available episodes and their status
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.mjs';
import YAML from 'yaml';

export const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('List available episodes and their status');

export async function execute(interaction) {
  const episodesDir = join(config.ROOT, 'episodes');
  if (!existsSync(episodesDir)) {
    return interaction.reply({ content: 'No episodes directory found.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('Available Episodes')
    .setColor(0x5865F2);

  for (const product of readdirSync(episodesDir)) {
    const dir = join(episodesDir, product);
    const files = readdirSync(dir).filter(f => f.endsWith('.yaml'));
    const lines = files.map(f => {
      const name = f.replace(/\.ya?ml$/, '');
      const ep = YAML.parse(readFileSync(join(dir, f), 'utf8'));
      const outDir = join(config.ROOT, 'out', product, name);
      const rendered = existsSync(outDir) ? ' [rendered]' : '';
      return `\`${name}\` — ${ep.template}${rendered}`;
    });
    embed.addFields({ name: product, value: lines.join('\n') || 'No episodes' });
  }

  await interaction.reply({ embeds: [embed] });
}
