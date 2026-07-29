# API and data

## HTTP boundary

Every request body is validated with a `@ai-ramp/protocol` schema.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/catalog` | Playable game manifests and enabled model metadata |
| `POST /api/games` | Create a Wordle game and start the model boards |
| `GET /api/games/active` | The caller's unfinished game, if any |
| `GET /api/games/:id` | Snapshot; rehydrates an evicted game from the database |
| `GET /api/games/:id/stream` | SSE: model board updates and lifecycle |
| `POST /api/games/:id/guesses` | Score one human guess; colours in the response |
| `POST /api/games/:id/rejections` | Telemetry for words the client rejected locally |
| `POST /api/games/:id/forfeit` | Quit; idempotent |
| `GET /api/wordle/allowed-guesses` | The word list the client validates against |

Two choices worth explaining:

**The guess result comes back on the POST, not the stream.** It is a direct
request/response, so that is both the lowest-latency path and avoids a client
having to correlate its own guess against a broadcast. The stream therefore only
carries model boards and can close once they finish.

**`expectedTurn` is checked, not trusted.** It is the board row the client
believes it is filling. A double-submitted or raced guess carries a stale value
and is refused with the real board rather than silently burning a try.

## Identity

A player is an opaque 32-byte token in an `arena_player` cookie; only its SHA-256
hash is stored. The cookie is HttpOnly, SameSite=Lax, and re-issued on every
resolve so it slides forward with use.

Cookie lifetime and game resume window are **separate knobs**. The cookie is a
year — it is the identity. A game's own `expires_at` is 24 hours and is what
decides how long an unfinished board stays playable. Conflating them is a bug.

Known limits, all inherent to cookie identity: a different browser or device is a
different player, clearing cookies orphans an in-progress game (which is exactly
why the sweep exists), and a shared browser is one player. `arena_players.user_id`
is the seam for real accounts — signing up attaches the existing anonymous row so
history and stats carry over.

## Tables

| Table | Owns |
| --- | --- |
| `arena_players` | Token hash, display name, and the future `user_id` link |
| `arena_games` | Type, status, timestamps, and `expires_at` |
| `arena_game_participants` | One row per seat: actor kind, model or player, and `outcome` |
| `wordle_games` | The answer. Server-only. |
| `wordle_turns` | Every attempt by every seat, in order |
| `wordle_participant_results` | View: one pre-aggregated row per settled board |

### Why `outcome` is per participant

A human who quits is `forfeited` while the models in the same game keep their
`won`/`lost` results — and those results still count. That is only expressible
per participant, so the leaderboard reads `outcome` and **never** game `status`.
A null outcome means the board never settled (still running, or killed by a
restart) and is simply not counted.

### Why `turn_number` is an attempt index

It counts attempts, not board rows, so a rejected guess gets its own row and the
board is `where accepted`. That is what makes the invalid-word rate comparable
between humans and models — and it is why locally-rejected human words are posted
back as telemetry, since otherwise humans would score a perfect validity rate for
free while models are penalised on theirs.

### One table, three jobs

`wordle_turns` backs all of:

- **Resume** — the human's accepted rows plus `wordle_games.answer` rebuild the
  board exactly.
- **Replay** — all seats ordered by `created_at` gives the interleaved timeline.
- **Leaderboard** — wins, guesses, invalid rate, latency, and tokens are
  aggregates over these rows.

## Access

Every table has RLS enabled with no policies. All queries run server-side with
the service key, which bypasses RLS; no client talks to Postgres directly. This
matters most for `wordle_games.answer` — without it, anyone holding the
publishable key could read the word.
