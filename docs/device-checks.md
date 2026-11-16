# Device checks

The e2e suite covers only the web build. Run these checks on a phone before a release that touches a native path.

## Health apps

1. Fresh install. Settings, Health apps, Turn on. Grant every permission. Expect the Synced notice with counts, and "Last synced" with the time.
2. Log a weight. Within a few seconds it appears in Health Connect (or Apple Health).
3. Add a weight in the health app. Return to the app. It appears in the journal with the "From Health Connect" note.
4. Force stop the app and reopen it. Health apps still says On. Sync now reports 0 in, 0 out. The health app holds one copy of each reading.
5. Set direction to Export, sync, force stop, reopen, sync. The health app still holds one copy of each reading.
6. Deny every permission. Expect `0 in, 0 out`, not an error.
7. Revoke access in Health Connect while sync is on. Expect a notice that names the cause, never a crash.

## Region and units

1. Android, region United States, new install: lb and ft in.
2. Android, region Germany, new install: kg and cm.
3. iPhone, region United States, Measurement System set to Metric, new install: kg and cm.
4. iPhone, region United Kingdom, new install: kg, ft in, mmol/L.
5. Update over an existing install in any region: units unchanged.
6. Airplane mode, new install: units still follow the region.

## Navigation

1. Every tab opens: Today, Stack, Calculator, Progress, Settings.
2. On Android, pressing the system back button from a peptide page returns to Stack, and from All entries returns to Progress.
3. The floating Log button clears the Android gesture bar cleanly at the bottom of every tab.

## Schedules

1. Install 0.4.0 with protocols, update to this build: every protocol reads as before.
2. Save a backup on 0.4.0, restore it on this build: same.
3. Change the device's time zone with a daily 08:00 schedule: it is still due at 08:00.
4. In the Android app: the same three checks.

## Reminders

1. Add reminder, Notify me: the explanation shows first, then the system prompt.
2. A schedule time two minutes ahead: the notification arrives; its text names no peptide.
3. Turn names on: the next notification names it.
4. Tap it: Today opens with the draw dialog for that peptide.
5. Two peptides at the same time: one notification, `2 doses due`.
6. Deny permission: the panel explains and offers to open settings; after allowing there and returning, the panel updates without a restart.
7. Restore a backup with reminders on: every reminder is off afterwards.
8. Airplane mode throughout: all of the above still work.
