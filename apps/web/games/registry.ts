import type { GameType } from "@ai-ramp/protocol";

export type GameViewId = GameType | "imposter";

export interface GameViewRegistration {
  id: GameViewId;
  label: string;
  summary: string;
  dialogTitle: string;
  dialogDescription: string;
  matchFormat: string;
  evaluation: string;
}

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
  {
    id: "codenames",
    label: "Codenames",
    summary: "Team up with a friend and take on an AI spymaster and operative.",
    dialogTitle: "Create a Codenames room",
    dialogDescription: "Bring a teammate. The two of you face an AI spymaster and AI operative.",
    matchFormat: "Two humans versus two models, with hidden colors restricted to each spymaster.",
    evaluation: "Clue quality, semantic associations, risky guesses, and the final win condition.",
  },
  {
    id: "imposter",
    label: "Imposter",
    summary: "Give clues, read the table, and expose the player bluffing with only a hint.",
    dialogTitle: "Play Imposter",
    dialogDescription: "Join five models in a hidden-role word game.",
    matchFormat: "Two clue rounds, an accusation, public defenses, and a final vote.",
    evaluation: "Bluffing, social deduction, persuasion, voting judgment, and recovery under suspicion.",
  },
];
