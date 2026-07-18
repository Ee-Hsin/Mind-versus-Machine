import { codenamesModule } from "@ai-ramp/game-codenames";
import { imposterModule } from "@ai-ramp/game-imposter";
import { wordleModule } from "@ai-ramp/game-wordle";
import { listConfiguredModels } from "@ai-ramp/model-runtime";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    games: [wordleModule.manifest, codenamesModule.manifest, imposterModule.manifest],
    models: listConfiguredModels(),
  });
}
