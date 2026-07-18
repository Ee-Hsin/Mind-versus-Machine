import type { CodenamesSpec } from "./codenames";
import type { ImposterSpec } from "./imposter";
import type { WordleSpec } from "./wordle";

export interface GameSpecMap {
  wordle: WordleSpec;
  codenames: CodenamesSpec;
  imposter: ImposterSpec;
}

export type GameType = keyof GameSpecMap;
export type GameConfig<G extends GameType> = GameSpecMap[G]["config"];
export type GameAction<G extends GameType> = GameSpecMap[G]["action"];
export type GamePublicState<G extends GameType> = GameSpecMap[G]["publicState"];
export type GameMetrics<G extends GameType> = GameSpecMap[G]["metrics"];

export * from "./types";
export * from "./wordle";
export * from "./codenames";
export * from "./imposter";
