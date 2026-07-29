import type { GameType } from "@ai-ramp/protocol";

export type GameViewId = GameType;

export interface GameViewRegistration {
  id: GameViewId;
  label: string;
  summary: string;
  dialogTitle: string;
  dialogDescription: string;
  matchFormat: string;
  evaluation: string;
}

/**
 * Games playable right now. Codenames and Imposter still have rules packages and
 * arena components on disk, but they are not wired to the live-play stack yet —
 * re-add them here once they are ported.
 */
export const gameViews: GameViewRegistration[] = [
  {
    id: "wordle",
    label: "Wordle",
    summary: "Solve the same hidden word as the models, then compare every board.",
    dialogTitle: "Play Wordle against the models",
    dialogDescription: "You and the selected models solve one hidden word on separate boards.",
    matchFormat: "Six guesses each. Model boards and commentary stay sealed until your game ends.",
    evaluation: "Solve rate, guesses used, invalid moves, and each model's route to the answer.",
  },
];
