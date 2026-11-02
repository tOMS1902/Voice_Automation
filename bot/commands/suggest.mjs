// /suggest — generate a new episode, render it, drop files in Discord
import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.mjs';
import YAML from 'yaml';

// Player pool: famous transfers where both clubs are in product.yaml categories
// Each entry: [name, current_club, previous_club, difficulty]
// difficulty: 1=easy, 2=medium, 3=hard, 4=impossible
const PLAYER_POOL = [
  // Easy - household names
  ['Lionel Messi', 'FC Barcelona', 'Paris Saint-Germain', 1],
  ['Cristiano Ronaldo', 'Real Madrid CF', 'Manchester United F.C.', 1],
  ['Kylian Mbappe', 'Real Madrid CF', 'Paris Saint-Germain', 1],
  ['Erling Haaland', 'Manchester City F.C.', 'Borussia Dortmund', 1],
  ['Mohamed Salah', 'Liverpool F.C.', 'AS Roma', 1],
  ['Neymar', 'Paris Saint-Germain', 'FC Barcelona', 1],
  ['Thierry Henry', 'Arsenal F.C.', 'FC Barcelona', 1],
  ['David Beckham', 'Manchester United F.C.', 'Real Madrid CF', 1],
  ['Zinedine Zidane', 'Real Madrid CF', 'Juventus FC', 1],
  ['Ronaldinho', 'FC Barcelona', 'Paris Saint-Germain', 1],

  // Medium - most football fans know
  ['Jude Bellingham', 'Real Madrid CF', 'Borussia Dortmund', 2],
  ['Robert Lewandowski', 'FC Barcelona', 'FC Bayern Munich', 2],
  ['Robin van Persie', 'Manchester United F.C.', 'Arsenal F.C.', 2],
  ['Luis Suarez', 'FC Barcelona', 'Liverpool F.C.', 2],
  ['Virgil van Dijk', 'Liverpool F.C.', 'Celtic F.C.', 2],
  ['Luka Modric', 'Real Madrid CF', 'Tottenham Hotspur F.C.', 2],
  ['Gareth Bale', 'Real Madrid CF', 'Tottenham Hotspur F.C.', 2],
  ['Antoine Griezmann', 'FC Barcelona', 'Paris Saint-Germain', 2],
  ['Bruno Fernandes', 'Manchester United F.C.', 'Sporting CP', 2],
  ['Pierre-Emerick Aubameyang', 'Arsenal F.C.', 'Borussia Dortmund', 2],
  ['Eden Hazard', 'Real Madrid CF', 'Chelsea F.C.', 2],
  ['Sadio Mane', 'FC Bayern Munich', 'Liverpool F.C.', 2],
  ['Cesc Fabregas', 'Chelsea F.C.', 'FC Barcelona', 2],

  // Hard - real fans only
  ['Philippe Coutinho', 'FC Barcelona', 'Liverpool F.C.', 3],
  ['Ousmane Dembele', 'Paris Saint-Germain', 'FC Barcelona', 3],
  ['Angel Di Maria', 'Paris Saint-Germain', 'Manchester United F.C.', 3],
  ['Alexis Sanchez', 'Manchester United F.C.', 'Arsenal F.C.', 3],
  ['Thomas Partey', 'Arsenal F.C.', 'Paris Saint-Germain', 3],
  ['Raphael Varane', 'Manchester United F.C.', 'Real Madrid CF', 3],
  ['Memphis Depay', 'FC Barcelona', 'Manchester United F.C.', 3],
  ['Christian Eriksen', 'Manchester United F.C.', 'Tottenham Hotspur F.C.', 3],
  ['Arturo Vidal', 'FC Barcelona', 'FC Bayern Munich', 3],
  ['Marcos Alonso', 'Chelsea F.C.', 'FC Barcelona', 3],
  ['Hector Bellerin', 'Arsenal F.C.', 'FC Barcelona', 3],

  // Impossible - true ball knowledge
  ['Gianluigi Buffon', 'Paris Saint-Germain', 'Juventus FC', 4],
  ['Dominik Szoboszlai', 'Liverpool F.C.', 'RB Salzburg', 4],
  ['Henrik Larsson', 'FC Barcelona', 'Celtic F.C.', 4],
  ['Emmanuel Petit', 'Arsenal F.C.', 'FC Barcelona', 4],
  ['Mark Gonzalez', 'Liverpool F.C.', 'Real Madrid CF', 4],
  ['Giovani dos Santos', 'Tottenham Hotspur F.C.', 'FC Barcelona', 4],
  ['Julien Faubert', 'Real Madrid CF', 'Tottenham Hotspur F.C.', 4],
  ['Thomas Gravesen', 'Real Madrid CF', 'Celtic F.C.', 4],
  ['Bolo Zenden', 'Liverpool F.C.', 'Chelsea F.C.', 4],
  ['Nuri Sahin', 'Real Madrid CF', 'Borussia Dortmund', 4],
  ['Danilo', 'Manchester City F.C.', 'Real Madrid CF', 4],
];

