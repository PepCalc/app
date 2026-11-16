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
