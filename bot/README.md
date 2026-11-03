# Ball Knowledge Discord Bot

Discord bot for generating, rendering, and managing Ball Knowledge quiz content.

## Setup

1. Fill in `.env.local` at the project root:

```
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_server_id
DISCORD_CHANNEL_ID=channel_for_notifications
BUFFER_API_KEY=your_buffer_api_key
BUFFER_CHANNEL_ID=your_tiktok_channel_id
```

2. Install dependencies: `npm install`
3. Register slash commands: `npm run bot:deploy`
4. Start the bot: `npm run bot` (or use pm2 — see below)

## Running with pm2 (Recommended)

pm2 keeps the bot running in the background and auto-restarts it if it crashes.

```bash
npm i -g pm2
pm2 start bot/index.mjs --name ball-bot
```

Useful commands:

| Command | What it does |
|---------|--------------|
| `pm2 status` | Check if the bot is running |
| `pm2 logs ball-bot` | View live logs |
| `pm2 restart ball-bot` | Restart the bot |
| `pm2 stop ball-bot` | Stop the bot |
| `pm2 delete ball-bot` | Remove it from pm2 |

## Commands

### /suggest

**Generate a new episode, render it, and drop the files in Discord.**

This is the main content creation command. It:
- Picks 4 random players you haven't used before (easy → impossible difficulty)
- Creates the episode YAML file automatically
- Renders the carousel slides
- Posts the images directly in Discord for you to save and post to TikTok / IG
- Includes a **Delete Episode** button if you don't like the picks

No arguments needed — just type `/suggest` and wait for the render.

### /list

**Show all available episodes and their status.**

Displays every episode YAML in the project, grouped by product. Episodes that have been rendered show `[rendered]` next to them.

### /render \<episode\>

**Render an episode locally without posting.**

| Option | Required | Description |
|--------|----------|-------------|
| `episode` | Yes | Episode name, e.g. `carousel-prev-club-01` |

Runs the full render pipeline (Puppeteer → PNG slides or MP4 video). The bot responds with the last few lines of render output when complete.

### /post \<episode\>

**Render an episode and post it to Buffer (TikTok).**

| Option | Required | Description |
|--------|----------|-------------|
| `episode` | Yes | Episode name, e.g. `carousel-prev-club-01` |

Does everything `/render` does, then uploads the media and caption to Buffer for posting on TikTok. Sends a notification embed to the configured Discord channel. Requires `BUFFER_API_KEY` and `BUFFER_CHANNEL_ID` to be set.

### /analytics \[post_id\]

**Show Buffer post metrics.**

| Option | Required | Description |
|--------|----------|-------------|
| `post_id` | No | Buffer post ID for detailed metrics |

- **Without post_id**: Shows an overview of your 5 most recent posts (status, date, ID)
- **With post_id**: Shows detailed metrics — views, reach, engagement rate, reactions, comments, shares

### /status

**Show bot health and recent activity.**

Displays:
- Bot uptime
- Number of connected guilds
- Buffer connection status
- Last 3 posts from Buffer (if configured)

## Automatic Features

### Daily Analytics Summary

If `DISCORD_CHANNEL_ID`, `BUFFER_API_KEY`, and `BUFFER_CHANNEL_ID` are all set, the bot sends a weekly analytics summary to the notification channel every day at midnight. It covers the last 7 days of post performance.

## File Structure

```
bot/
  index.mjs            — Bot entry point, command loader, daily summary
  config.mjs           — Loads .env.local, validates required vars
  buffer.mjs           — Buffer GraphQL API client
  deploy-commands.mjs  — Registers slash commands with Discord (run once)
  commands/
    suggest.mjs        — /suggest — generate + render + drop files
    list.mjs           — /list — show episodes
    render.mjs         — /render — render locally
    post.mjs           — /post — render + post to Buffer
    analytics.mjs      — /analytics — Buffer metrics
    status.mjs         — /status — bot health
```

## Adding More Players

The player pool for `/suggest` is in `bot/commands/suggest.mjs` in the `PLAYER_POOL` array. Each entry is:

```js
['Player Name', 'Current Club', 'Previous Club', difficulty]
```

- Difficulty: `1` = easy, `2` = medium, `3` = hard, `4` = impossible
- Both clubs must exist in `products/ball-knowledge/product.yaml` categories
- Already-used players (from existing episode YAMLs) are automatically skipped
