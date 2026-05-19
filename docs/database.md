# Database

SQLite is configured on open with:

```sql
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
PRAGMA synchronous=NORMAL;
```

Migrations live in `migrations/` and run automatically at server startup. The schema includes delegations, participants, attendance records, seat layout, amendments, resolution points, voting sessions, votes, speaker state, speaker queue, reactions, debate sessions, breaks, agenda items, settings, auth tokens, event log, and state revisions.

The production database path is `/opt/mun-app/data/mun.db`. Backups should use SQLite `.backup` through `scripts/backup.sh` so WAL state is handled correctly.
