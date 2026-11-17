---
name: front-end
description: 'Use when changing pepcalc Vue components, views, layout, Vuetify usage, styling, theming, the syringe drawing, charts, or user-facing copy.'
---

# Front-end

One-line rules; detail lives in `reference/`. Read a reference when its trigger applies:

| Read                         | When                                                   |
| ---------------------------- | ------------------------------------------------------ |
| `reference/design-tokens.md` | Writing any CSS, choosing a colour, theming, dark mode |
| `reference/components.md`    | Building a view, dialog, form, chart, or touch layout  |

## Styling

1. Colours come only from `--pc-*` tokens (`src/styles/tokens.css`) or Vuetify theme colours
   (`primary`, `secondary`, `success`, `warning`, `error`, `info`). No hex, `rgb()`, or Material
   names in components; `npm run check:tokens` enforces it and catches undefined tokens.
2. Two themes, `light` and `dark`, follow the device by default; Settings can pin one. Every new
   token is defined in both theme blocks, and text tokens pass `npm run check:contrast` (WCAG AA).
3. `theme.css` owns the look of app bar, navigation, cards, dialogs, fields, buttons and chips.
   Scoped styles are for layout and for drawing (SVG), never to restyle a Vuetify component.
4. Cascade layers: our theme sits above Vuetify components and below Vuetify utilities
   (`public/layers.css`). No `!important` outside the reduced-motion rule.
5. Typography: Hanken Grotesk throughout; headings (`pc-display` 700, card titles 600) use tight
   tracking. IBM Plex Mono or `pc-num` for figures. Use Vuetify 4 MD3 classes
   (`text-headline-large`). The brand is `AppLogo` (mark plus wordmark), never plain text.

## Layout and interaction

6. Phone first: one column, bottom navigation, 48 px touch targets, inputs at 16 px or larger
   (iOS zooms smaller ones). From 840 px: side rail and two-column views.
7. Respect safe areas (`env(safe-area-inset-*)`) because the app runs standalone on notched
   phones.
8. Presets are `PresetPicker` (chips plus custom entry), not ad-hoc chip groups.
9. One Log button (`LogHost`) is the way in to every log dialog.
10. Destructive actions await `useConfirmStore().ask()`; feedback goes through
    `useNotifyStore().show()`; never a local `v-snackbar`.
11. Every chart has a text summary (`aria-label`), and notes and sources sit under `MoreInfo`
    below it; series identity never relies on colour alone (the preview curve is dashed). A dose is
    told by its label and the legend's text; colour repeats it.
12. Charts use ECharts through `echarts/core` with only the parts registered; colours come from
    `useChartColors()`, never literals.

## Voice

12. Short and direct: say the thing and stop. No filler, no trailing ", so X" clauses, no
    em-dashes. Legal and safety wording is the exception and keeps its full text.
13. Never tell the user what dose to take. A preset is "from the label" or carries its
    `SourceBadge`; community-reported values never look like clinical ones; a schedule's
    interval is always the user's own. A planned dose is the user's entry. Never prefill it,
    rank it or comment on it.
14. The first-run notice (`common/DisclaimerDialog.vue`) says some peptides are
    investigational or not approved for human use. Nothing elsewhere softens or contradicts
    it.
15. Body measures are stated plainly: no shame or judgement about weight, gains and losses
    as signed numbers and never as colours, every profile field optional.

## Screens

Every chart, list and action has one home; other screens link to it. The estimated-level chart lives on the medicine's page. A preview inside an editor may repeat a chart only to show a value that is not saved yet, and stays folded until asked for. All entries has a list and a calendar. The calendar is the only month view.

| Screen     | Holds                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Today      | Doses due and active levels on `DueCard` (countdown, backdrop curve, readings, Stack/Calculate/Log actions), latest readings, recent entries |
| Stack      | Peptide cards with supply, age, schedule, in-system status and quick actions. Its page: schedule, reminder, level chart, draws, vials        |
| Calculator | Mix, draw, save a vial                                                                                                                       |
| Progress   | One trend chart with range chips and dose callouts, stat tiles, photos, side effects, All entries, Export PDF                                |
| Settings   | Profile, units, health apps, backup, install, about                                                                                          |
