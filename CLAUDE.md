# andymasley-site — Instructions for Claude Code

**Multiple Claude Code instances may edit this repo from different machines.**
Every instruction here exists to prevent instances from silently overwriting each other's work. Follow them exactly.

## Git workflow (CRITICAL)

### Before ANY edit

```
git fetch origin
git pull origin main
```

Do this at the very start of every session, before reading or modifying any file. If the pull fails due to local uncommitted changes, stash them, pull, then re-apply.

### After ANY edit

Every change must be committed and pushed before the session ends:

```
git add <changed files>
git commit -m "Description of change"
git push origin main
```

**Never deploy to Cloudflare without also committing and pushing to GitHub.** Cloudflare deployments without git commits will be silently overwritten by the next session on any machine.

### Deploy workflow

The full workflow for any change is:

1. `git pull origin main`
2. Make changes
3. `npm run build`
4. `/opt/homebrew/bin/wrangler pages deploy dist`
5. `git add` the changed files
6. `git commit`
7. `git push origin main`

Never skip steps 5–7. The deploy is not complete until the push succeeds.

## Aesthetic and design rules

### Do not restyle existing UI

Do not "clean up," "polish," "modernize," or "strip" the visual styling of any page unless Andy explicitly asks for it. This includes:

- Changing colors, fonts, spacing, or layout
- Removing CSS that you consider "decorative" or "slop"
- Replacing class-based styles with inline styles or vice versa
- Rewriting CSS to match a different design philosophy (e.g., "data-journalism aesthetic")
- Adding or removing animations, transitions, hover effects
- Changing border-radius, box-shadow, opacity values
- Restructuring HTML for aesthetic reasons (e.g., collapsing a details/summary into a flat paragraph)

**Why:** Multiple sessions have independently decided to overhaul the site's aesthetics, each overwriting the previous session's work. Andy's aesthetic choices are intentional. If Andy asks you to add a feature, add the feature — don't also restyle the page it lives on.

### Site-wide design system

The system lives in `src/styles/global.css` (tokens at the top of `:root`). These are the facts; do not change any of them without being asked.

- **Typeface:** Georgia for everything — body, headings, UI chrome (`--font-editorial` / `--font-body` / `--font-label` all resolve to the same Georgia stack). Real code samples are the only monospace. Weights 400 and 700 only; no webfonts.
- **Ink:** near-black on white paper (`--text: #1a1a1a` on `#ffffff`; dark mode `#e6e6e6` on `#121212`). Secondary ink `--text-secondary`, dimmed ink `--dim`, hairlines `--border` / `--border-subtle`. All pairs meet WCAG AA at the sizes they're used.
- **Links:** Wikipedia blue `--accent: #0645ad` (dark `#8ab4f8`), visited `#551a8b` (dark `#c58af9`). Blue means "this is a link" and is used for nothing else. Hover changes underline color; it never removes the underline.
- **Measure:** `--measure: 640px` for reading columns; `.main-content` is measure + `--page-pad` each side. Essay pages at ≥1280px add a 220px TOC rail left of the text column (`.article-grid--wide`); sidenotes engage at the same breakpoint.
- **Type scale:** eight sizes, `--text-xs` through `--text-2xl` plus `--text-display`. Every font-size on a reading surface is a scale token — `src/lib/__tests__/design-tokens.test.ts` enforces this and fails the build on literal px/rem sizes (visualization internals are exempt by path).
- **Leading:** five values — `--leading-tight` 1.1 (display), `--leading-heading` 1.3, `--leading-note` 1.5, `--leading-ui` 1.65, `--leading-prose` 1.7.
- **Spacing:** nine steps, `--space-2xs` (4px) through `--space-4xl` (80px). No off-scale margins/padding on new work.
- **Labels:** exactly two recipes. A: spaced caps, `--text-xs` / letter-spacing 0.12em / `--dim` (section labels, running heads). B: sentence-case `--text-sm` (everything else). No third variant.
- **Case:** sentence case for all titles and labels (capitalize first word only).
- **Corners and effects:** sharp corners (radius 0), hairline borders, no shadows, no animations beyond the rotating ▸ disclosure caret and theme-neutral hovers.
- **Dark mode:** same structure, inverted ink; nothing warm-toned. Only an explicit toggle choice persists; otherwise the site follows the system preference live.
- **End matter:** essay pages end with at most: diamond end mark, notes run, one colophon line, a cited-in list (≤5), older/newer links, one back-link. Do not add more furniture after the prose.

## Water visualization (`src/pages/visuals/water.astro`)

This is a large single-file interactive visualization (~2400 lines). It contains data, HTML, CSS, and JS all in one `.astro` file.

### Key design decisions (do not change without being asked)

- **Electricity water factor:** All +elec estimates use **0.47 gal/kWh** (thermoelectric-only, NREL), excluding hydroelectric reservoir evaporation. This is an intentional editorial choice — see the Construction Physics link in the methodology. Do not switch to LBNL's 1.19 gal/kWh factor.
- **Intro structure:** Short lede paragraph + collapsible `<details>` section ("How to read this visualization") + methodology/contact line. Do not flatten this into a single paragraph or inline the styles.
- **Tooltip behavior:** Click-to-show (not hover) with close button. Links inside tooltips must be clickable.
- **Toggle panel:** Category headers with chevrons, color-coded left borders on active items, category-colored checkboxes.
- **Segmented controls:** Underline-style (not pill-style) for view mode and water source toggles.
- **Mobile layout:** Dedicated responsive breakpoints at 850px, 560px, and 380px with specific layout changes at each.

### Data sources and methodology

The methodology section at the bottom of the page documents every number. If you change any data values, update the corresponding methodology section and tooltip text to match.

The file `WATER-VIZ-METHODOLOGY.md` at the repo root contains a comprehensive audit of all sources. Keep it in sync if data changes.

## Project structure

- **Framework:** Astro
- **Build:** `npm run build` → output in `dist/`
- **Deploy:** `/opt/homebrew/bin/wrangler pages deploy dist` (Cloudflare Pages)
- **Domain:** andymasley.com
- **Repo:** https://github.com/AndyMasley/andymasley-site

### Key paths

- `src/pages/` — All page files (.astro)
- `src/layouts/Base.astro` — Base layout
- `src/components/` — Reusable components
- `src/styles/global.css` — Global styles
- `src/content/` — Content collections
- `src/lib/` — Utility functions

### Content source

Content comes from an Obsidian vault at:
`/Users/andy/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian/Obsidian Vault/07 - Writing/For the website/`

## General rules

- **Don't create documentation files** (README.md, CONTRIBUTING.md, etc.) unless asked.
- **Don't add comments, docstrings, or type annotations** to code you didn't change.
- **Don't refactor code** you weren't asked to touch.
- **Sentence case** for all titles on the site (only capitalize the first word).
- **No emojis** in code or content unless Andy explicitly asks for them.
