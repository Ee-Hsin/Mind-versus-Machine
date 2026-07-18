import type {
  CodenamesAction,
  CodenamesCardColor,
  CodenamesPublicState,
  CodenamesRole,
  CodenamesSeat,
  CodenamesTeam,
} from "@ai-ramp/protocol";
import { Codenames } from "../../../../game_models/codenames/codenames";

export interface CodenamesState {
  words: string[];
  key: CodenamesCardColor[];
  startingTeam: CodenamesTeam;
  moves: CodenamesAction[];
}

/** Package-local façade over the pure Codenames state machine. */
export class CodenamesModel {
  static readonly BOARD_SIZE = 25;
  private readonly game: Codenames;

  constructor(state?: CodenamesState) {
    this.game = state ? Codenames.fromState(state) : new Codenames();
  }

  apply(action: CodenamesAction): boolean {
    if (action.type === "clue") return this.game.giveClue(action.word, action.number);
    if (action.type === "guess") return this.game.guess(action.word).accepted;
    return this.game.endGuessing();
  }

  formattedState(role: CodenamesRole): string {
    return this.game.formattedState(role);
  }

  publicState(role: CodenamesRole | "spectator"): CodenamesPublicState {
    const visibleRole = role === "spymaster" ? "spymaster" : "operative";
    const state = this.game.getPlayerState(visibleRole);
    const activeRole = state.phase === "clue" ? "spymaster" : "operative";
    return {
      board: state.board.map((card) => ({
        word: card.word,
        revealed: card.revealed,
        color: "color" in card ? card.color : null,
      })),
      currentTeam: state.currentTeam,
      phase: state.phase,
      activeSeat: `${state.currentTeam}-${activeRole}` as CodenamesSeat,
      remaining: state.remaining,
      isGameOver: state.isGameOver,
      winner: state.winner,
      keyVisible: visibleRole === "spymaster",
    };
  }

  get activeSeat(): CodenamesSeat {
    const role = this.game.phase === "clue" ? "spymaster" : "operative";
    return `${this.game.currentTeam}-${role}` as CodenamesSeat;
  }

  get isGameOver(): boolean {
    return this.game.isGameOver;
  }

  get winner(): CodenamesTeam | null {
    return this.game.winner;
  }

  get endReason(): "all-cards" | "assassin" | null {
    return this.game.endReason;
  }

  serialize(): CodenamesState {
    const { words, key, startingTeam, moves } = this.game.getState();
    return { words, key, startingTeam, moves };
  }
}
