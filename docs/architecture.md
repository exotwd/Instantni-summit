# Architecture

MUN Chair System is organized as controller -> service -> repository -> database.

- Controllers decode HTTP requests, enforce auth middleware, and return JSON.
- Services own business rules for voting, speakers, attendance, amendments, resolution, agenda, breaks, settings, and resets.
- Repositories contain SQL and persistence-only operations.
- SQLite is the source of truth. Frontend state never writes directly to storage.
- Realtime updates use Server Sent Events from `/api/events`.

All mutable live state has revisions: voting, speaker, resolution, attendance, layout, break, debate, settings, and agenda. Services persist changes in a transaction, log the event, commit, then publish the SSE event. Clients ignore events with stale revisions.

The projection state intentionally excludes agenda and participant personal data. The delegate vote API exposes only public delegation fields, the current voting state, and the current resolution.

## Imports

Imports are handled server-side so the browser does not need to parse XLSX files.

- Attendance and preference XLSX imports live in `internal/controller/attendance_xlsx.go`.
- Layout and agenda imports live in `internal/controller/import_controller.go`.
- Layout import writes `seat_layout` through `DelegationService.UpdateSeats`, bumps the `layout` revision once, and publishes `layout.updated`.
- Agenda import replaces all `agenda_items` through `AgendaService.ReplaceAgendaItems`, bumps the `agenda` revision once, and publishes `agenda.updated`.

The UI uploads files as `multipart/form-data` and then reloads admin state after success. Exact file formats are documented in `docs/import-formats.md`.
