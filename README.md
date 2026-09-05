# andymasley.com

Personal website built with [Astro](https://astro.build).

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Substack Integration

The Writing page automatically pulls posts from `andymasley.substack.com/feed` at build time.

### Category Mapping

Posts are auto-categorized by keywords, but you can manually map posts to categories in `src/lib/substack.ts`:

```typescript
const categoryMap: Record<string, string> = {
  "your-post-slug": "AI & Technology",
  "another-post": "Economics",
};
```

### Automatic Refresh

To keep posts in sync, set up daily rebuilds in Netlify:

1. Go to **Site settings → Build & deploy → Build hooks**
2. Create a new build hook (e.g., "Daily Substack Sync")
3. Copy the hook URL
4. Set up a cron job or use a service like [cron-job.org](https://cron-job.org) to POST to that URL daily

Or use GitHub Actions - create `.github/workflows/daily-build.yml`:

```yaml
name: Daily Build
on:
  schedule:
    - cron: '0 6 * * *'  # 6am UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Netlify Build
        run: curl -X POST ${{ secrets.NETLIFY_BUILD_HOOK }}
```

## Structure

```
src/
├── content/           # Local markdown content
│   ├── music/
│   ├── film/
│   ├── books/
│   ├── notes/
│   └── physics/
├── lib/
│   └── substack.ts    # Substack RSS fetcher
├── layouts/
├── pages/
│   ├── writing/       # Pulls from Substack
│   ├── ib-physics/
│   ├── notes/
│   ├── media-recs/
│   ├── about.astro
│   └── contact.astro
└── styles/
```

## Deployment

Push to GitHub → Netlify auto-deploys.

## License

Content © Andy Masley. Code MIT.

## Hidden library

The `/room` set piece keeps the hexagonal library, chasm, mirror, 242 original fragments, and the complete Plunkitt book. Its 3D dependencies are bundled from pinned npm packages. `src/lib/room/graphics.ts` supplies the individual bindings and architectural details; `physics.ts` owns collision and frame-independent motion.

Visitors can use mouse and keyboard or touch controls. E opens the selected book; Escape pauses. The pause menu offers sound, camera comfort, lamplight, and a direct reading option. Plunkitt remembers a reading-position fraction locally, so the bookmark also survives a changed window size. Hidden tabs suspend audio and rendering; the reader suspends 3D rendering. The book text and original fragment records are retained unchanged.

Run `npm test` and `npm run build` after room edits. The movement tests cover bridge/pedestal collisions, large movement steps, frame rates, and rendering-quality recovery.
