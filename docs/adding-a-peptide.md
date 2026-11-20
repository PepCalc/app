# Adding a peptide

PepCalc's peptides live in `src/data/peptides.json`, validated by
`src/data/peptides.schema.json`. Adding one is a data change; no code is needed.

## 1. Gather sources

| Field                     | Preferred source                              | Acceptable fallback                   |
| ------------------------- | --------------------------------------------- | ------------------------------------- |
| Half-life, time to peak   | Prescribing label section 12.3; phase 1 trial | Systematic review of trials           |
| Doses                     | Label dosing section; trial dose arms         | Community amounts, tagged `community` |
| Vial sizes, water volumes | Vendor listings, tagged `community`           |                                       |

If there is no human pharmacokinetic data, do not use animal or vendor figures for `pk`.

Injection-site reports (stinging, redness, welts) come from the label's warnings section where
one exists, otherwise from community reports tagged `community`.

## 2. Add the entry

```json
{
  "id": "example-peptide",
  "name": "Example Peptide",
  "aliases": ["EP"],
  "kind": "single",
  "summary": "One sentence on what it is and its approval status.",
  "vialUnit": "mg",
  "defaultDoseUnit": "mcg",
  "vialSizes": {
    "values": [5, 10],
    "unit": "mg",
    "source": { "kind": "community", "citation": "Common research-vendor vial sizes" }
  },
  "diluentMl": {
    "values": [1, 2, 3],
    "source": { "kind": "community", "citation": "Common reconstitution volumes" }
  },
  "doses": null,
  "pk": null,
  "pkUnavailableReason": "No published human pharmacokinetic data."
}
```

With human data, replace `pk` with:

```json
{
  "halfLifeHours": 120,
  "tmaxHours": 24,
  "notes": "What the source says, including ranges, and which value the model uses.",
  "sources": [
    {
      "kind": "label",
      "citation": "Product US prescribing information, 12.3",
      "url": "https://..."
    }
  ]
}
```

If users report that injections sting, add an `injectionSite` block before `pk`. The mixing
advisor uses `maxMgPerMl` to prefer more water; leave it out when the source gives no strength.

```json
"injectionSite": {
  "note": "What users or the label report, and what helps.",
  "maxMgPerMl": 10,
  "sources": [
    { "kind": "community", "citation": "Where the reports come from", "url": "https://..." }
  ]
}
```

Every mixed vial is aged against the catalog's `storage.inUse` limit (28 days, the
multiple-dose limit for bacteriostatic water). Add an `inUse` block only when the peptide's own
label sets a shorter limit after mixing; it needs a `label`, `trial` or `standard` source, and
its `note` replaces the general storage advice on the vial page, so say how to store it.

```json
"inUse": {
  "days": 7,
  "note": "What the label says about storing the mixed vial and when to discard it.",
  "sources": [{ "kind": "label", "citation": "Product US prescribing information, 2.2", "url": "https://..." }]
}
```

Blend components name the catalog peptide they contain, so its notes apply to the blend:
`{ "name": "GHK-Cu", "amountMg": 50, "peptideId": "ghk-cu" }`.

Optional catalog flags:

- `"popular": true` shows the peptide directly in the calculator's top-level dropdown (sorted
  alphabetically above `More / Custom`). Other peptides appear in the `More & Custom` dialog.
- `"solutionColor": "blue"` tints the syringe graphic blue for copper-peptide solutions (GHK-Cu,
  AHK-Cu). Blends inherit it through each component's `peptideId`. Omit for clear liquids.

## 3. Check

```bash
npx vitest run tests/data   # schema and consistency
make check                  # full fast gate
```

Then open the calculator, choose the peptide, and confirm the presets, source badges, and
level chart look right.

## Adding a syringe

Add an entry to `src/data/syringes.json`: `unitsPerMl` (100, 40, or `null` for mL syringes),
`capacityMl`, `tickMl` (volume between marks), and `labelEveryTicks`. Capacity must be a whole
number of ticks; the catalog test checks it.
