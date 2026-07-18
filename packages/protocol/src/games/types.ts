export interface BaseGameMetrics {
  actorId: string;
  score: number;
  invalidActions: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface GameSpec {
  config: unknown;
  action: unknown;
  publicState: unknown;
  metrics: BaseGameMetrics;
}
