import type { GameAdapter } from "@ai-ramp/engine";
import {
  codenamesActionSchema,
  type CodenamesAction,
  type CodenamesPublicState,
  type CodenamesRole,
  type CodenamesSeat,
  type CodenamesTeam,
} from "@ai-ramp/protocol";
import { CodenamesModel } from "./model";
import { codenamesSystemPrompt } from "./prompts";

export class CodenamesAdapter implements GameAdapter<"codenames"> {
  readonly gameType = "codenames" as const;
  readonly actionSchema = codenamesActionSchema;

  constructor(private readonly model: CodenamesModel) {}

  playersToAct(): string[] {
    return this.model.isGameOver ? [] : [this.model.activeSeat];
  }

  systemPromptFor(playerId: string): string {
    const seat = parseSeat(playerId);
    return codenamesSystemPrompt(teamForSeat(seat), roleForSeat(seat));
  }

  viewFor(playerId: string): string {
    return this.model.formattedState(roleForSeat(parseSeat(playerId)));
  }

  applyAction(playerId: string, action: CodenamesAction) {
    if (parseSeat(playerId) !== this.model.activeSeat) {
      return { accepted: false, message: `It is ${this.model.activeSeat}'s turn.` };
    }
    const accepted = this.model.apply(action);
    return accepted ? { accepted } : { accepted, message: "Action was rejected by the Codenames model." };
  }

  isOver(): boolean {
    return this.model.isGameOver;
  }

  result() {
    const winner = this.model.winner;
    return {
      scores: { red: winner === "red" ? 1 : 0, blue: winner === "blue" ? 1 : 0 },
      summary: winner
        ? `${winner.toUpperCase()} wins (${this.model.endReason}).`
        : "Game is still in progress.",
    };
  }

  publicStateFor(viewerId: string | "spectator" = "spectator"): CodenamesPublicState {
    return this.model.publicState(viewerId === "spectator" ? "spectator" : roleForSeat(parseSeat(viewerId)));
  }

  serialize() {
    return this.model.serialize();
  }
}

function parseSeat(value: string): CodenamesSeat {
  if (["red-spymaster", "red-operative", "blue-spymaster", "blue-operative"].includes(value)) {
    return value as CodenamesSeat;
  }
  throw new Error(`Unknown Codenames seat: ${value}`);
}

function teamForSeat(seat: CodenamesSeat): CodenamesTeam {
  return seat.startsWith("red-") ? "red" : "blue";
}

function roleForSeat(seat: CodenamesSeat): CodenamesRole {
  return seat.endsWith("spymaster") ? "spymaster" : "operative";
}
