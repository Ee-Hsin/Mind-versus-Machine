import {
  IMPOSTER_SEATS,
  type ImposterAction,
  type ImposterAlignment,
  type ImposterEndReason,
  type ImposterPublicState,
  type ImposterSeat,
} from "@ai-ramp/protocol";
import { Imposter, type Move, type Seat } from "../../../../game_models/imposter/imposter";

export interface ImposterModelState {
  imposter: Seat;
  word: string;
  hint: string;
  speakingOrder: Seat[];
  moves: Move[];
}

/** Package-local façade over the pure Imposter state machine (game_models/imposter). */
export class ImposterModel {
  static readonly PLAYER_COUNT = 6;
  private readonly game: Imposter;

  constructor(state?: ImposterModelState) {
    this.game = state ? Imposter.fromState(state) : new Imposter();
  }

  apply(seat: ImposterSeat, action: ImposterAction): boolean {
    switch (action.type) {
      case "clue":
        return this.game.clue(seat, action.word);
      case "vote":
        return this.game.vote(seat, action.target);
      case "defend":
        return this.game.defend(seat, action.message, action.pointAt);
      case "guess":
        return this.game.guessWord(action.word);
    }
  }

  playersToAct(): ImposterSeat[] {
    return this.game.playersToAct();
  }

  roleOf(seat: ImposterSeat): ImposterAlignment {
    return this.game.getPlayerState(seat).role;
  }

  formattedState(seat: ImposterSeat): string {
    return this.game.formattedState(seat);
  }

  publicState(viewer: ImposterSeat | "spectator"): ImposterPublicState {
    if (viewer === "spectator") {
      const s = this.game.getState();
      return {
        phase: s.phase,
        seats: [...IMPOSTER_SEATS],
        speakingOrder: s.speakingOrder,
        currentSpeaker: this.game.currentSpeaker,
        clues: s.clues,
        accused: s.accused,
        pointedAt: s.pointedAt,
        eliminated: s.eliminated,
        isGameOver: s.isGameOver,
        winner: s.winner,
        endReason: s.endReason,
        viewer: null,
        viewerRole: s.isGameOver ? this.roleOf(s.imposter) : null,
        word: s.isGameOver ? s.word : null,
        hint: s.isGameOver ? s.hint : null,
      };
    }
    const ps = this.game.getPlayerState(viewer);
    return {
      phase: ps.phase,
      seats: [...IMPOSTER_SEATS],
      speakingOrder: ps.speakingOrder,
      currentSpeaker: ps.currentSpeaker,
      clues: ps.clues,
      accused: ps.accused,
      pointedAt: ps.pointedAt,
      eliminated: ps.eliminated,
      isGameOver: ps.isGameOver,
      winner: ps.winner,
      endReason: ps.endReason,
      viewer,
      viewerRole: ps.role,
      word: ps.secretWord,
      hint: ps.hint,
    };
  }

  get isGameOver(): boolean {
    return this.game.isGameOver;
  }

  get winner(): ImposterAlignment | null {
    return this.game.winner;
  }

  get endReason(): ImposterEndReason | null {
    return this.game.endReason;
  }

  get imposterSeat(): ImposterSeat {
    return this.game.getState().imposter;
  }

  serialize(): ImposterModelState {
    const { imposter, word, hint, speakingOrder, moves } = this.game.getState();
    return { imposter, word, hint, speakingOrder, moves };
  }
}
