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
