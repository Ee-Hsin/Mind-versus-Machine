import { codenamesModule } from "@ai-ramp/game-codenames";
import { wordleModule } from "@ai-ramp/game-wordle";
import { listConfiguredModels } from "@ai-ramp/model-runtime";

const games = [wordleModule.manifest, codenamesModule.manifest];
const models = listConfiguredModels();

console.log("AI Ramp worker wireframe");
console.log(`Games: ${games.map((game) => game.id).join(", ")}`);
console.log(`Configured models: ${models.map((model) => model.id).join(", ") || "none"}`);
console.log("Queue claiming and run execution are not implemented yet.");
