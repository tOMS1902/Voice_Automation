# Studio

This repo makes marketing videos for any product. It produces vertical videos for TikTok, Reels and Shorts that are animated, voiced in your ElevenLabs voice and ready to post, all from one command. It runs on its own: a product plugs in with a config folder, and it can point at that product's repo to check facts.

```
episodes/<product>/<name>.yaml     WHAT this video says (content)
        +
products/<product>/product.yaml    WHO it's for (name, icon, end card, voice, categories, repo)
        +
templates/<template>.js            HOW it looks and moves (animation, timing, voice lines)
        │
        ▼   node studio.mjs render episodes/<product>/<name>.yaml
out/<product>/<name>/video.mp4     voiced, music under it, -14 LUFS. Post this.
                     silent.mp4    no audio, for a trending sound in TikTok
                     music.mp4     music and effects, no voice
```

## Setup (once)

```bash
npm install                               # also installs Chrome (for drawing) and ffmpeg
echo ELEVENLABS_API_KEY=your-key > .env.local
```

On Windows, put the key in `.env.local` with Notepad, or run `setx ELEVENLABS_API_KEY "your-key"`.

## Make a video

```bash
node studio.mjs new ball-knowledge quiz-rapid-fire rapid-fire-02   # copies the last one
#   edit episodes/ball-knowledge/rapid-fire-02.yaml: the 5 squares and their answers
node studio.mjs check  episodes/ball-knowledge/rapid-fire-02.yaml  # facts, from the app's own data
node studio.mjs render episodes/ball-knowledge/rapid-fire-02.yaml  # about 2.5 minutes
```

The voiceover is written and timed by the template from the episode's content: the categories when a square appears, nothing during the countdown, the answer on the reveal, then the sign-off. Each line is voiced once and cached in `out/voice-cache`, so re-renders cost no credits.

Other options:
- `--stills 2,5,12`: still images at those seconds, for a quick look.
- `--no-voice`: skip the voiceover.
- `--take take.mp3`: use one take made in the ElevenLabs app (with `[long pause]` between lines) instead of the API.

## Automated pipeline (GitHub Actions → TikTok)

Push a YAML episode (or trigger manually from the Actions tab) and the full pipeline runs:

1. **Render** — frames + ElevenLabs voiceover + music mix
2. **Upload artifact** — downloadable from the Actions run
3. **Publish release** — voiced `.mp4` attached to a GitHub Release
4. **Queue to Buffer** — the video is automatically added to your Buffer queue for TikTok posting

### Required secrets (Settings → Secrets and variables → Actions)

| Secret | What | Where to get it |
|--------|------|-----------------|
| `ELEVENLABS_API_KEY` | Voice synthesis | [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys) (starts with `sk_`) |
| `BUFFER_TOKEN` | Post to TikTok via Buffer | [publish.buffer.com/settings/api](https://publish.buffer.com/settings/api) |
| `BUFFER_CHANNEL_ID` | Your TikTok channel in Buffer | Query the Buffer GraphQL API (see below) |

To find your Buffer channel ID:
```bash
curl -s -X POST https://api.buffer.com \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BUFFER_TOKEN" \
  -d '{"query": "{ account { organizations { id } } }"}'
# then use the org id:
curl -s -X POST https://api.buffer.com \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BUFFER_TOKEN" \
  -d '{"query": "{ channels(input: { organizationId: \"YOUR_ORG_ID\" }) { id name service } }"}'
```

### Manual trigger

```bash
gh workflow run render.yml -f episode="episodes/ball-knowledge/rapid-fire-01.yaml"
```

## Add a product

1. Copy `products/ball-knowledge/` to `products/<new-product>/`.
2. Change `product.yaml`: name, icon, end card text, pill, voice (any ElevenLabs voice id), sign-off.
3. If the product has its own data, set `source`: the repo, where it's cloned locally, and the command that lists the right answers. `studio check` runs that command.
4. Use an existing template, or add one in `templates/` (copy `quiz-rapid-fire.js`). Templates read `window.EPISODE` and `window.PRODUCT` and set `window.AD = { FPS, DURATION, render, SOUND, VOICE }`.

## Fixing the voice

- **A word said wrong:** add it to `voice.pronunciations` in the product, spelled how it sounds (`Weah: Way-ah`).
- **A different read for one line:** in the episode, set `say:` on a square or `voice_hook:` for the opening line.
- **Overlapping lines:** the render prints a timeline and flags any line that overlaps the next or runs past the end.

## Where things are

- `studio.mjs`: the command line.
- `engine/`: the drawing kit (`engine.js`), the page it draws on, synthesised music and effects (`audio.mjs`, nothing to license), and the voice (`voice.mjs`, ElevenLabs).
- `engine/fonts/`: Bebas Neue (SIL Open Font License, see `OFL.txt`).

The engine started in footy-grid's `store/ad`. Here it's product-neutral: kits, flags, icon and end card come from the product file.
