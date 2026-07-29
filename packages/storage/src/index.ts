import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ActorKind,
  GameStatus,
  GameType,
  ModelRef,
  ParticipantOutcome,
  WordleLetterState,
} from "@ai-ramp/protocol";

export interface PlayerRow {
  id: string;
  displayName: string;
  userId: string | null;
}

export interface GameRow {
  id: string;
  gameType: GameType;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string;
}

export interface ParticipantRow {
  id: string;
  gameId: string;
  seatId: string;
  actorKind: ActorKind;
  playerId: string | null;
  modelId: string | null;
  displayName: string;
  outcome: ParticipantOutcome | null;
}

export interface WordleTurnRow {
  seatId: string;
  turnNumber: number;
  guess: string;
  states: WordleLetterState[];
  accepted: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

export type NewWordleTurn = Omit<WordleTurnRow, "createdAt">;

/** One settled board, pre-aggregated by the `wordle_participant_results` view. */
export interface WordleParticipantResult {
  gameId: string;
  seatId: string;
  actorKind: ActorKind;
  modelId: string | null;
  won: boolean;
  guesses: number;
  invalidActions: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  starterWord: string | null;
}

export class ArenaRepository {
  constructor(private readonly client: SupabaseClient) {}

  // --- Players --------------------------------------------------------------

  async findPlayerByTokenHash(tokenHash: string): Promise<PlayerRow | null> {
    const { data, error } = await this.client.from("arena_players")
      .select("id, display_name, user_id").eq("token_hash", tokenHash).maybeSingle();
    if (error) throw error;
    return data ? mapPlayer(data) : null;
  }

  async createPlayer(tokenHash: string, displayName: string): Promise<PlayerRow> {
    const { data, error } = await this.client.from("arena_players")
      .insert({ token_hash: tokenHash, display_name: displayName })
      .select("id, display_name, user_id").single();
    if (error) throw error;
    return mapPlayer(data);
  }

  /** Keeps `last_seen_at` fresh, and lets a returning player rename themselves. */
  async touchPlayer(id: string, displayName?: string): Promise<void> {
    const { error } = await this.client.from("arena_players")
      .update({ last_seen_at: new Date().toISOString(), ...(displayName ? { display_name: displayName } : {}) })
      .eq("id", id);
    if (error) throw error;
  }

  // --- Games ----------------------------------------------------------------

  async createWordleGame(input: {
    playerId: string;
    displayName: string;
    answer: string;
    models: ModelRef[];
  }): Promise<GameRow> {
    const { data, error } = await this.client.rpc("create_wordle_game", {
      p_player_id: input.playerId,
      p_display_name: input.displayName,
      p_answer: input.answer,
      p_models: input.models,
    }).single();
    if (error) throw error;
    return mapGame(data as Record<string, unknown>);
  }

  async getGame(gameId: string): Promise<GameRow | null> {
    const { data, error } = await this.client.from("arena_games").select().eq("id", gameId).maybeSingle();
    if (error) throw error;
    return data ? mapGame(data) : null;
  }

