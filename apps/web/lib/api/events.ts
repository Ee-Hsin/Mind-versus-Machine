import type { ArenaEvent, EventVisibility, RunStatus } from "@ai-ramp/protocol";

const terminalStatuses: RunStatus[] = ["completed", "failed", "cancelled"];

export function eventVisibility(events: ArenaEvent[], status: RunStatus): EventVisibility {
  if (terminalStatuses.includes(status)) return "terminal";
  return hasFinishedHumanWordle(events) ? "revealed" : "live";
}

/**
 * The events a given viewer may see. Public events are always visible. Seat
 * events are the per-seat security boundary (e.g. a Codenames spymaster's key)
 * and are returned only to the authenticated seat that owns them. Postgame
 * events unseal once the game-specific reveal condition is met.
 */
export function visibleEvents(events: ArenaEvent[], status: RunStatus, viewerSeatId?: string | null): ArenaEvent[] {
  const revealPostgame = status === "completed" || hasFinishedHumanWordle(events);
  return events.filter((event) => {
    if (event.audience.kind === "public") return true;
    if (event.audience.kind === "seat") return Boolean(viewerSeatId) && event.audience.seatId === viewerSeatId;
    if (event.audience.kind === "postgame") return revealPostgame;
    return false; // operator events never reach the public API
  });
}

function hasFinishedHumanWordle(events: ArenaEvent[]): boolean {
  return events.some((event) => {
    if (event.gameType !== "wordle" || event.type !== "turn" || event.gameId !== "human-wordle") return false;
    const payload = event.payload as { state?: { isGameOver?: unknown } } | null;
    return payload?.state?.isGameOver === true;
  });
}
