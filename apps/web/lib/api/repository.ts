import { createSupabaseRepository, type ArenaRepository } from "@ai-ramp/storage";

/**
 * One Supabase client per process. Pinned on `globalThis` because Next's dev
 * server re-evaluates modules on hot reload, which would otherwise leak a new
 * client (and its connection pool) on every edit.
 */
const globalForRepository = globalThis as typeof globalThis & {
  __arenaRepository?: ArenaRepository;
};

export function repository(): ArenaRepository {
  globalForRepository.__arenaRepository ??= createSupabaseRepository();
  return globalForRepository.__arenaRepository;
}

export function apiError(error: unknown): Response {
  console.error(error);
  return Response.json({ error: "internal_error" }, { status: 500 });
}

export function badRequest(error: string, details?: unknown): Response {
  return Response.json({ error, ...(details === undefined ? {} : { details }) }, { status: 400 });
}

export function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}
