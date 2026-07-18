import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NotImplementedError, type ArenaRepository } from "@ai-ramp/engine";
import type { ArenaEvent, RunSummary } from "@ai-ramp/protocol";

export class SupabaseArenaRepository implements ArenaRepository {
  constructor(private readonly client: SupabaseClient) {}

  async appendEvent(_event: ArenaEvent): Promise<void> {
    void this.client;
    throw new NotImplementedError("Supabase event persistence");
  }

  async getRun(_runId: string): Promise<RunSummary | null> {
    throw new NotImplementedError("Supabase run lookup");
  }

  async listRuns(_limit?: number): Promise<RunSummary[]> {
    throw new NotImplementedError("Supabase run listing");
  }

  async claimNextRun(_workerId: string): Promise<RunSummary | null> {
    throw new NotImplementedError("Supabase run claiming");
  }

  async requestCancellation(_runId: string): Promise<void> {
    throw new NotImplementedError("Supabase run cancellation");
  }
}

export function createSupabaseRepository(environment = process.env): SupabaseArenaRepository {
  const url = environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return new SupabaseArenaRepository(createClient(url, key));
}
