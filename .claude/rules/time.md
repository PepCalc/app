---
paths: ['src/**']
---

# Time

- Records store UTC ISO-8601 strings (`nowIso()`); a local or naive timestamp in storage is a bug.
- Only `src/services/time.ts` reads the clock or formats dates; ESLint rejects `new Date()`,
  `Date.now()` and `toLocale*String()` elsewhere. Pass a `Clock` into code that needs "now" so
  tests can fix it.
- Display uses the device locale and time zone through `Intl`, never a hard-coded format.
- A time of day or a calendar date that is not an instant (a schedule's 08:00, a course's start)
  is stored as numbers or `YYYY-MM-DD`, and becomes an instant only through
  `src/services/time.ts`.
- A `Date` handed over by a UI component is converted at once by `src/services/time.ts`; it is
  never stored, compared or formatted elsewhere.
