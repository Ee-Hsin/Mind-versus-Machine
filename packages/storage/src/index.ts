import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ArenaRepository } from "@ai-ramp/engine";
import type { ArenaEvent, RunConfig, RunSummary } from "@ai-ramp/protocol";

export interface ParticipantRow {
  id: string; runId: string; displayName: string; seatId: string; ready: boolean; isHost: boolean;
}

export interface HumanTurnRow {
  id: string; runId: string; gameId: string; turnNumber: number; seatId: string;
  status: "pending" | "submitted" | "consumed" | "cancelled"; action: unknown;
}
export interface RatingRow { model: string; gameType: string; elo: number; gamesPlayed: number }

export class SupabaseArenaRepository implements ArenaRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createRun(config: RunConfig, status: "queued" | "running" | "lobby" = "queued"): Promise<RunSummary> {
    const { data, error } = await this.client.from("arena_runs")
      .insert({ config, status }).select().single();
    if (error) throw error;
    return mapRun(data as Record<string, unknown>);
  }

  async setRoomCode(runId: string, roomCode: string): Promise<void> {
    const { error } = await this.client.from("arena_runs").update({ room_code: roomCode }).eq("id", runId);
    if (error) throw error;
  }

  async findRunByRoomCode(roomCode: string): Promise<RunSummary | null> {
    const { data, error } = await this.client.from("arena_runs").select()
      .eq("room_code", roomCode.toUpperCase()).eq("status", "lobby").maybeSingle();
    if (error) throw error;
    return data ? mapRun(data as Record<string, unknown>) : null;
  }

  async createParticipant(input: { runId: string; tokenHash: string; displayName: string; seatId: string; isHost: boolean }) {
    const { data, error } = await this.client.from("arena_participants").insert({
      run_id: input.runId, token_hash: input.tokenHash, display_name: input.displayName,
      seat_id: input.seatId, is_host: input.isHost,
    }).select().single();
    if (error) throw error;
    return mapParticipant(data as Record<string, unknown>);
  }

  async listParticipants(runId: string): Promise<ParticipantRow[]> {
    const { data, error } = await this.client.from("arena_participants").select().eq("run_id", runId).order("created_at");
    if (error) throw error;
    return (data ?? []).map((row) => mapParticipant(row as Record<string, unknown>));
  }

  async getParticipant(runId: string, tokenHash: string): Promise<ParticipantRow | null> {
    const { data, error } = await this.client.from("arena_participants").select()
      .eq("run_id", runId).eq("token_hash", tokenHash).maybeSingle();
    if (error) throw error;
    return data ? mapParticipant(data as Record<string, unknown>) : null;
  }

  async setParticipantReady(runId: string, tokenHash: string): Promise<void> {
    const { data, error } = await this.client.from("arena_participants").update({ ready: true })
      .eq("run_id", runId).eq("token_hash", tokenHash).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Participant not found.");
  }

  async pendingTurnFor(runId: string, tokenHash: string): Promise<HumanTurnRow | null> {
    const { data: participant, error: participantError } = await this.client.from("arena_participants")
      .select("seat_id").eq("run_id", runId).eq("token_hash", tokenHash).maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return null;
    const { data, error } = await this.client.from("arena_human_turns").select()
      .eq("run_id", runId).eq("seat_id", participant.seat_id).eq("status", "pending").maybeSingle();
    if (error) throw error;
    return data ? mapHumanTurn(data as Record<string, unknown>) : null;
  }

  async createHumanTurn(input: { runId: string; gameId: string; turnNumber: number; seatId: string }): Promise<HumanTurnRow> {
    const { data, error } = await this.client.from("arena_human_turns").insert({
      run_id: input.runId, game_id: input.gameId, turn_number: input.turnNumber, seat_id: input.seatId,
    }).select().single();
    if (error) throw error;
    return mapHumanTurn(data as Record<string, unknown>);
  }

  async loadHumanTurn(turnId: string): Promise<HumanTurnRow | null> {
    const { data, error } = await this.client.from("arena_human_turns").select().eq("id", turnId).maybeSingle();
    if (error) throw error;
    return data ? mapHumanTurn(data as Record<string, unknown>) : null;
  }

  async consumeHumanTurn(turnId: string): Promise<void> {
    const { error } = await this.client.from("arena_human_turns").update({ status: "consumed" })
      .eq("id", turnId).eq("status", "submitted");
    if (error) throw error;
  }

  async submitHumanAction(input: { runId: string; turnId: string; tokenHash: string; action: unknown; idempotencyKey: string }) {
    const { data, error } = await this.client.rpc("submit_arena_human_action", {
      target_run_id: input.runId, target_turn_id: input.turnId, participant_token_hash: input.tokenHash,
      submitted_action: input.action, submitted_idempotency_key: input.idempotencyKey,
    }).single();
    if (error) throw error;
    return mapHumanTurn(data as Record<string, unknown>);
  }

  async appendEvent(event: ArenaEvent): Promise<void> {
    const { error } = await this.client.from("arena_events").insert({
      run_id: event.runId, sequence: event.sequence, game_type: event.gameType,
      event_type: event.type, audience: event.audience, match_id: event.matchId,
      game_id: event.gameId, payload: event.payload, created_at: event.timestamp,
    });
    if (error) throw error;
  }

  async listEvents(runId: string, after = 0, limit = 500): Promise<ArenaEvent[]> {
    const { data, error } = await this.client.from("arena_events").select()
      .eq("run_id", runId).gt("sequence", after).order("sequence").limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => mapEvent(row as Record<string, unknown>));
  }

  async loadRating(model: string, gameType: string): Promise<RatingRow | null> {
    const { data, error } = await this.client.from("arena_ratings").select()
      .eq("model", model).eq("game_type", gameType).maybeSingle();
    if (error) throw error;
    return data ? { model: data.model, gameType: data.game_type, elo: data.elo, gamesPlayed: data.games_played } : null;
  }

  async saveRating(row: RatingRow): Promise<void> {
    const { error } = await this.client.from("arena_ratings").upsert({
      model: row.model, game_type: row.gameType, elo: row.elo, games_played: row.gamesPlayed,
    });
    if (error) throw error;
  }

  async getRun(runId: string): Promise<RunSummary | null> {
    const { data, error } = await this.client.from("arena_runs").select().eq("id", runId).maybeSingle();
    if (error) throw error;
    return data ? mapRun(data as Record<string, unknown>) : null;
  }

  async listRuns(limit = 50): Promise<RunSummary[]> {
    const { data, error } = await this.client.from("arena_runs").select().order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapRun);
  }

  async claimNextRun(workerId: string): Promise<RunSummary | null> {
    const { data, error } = await this.client.rpc("claim_next_arena_run", { worker_id: workerId }).maybeSingle();
    if (error) throw error;
    return data ? mapRun(data as Record<string, unknown>) : null;
  }

  async queueRun(runId: string): Promise<void> {
    const { error } = await this.client.from("arena_runs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("id", runId).eq("status", "lobby");
    if (error) throw error;
  }

  async requestCancellation(runId: string): Promise<void> {
    const { error } = await this.client.from("arena_runs").update({
      cancellation_requested: true,
      updated_at: new Date().toISOString(),
    }).eq("id", runId);
    if (error) throw error;
    const { error: statusError } = await this.client.from("arena_runs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", runId).in("status", ["lobby", "queued"]);
    if (statusError) throw statusError;
  }

  async isCancellationRequested(runId: string): Promise<boolean> {
    const { data, error } = await this.client.from("arena_runs")
      .select("cancellation_requested").eq("id", runId).single();
    if (error) throw error;
    return Boolean(data.cancellation_requested);
  }

  async heartbeat(runId: string, workerId: string): Promise<void> {
    const { error } = await this.client.from("arena_runs")
      .update({ heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", runId).eq("worker_id", workerId).eq("status", "running");
    if (error) throw error;
  }

  async cancelRun(runId: string): Promise<void> {
    const { error } = await this.client.from("arena_runs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", runId);
    if (error) throw error;
  }

  async finishRun(runId: string, result: unknown): Promise<void> {
    const { error } = await this.client.from("arena_runs")
      .update({ status: "completed", result, updated_at: new Date().toISOString() }).eq("id", runId);
    if (error) throw error;
  }

  async failRun(runId: string, message: string): Promise<void> {
    const { error } = await this.client.from("arena_runs")
      .update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", runId);
    if (error) throw error;
  }
}

function mapEvent(row: Record<string, unknown>): ArenaEvent {
  return {
    sequence: row.sequence as number,
    runId: row.run_id as string,
    gameType: row.game_type as ArenaEvent["gameType"],
    type: row.event_type as string,
    timestamp: row.created_at as string,
    audience: row.audience as ArenaEvent["audience"],
    matchId: row.match_id as string | undefined,
    gameId: row.game_id as string | undefined,
    payload: row.payload,
  };
}

function mapParticipant(row: Record<string, unknown>): ParticipantRow {
  return { id: row.id as string, runId: row.run_id as string, displayName: row.display_name as string,
    seatId: row.seat_id as string, ready: row.ready as boolean, isHost: row.is_host as boolean };
}

function mapHumanTurn(row: Record<string, unknown>): HumanTurnRow {
  return { id: row.id as string, runId: row.run_id as string, gameId: row.game_id as string,
    turnNumber: row.turn_number as number, seatId: row.seat_id as string,
    status: row.status as HumanTurnRow["status"], action: row.action };
}

function mapRun(row: Record<string, unknown>): RunSummary {
  return {
    id: row.id as string,
    status: row.status as RunSummary["status"],
    config: row.config as RunSummary["config"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createSupabaseRepository(environment = process.env): SupabaseArenaRepository {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required.");
  }
  return new SupabaseArenaRepository(createClient(url, key));
}
