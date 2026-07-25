# Ship as a static, client-only Angular site with no backend

Streams needs to sync bank data (via SimpleFIN Bridge) and persist a personal financial model (Accounts, Flows, Transfers, rules), but we wanted to avoid owning any backend infrastructure for a personal-use app. We confirmed by direct request that SimpleFIN Bridge returns proper CORS headers (`access-control-allow-origin`, `access-control-allow-credentials`, `authorization` in allowed headers), so the browser can call it directly with no proxy server. We chose to build a plain static website (Angular, `ng build` output, no PWA install/service worker) hosted on GitHub Pages, with all state — including the SimpleFIN access credentials themselves — persisted client-side in IndexedDB. Angular was chosen over other framework options because the developer already has deep fluency with it and Angular Signals give the fine-grained reactivity the timeline-scrubbing UI needs; the project's stated goal is personal utility, not learning a new stack.

## Consequences

- All data lives in one browser on one device. There is no cross-device sync — using Streams from a second device means starting fresh and re-linking accounts there.
- Because there's no backup beyond the device itself, manual export/import (a user-controlled backup file) is a v1 requirement, not a nice-to-have.
- Alerts (Variance Alerts, Running-Dry Alerts) are in-app only — no push notifications, since that would require either a backend or an installed PWA, both of which were explicitly ruled out.
