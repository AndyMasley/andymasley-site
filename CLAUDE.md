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

## Post content is inviolable (CRITICAL)

Never edit the main text content of Andy's posts. Not a word, not a heading, not a footnote. This is the hardest rule in this file, and it has no "unless it would clearly be better" exception.

The posts' source of truth is Substack (and the EA Forum). The site's transform layer may change how a post RENDERS, never what it SAYS:

- Never add, remove, retitle, or restructure headings or sections.
- Never rewrite, insert, or delete sentences, list items, captions, or footnotes.
- Never change punctuation. Dashes, hyphens, ellipses, spacing characters — everything renders exactly as typed. The single grandfathered exception is the long-standing straight→curly quote/apostrophe smartener in `src/lib/smarten.ts`; do not extend it.
- Never add per-post content patches to `src/data/patches.ts`. It stays empty unless Andy explicitly dictates a specific patch, in his own words, in the current session.
- Never edit the committed caches (`.cache/substack`, `.cache/eaforum`) — they hold the raw upstream copies.
- Never edit the posts on Substack or the EA Forum themselves.

The only permitted transforms are the quote smartener above and character-identical markup work (inline-tag whitespace hygiene, empty-paragraph removal, heading IDs and anchors, link rewriting, image attributes, embed containment, widget stripping). Any new transform that touches text characters requires Andy's explicit approval in the session that adds it. A dash-normalization pass was added and then removed at Andy's direction in Aug 2026 — do not reintroduce it.

**Enforced mechanically:** `src/lib/__tests__/content-integrity.test.ts` fails the suite if the pipeline's output ever adds or rewrites a word of any cached post. Do not weaken, exempt, or delete that test to make a change pass — if it fails, the change is wrong. The sole sanctioned exception is a wording fix Andy dictates himself, recorded in that test's `ALLOWED_INSERTIONS` with a note naming him.

**Why:** During an Aug 2026 typography pass, a session added its own section headings to two essays and retitled "Conclusion" headings. The structure and wording of the essays are Andy's voice and his alone. If a post seems to need an edit, tell Andy what and why — do not make it.

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
- **Ink:** near-black on warm off-white paper (`--text: #1a1a1a` on `--bg: #f4f3ee`; dark mode `#e6e6e6` on `#121212`). Secondary ink `--text-secondary`, dimmed ink `--dim`, hairlines `--border` / `--border-subtle`. All pairs meet WCAG AA at the sizes they're used.
- **Links:** quiet ink-blue `--accent: #1f5a7a` (dark `#8fb8d8`), visited `#5b3a7a` (dark `#b9a3d9`). Andy replaced the old Wikipedia blue (`#0645ad`) in Aug 2026: the browser-default blue made the page read undesigned. Blue means "this is a link" and is used for nothing else. Hover changes underline color; it never removes the underline. `:visited` cannot read `var()` (browsers block it to defeat history-sniffing), so those hexes are repeated literally at six `:visited` sites (one of them in `writing/index.astro`) — `grep -rn '5b3a7a\|b9a3d9' src/` finds them all, and they must move together.
- **Measure:** `--measure: 640px` for reading columns; `.main-content` is measure + `--page-pad` each side. Essay pages at ≥1280px add a 220px TOC rail left of the text column (`.article-grid--wide`); sidenotes engage at the same breakpoint.
- **Type scale:** eight sizes, `--text-xs` through `--text-2xl` plus `--text-display`. Every font-size on a reading surface is a scale token — `src/lib/__tests__/design-tokens.test.ts` enforces this and fails the build on literal px/rem sizes (visualization internals are exempt by path).
- **Leading:** five values — `--leading-tight` 1.1 (display), `--leading-heading` 1.3, `--leading-note` 1.5, `--leading-ui` 1.65, `--leading-prose` 1.7.
- **Spacing:** nine steps, `--space-2xs` (4px) through `--space-4xl` (80px). No off-scale margins/padding on new work.
- **Labels:** two recipes. A: spaced caps, `--text-xs` / letter-spacing 0.12em / `--dim`. B: sentence-case `--text-sm`. No third variant. Andy quieted the homepage in Aug 2026: the `.label` component (Start here / Recent / Subscribe), the Recent dates and the Elsewhere line moved from A to B, because spaced caps read as a stock editorial component. `Elsewhere` is a shared component, so /contact's copy of that line de-capped too; /contact's own "Press" label was then moved to B as well, so the page would not carry both recipes side by side. That second one was the implementing session's call, not Andy's instruction — revert `.contact-press__label` in `src/pages/contact.astro` if he wants /contact left alone. Recipe A still holds everywhere else — essay bylines and series lines, the TOC rail and mobile running head, "notes", "Cited in", Older/Newer, search result types, `.prose th`, and the /appearances, /notes and /physics chrome. Converting those too is a live open question, not drift; ask before doing it.
- **Case:** sentence case for all titles and labels (capitalize first word only).
- **Corners and effects:** sharp corners (radius 0), hairline borders, no shadows, no animations beyond the rotating ▸ disclosure caret. Hovers shift colour and nothing else — no rotate, scale, translate, or opacity fade on any chrome or reading surface (Andy, Aug 2026; the header hexagon used to swing 30°). Visualization internals and the /hexagon and /room set pieces keep their own motion.
- **Dark mode:** same structure, inverted ink; nothing warm-toned. Only an explicit toggle choice persists; otherwise the site follows the system preference live.
- **End matter:** essay pages end with at most: one hairline end rule (`.divider.article-endmark`), notes run, one colophon line, a cited-in list (≤5), older/newer links, one back-link. Do not add more furniture after the prose. The rule replaced a CSS diamond in Aug 2026, at Andy's direction — `.divider` is now a plain 1px `var(--border)` line everywhere it is used, and there is no ornament left to restore.

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

