import type {
  CodenamesAction,
  CodenamesCardColor,
  CodenamesPublicState,
  CodenamesRole,
  CodenamesSeat,
  CodenamesTeam,
} from "@ai-ramp/protocol";
import { Codenames } from "./codenames";

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
        // Spymasters always know colours; operatives only see a colour once the
        // card is revealed (the pure model already masks unrevealed colours to null).
        color: "color" in card ? card.color : null,
      })),
      currentTeam: state.currentTeam,
      phase: state.phase,
      activeSeat: `${state.currentTeam}-${activeRole}` as CodenamesSeat,
      remaining: state.remaining,
      // currentClue / guesses / log only ever expose already-revealed cards, so
      // they are safe to project to any audience.
      currentClue: state.currentClue,
      guessesRemaining: state.guessesRemaining,
      log: state.log.map((turn) => ({
        team: turn.team,
        clue: { word: turn.clue.word, number: turn.clue.number },
        guesses: turn.guesses.map((guess) => ({
          word: guess.word,
          color: guess.color,
          outcome: guess.outcome,
        })),
        endedBy: turn.endedBy,
      })),
      isGameOver: state.isGameOver,
      winner: state.winner,
      endReason: state.endReason,
      keyVisible: visibleRole === "spymaster",
    };
  }

  /** The full colour key, aligned to the board words. SERVER-SIDE ONLY — deliver
   *  it only to a spymaster seat. */
  fullBoard(): { words: string[]; colors: CodenamesCardColor[] } {
    const { words, key } = this.game.getState();
    return { words, colors: key };
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
