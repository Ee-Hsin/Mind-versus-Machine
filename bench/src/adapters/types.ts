import type { z } from "zod";

export type PlayerId = string;

export interface ActionResult {
  accepted: boolean;
  message?: string;
}

export interface GameResult {
  scores: Record<PlayerId, number>;
  summary: string;
}

/** The only game-specific interface the runner and persistence layers use. */
export interface GameAdapter<Action = unknown> {
  readonly gameType: string;
  readonly actionSchema: z.ZodType<Action>;
  playersToAct(): PlayerId[];
  viewFor(player: PlayerId): string;
  systemPromptFor(player: PlayerId): string;
  applyAction(player: PlayerId, action: Action): ActionResult;
  isOver(): boolean;
  result(): GameResult;
  serialize(): unknown;
}
