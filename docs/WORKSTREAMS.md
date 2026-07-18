# Team workstreams

The package boundaries are designed so these tracks can progress in parallel.
Coordinate protocol changes early because protocol is the shared dependency.

## 1. Protocol and run orchestration

**Owns:** `packages/protocol`, `packages/engine`

Finalize event names/payloads, normalized run config, the shared turn executor,
and game registry typing. Work with game owners instead of adding game-specific
branches to the engine.

**Handoff:** stable interfaces that worker, CLI, games, and web can import.

## 2. Wordle

**Owns:** `packages/games/wordle`

Port the pure game model and word lists, then complete the adapter and match
definition. Confirm the prompt and secrecy/reveal behavior with the web owner.

**Handoff:** a runnable `wordleModule` with no infrastructure dependencies.

## 3. Codenames

**Owns:** `packages/games/codenames`

Port the role-safe state machine, then complete human-team play and paired
benchmark fixtures. Hidden-color projections are part of this workstream.

**Handoff:** a runnable `codenamesModule` with audited role projections.

## 4. Model runtime and CLI

**Owns:** `packages/model-runtime`, `apps/cli`

Build the Vercel AI SDK player, provider catalog, usage accounting, and direct
benchmark command. Start with scripted/random players so work does not require
provider keys.

**Depends on:** engine interfaces and at least one runnable game module.

## 5. Supabase and worker

**Owns:** `packages/storage`, `apps/worker`, `supabase`

Create the first migration, atomic claim/action RPCs, repository implementation,
database interactive controller, queue loop, heartbeat, and cancellation path.

**Depends on:** normalized run/event contracts. It can use a fake game module
until Wordle or Codenames is runnable.

## 6. Web play and replays

**Owns:** `apps/web`

Implement the catalog launcher, participant cookies, room lobby, cursor polling,
and game renderer/replay registry. Keep endpoint handlers thin and call storage
or application services rather than importing game models.

**Depends on:** protocol DTOs first; storage services can initially be mocked.

## Coordination rules

- One owner approves changes to each package's public exports.
- Prompt or scoring changes include a version bump and documentation note.
- Secret-state changes require review from the relevant game owner.
- Avoid broad root refactors while another workstream is establishing a package.
- Put unresolved product decisions in the owning package README, not generic code.
