# Components and views

Part of the `front-end` skill.

## Shared components

| Component                                                                                      | Use                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common/PresetPicker.vue`                                                                      | Number input as preset chips plus a Custom field; chips are buttons with `aria-pressed`                                                                                          |
| `common/SourceBadge.vue`                                                                       | Shows where a number came from (label, trial, standard, community, ...)                                                                                                          |
| `common/SourceList.vue`                                                                        | A list of sources, each with its badge and a link                                                                                                                                |
| `common/ListPager.vue`, `SortToggle.vue`                                                       | Range caption and `v-pagination` (hidden on one page); newest or oldest first toggle                                                                                             |
| `common/AppLogo.vue`                                                                           | The brand: mark (`src/assets/brand/pepcalc-mark.svg`, same art as `public/favicon.svg`) plus the two-tone wordmark                                                               |
| `common/AppSnackbar.vue`, `AppConfirm.vue`                                                     | Render the notify and confirm stores; mounted once in `App.vue`                                                                                                                  |
| `common/UpdatePrompt.vue`                                                                      | Service-worker update and offline-ready notices                                                                                                                                  |
| `common/DisclaimerDialog.vue`                                                                  | First-run research-use acknowledgement                                                                                                                                           |
| `calculator/SyringeGraphic.vue`                                                                | SVG syringe drawn from a `SyringeSpec`; accessible label states the reading                                                                                                      |
| `calculator/DiluentAdvisor.vue`                                                                | Bottom sheet: ranks water volumes for planned doses and vial size; emits the chosen mL                                                                                           |
| `calculator/DrawResult.vue`                                                                    | Headline reading, warnings, syringe picker, readings on every syringe                                                                                                            |
| `charts/PkPanel.vue`                                                                           | Chooses catalog or user-supplied PK, shows sources and caveats, or why no curve exists; optional `title` and `caption`                                                           |
| `charts/PkChart.vue`                                                                           | ECharts curve: logged doses (solid) and the previewed draw (dashed), "Now" marker                                                                                                |
| `charts/levelsChart.ts`                                                                        | The curve's model and ECharts option, shared by `PkChart` and the share card so both draw the same thing                                                                         |
| `charts/ShareLevelsDialog.vue`                                                                 | Previews the levels card (`levelsShareCard.ts`, a 1080x1350 PNG drawn on device) and shares it; name and amounts optional                                                        |
| `report/ExportReportDialog.vue`                                                                | Period and section choice, then PDF export (`useReportExport`); opened from Journal                                                                                              |
| `shelf/VialCard.vue`                                                                           | Vial summary card on the peptide page                                                                                                                                            |
| `protocols/ProtocolDialog.vue`, `DoseCountdown.vue`                                            | Add or edit a peptide's schedule; countdown ring to the next dose (`domain/schedule.ts`)                                                                                         |
| `shelf/VialAgeBadge.vue`, `VialAgePanel.vue`                                                   | Days since mixing against the use window (text, not colour alone); the window's source and storage advice                                                                        |
| `shelf/VialFormDialog.vue`, `LogDrawDialog.vue`                                                | Edit a vial (composition, PK override); log, edit or delete a draw                                                                                                               |
| `journal/LogHost.vue`                                                                          | Mounted once in `App.vue`: the Log button, the sheet, and every log dialog                                                                                                       |
| `journal/LogButton.vue`, `journal/LogSheet.vue`                                                | Floating Log button and bottom sheet listing every loggable kind                                                                                                                 |
| `journal/EntriesTimeline.vue`                                                                  | Every logged thing by day, with kind filters; a row opens its dialog through the log store                                                                                       |
| `charts/TrendCard.vue`, `charts/BodyChart.vue`, `charts/DoseLegend.vue`, `charts/bodyChart.ts` | A body measure over time. On weight and BMI the line takes the colour of the dose in use and a pill marks each change (`domain/doseBands.ts`); `DoseLegend` lists the strengths. |
| `share/ShareTrendDialog.vue`                                                                   | Trend image; numbers, photos and doses each opt-in                                                                                                                               |

## Views

- `views/CalculatorView.vue`, `views/StackView.vue`, `views/PeptideView.vue`, `views/LevelsView.vue`, `views/VialView.vue`, `views/JournalView.vue`, `views/SettingsView.vue`, `views/HealthView.vue` (apps only).

## Patterns

- To log or edit anything, call `useLogStore().start(kind, context)` or `.edit(entry)`. Never mount a log dialog in a view.
- A new kind of entry is one adapter case in `useEntries.ts`, one row in `logKinds.ts`, and its dialog.
- Dialogs reset their form from props each time they open, so abandoned edits never leak.
- A view that edits data calls a store action, then `notify.show()`.
- Every number with a source shows a `SourceBadge`; community-reported values never look like
  clinical ones.
- One-home rule: the full estimated-level chart (`PkPanel`) lives on the peptide's page (`PeptideView`), pooling every draw of that peptide across its vials (`shelf.pooledDosesFor`, `shelf.levelGroups`). The vial page links to the peptide's page instead of repeating `PkPanel`; the calculator keeps its draft dose preview folded under `Preview levels` (`MoreInfo`); the multi-peptide overlay lives on its own comparison page (`LevelsView` at `/stack/levels`).
- A trend chart is one grid with one value axis. Do not add a second panel under it.
- Share dialogs render their privacy switches compact through `ShareImageDialog`'s slot.
- A protocol belongs to a peptide, not a vial (`sameProductKey`, as vial numbering uses): its
  last dose is the newest draw from any of the peptide's vials, and a blend is its own product.
  The interval is always the user's own; nothing is pre-filled from the catalog.
- Helpers that read per-visit calculator state (the mixing advisor) open as a sheet over the
  calculator rather than a route, so the user's inputs are never lost or passed through the URL.
- Lists page in memory, ten to a page (`usePaging`, `domain/listing.ts`): the shelf by most recent
  use, draws newest first with a sort toggle. Charts and totals always use every row, not the page.
- A vial is named through `shelf.displayName()`, which adds "#2" when another vial of the same
  peptide exists, so the shelf, vial page, calculator and Protocols agree.
- Loading a shelf vial into the calculator (`?vial=<id>`) locks amount and water; editing them
  happens on the vial page so history stays consistent.

- The app bar scrolls away while reading (`useHideOnScroll`) and returns on a scroll up, a tap
  on a non-interactive part of the page, a route change, or focus. Re-tapping the current tab
  scrolls to the top. The bar keeps its layout slot, so content never jumps.
- Anything shared out of the app (the levels image, the PDF report) is made on the device and
  carries the source of every figure and the model caveat. The image lets the user leave out
  names and amounts; the report covers a chosen period.
- A unit default comes from `unitDefaultsFor`; never hard-code `kg` or `cm` as a fallback in a
  component.

## Spacing and alignment

- The container owns spacing. A card body, form or panel is a `.pc-stack` (16px between
  children), `.pc-stack--tight` (8px, a caption and what it describes) or `.pc-stack--loose`
  (24px, sections of one card). Children carry no margin utilities. Scoped CSS is unlayered and
  silently beats every utility class, so `margin: 0` in a component cancels `mt-*` on it.
- Fields default to `hideDetails: 'auto'` (`src/plugins/vuetify.ts`): the message row appears
  only for a hint or an error, so gaps come from the stack. A hint that must always show takes
  `persistent-hint`. Rows that pair fields (dose and unit) use `align-start` so an error under
  one does not shift the other.
- Labels sit above controls, left-aligned with the control's border. Vuetify fields get this
  from `theme.css`; any other control (a preset group, a toggle, a list) takes `.pc-label`,
  which has the same type. Hints and errors share that left edge.
- Action rows line up with the content above. Text-only rows keep Vuetify's padding, so the
  label sits at the content edge; a row with a filled, tonal or outlined button insets that
  button to 16px (24px in dialogs and sheets). `theme.css` does this; components do not pad
  `v-card-actions`.
- A notice with actions puts the message first and an end-aligned `.pc-actions` row below it:
  Dismiss (text), then the action (tonal). Buttons keep the default size for touch targets.
- Everyday actions sit with the content they act on; archive and delete close the page,
  separated by a divider.
