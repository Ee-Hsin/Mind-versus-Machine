import type { GameType } from "@ai-ramp/protocol";

export interface GameViewRegistration {
  id: GameType;
  label: string;
  summary: string;
  status: "model pending" | "orchestration pending";
}

export const gameViews: GameViewRegistration[] = [
  {
    id: "wordle",
    label: "Wordle",
    summary: "Shared-answer human versus model races.",
    status: "model pending",
  },
  {
    id: "codenames",
    label: "Codenames",
    summary: "Two humans versus an AI spymaster and operative.",
    status: "model pending",
  },
];
