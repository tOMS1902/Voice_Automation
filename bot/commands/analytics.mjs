// /analytics [post_id] — pull Buffer post metrics
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../config.mjs';
import { getPostMetrics, getRecentPosts } from '../buffer.mjs';

export const data = new SlashCommandBuilder()
  .setName('analytics')
  .setDescription('Show Buffer post metrics')
  .addStringOption(opt =>
    opt.setName('post_id').setDescription('Buffer post ID (omit for recent posts overview)').setRequired(false)
  );

export async function execute(interaction) {
  if (!config.BUFFER_API_KEY) {
    return interaction.reply({ content: 'Buffer API key not configured.', ephemeral: true });
  }

  await interaction.deferReply();

  const postId = interaction.options.getString('post_id');

  try {
    if (postId) {
      // Single post detail
      const post = await getPostMetrics(postId);
      if (!post) {
        return interaction.editReply(`Post not found: \`${postId}\``);
      }

      const m = post.metrics ?? {};
      const embed = new EmbedBuilder()
        .setTitle('Post Metrics')
        .setColor(0x2196F3)
        .setDescription(post.text?.slice(0, 200) ?? 'No caption')
        .addFields(
          { name: 'Views', value: fmt(m.views), inline: true },
          { name: 'Reach', value: fmt(m.reach), inline: true },
          { name: 'Engagement', value: pct(m.engagementRate), inline: true },
          { name: 'Reactions', value: fmt(m.reactions), inline: true },
          { name: 'Comments', value: fmt(m.comments), inline: true },
          { name: 'Shares', value: fmt(m.shares), inline: true },
        )
        .setFooter({ text: `Post ID: ${post.id} | Updated: ${post.metricsUpdatedAt ?? 'n/a'}` });

      await interaction.editReply({ embeds: [embed] });
    } else {
      // Overview of recent posts
      const posts = await getRecentPosts(5);
      if (!posts.length) {
        return interaction.editReply('No recent posts found.');
      }

      const embed = new EmbedBuilder()
        .setTitle('Recent Posts')
        .setColor(0x2196F3);

      for (const post of posts) {
        const label = post.text?.slice(0, 60) ?? post.id;
        const sent = post.sentAt ? new Date(post.sentAt).toLocaleDateString() : post.status;
        embed.addFields({
          name: `${label}...`,
          value: `Status: ${post.status} | Sent: ${sent}\nID: \`${post.id}\``,
        });
      }

      embed.setFooter({ text: 'Use /analytics post_id:<id> for detailed metrics' });
      await interaction.editReply({ embeds: [embed] });
    }
  } catch (err) {
    await interaction.editReply(`Failed to fetch analytics:\n\`\`\`\n${err.message.slice(0, 1500)}\n\`\`\``);
  }
}

function fmt(n) { return n != null ? n.toLocaleString() : '—'; }
function pct(n) { return n != null ? `${(n * 100).toFixed(1)}%` : '—'; }