const DIFFICULTY_LABELS = ['', '# EASY - everyone knows this one', '# MEDIUM - most fans know this', '# HARD - real fans only', '# IMPOSSIBLE - only true ball knowledge'];

export const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Generate a new episode, render it, and drop files here for you to post');

export async function execute(interaction) {
  await interaction.deferReply();

  // Find already-used players
  const episodesDir = join(config.ROOT, 'episodes', 'ball-knowledge');
  const usedPlayers = new Set();
  if (existsSync(episodesDir)) {
    for (const f of readdirSync(episodesDir).filter(f => f.includes('carousel-prev-club'))) {
      const ep = YAML.parse(readFileSync(join(episodesDir, f), 'utf8'));
      for (const p of ep.players ?? []) usedPlayers.add(p.name);
    }
  }

  // Pick 4 players (1 per difficulty), avoiding already used
  const available = PLAYER_POOL.filter(p => !usedPlayers.has(p[0]));
  const pick = [];
  for (const diff of [1, 2, 3, 4]) {
    const pool = available.filter(p => p[3] === diff && !pick.some(x => x[0] === p[0]));
    if (!pool.length) {
      return interaction.editReply(`Not enough unused ${['', 'easy', 'medium', 'hard', 'impossible'][diff]} players left. Add more to the pool!`);
    }
    pick.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  // Determine next episode number
  const existing = readdirSync(episodesDir).filter(f => f.match(/carousel-prev-club-\d+\.yaml/));
  const maxNum = existing.reduce((max, f) => {
    const n = parseInt(f.match(/(\d+)\.yaml/)?.[1] ?? '0');
    return n > max ? n : max;
  }, 0);
  const nextNum = String(maxNum + 1).padStart(2, '0');
  const episodeName = `carousel-prev-club-${nextNum}`;
  const yamlPath = join(episodesDir, `${episodeName}.yaml`);

  // Write YAML with difficulty comments
  const yamlLines = [
    `product: ball-knowledge`,
    `template: quiz-carousel-prev-club`,
    `players:`,
  ];
  for (let i = 0; i < pick.length; i++) {
    const [name, current_club, previous_club, diff] = pick[i];
    yamlLines.push(`  ${DIFFICULTY_LABELS[diff]}`);
    yamlLines.push(`  - name: ${name}`);
    yamlLines.push(`    current_club: ${current_club}`);
    yamlLines.push(`    previous_club: ${previous_club}`);
  }
  yamlLines.push(`caption: |`);
  yamlLines.push(`  Easy to IMPOSSIBLE! Can you get all 4?`);
  yamlLines.push(`  Swipe to reveal the answers`);
  yamlLines.push(`  Play the full game - link in bio`);
  yamlLines.push(`  #ballknowledge #football #footballquiz #transferquiz #fyp`);
  yamlLines.push(``);

  writeFileSync(yamlPath, yamlLines.join('\n'));

  // Render
  try {
    await new Promise((resolve, reject) => {
      execFile('node', ['studio.mjs', 'render', `episodes/ball-knowledge/${episodeName}.yaml`], {
        cwd: config.ROOT,
        timeout: 300_000,
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout + stderr);
      });
    });
  } catch (err) {
    return interaction.editReply(`Render failed:\n\`\`\`\n${err.message.slice(0, 1500)}\n\`\`\``);
  }

  // Gather slides and send to Discord
  const outDir = join(config.ROOT, 'out', 'ball-knowledge', episodeName);
  const slides = readdirSync(outDir).filter(f => f.startsWith('slide-') && f.endsWith('.png')).sort();

  const attachments = slides.map(s => new AttachmentBuilder(join(outDir, s)));

  const embed = new EmbedBuilder()
    .setTitle(`New Episode: ${episodeName}`)
    .setColor(0xFF6B00)
    .setDescription(pick.map(([name, curr, prev, diff]) =>
      `${'⭐'.repeat(diff)} **${name}** — ${prev} → ${curr}`
    ).join('\n'))
    .addFields(
      { name: 'Caption', value: `Easy to IMPOSSIBLE! Can you get all 4?\nSwipe to reveal the answers\nPlay the full game - link in bio\n#ballknowledge #football #footballquiz #transferquiz #fyp` },
    )
    .setFooter({ text: 'Save the images and post to TikTok / IG!' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`delete_${episodeName}`)
      .setLabel('Delete Episode')
      .setStyle(ButtonStyle.Danger),
  );

  const reply = await interaction.editReply({
    content: `Here's your new carousel — save and post!`,
    embeds: [embed],
    files: attachments,
    components: [row],
  });

  // Handle delete button (one-time collector)
  const collector = reply.createMessageComponentCollector({ time: 600_000 });
  collector.on('collect', async i => {
    if (i.customId === `delete_${episodeName}`) {
      try { unlinkSync(yamlPath); } catch {}
      await i.update({ content: `Episode \`${episodeName}\` deleted.`, embeds: [], files: [], components: [] });
      collector.stop();
    }
  });
}
