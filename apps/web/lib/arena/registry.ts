import { repository } from "@/lib/api/repository";
import { LiveWordleGame } from "@/lib/arena/live-wordle";

/**
 * Most a single process will hold at once. Games are cheap — a board is a few KB
 * and the work is almost entirely waiting on a person or a provider — so this is
 * a backstop against runaway provider spend, not a memory limit.
 */
const MAX_CONCURRENT_GAMES = Math.max(1, Number(process.env.ARENA_MAX_CONCURRENT_GAMES ?? "200"));

/**
 * How long a game with no activity stays resident once its models have settled.
 * Eviction is safe at any point: an unfinished human board rebuilds from the
 * database on the player's next request.
 */
const IDLE_EVICTION_MS = Number(process.env.ARENA_IDLE_EVICTION_MS ?? String(5 * 60_000));
const IDLE_SCAN_MS = 60_000;
const EXPIRY_SWEEP_MS = Number(process.env.ARENA_SWEEP_MS ?? String(10 * 60_000));
const SHUTDOWN_GRACE_MS = 15_000;

export class AtCapacityError extends Error {
  constructor() {
    super("The arena is at capacity. Try again in a moment.");
    this.name = "AtCapacityError";
  }
}

interface RegistryState {
  games: Map<string, LiveWordleGame>;
  /** In-flight rehydrations, so two concurrent requests share one rebuild. */
  rehydrating: Map<string, Promise<LiveWordleGame | null>>;
  draining: boolean;
  started: boolean;
}

// Pinned on globalThis: Next re-evaluates modules on hot reload, which would
// otherwise orphan every live game and duplicate the background timers.
const globalForRegistry = globalThis as typeof globalThis & {
  __arenaRegistry?: RegistryState;
};

function state(): RegistryState {
  globalForRegistry.__arenaRegistry ??= {
    games: new Map(),
    rehydrating: new Map(),
    draining: false,
    started: false,
  };
  const current = globalForRegistry.__arenaRegistry;
  if (!current.started) {
    current.started = true;
    startBackgroundWork(current);
  }
  return current;
}

/** Reserve a slot for a new game. Throws rather than silently overloading. */
export function admit(): void {
  const current = state();
  if (current.draining) throw new AtCapacityError();
  if (current.games.size >= MAX_CONCURRENT_GAMES) throw new AtCapacityError();
}

export function register(game: LiveWordleGame): void {
  state().games.set(game.gameId, game);
}

export function peek(gameId: string): LiveWordleGame | undefined {
  return state().games.get(gameId);
}

/**
 * The live game, rebuilding it from the database if this process no longer holds
 * it. Concurrent callers share a single rebuild.
 */
export async function getOrRehydrate(gameId: string): Promise<LiveWordleGame | null> {
  const current = state();
  const resident = current.games.get(gameId);
  if (resident) return resident;

  const pending = current.rehydrating.get(gameId);
  if (pending) return pending;

  const rebuild = LiveWordleGame.rehydrate(gameId)
    .then((game) => {
      if (game) current.games.set(gameId, game);
      return game;
    })
    .finally(() => current.rehydrating.delete(gameId));

  current.rehydrating.set(gameId, rebuild);
  return rebuild;
}

export async function evict(gameId: string): Promise<void> {
  const current = state();
  const game = current.games.get(gameId);
  if (!game) return;
  current.games.delete(gameId);
  await game.close();
}

function startBackgroundWork(current: RegistryState): void {
  // Both callbacks are fully guarded: an uncaught throw inside a timer takes the
  // whole process down, and neither of these is worth losing live games over.
  const idle = setInterval(() => {
    try {
      const cutoff = Date.now() - IDLE_EVICTION_MS;
      for (const [gameId, game] of current.games) {
        // Only evict once nothing is running: a game whose models are still going
        // has work in flight that would be lost.
        if (game.modelsFinished && game.lastActivityAt < cutoff) {
          void evict(gameId).catch((error) => console.error(`Evicting ${gameId} failed:`, error));
        }
      }
    } catch (error) {
      console.error("Idle eviction scan failed:", error);
    }
  }, IDLE_SCAN_MS);

  const sweep = setInterval(() => {
    try {
      // repository() throws synchronously when Supabase is unconfigured, so it
      // has to be inside the try rather than relying on the promise catch.
      void repository()
        .expireStaleGames()
        .then((count) => {
          if (count > 0) console.log(`Auto-forfeited ${count} expired game(s).`);
        })
        .catch((error) => console.error("Expiry sweep failed:", error));
    } catch (error) {
      console.error("Expiry sweep could not run:", error);
    }
  }, EXPIRY_SWEEP_MS);

  idle.unref?.();
  sweep.unref?.();

  const shutdown = async () => {
    if (current.draining) return;
    current.draining = true;
    clearInterval(idle);
    clearInterval(sweep);
    console.log(`Draining ${current.games.size} live game(s) before exit.`);
    const games = [...current.games.values()];
    current.games.clear();
    await Promise.race([
      Promise.all(
        games.map((game) =>
          game.close().catch((error) => console.error(`Draining ${game.gameId} failed:`, error)),
        ),
      ),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
    ]);
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}
