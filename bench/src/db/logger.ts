import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface TurnRecord {
  game_id: string;
  turn_number: number;
  player: string;
  prompt: string;
  raw_output: unknown;
  action: unknown;
  accepted: boolean;
  attempt: number;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface RatingRow {
  model: string;
  game_type: string;
  elo: number;
  games_played: number;
}

export interface GameLogger {
  startGame(game: { game_type: string; player: string; match_id: string | null }): Promise<string>;
  logTurn(turn: TurnRecord): Promise<void>;
  finishGame(gameId: string, result: unknown, finalState: unknown): Promise<void>;
  loadRating(model: string, gameType: string): Promise<RatingRow | null>;
  saveRating(row: RatingRow): Promise<void>;
}

async function withRetry<T>(operation: () => Promise<T>, tries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

class SupabaseLogger implements GameLogger {
  constructor(private readonly db: SupabaseClient) {}

  startGame(game: { game_type: string; player: string; match_id: string | null }) {
    return withRetry(async () => {
      const { data, error } = await this.db.from("games").insert(game).select("id").single();
      if (error) throw error;
      return data.id as string;
    });
  }

  logTurn(turn: TurnRecord) {
    return withRetry(async () => {
      const { error } = await this.db.from("turns").insert(turn);
      if (error) throw error;
    });
  }

  finishGame(gameId: string, result: unknown, finalState: unknown) {
    return withRetry(async () => {
      const { error } = await this.db
        .from("games")
        .update({ status: "finished", result, final_state: finalState })
        .eq("id", gameId);
      if (error) throw error;
    });
  }

  loadRating(model: string, gameType: string) {
    return withRetry(async () => {
      const { data, error } = await this.db
        .from("ratings")
        .select()
        .eq("model", model)
        .eq("game_type", gameType)
        .maybeSingle();
      if (error) throw error;
      return data as RatingRow | null;
    });
  }

  saveRating(row: RatingRow) {
    return withRetry(async () => {
      const { error } = await this.db.from("ratings").upsert(row);
      if (error) throw error;
    });
  }
}

class JsonlLogger implements GameLogger {
  private readonly path: string;
  private readonly ratingsPath = "runs/ratings.json";

  constructor() {
    mkdirSync("runs", { recursive: true });
    this.path = `runs/${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  }

  private write(type: string, data: object) {
    appendFileSync(this.path, `${JSON.stringify({ type, ...data })}\n`);
  }

  private ratings(): Record<string, RatingRow> {
    return existsSync(this.ratingsPath)
      ? JSON.parse(readFileSync(this.ratingsPath, "utf8"))
      : {};
  }

  async startGame(game: { game_type: string; player: string; match_id: string | null }) {
    const id = randomUUID();
    this.write("game_start", { id, ...game });
    return id;
  }

  async logTurn(turn: TurnRecord) {
    this.write("turn", turn);
  }

  async finishGame(gameId: string, result: unknown, finalState: unknown) {
    this.write("game_finish", { id: gameId, result, final_state: finalState });
  }

  async loadRating(model: string, gameType: string) {
    return this.ratings()[`${model}|${gameType}`] ?? null;
  }

  async saveRating(row: RatingRow) {
    const ratings = this.ratings();
    ratings[`${row.model}|${row.game_type}`] = row;
    writeFileSync(this.ratingsPath, JSON.stringify(ratings, null, 2));
  }
}

export function makeLogger(): GameLogger {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return new SupabaseLogger(createClient(url, key));
  console.log("Supabase is not configured; logging to ./runs/*.jsonl");
  return new JsonlLogger();
}
