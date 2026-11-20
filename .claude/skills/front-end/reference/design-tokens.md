# Design tokens

Part of the `front-end` skill.

The palette is adapted from the Cognitive Companion design system: warm paper surfaces, sage
green primary, terracotta accent, warm ink text, soft daylight shadows, calm motion. PepCalc
adds a warm-dark variant and a glass layer: the app bar, bottom navigation, rail, dialogs,
sheets, menus and snackbars are frosted (`backdrop-filter`) over a soft two-tone backdrop, and
cards are translucent paper with a lit top edge. Glass falls back to `--pc-surface` where
`backdrop-filter` is unsupported or the OS asks for reduced transparency.

## Files

| File                     | Holds                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `public/layers.css`      | Cascade layer order, linked before any bundled CSS                                                     |
| `src/styles/tokens.css`  | Primitives (`--stone-*`, `--sage-*`, `--terra-*`), fonts, radii, motion; semantic tokens per theme     |
| `src/styles/theme.css`   | Global element styles and Vuetify overrides (`pc-theme` layer); utility classes (`pc-utilities` layer) |
| `src/plugins/vuetify.ts` | Vuetify `light` and `dark` theme colours mirroring the tokens                                          |

## Semantic tokens (both themes)

| Group        | Tokens                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces     | `--pc-bg`, `--pc-surface`, `--pc-surface-2`, `--pc-surface-sunk`                                                                   |
| Text         | `--pc-text-1` (primary), `--pc-text-2` (secondary), `--pc-text-3` (tertiary)                                                       |
| Brand        | `--pc-brand`, `--pc-brand-strong`, `--pc-brand-soft`, `--pc-brand-softer`, `--pc-accent`, `--pc-accent-soft`, `--pc-accent-line`   |
| Lines        | `--pc-divider`, `--pc-divider-strong`                                                                                              |
| Status pairs | `--pc-{good,notice,alert,info}-{fg,bg}`                                                                                            |
| Shadows      | `--pc-shadow-{sm,md,lg,inset}`                                                                                                     |
| Glass        | `--pc-glass`, `--pc-glass-strong`, `--pc-glass-card`, `--pc-glass-{line,edge,sheen,shadow}`, `--pc-backdrop-{1,2}`                 |
| Syringe      | `--pc-syringe-{barrel,barrel-shade,ink,fill,fill-deep,clear-*,blue-*,steel-*,hub,hub-deep,stopper,stopper-hi,rod-*,glint,plunger}` |
| Chart        | `--pc-chart-{logged,preview,grid,axis,now,on-dose}`, `--pc-chart-dose-1` to `--pc-chart-dose-8`                                    |

Theme-independent: `--pc-font`, `--pc-font-display`, `--pc-font-mono`, `--pc-radius-*`, `--pc-glass-blur`,
`--pc-dur-*`, `--pc-focus-ring`, `--pc-shadow-focus`, `--pc-touch`.

## Utility classes

| Class                                                   | Use                                          |
| ------------------------------------------------------- | -------------------------------------------- |
| `pc-page`                                               | Page container with responsive gutters       |
| `pc-eyebrow`                                            | Small tracked terracotta label above a title |
| `pc-display`                                            | Heading weight and tracking                  |
| `pc-muted`, `pc-faint`                                  | Secondary and tertiary text                  |
| `pc-num`, `pc-mono`                                     | Tabular figures                              |
| `pc-inset`                                              | Grouped panel inside a card                  |
| `pc-card-soft`, `pc-card-accent`                        | Sage or terracotta tinted card               |
| `pc-badge` + `pc-badge--{brand,good,notice,alert,info}` | Calm status pill; add `pc-badge__dot`        |

## Adding a colour

1. Add the token to both `.v-theme--light` and `.v-theme--dark` in `tokens.css`.
2. If it is text, add the pair to `scripts/check-contrast.mjs`. The checker reads only solid
   hex tokens, verifies each `--pc-chart-dose-1` to `--pc-chart-dose-8` passes 3:1 against
   `--pc-surface`, and verifies `--pc-chart-on-dose` passes 4.5:1 against each dose slot; glass
   fills stay at 72% opacity or more so text keeps its contrast on them. The
   backdrop tint lowers light-mode contrast at the top left: `--pc-text-3` drops to about
   4.1:1 there, so faint text belongs inside cards, never on the bare page.
3. Write `-webkit-backdrop-filter` before `backdrop-filter`: the CSS minifier merges the pair
   and keeps the last one, and Chromium ignores the prefixed form.
4. If it is a chart series, validate the palette with the dataviz palette checker against both
   surfaces (lightness band, chroma, colour-blind separation) before use.
