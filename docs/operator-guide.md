# Operator Guide

Before a session:

1. Change default admin and screen PINs.
2. Verify `/healthz`.
3. Open `/screen` on the projection machine and log in.
4. In Attendance, generate delegate codes during check-in.
5. Test one delegate vote from `/vote`.

During voting:

1. Start voting from a PN in the Voting or PN tab.
2. Keep voting open while delegates cast votes.
3. Close voting before saving the result.
4. Reopen only if the chair allows corrections.
5. Save result only after voting is closed.

For incidents:

- Use Reset live to clear active voting, speakers, debate, and overlays.
- Use Reset all only after confirming `RESET ALL`; a database backup is created first.
- Use `journalctl -u mun-app -f` for server logs.
