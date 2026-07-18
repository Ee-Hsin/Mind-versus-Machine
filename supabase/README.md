# Supabase wireframe

Supabase is the coordination and event store for deployed web play. No migration
has been created yet; the storage owner should finalize protocol fields first.

## Planned tables

| Table | Purpose |
| --- | --- |
| `arena_runs` | Config, mode, status, worker claim/heartbeat, cancellation, summary |
| `arena_events` | Ordered canonical event log with audience metadata |
| `arena_rooms` | Join code, host, required seats, and lobby state |
| `arena_participants` | Display name, seat, readiness, host flag, token hash |
| `arena_human_turns` | Pending action, submitted action, and idempotency state |
| `arena_ratings` | Optional per-game benchmark rating projection |

## Planned atomic operations

- Claim the next queued run for one worker.
- Refresh a worker heartbeat and request cancellation.
- Join an available room seat.
- Mark a participant ready and queue a complete room.
- Submit exactly one valid action for an active human turn.
- Allocate the next run-local event sequence.

Use the service role only in Next.js server routes, the worker, and configured
CLI processes. Browser clients should consume audience-filtered application API
responses rather than querying canonical events or game state directly.
