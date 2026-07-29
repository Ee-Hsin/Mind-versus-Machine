import type { NewWordleTurn } from "@ai-ramp/storage";
import { repository } from "@/lib/api/repository";

/**
 * Writes turn rows to Postgres off the response path.
 *
 * Persistence exists for resume, replay, and the leaderboard — none of which a
 * player is waiting on. Callers enqueue and move on; a slow or failing database
 * degrades durability, never latency. `drain()` is the shutdown hook that makes
 * sure a graceful stop doesn't lose the tail.
 */
export class WordleTurnPersister {
  private queue: NewWordleTurn[] = [];
  private inFlight: Promise<void> = Promise.resolve();
  private scheduled = false;

  constructor(private readonly gameId: string) {}

  enqueue(turn: NewWordleTurn): void {
    this.queue.push(turn);
    if (this.scheduled) return;
    this.scheduled = true;
    // Coalesce the burst of turns that lands when several model boards advance
    // at once into a single insert.
    setTimeout(() => void this.flush(), 0);
  }

  /** Resolves once everything enqueued so far has been written (or has failed). */
  async drain(): Promise<void> {
    await this.flush();
    await this.inFlight;
  }

  private async flush(): Promise<void> {
    this.scheduled = false;
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    this.inFlight = this.inFlight
      .then(() => repository().appendWordleTurns(this.gameId, batch))
      .catch((error) => {
        // Losing a turn row costs replay fidelity and a leaderboard data point.
        // It must not take the live game down with it.
        console.error(`Could not persist ${batch.length} Wordle turn(s) for game ${this.gameId}:`, error);
      });
    await this.inFlight;
  }
}
