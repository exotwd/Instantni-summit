# API

All errors return:

```json
{"error":{"code":"string","message":"Czech message"}}
```

Auth:

- `POST /api/auth/admin/login`
- `POST /api/auth/screen/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Realtime:

- `GET /api/events?role=admin|screen|delegate`

State:

- `GET /api/admin/state`
- `GET /api/screen/state`
- `POST /api/vote/login`
- `GET /api/vote/state`
- `POST /api/vote/cast`
- `POST /api/vote/amendments`

Admin operations cover voting, speakers, attendance, amendments, resolution, breaks, agenda, settings, delegation editing, and seat layout. See `internal/app/routes.go` for the exact route list.

SSE event payloads contain `type`, `revision`, and `payload`. Clients must keep per-state revision counters and ignore older or equal revisions.

## Import Endpoints

All import endpoints require admin authentication and use `multipart/form-data` with a `file` field.

| Endpoint | Formats | Effect |
| --- | --- | --- |
| `POST /api/attendance/import` | XLSX | Updates participant fields for existing delegations. |
| `POST /api/attendance/import-preferences` | XLSX | Assigns applicants to delegations by preferences. |
| `POST /api/layout/import` | XLSX, CSV, TSV | Updates existing seat positions and sizes. |
| `POST /api/agenda/import` | XLSX, CSV, TSV | Replaces the current agenda with imported rows. |

Successful imports return:

```json
{"imported":10,"skipped":0}
```

See [Import Formats](./import-formats.md) for exact column names and examples.
