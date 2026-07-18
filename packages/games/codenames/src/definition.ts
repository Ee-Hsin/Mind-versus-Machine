import { NotImplementedError, type GameDefinition } from "@ai-ramp/engine";

export const codenamesDefinition: GameDefinition<"codenames"> = {
  gameType: "codenames",
  async runMatch() {
    // Play uses human red seats; benchmarks use two color-swapped legs.
    throw new NotImplementedError("Codenames match orchestration");
  },
};
