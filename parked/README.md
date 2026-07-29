# Parked components

Codenames and Imposter UI, kept verbatim from the pre-rework tree.

These are **not compiled**. They live outside `apps/web` because `apps/web/tsconfig.json`
typechecks `**/*.tsx`, and this code still targets the old polling API and the old
protocol types (`ArenaEvent`, `RunSummary`, `PendingTurn`), which no longer exist.

The rendering is good and worth keeping — the rework replaced the transport, not the
views. When Codenames and Imposter are ported onto the live-play stack:

1. Move the directory back under `apps/web/components/`.
2. Replace the polling `useEffect` (the `setTimeout(poll, 900)` / `setTimeout(poll, 700)`
   loop near the top of each arena) with the SSE hook, as was done for
   `components/wordle/wordle-arena.tsx`.
3. Re-register the game in `apps/web/games/registry.ts` and add its branch to
   `apps/web/components/game-dialog.tsx`.

The rules packages (`packages/games/codenames`, `packages/games/imposter`) were left
untouched and still compile.