## Water map (`src/pages/visuals/water-map.astro`)

A 3D map of USGS 2015 county water use ("Where America’s water goes"). The Three.js app lives in `src/lib/water-map/` (entry `main.js`, `startWaterMap(root)`), its styles in `src/styles/water-map.css`, and its baked data in `public/water-map/data/`. The Python scripts that baked the data from the raw sources are in `scripts/water-map/` (the raw downloads are not in the repo).

- The map sits on a dark screen like `/town`; the chrome around and over it uses the site tokens (Georgia, hairlines, square corners, no shadows). Keep it that way.
- Every number on it comes from the sources in the page’s “About the data” section. If a data value changes, update that section and the panel text that quotes it.
- The page script disposes the app on `astro:before-swap`, because the site uses view transitions.
- Color means use for the streaks, the channels and the use list. A selected place is the one exception: clicking a county, power plant, treatment plant or golf course calls `FlowParticles.setFocus`, which draws that place's channels, particles and dots in the color of each source (`SRC_DEF` in `core/config.js`, the same names and colors as the panels), with widths set by their share of its water, returns as gray dashes and no fate labels. Each source is boxed on the map with its share and is never dropped; keep those shares and the panel's "Where its water comes from" in agreement (both include reclaimed wastewater).
- Channels (`flow/particles.js`): closer than `midMax` (800) the biggest channels everywhere are drawn over the national streaks, and closer than `detailMax` (260) every channel down to `minChannel(d)` around the view, with particles riding them. All of them share one fixed width scale (`chanPx`); each starts in the color of its source and turns to the color of its use (`aSCol` to `aCol`), with a chevron near the use end. They start at a small dot of one size (an intake) or a small ring (a well); water for a utility, factory or fish farm ends at a square where it is gathered. Only trunks are drawn, from each source to where its water is gathered. The reading key and the one-line key over the map while channels are drawn (`Hud.setLegend`) draw their width examples with `chanPx`, so they stay in step. While a lens colors the land and the Layers sheet is shut, that key also carries a line with the lens's name and ramp.
- Water the biggest public systems move between counties is in `core/transfers.js`: each system's sources, routes and volumes, with a citation for each. `WaterModel._transfers` takes that water out of the counties USGS counts it in (surface water first) and routes it to the counties it serves. A county's shares, story sentence and Sankey count water piped in and not water piped away. Add a system only with a cited source for how much it moves and where; an audit in Oct 2026 dropped two that had none (Cobb County's Lake Allatoona water, and the Raritan basin system, whose USGS withdrawals in Hunterdon County may be the Delaware and Raritan Canal's diversion rather than the reservoirs).
- The West's imported water (`IMPORTS` in `core/transfers.js`, `WaterModel._imports`): where a source says how much of an aqueduct's water reached a county, that part of the county's surface water for the use starts at the aqueduct's intake and runs along it, and the county's USGS totals stay as they are. So far the Los Angeles Aqueduct (LADWP open data) and the Central Arizona Project (its 2015 deliveries summed customer by customer by county and use in `scripts/water-map/cap_deliveries.py`; what is left out is in `WATER-MAP-METHODOLOGY.md` section 3). An import counts in its county's disc and labels, never more than the county's own surface water for the use; the number checks hold both.
- In counties with mapped canals and aqueducts (outside New York), surface water for crops, golf courses, livestock, public supply and industry is drawn from the canals, not the rivers. Crops, golf courses and livestock take none from the aqueducts built for cities (`AQ_CITY` in `core/flows_data.js`).
- Aqueduct lines come from OpenStreetMap (`bake_features.py`), except where OpenStreetMap maps them only in pieces or not at all: the Colorado River Aqueduct (6 of its 390 km), the first Los Angeles Aqueduct, the Delta-Mendota Canal and the State Water Project's East and West branches (added by `NEW` in the script) are drawn from the USGS National Hydrography Dataset (`scripts/water-map/bake_nhd_aqueducts.py`, which writes `geom: 'nhd'` so their panels credit NHD). Their pipeline reaches (NHD FCodes 428xx) are dashed like the tunnels from OpenStreetMap.
- USGS counts the water of Brunner Island and Peach Bottom, on the York County bank of the Susquehanna, in Lancaster County across the river (`COUNTED_IN` in `scripts/water-map/bake_features.py`, mirrored in the baked `features.json`). Their `loc_county` keeps the county they stand in.
- The use picker on the left is the three-step Sankey (`Hud.renderUseSankey`, `sankey3SVG` with `pick`) wherever the panel is at least 286px wide: clicking a use shows only its water, clicking a band or a source holds that water on the map (`app.focusFlow`) and dims the other bands, with a caption under it. Narrower, and on phones, it is the list of uses.
- The Withdrawn/Consumed switch above the use list shows only the water consumed, for the uses USGS estimated it for (crops, golf courses and power plants); the other uses read "not estimated".
- Follow a drop (toolbar, `#drop`): `flow/drop.js` puts every surface intake on the HydroRIVERS reach it draws from and walks a drop downstream, taken at each intake with the chance withdrawals over the flow past (natural flow less what was consumed or piped away upstream), then used up by its use's share (crops, golf and power plants from USGS 2015; public supply 0.12 and industry 0.10 from `DROP_CONSUMED`, each cited; no share for livestock, fish farms, mines or self-supplied homes, whose water goes back). The five big western diversions USGS counts far from their river are taken out of it at their measured 2015 volumes (`DROP_DIVERSIONS`; the State Water Project at what Banks Pumping Plant pumped, not what it delivered), their water runs along their canals to where it is used, and the receiving counties' own intakes lose the same amount. Each split is cited (Reclamation for the All-American Canal and the Delta-Mendota Canal's 2015 deliveries by district, DWR's Table A amounts for the State Water Project, `DROP_SOURCES`); add no part without a source. The drop takes a county's water near where it is used, not always at the map's anchors (WATER-MAP-METHODOLOGY.md section 12, "The intakes"), and sends it back near where it was taken. `ui/dropview.js` draws the drop, its trail and the captions, and the panel gives its journey and the odds for 1,000 drops from the same spot. Its words say "by the map's figures"; keep them that way, and keep the caveat on heavily used rivers until the flows are gage-adjusted. Only the click that drops it makes a sound.
- Rivers carry glowing pulses that travel downstream (`net/rivers.js`). A session removed them in Oct 2026 to quiet the basemap, and Andy asked for them back the same day: keep them.
- Andy had the Compare chart (a log-scale comparison) removed in Oct 2026. Do not bring it back.
- Interface sounds (`ui/sound.js`, added at Andy's request in Oct 2026) are synthesized with Web Audio, no audio files: a drop pitched by the water of the place picked, a run of drops for a use, taps, rising or falling notes for switches, a breath for camera flights, a gulp underground, a pentatonic note per story scene, a shutter for Save image. They play only within moments of the reader's own click, key, touch or wheel, never for the map's own motions, and a priority gate keeps them from piling up. The Sound button in the toolbar mutes them (remembered in localStorage `wm-sound`; on by default). Keep them quiet: the loudest peaks near -14 dBFS.
- One width scale for everything that carries water: `chanPx(v) = max(1.25, 0.1585 v^0.6)` px (ten times the water, about four times as wide) in `flow/particles.js`, used by channels, routes, the top discs and the measured canals in `net/aqueducts.js`. A chevron near the use end shows direction (no taper). At crops, golf courses and power plants a pie shows consumed (white) and returned (gray), ringed in the use's color.
- From afar (farther than about 640), `FlowParticles.buildTop(40)` draws discs at the 40 places that withdrew the most, labeled in `main.js` (the first ten from the national view). The page text and the key say "40"; the number checks hold them to `buildTop`.
- Below 1500px wide the right panel starts as a slim card (`Hud.railWanted`); zoomed in with nothing selected it sums up the counties in view (`Hud.showView`, `countiesInView`). Hovering a disc or channel names it (`FlowParticles.pickAt`).
- Data layers added in Oct 2026, each baked by a script in `scripts/water-map/` whose raw inputs and checksums are in `WATER-MAP-METHODOLOGY.md`: the strain lens and county strain figures (`strain.json`, USGS surface water supply and use index), the High Plains water levels in the underground view (`conus_hpwl.png`, `HP_LEVELS`), five-year county history 1985 to 2015 and the "Change since 2005" lens (`history.json`), the ZIP code search (`zips.json`, Census ZCTAs), and the flat map (`flat_county.png`, `flat.js`).
- Irrigated land on the lower 48 is LANID 2015 (Xie, Gibbs and Lark 2021), reduced on the downloading computer by `scripts/water-map/lanid_reduce.py` and baked by `bake_lanid.py`: the land texture's irrigated channel, the close-up sheets' top three bits (`class + 32 x level`, `irr: 7` in the manifest; `nlcd.js` masks them off for the class), the `irr` anchors (crop water ends on LANID fields in counties with at least 1 km² of them) and `lanid_km2` in `county_data.json`. Alaska, Hawaii and Puerto Rico keep each county's USGS acreage spread over cropland. `bake_flows.py` draws the newer anchor sets (`irr`, `ind`, `mine`, `fish`) with their own random generator so the older sets stay exactly as they were; keep it that way.
- Factories, mines, fish farms and livestock farms with an individual EPA discharge permit (ECHO, October 2026) are a point layer (`loadFacilities` in `net/infra.js`, `app.fac`, the `fac` toggle under Layers), filtered on the downloading computer by `scripts/water-map/npdes_extract.py` and `npdes_join.py` and baked by `bake_npdes.py`. Each county's industry, mining and fish farm water ends at up to eight of its permitted facilities of that kind, largest design flow first (`ind`, `mine`, `fish` anchors); livestock water stays on farmland. A design flow over ten times its county's 2015 total is flagged (`flags & 2`) and its panel says the figure or the location is probably wrong. USGS has no figure for any one facility, so a facility's panel shows its county's water for the use; keep it saying so.
- Sewage plants with an individual EPA discharge permit (ECHO, October 2026) are a point layer (`loadSewage` in `net/infra.js`, `app.sew`, the `sew` toggle under Layers), extracted on the downloading computer by `scripts/water-map/npdes_sewage.py` and baked by `bake_sewage.py`, each with up to eight outfalls: a click draws a line from the plant to each (`CountyOutline.setPaths`). OpenStreetMap's wastewater plants within 750 m of one are the same plant and are hidden (`hidePoints`). A design flow over 3,000 gallons a day per person in the county is flagged as the wrong units, and a plant over 20 km from the county its permit names says so. USGS has no figure for what a sewage plant returns, so its panel gives the permit's design flow; keep it saying so.
- What those facilities and sewage plants discharged in 2015 is from EPA's discharge monitoring reports (ECHO's DMR downloads for fiscal 2015 and 2016): `scripts/water-map/npdes_dmr_flows.py` on the downloading computer keeps the flow values (parameter 50050), `bake_dmr.py` takes each permit's mean monthly flow summed over its external outfalls, and `bake_dmr_join.py` writes `dmr[i] = [Mgal/d, months, outfalls, flags]` into `npdes.json` and `sewage.json` (WATER-MAP-METHODOLOGY.md section 18). A flow that fails the script's tests (`flags`) is shown as probably in the wrong units, never as measured. The panels give the reported flow beside the design flow; it is what left through the outfalls, and the map's flows still follow the USGS county figures.
- County panels list the public water systems serving the most people there, from the USGS water service areas (Buchwald and others 2022), sampled on the downloading computer by `scripts/water-map/wsa_samples.py` and baked by `bake_wsa.py` into `water_systems.json` (loaded when a county is first opened). A system's name outlines its service area (`app.showSystem`, from `wsa_outlines.dat.png`: `wsa_outlines.py` on the downloading computer, `bake_wsa_outlines.py` here; `rec` in `water_systems.json` is each listed system's record). On the lower 48 a county's public supply ends in its systems' service areas (`wsa` anchors, ANC4, drawn with their own generator `rng3` in `bake_flows.py`) where they serve at least 2,000 people there.
- Up close (camera distance under 24) the lower 48's irrigated fields are LANID's own at about 65 m (`world/fields.js`, `FieldTiles`; F = 12 times the colour texture): sheets made on the downloading computer by `scripts/water-map/fields_fine.py` (byte = crop group + 32 x irrigated level in eighths) and converted by `bake_fields.py`. The crop groups (`fields_fine.CROPS`) are what the USDA Cropland Data Layer says grew there in 2015, added by `scripts/water-map/fields_crops.py` on the computer with the Cropland Data Layer and unpacked by `bake_crops.py` here; `bake_crops.py --counties` puts each county's irrigated land by crop in `county_data.json` (`crops`) for its panel. Where they are loaded, `groundDetail` draws the irrigated land from them and paints no procedural pivots; fields that were not irrigated stay procedural.
- The flat map (`src/lib/water-map/flat.js`) starts at `?flat` or when the browser has no WebGL 2: the same county figures on a 2D map, with keyboard stepping and spoken summaries. Keep its figures in step with the 3D panels.
- `src/lib/__tests__/water-map-numbers.test.ts` checks every fixed figure in the page text, panels, tour and common questions against the data. When it fails, fix the text or the data, not the check. `scripts/water-map/check_plants.mjs` lists plants credited with more than ten times their plant-model estimate. Each plant also carries what its operator reported to EIA for 2015 (`eia_w`, `eia_c`, baked by `scripts/water-map/bake_eia_plants.py` from EIA's cooling_summary_2015.xlsx), shown in its panel beside the model; the map's flows still follow the USGS county figures.
- The page keeps a public "Corrections" list (newest first). Add an entry whenever a published figure or claim changes.
- `WATER-MAP-METHODOLOGY.md` documents every dataset, modeling choice and known limit. Keep it in sync when data or methods change.

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
