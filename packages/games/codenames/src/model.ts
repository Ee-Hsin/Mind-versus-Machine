import { NotImplementedError } from "@ai-ramp/engine";
import type {
  CodenamesAction,
  CodenamesCardColor,
  CodenamesPublicState,
  CodenamesRole,
  CodenamesSeat,
  CodenamesTeam,
} from "@ai-ramp/protocol";

export interface CodenamesState {
  words: string[];
  key: CodenamesCardColor[];
  startingTeam: CodenamesTeam;
  moves: CodenamesAction[];
}

/** Pure Codenames rules and role projections belong here. */
export class CodenamesModel {
  static readonly BOARD_SIZE = 25;

  constructor(readonly state: CodenamesState) {}

  apply(_action: CodenamesAction): boolean {
    throw new NotImplementedError("Codenames turn state machine");
  }

  formattedState(_role: CodenamesRole): string {
    throw new NotImplementedError("Codenames role-specific formatted view");
  }

  publicState(_role: CodenamesRole | "spectator"): CodenamesPublicState {
    throw new NotImplementedError("Codenames role-specific public state");
  }

  get activeSeat(): CodenamesSeat {
    throw new NotImplementedError("Codenames active-seat calculation");
  }

  get isGameOver(): boolean {
    throw new NotImplementedError("Codenames completion rules");
  }

  serialize(): CodenamesState {
    return {
      words: [...this.state.words],
      key: [...this.state.key],
      startingTeam: this.state.startingTeam,
      moves: [...this.state.moves],
    };
  }
}
