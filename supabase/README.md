# Supabase

Apply `migrations/*.sql` in filename order to a fresh project. `0004_rework.sql`
requires Postgres 15 or later (it sets `security_invoker` on a view); Supabase is
15+.

`0001`–`0003` build the original run/event schema and `0004` replaces it, so a
fresh project runs all four in order.

## Tables

| Table | Purpose |
| --- | --- |
| `arena_players` | Anonymous identity: token hash, display name, nullable `user_id` |
| `arena_games` | Type, status, timestamps, `expires_at` |
| `arena_game_participants` | One row per seat, with the per-participant `outcome` |
| `wordle_games` | The answer for one game — **server-only** |
| `wordle_turns` | Every attempt by every seat, in order |
| `arena_ratings` | Unused. Left in place for a possible head-to-head Elo in Codenames. |

## View

`wordle_participant_results` collapses turn rows into one row per **settled**
board and filters forfeited and abandoned participants out. The filter is on the
participant, not the game — which is what lets the model boards from a game a
human quit still count.

## Functions

| Function | Why it is a function |
| --- | --- |
| `create_wordle_game` | Touches three tables; one statement avoids the orphan rows a partially-failed sequence of client calls would leave |
| `forfeit_game` | Authorises, marks the human forfeited, and closes the game atomically. Idempotent. Deliberately does not touch model participants. |
| `expire_stale_games` | The 24h sweep: forfeits stale games and marks their humans `abandoned` |

## Access

RLS is enabled on every table with **no policies**, so the anon and authenticated
roles can read nothing. The server uses the service key, which bypasses RLS.

This is load-bearing rather than decorative: `wordle_games.answer` is the game's
secret, and the entire reason the client is never sent the answer is so a human
score means something. A readable `wordle_games` would defeat that.

Never expose the service key to the browser.
