# Architecture

MUN Chair System is organized as controller -> service -> repository -> database.

- Controllers decode HTTP requests, enforce auth middleware, and return JSON.
- Services own business rules for voting, speakers, attendance, amendments, resolution, agenda, breaks, settings, and resets.
- Repositories contain SQL and persistence-only operations.
- SQLite is the source of truth. Frontend state never writes directly to storage.
- Realtime updates use Server Sent Events from `/api/events`.

All mutable live state has revisions: voting, speaker, resolution, attendance, layout, break, debate, settings, and agenda. Services persist changes in a transaction, log the event, commit, then publish the SSE event. Clients ignore events with stale revisions.

The projection state intentionally excludes agenda and participant personal data. The delegate vote API exposes only public delegation fields, the current voting state, and the current resolution.
