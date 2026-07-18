# API and data

## HTTP boundary

The Next.js API validates all input with `@ai-ramp/protocol`. Current handlers
return `501 Not Implemented` after successful validation so their status is
unambiguous.

| Endpoint | Intended responsibility |
| --- | --- |
| `GET /api/catalog` | Public game manifests and enabled model metadata |
| `POST /api/runs` | Create a Wordle or Codenames play run and host participant |
| `GET /api/runs` | Read-only run history |
| `POST /api/rooms/join` | Join a Codenames lobby by code |
| `GET /api/runs/:id` | Run snapshot, viewer, room, pending turn, initial events |
| `GET /api/runs/:id/events` | Audience-filtered events after a sequence cursor |
| `POST /api/runs/:id/ready` | Mark the current participant ready |
| `POST /api/runs/:id/actions` | Submit one idempotent action for a pending turn |
| `POST /api/runs/:id/cancel` | Host/operator cancellation request |

Public play requests contain model IDs and human-facing setup only. The server
resolves model display names, participant IDs, seats, and internal run config.

## Events

Events are the replay and live-update contract. Each event has a run-local
sequence, game type, optional match/game IDs, timestamp, payload, and audience:

- `public`: safe during live play.
- `seat`: visible only to one authenticated seat.
- `postgame`: hidden until that game-specific reveal condition is met.
- `operator`: never returned by the public API.

The browser will poll with `after=<sequence>`. Event pages also carry a visibility
state (`live`, `revealed`, or `terminal`). When visibility expands, the server
sets `reset: true` and returns newly visible history, including events older than
the browser's previous cursor.

## Participant identity

Create/join endpoints issue an opaque token in an HttpOnly, SameSite cookie. The
database stores only its hash. Room codes identify a lobby but do not authorize
actions. Action submission must match the participant seat, active turn ID, and
idempotency key.

## Data ownership

- Run rows own status, normalized config, worker claim, and cancellation state.
- Event rows own durable chronological history.
- Room and participant rows own multiplayer readiness and seats.
- Human-turn rows bridge an HTTP action to a worker waiting for that action.
- Game canonical state is server-only; projections belong in events or game rows.

The conceptual Supabase tables are listed in `supabase/README.md`. SQL and RPC
shapes are intentionally deferred until the storage workstream begins.
