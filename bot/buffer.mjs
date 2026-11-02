// Buffer API client — GraphQL queries for posting + metrics
import { config } from './config.mjs';

const BUFFER_API = 'https://graph.buffer.com/graphql';

async function gql(query, variables = {}) {
  const token = config.BUFFER_API_KEY;
  if (!token) throw new Error('BUFFER_API_KEY / BUFFER_TOKEN not set');

  const res = await fetch(BUFFER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Buffer API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Buffer GraphQL: ${json.errors[0].message}`);
  return json.data;
}

/** List recent posts (last N) for the configured channel */
export async function getRecentPosts(limit = 10) {
  const data = await gql(`
    query RecentPosts($channelId: String!, $limit: Int) {
      channel(id: $channelId) {
        posts(limit: $limit) {
          id
          text
          status
          createdAt
          scheduledAt
          sentAt
          channels { id name }
        }
      }
    }
  `, { channelId: config.BUFFER_CHANNEL_ID, limit });
  return data.channel?.posts ?? [];
}

/** Get metrics for a specific post by ID */
export async function getPostMetrics(postId) {
  const data = await gql(`
    query PostMetrics($postId: String!) {
      post(id: $postId) {
        id
        text
        status
        sentAt
        metrics {
          views
          impressions
          reach
          engagementRate
          reactions
          comments
          shares
        }
        metricsUpdatedAt
      }
    }
  `, { postId });
  return data.post;
}

/** Get aggregated metrics for posts in a date range */
export async function getAggregatedMetrics(startDate, endDate) {
  const data = await gql(`
    query AggregatedMetrics($channelId: String!, $startDate: String!, $endDate: String!) {
      aggregatedPostMetrics(
        channelId: $channelId
        startDate: $startDate
        endDate: $endDate
      ) {
        totalViews
        totalImpressions
        totalReach
        totalReactions
        totalComments
        totalShares
        averageEngagementRate
        postCount
      }
    }
  `, { channelId: config.BUFFER_CHANNEL_ID, startDate, endDate });
  return data.aggregatedPostMetrics;
}

/** Create a post on Buffer (queue to TikTok channel) */
export async function createPost({ text, mediaUrls = [], scheduledAt }) {
  const data = await gql(`
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        id
        status
        scheduledAt
        channels { id name }
      }
    }
  `, {
    input: {
      channelIds: [config.BUFFER_CHANNEL_ID],
      text,
      media: mediaUrls.map(url => ({ url })),
      ...(scheduledAt ? { scheduledAt } : {}),
    },
  });
  return data.createPost;
}
