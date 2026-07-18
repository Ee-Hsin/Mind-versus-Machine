import { codenamesModule } from "@ai-ramp/game-codenames";
import { wordleModule } from "@ai-ramp/game-wordle";
import type { GameType } from "@ai-ramp/protocol";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const modules = { wordle: wordleModule, codenames: codenamesModule };
const requestedGame = argument("game", "wordle");
if (!(requestedGame in modules)) {
  throw new Error(`Unknown game "${requestedGame}". Expected wordle or codenames.`);
}

const game = requestedGame as GameType;
const models = argument("models", "random-a,random-b").split(",").filter(Boolean);
const matches = Number(argument("n", "3"));
const concurrency = Number(argument("concurrency", "2"));

console.log("AI Ramp benchmark CLI wireframe");
console.log(JSON.stringify({ game, models, matches, concurrency, promptVersion: modules[game].manifest.promptVersion }, null, 2));
console.log("Direct benchmark execution is not implemented yet.");