  /**
   * The player's unfinished game of this type, if any. Backs the rule that you
   * must finish or quit before starting another.
   */
  async findActiveGame(playerId: string, gameType: GameType): Promise<GameRow | null> {
    const { data, error } = await this.client.from("arena_game_participants")
      .select("arena_games!inner(*)")
      .eq("player_id", playerId)
      .eq("arena_games.game_type", gameType)
      .eq("arena_games.status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const game = (data as { arena_games?: Record<string, unknown> } | null)?.arena_games;
    return game ? mapGame(game) : null;
  }

  async setGameStatus(gameId: string, status: GameStatus): Promise<void> {
    const now = new Date().toISOString();
    const terminal = status !== "in_progress";
    const { error } = await this.client.from("arena_games")
      .update({ status, updated_at: now, ...(terminal ? { completed_at: now } : {}) })
      .eq("id", gameId);
    if (error) throw error;
  }

  /** Atomic quit: marks the human forfeited and the game over, models untouched. */
  async forfeitGame(gameId: string, playerId: string): Promise<GameRow> {
    const { data, error } = await this.client.rpc("forfeit_game", {
      p_game_id: gameId,
      p_player_id: playerId,
    }).single();
    if (error) throw error;
    return mapGame(data as Record<string, unknown>);
  }

  async expireStaleGames(): Promise<number> {
    const { data, error } = await this.client.rpc("expire_stale_games");
    if (error) throw error;
    return (data as number | null) ?? 0;
  }

  // --- Participants ---------------------------------------------------------

  async listParticipants(gameId: string): Promise<ParticipantRow[]> {
    const { data, error } = await this.client.from("arena_game_participants")
      .select().eq("game_id", gameId).order("created_at");
    if (error) throw error;
    return (data ?? []).map(mapParticipant);
  }

  /**
   * Only ever fills in a null outcome. A board that already settled must not be
   * relabelled — in particular a model that finished before a human quit keeps
   * its won/lost result.
   */
  async setParticipantOutcome(gameId: string, seatId: string, outcome: ParticipantOutcome): Promise<void> {
    const { error } = await this.client.from("arena_game_participants")
      .update({ outcome })
      .eq("game_id", gameId).eq("seat_id", seatId).is("outcome", null);
    if (error) throw error;
  }

  // --- Wordle ---------------------------------------------------------------

  async getWordleAnswer(gameId: string): Promise<string | null> {
    const { data, error } = await this.client.from("wordle_games")
      .select("answer").eq("game_id", gameId).maybeSingle();
    if (error) throw error;
    return (data?.answer as string | undefined) ?? null;
  }

  async listWordleTurns(gameId: string): Promise<WordleTurnRow[]> {
    const { data, error } = await this.client.from("wordle_turns")
      .select().eq("game_id", gameId).order("seat_id").order("turn_number");
    if (error) throw error;
    return (data ?? []).map(mapWordleTurn);
  }

  async appendWordleTurns(gameId: string, turns: NewWordleTurn[]): Promise<void> {
    if (turns.length === 0) return;
    const { error } = await this.client.from("wordle_turns").insert(
      turns.map((turn) => ({
        game_id: gameId,
        seat_id: turn.seatId,
        turn_number: turn.turnNumber,
        guess: turn.guess,
        states: turn.states,
        accepted: turn.accepted,
        latency_ms: turn.latencyMs,
        input_tokens: turn.inputTokens,
        output_tokens: turn.outputTokens,
      })),
    );
    if (error) throw error;
  }

  // --- Leaderboard ----------------------------------------------------------

  async listWordleResults(limit = 5000): Promise<WordleParticipantResult[]> {
    const { data, error } = await this.client.from("wordle_participant_results")
      .select().order("completed_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      gameId: row.game_id as string,
      seatId: row.seat_id as string,
      actorKind: row.actor_kind as ActorKind,
      modelId: (row.model_id as string | null) ?? null,
      won: Boolean(row.won),
      guesses: Number(row.guesses ?? 0),
      invalidActions: Number(row.invalid_actions ?? 0),
      latencyMs: Number(row.latency_ms ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      starterWord: (row.starter_word as string | null) ?? null,
    }));
  }
}

function mapPlayer(row: Record<string, unknown>): PlayerRow {
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    userId: (row.user_id as string | null) ?? null,
  };
}

function mapGame(row: Record<string, unknown>): GameRow {
  return {
    id: row.id as string,
    gameType: row.game_type as GameType,
    status: row.status as GameStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    expiresAt: row.expires_at as string,
  };
}

function mapParticipant(row: Record<string, unknown>): ParticipantRow {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    seatId: row.seat_id as string,
    actorKind: row.actor_kind as ActorKind,
    playerId: (row.player_id as string | null) ?? null,
    modelId: (row.model_id as string | null) ?? null,
    displayName: row.display_name as string,
    outcome: (row.outcome as ParticipantOutcome | null) ?? null,
  };
}

function mapWordleTurn(row: Record<string, unknown>): WordleTurnRow {
  return {
    seatId: row.seat_id as string,
    turnNumber: row.turn_number as number,
    guess: row.guess as string,
    states: (row.states as WordleLetterState[] | null) ?? [],
    accepted: row.accepted as boolean,
    latencyMs: (row.latency_ms as number | null) ?? 0,
    inputTokens: (row.input_tokens as number | null) ?? 0,
    outputTokens: (row.output_tokens as number | null) ?? 0,
    createdAt: row.created_at as string,
  };
}

export function createSupabaseRepository(environment = process.env): ArenaRepository {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required.");
  }
  return new ArenaRepository(createClient(url, key, { auth: { persistSession: false } }));
}
