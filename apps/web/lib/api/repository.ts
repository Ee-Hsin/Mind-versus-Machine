import { createSupabaseRepository } from "@ai-ramp/storage";
import { createHash, randomBytes } from "node:crypto";

export function repository() {
  return createSupabaseRepository();
}

export const PARTICIPANT_COOKIE = "arena_participant";
export function newParticipantToken() { return randomBytes(32).toString("base64url"); }
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function participantToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${PARTICIPANT_COOKIE}=`))?.split("=").slice(1).join("=");
}
export function participantCookie(token: string) {
  return `${PARTICIPANT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

export function apiError(error: unknown): Response {
  console.error(error);
  return Response.json({ error: "internal_error" }, { status: 500 });
}
