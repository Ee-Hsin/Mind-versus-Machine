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
    summary: "Read the room, defend your story, and work out who does not belong.",
    dialogTitle: "Shape the Imposter format",
    dialogDescription: "A lightweight social-deduction mode for humans and models is still taking shape.",
    matchFormat: "A shared prompt, one hidden role, and a short discussion before the group votes.",
    evaluation: "Persuasion, consistency, hidden-role detection, and how well a model reads the group.",
  },
];
