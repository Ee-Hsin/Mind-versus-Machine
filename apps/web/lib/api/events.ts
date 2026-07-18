import type { ArenaEvent, EventVisibility, RunStatus } from "@ai-ramp/protocol";

const terminalStatuses: RunStatus[] = ["completed", "failed", "cancelled"];

export function eventVisibility(events: ArenaEvent[], status: RunStatus): EventVisibility {
  if (terminalStatuses.includes(status)) return "terminal";
  return hasFinishedHumanWordle(events) ? "revealed" : "live";
}

export function visibleEvents(events: ArenaEvent[], status: RunStatus): ArenaEvent[] {
  const revealPostgame = status === "completed" || hasFinishedHumanWordle(events);
  return events.filter((event) =>
    event.audience.kind === "public" || (revealPostgame && event.audience.kind === "postgame"));
}

function hasFinishedHumanWordle(events: ArenaEvent[]): boolean {
  return events.some((event) => {
    if (event.gameType !== "wordle" || event.type !== "turn" || event.gameId !== "human-wordle") return false;
    const payload = event.payload as { state?: { isGameOver?: unknown } } | null;
    return payload?.state?.isGameOver === true;
  });
}
