# Carbon Footprint Calculator — Design Notes

This document records design reasoning so future edits don't regress or contradict earlier decisions. Read this before making visual changes to the calculator.

## Core anti-patterns to avoid ("claudeslop" tells)

These are the specific visual patterns that mark a tool as hastily AI-generated:

1. **Equal-width column grids.** Every vibecoded dashboard defaults to `1fr 1fr 1fr`. Column widths should reflect content density. The calculator uses 7:5:8 because the form panel needs width for inputs, the toggle list is narrow, and the systemic panel needs room for inline formulas.

2. **Identical panel headers with no affordance cues.** Panels that look the same but behave differently confuse users. Each panel header should hint at what the user does there. Currently: left has no subtitle (the form is self-explanatory), middle says "Toggle actions to see their impact", right says "Estimate your leverage on big problems."

3. **Missing expand/collapse affordances.** Clickable rows that look like static text are a major usability gap. Always include a chevron (▸/▾) or other visual indicator when something expands.

4. **Orphaned form fields.** A single field sitting alone in a grid row looks broken. Reflow fields to avoid orphans — pair them, or use a different sub-grid for that row.

5. **Uniform information density across panels.** If one panel is packed and another is airy, the layout looks unconsidered. Match density by adjusting column widths, not by padding sparse panels.

6. **Default checkbox styling.** Empty rounded squares in a list are the default look of every AI tool. The calculator uses custom Dot components with green fill + checkmark.

7. **Muddy input contrast.** Form inputs should be visually distinct from their container. Don't use the same background as the panel — use `--bg-elevated` (lighter) so inputs pop against the panel.

## Data integrity rules

8. **Never show impossible numbers.** The "up to X kg" summary must respect exclusive groups — you can't go vegan AND vegetarian AND cut beef. Compute the realistic max by taking only the best action from each exclusive group.

9. **Left number must never exceed right number** in "Eliminate X of Y flights" patterns. Enforce this both at default time (`Math.min(1, baseline)`) and reactively via `useEffect` clamping when baseline changes.

## Typography & consistency

10. **Units are always compact:** `kg CO₂e/yr`, `kg/person` — no spaces around slashes.

11. **Sentence case everywhere** per site convention. "4 actions" not "4 Actions" — watch out for `textTransform: capitalize` on parent elements leaking into child spans (override with `textTransform: 'none'`).

12. **Operator symbols in formulas** (× ÷ =) should be visually distinct from editable numbers — slightly larger, lighter weight, lower opacity. Otherwise the formula line reads as undifferentiated noise.

## Inline editable numbers

13. **Subtle background** (`rgba(0,0,0,0.04)`) + top border-radius on inline editable inputs so they read as interactive fields, not just underlined text.

14. **Dashed underline** on hover/focus changes to solid + accent color to confirm editability.

## Reference lines (bar chart)

15. **Visual weight hierarchy.** The most important reference (US avg) gets bold weight + higher opacity. Secondary references (EU avg, Global avg) are lighter. Don't make all reference lines identical.

## Font size scale

Only three sizes, no more:
- **1rem** — panel headers only
- **0.72rem** — primary body: action names, category headers, systemic action names, bar chart labels
- **0.62rem** — secondary/meta: collapsed counts, formula text, notes, subtitles, chevrons

Operator symbols in formulas (× ÷ =) use 0.85rem relative to their container but with opacity 0.5 and weight 300 so they read as punctuation, not content.

## Layout decisions already made

- **Grid ratio:** `7fr 5fr 8fr` (not equal thirds)
- **Transport opens by default** so the middle panel isn't empty on load
- **Presets label** is lowercase "Presets" in muted style — not uppercase/letterspaced (that competed with the panel header)
- **Form layout:** Uniform 3-col grid. Row 1: Location, Housing, Car. Row 2: Household, Area, Diet. Row 3: Flights/yr, Spend/mo, (empty). No dividers — clean grid.
- **Panel top borders:** Unified 2px accent red across all three panels — not three different colors (that was decorative noise with no meaning)
- **Bar chart separator:** 1px border, not 2px — the bars are the payoff, don't wall them off
- **Systemic intro text:** Collapsed by default into a one-line summary with "More" link. The full explanation + Example dropdown are nested inside the expanded state. Action list is immediately visible.
- **Category progress bars:** When actions are enabled, a tiny 32px-wide green progress bar appears on the category row showing fraction of max potential used. Gives visual weight to collapsed categories.
- **"Up to X kg" display:** The kg number is `fontWeight: 600` in body color, rest of the meta text is muted. Makes the most useful info the most visible.
