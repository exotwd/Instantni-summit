# Operator Guide

## Before A Session

1. Change the default admin and screen PINs in `Nastavení`.
2. Verify the server with `GET /healthz`.
3. Open `/screen` on the projection machine and log in with the screen PIN.
4. Open `/admin` on the chair machine and confirm that SSE shows `připojeno`.
5. In `Rozložení a prezence`, check the table layout and chair-table orientation.
6. Generate delegate vote links when the attendance list is ready.
7. Test one delegate login and vote from `/vote`.

## Imports

Use imports before the session starts, or during a break when no voting is active.

Available imports:

- `Import XLSX` in `Rozložení a prezence`: participant data.
- `Import preferencí XLSX` in `Rozložení a prezence`: preference assignment.
- `Import rozložení` in `Rozložení a prezence`: table layout.
- `Import agendy` in `Agenda`: agenda items.

Detailed file formats are documented in [Import Formats](./import-formats.md).

Operational notes:

- Layout import updates only table geometry. It does not create countries.
- Agenda import replaces the whole current agenda.
- Attendance import updates participant data on existing delegations.
- Preference import assigns at most one participant per delegation.

## During Voting

1. PN must be incorporated into the document first.
2. PN must then be marked as introduced.
3. Start voting from the PN. This first runs the reading/supporter/opponent flow when configured.
4. Keep voting open while delegates cast votes.
5. The chair can still adjust votes by clicking tables after voting is closed.
6. Reopen voting only if the chair allows corrections; reopening resets the timer.
7. Save the result only after voting is closed.

## Screen Operation

- `/screen` can stay logged in while `/admin` and `/vote` are also open.
- Breaks and caucuses take over the projection screen with a countdown.
- Voting hides the debate overlay and uses the same layout geometry as admin.
- Secret voting shows only counts on the projection, not individual tables.

## Incident Handling

- Use `Reset live` to clear active voting, speakers, debate, break overlays, and temporary state.
- Use `Reset all` only after confirming the action; a database backup is created first.
- Use data management in `Nastavení` to delete specific data groups without wiping everything.
- Use `journalctl -u mun-app -f` for server logs.
- If the UI shows `Page not found` for an API action, redeploy and restart the current backend binary; the frontend is newer than the running server.
