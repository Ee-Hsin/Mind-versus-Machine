import { createHash, randomBytes } from "node:crypto";
import type { PlayerRow } from "@ai-ramp/storage";
import { repository } from "@/lib/api/repository";

export const PLAYER_COOKIE = "arena_player";

/**
 * The cookie is the identity, so it is deliberately long-lived and re-issued on
 * every resolve — it slides forward with use rather than expiring a year after
 * a player's first visit.
 *
 * Note this is a *ceiling* on resume, not the resume policy: a game's own 24h
 * `expires_at` is what decides how long an unfinished board stays playable. The
 * two are separate knobs and conflating them is a bug.
 */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function newPlayerToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only the hash is stored, so a database leak cannot impersonate a player. */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function playerCookie(token: string): string {
  return [
    `${PLAYER_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

export function readPlayerToken(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PLAYER_COOKIE}=`))
    ?.slice(PLAYER_COOKIE.length + 1);
}

export interface ResolvedPlayer {
  player: PlayerRow;
  /** Attach with `Set-Cookie` to slide the expiry (and to issue a new identity). */
  cookie: string;
}

/** The player behind this request, or `null` if they have no usable cookie yet. */
export async function resolvePlayer(request: Request): Promise<ResolvedPlayer | null> {
  const token = readPlayerToken(request);
  if (!token) return null;
  const player = await repository().findPlayerByTokenHash(tokenHash(token));
  if (!player) return null;
  return { player, cookie: playerCookie(token) };
}

/**
 * The player behind this request, minting an identity if they don't have one.
 * Used by game creation — every other route should use `resolvePlayer`, so that
 * acting without an identity is an authorization failure rather than a silent
 * new player.
 */
export async function ensurePlayer(request: Request, displayName: string): Promise<ResolvedPlayer> {
  const existing = await resolvePlayer(request);
  if (existing) {
    await repository().touchPlayer(existing.player.id, displayName);
    return { player: { ...existing.player, displayName }, cookie: existing.cookie };
  }
  const token = newPlayerToken();
  const player = await repository().createPlayer(tokenHash(token), displayName);
  return { player, cookie: playerCookie(token) };
}

/** `Response.json` plus the sliding identity cookie. */
export function jsonWithPlayer(body: unknown, cookie: string, init?: ResponseInit): Response {
  const response = Response.json(body, init);
  response.headers.append("Set-Cookie", cookie);
  return response;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
