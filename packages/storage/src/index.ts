import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ArenaRepository } from "@ai-ramp/engine";
import type { ArenaEvent, RunSummary } from "@ai-ramp/protocol";

export class SupabaseArenaRepository implements ArenaRepository {
  constructor(private readonly client: SupabaseClient) {}

  async appendEvent(event: ArenaEvent): Promise<void> {
    const { error } = await this.client.from("arena_events").insert({
      run_id: event.runId, sequence: event.sequence, game_type: event.gameType,
      event_type: event.type, audience: event.audience, match_id: event.matchId,
      game_id: event.gameId, payload: event.payload, created_at: event.timestamp,
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

  async requestCancellation(runId: string): Promise<void> {
    const { error } = await this.client.from("arena_runs").update({ cancellation_requested: true }).eq("id", runId);
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
