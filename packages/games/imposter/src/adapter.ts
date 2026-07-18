import type { GameAdapter } from "@ai-ramp/engine";
import {
  imposterActionSchema,
  IMPOSTER_SEATS,
  type ImposterAction,
  type ImposterPublicState,
  type ImposterSeat,
} from "@ai-ramp/protocol";
import { ImposterModel } from "./model";
import { imposterSystemPrompt } from "./prompts";

export class ImposterAdapter implements GameAdapter<"imposter"> {
  readonly gameType = "imposter" as const;
  readonly actionSchema = imposterActionSchema;

  constructor(private readonly model: ImposterModel) {}

  playersToAct(): string[] {
    return this.model.playersToAct();
  }

  systemPromptFor(playerId: string): string {
    return imposterSystemPrompt(this.model.roleOf(parseSeat(playerId)));
  }

  viewFor(playerId: string): string {
    return this.model.formattedState(parseSeat(playerId));
  }

  applyAction(playerId: string, action: ImposterAction) {
    const seat = parseSeat(playerId);
    if (!this.model.playersToAct().includes(seat)) {
      return { accepted: false, message: `It is not ${seat}'s turn to act.` };
    }
    const accepted = this.model.apply(seat, action);
    return accepted ? { accepted } : { accepted, message: "Action was rejected by the Imposter model." };
  }

  isOver(): boolean {
    return this.model.isGameOver;
  }

  result() {
    const winner = this.model.winner;
    const imposter = this.model.imposterSeat;
    const scores: Record<string, number> = {};
    for (const seat of IMPOSTER_SEATS) {
      const isImposter = seat === imposter;
      const won = winner === "imposter" ? isImposter : winner === "crew" ? !isImposter : false;
      scores[seat] = won ? 1 : 0;
    }
    return {
      scores,
      summary: winner
        ? `${winner === "imposter" ? "Imposter" : "Crew"} wins (${this.model.endReason}).`
        : "Game is still in progress.",
    };
  }

  publicStateFor(viewerId: string | "spectator" = "spectator"): ImposterPublicState {
    return this.model.publicState(viewerId === "spectator" ? "spectator" : parseSeat(viewerId));
  }

  serialize() {
    return this.model.serialize();
  }
}

function parseSeat(value: string): ImposterSeat {
  if ((IMPOSTER_SEATS as readonly string[]).includes(value)) return value as ImposterSeat;
  throw new Error(`Unknown Imposter seat: ${value}`);
}
