import type { ArenaEventSink } from "@ai-ramp/engine";
import { WordleModel, wordleModule } from "@ai-ramp/game-wordle";
import { AiSdkModelPlayer } from "@ai-ramp/model-runtime";
import {
  WORDLE_HUMAN_SEAT,
  WORDLE_MAX_TRIES,
  isTerminalStatus,
  type GameStatus,
  type ModelRef,
  type WordleGuessResult,
  type WordleSnapshot,
  type WordleStreamEvent,
  type WordleStreamEventBody,
  type WordleTurnEventPayload,
} from "@ai-ramp/protocol";
import type { GameRow, ParticipantRow } from "@ai-ramp/storage";
import { repository } from "@/lib/api/repository";
import { WordleTurnPersister } from "@/lib/arena/persist/wordle";
import { emptyBoard, toSeatView, type SeatBoard } from "@/lib/arena/views";

/** How many recent events a reconnecting stream can replay from memory. */
const REPLAY_BUFFER = 256;

/**
 * Upper bound on locally-rejected words we will record per game. Rejections are
 * telemetry, not gameplay, so a client that spams them should stop writing rows
 * rather than be able to inflate the table.
 */
const MAX_RECORDED_REJECTIONS = 60;

export type StreamSink = (event: WordleStreamEvent) => void;

/** Picks the word for a new game. Server-side only — it is the game's secret. */
export function pickWordleAnswer(): string {
  return new WordleModel().serialize().answer;
}

/**
 * One live Wordle game.
 *
 * The model boards run through the shared game definition; the human's board is
 * a plain `WordleModel` driven by HTTP requests, because a human guess is
 * genuinely request/response and not a turn loop. That asymmetry is what makes
 * this cheap to rehydrate — a board is a pure function of (answer, guesses).
 */
export class LiveWordleGame {
  readonly gameId: string;
  readonly expiresAt: string;
  /** Whose game this is. Lets every play route authorize without a round trip. */
  readonly humanPlayerId: string | null;
  status: GameStatus;
  lastActivityAt = Date.now();

  private readonly answer: string;
  private readonly human: WordleModel;
  private readonly humanBoard: SeatBoard;
  private readonly modelBoards = new Map<string, SeatBoard>();
  private readonly modelAttempts = new Map<string, number>();
  private readonly persister: WordleTurnPersister;
  private readonly subscribers = new Set<StreamSink>();
  private readonly recent: WordleStreamEvent[] = [];
  private readonly abort = new AbortController();
  private seq = 0;
  private humanAttempts = 0;
  private rejectionsRecorded = 0;
  private modelsSettled: boolean;
  private modelsDone: Promise<void> = Promise.resolve();

  private constructor(input: {
    game: GameRow;
    answer: string;
    participants: ParticipantRow[];
    human: WordleModel;
    humanBoard: SeatBoard;
    modelBoards: SeatBoard[];
    humanAttempts: number;
    modelAttempts: Map<string, number>;
    modelsSettled: boolean;
  }) {
    this.gameId = input.game.id;
    this.expiresAt = input.game.expiresAt;
    this.status = input.game.status;
    this.humanPlayerId = participantFor(input.participants, WORDLE_HUMAN_SEAT)?.playerId ?? null;
    this.answer = input.answer;
    this.human = input.human;
    this.humanBoard = input.humanBoard;
    this.humanAttempts = input.humanAttempts;
    this.modelAttempts = input.modelAttempts;
    this.modelsSettled = input.modelsSettled;
    this.persister = new WordleTurnPersister(this.gameId);
    for (const board of input.modelBoards) this.modelBoards.set(board.seatId, board);
  }

  // --- Construction ---------------------------------------------------------

  /** Starts the model boards for a game row that was just created. */
  static start(input: {
    game: GameRow;
    answer: string;
    participants: ParticipantRow[];
    models: ModelRef[];
  }): LiveWordleGame {
    const human = participantFor(input.participants, WORDLE_HUMAN_SEAT);
    const live = new LiveWordleGame({
      game: input.game,
      answer: input.answer,
      participants: input.participants,
      human: new WordleModel({ answer: input.answer, guesses: [] }),
      humanBoard: emptyBoard({
        seatId: WORDLE_HUMAN_SEAT,
        actorKind: "human",
        displayName: human?.displayName ?? "You",
      }),
      modelBoards: input.models.map((model) =>
        emptyBoard({
          seatId: model.id,
          actorKind: "model",
          modelId: model.id,
          displayName: model.displayName,
        }),
      ),
      humanAttempts: 0,
      modelAttempts: new Map(),
      modelsSettled: false,
    });
    live.runModels(input.models);
    return live;
  }

  /**
   * Rebuilds a game from the database. Used when a player returns to a game the
   * registry has evicted, or after a restart. Model boards are *not* restarted —
   * whatever they had finished is what counts.
   */
  static async rehydrate(gameId: string): Promise<LiveWordleGame | null> {
    const repo = repository();
    const game = await repo.getGame(gameId);
    if (!game || game.gameType !== "wordle") return null;

    const [answer, participants, turns] = await Promise.all([
      repo.getWordleAnswer(gameId),
      repo.listParticipants(gameId),
      repo.listWordleTurns(gameId),
    ]);
    if (!answer) return null;

    const humanTurns = turns.filter((turn) => turn.seatId === WORDLE_HUMAN_SEAT);
    const human = new WordleModel({
      answer,
      guesses: humanTurns.filter((turn) => turn.accepted).map((turn) => turn.guess),
    });
    const humanState = human.publicState();
    const humanParticipant = participantFor(participants, WORDLE_HUMAN_SEAT);

    const modelAttempts = new Map<string, number>();
    const modelBoards: SeatBoard[] = [];
    for (const participant of participants) {
      if (participant.actorKind !== "model") continue;
      const seatTurns = turns.filter((turn) => turn.seatId === participant.seatId);
      modelAttempts.set(participant.seatId, maxTurnNumber(seatTurns));
      const rows = seatTurns
        .filter((turn) => turn.accepted)
        .map((turn) => ({ guess: turn.guess, states: turn.states }));
      const isWon = participant.outcome === "won" || rows.at(-1)?.guess === answer;
      modelBoards.push({
        seatId: participant.seatId,
        actorKind: "model",
        modelId: participant.modelId ?? participant.seatId,
        displayName: participant.displayName,
        rows,
        isWon,
        // A settled outcome is authoritative; otherwise derive it from the board.
        isGameOver: participant.outcome !== null || isWon || rows.length >= WORDLE_MAX_TRIES,
      });
    }

    return new LiveWordleGame({
      game,
      answer,
      participants,
      human,
      humanBoard: {
        seatId: WORDLE_HUMAN_SEAT,
        actorKind: "human",
        displayName: humanParticipant?.displayName ?? "You",
        rows: humanState.board,
        isWon: humanState.isWon,
        isGameOver: humanState.isGameOver,
      },
      modelBoards,
      humanAttempts: maxTurnNumber(humanTurns),
      modelAttempts,
      // Nothing is running in this process, so the models will never advance.
      modelsSettled: true,
    });
  }

  // --- Reads ----------------------------------------------------------------

  /** True once the human's board is over and the model letters unseal. */
  get revealed(): boolean {
    return this.humanBoard.isGameOver || isTerminalStatus(this.status);
  }

  get modelsFinished(): boolean {
    return this.modelsSettled;
  }

  get humanFinished(): boolean {
    return this.humanBoard.isGameOver;
  }

  snapshot(): WordleSnapshot {
    const revealed = this.revealed;
    return {
      gameId: this.gameId,
      status: this.status,
      expiresAt: this.expiresAt,
      revealed,
      ...(revealed ? { answer: this.answer } : {}),
      you: toSeatView(this.humanBoard, revealed),
      models: [...this.modelBoards.values()].map((board) => toSeatView(board, revealed)),
    };
  }

  // --- Human play -----------------------------------------------------------

  /**
   * `expectedTurn` is the board row the client believes it is filling. It is
   * checked rather than trusted so a double-submitted or raced guess is refused
   * with the real board instead of silently burning a try.
   */
  async submitGuess(guess: string, expectedTurn: number): Promise<WordleGuessResult> {
    this.lastActivityAt = Date.now();
    if (isTerminalStatus(this.status)) return this.refuse("This game is already over.");
    if (this.humanBoard.isGameOver) return this.refuse("Your board is already complete.");
    if (expectedTurn !== this.humanBoard.rows.length + 1) {
      return this.refuse("That guess was out of step with the board.");
    }

    const normalized = guess.trim().toUpperCase();
    const accepted = this.human.guessWord(normalized);
    this.humanAttempts += 1;

    let states: WordleGuessResult["you"]["board"][number]["states"] = [];
    if (accepted) {
      const row = this.human.publicState().board.at(-1);
      if (row) {
        states = row.states;
        this.humanBoard.rows.push({ guess: row.guess, states: row.states });
      }
      const state = this.human.publicState();
      this.humanBoard.isWon = state.isWon;
      this.humanBoard.isGameOver = state.isGameOver;
    }

    this.persister.enqueue({
      seatId: WORDLE_HUMAN_SEAT,
      turnNumber: this.humanAttempts,
      guess: normalized,
      states,
      accepted,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    });

    if (this.humanBoard.isGameOver) await this.onHumanBoardFinished();

    const revealed = this.revealed;
    return {
      accepted,
      ...(accepted ? {} : { reason: "That word was not accepted." }),
      you: toSeatView(this.humanBoard, revealed),
      revealed,
      ...(revealed ? { answer: this.answer } : {}),
    };
  }

  /**
   * Records a word the client rejected locally. Without this, humans would post
   * a perfect valid-word rate purely because their bad guesses never reach the
   * server, while models are scored on theirs.
   */
  recordRejection(guess: string): void {
    if (isTerminalStatus(this.status) || this.humanBoard.isGameOver) return;
    if (this.rejectionsRecorded >= MAX_RECORDED_REJECTIONS) return;
    this.rejectionsRecorded += 1;
    this.humanAttempts += 1;
    this.persister.enqueue({
      seatId: WORDLE_HUMAN_SEAT,
      turnNumber: this.humanAttempts,
      guess: guess.trim().toUpperCase().slice(0, 24),
      states: [],
      accepted: false,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
  }

  /**
   * Marks the game forfeited in memory after the database has recorded it. The
   * model boards are deliberately left running: they are usually finished
   * already, and cancelling one mid-board throws away tokens already spent for a
   * result that can no longer be scored.
   */
  markForfeited(): void {
    this.status = "forfeited";
    this.lastActivityAt = Date.now();
    this.emit({ type: "revealed", answer: this.answer, models: this.modelViews(true) });
    this.emit({ type: "finished", status: this.status });
  }

  // --- Streaming ------------------------------------------------------------

  subscribe(sink: StreamSink, lastEventId = 0): () => void {
    for (const event of this.recent) {
      if (event.seq > lastEventId) sink(event);
    }
    this.subscribers.add(sink);
    this.lastActivityAt = Date.now();
    return () => {
      this.subscribers.delete(sink);
    };
  }

  private emit(event: WordleStreamEventBody): void {
    const full: WordleStreamEvent = { ...event, seq: ++this.seq };
    this.recent.push(full);
    if (this.recent.length > REPLAY_BUFFER) this.recent.shift();
    for (const sink of this.subscribers) {
      try {
        sink(full);
      } catch (error) {
        console.error(`Wordle stream subscriber failed on game ${this.gameId}:`, error);
      }
    }
  }

  private modelViews(revealed: boolean) {
    return [...this.modelBoards.values()].map((board) => toSeatView(board, revealed));
  }

  // --- Model boards ---------------------------------------------------------

  private runModels(models: ModelRef[]): void {
    const players = Object.fromEntries(models.map((model) => [model.id, new AiSdkModelPlayer(model.id)]));
    this.modelsDone = wordleModule.definition
      .runMatch({
        gameId: this.gameId,
        config: { answer: this.answer },
        humanSeats: [WORDLE_HUMAN_SEAT],
        events: this.sink,
        players,
        signal: this.abort.signal,
      })
      .then(async ({ metrics }) => {
        await Promise.all(
          metrics.map((metric) =>
            repository()
              .setParticipantOutcome(this.gameId, metric.actorId, metric.won ? "won" : "lost")
              .catch((error) =>
                console.error(`Could not record outcome for ${metric.actorId} in game ${this.gameId}:`, error),
              ),
          ),
        );
      })
      .catch((error) => {
        // Model boards failing does not invalidate the human's board — a Wordle
        // score is "did you solve this word in N guesses" and is independent of
        // the models. Their participant rows keep a null outcome and are simply
        // never counted.
        console.error(`Wordle model boards failed for game ${this.gameId}:`, error);
      })
      .finally(async () => {
        this.modelsSettled = true;
        await this.persister.drain();
        await this.maybeComplete();
      });
  }

  private readonly sink: ArenaEventSink = {
    publish: async (event) => {
      if (event.type !== "turn") return;
      const payload = event.payload as WordleTurnEventPayload;
      const board = this.modelBoards.get(payload.seatId);
      if (!board) return;

      if (payload.accepted) board.rows.push({ guess: payload.guess, states: payload.states });
      board.isWon = payload.isWon;
      board.isGameOver = payload.isGameOver;

      const attempt = (this.modelAttempts.get(payload.seatId) ?? 0) + 1;
      this.modelAttempts.set(payload.seatId, attempt);
      this.persister.enqueue({
        seatId: payload.seatId,
        turnNumber: attempt,
        guess: payload.guess,
        states: payload.states,
        accepted: payload.accepted,
        latencyMs: payload.latencyMs,
        inputTokens: payload.inputTokens,
        outputTokens: payload.outputTokens,
      });

      this.emit({ type: "seat", seat: toSeatView(board, this.revealed) });
    },
  };

  // --- Lifecycle ------------------------------------------------------------

  private async onHumanBoardFinished(): Promise<void> {
    await repository()
      .setParticipantOutcome(this.gameId, WORDLE_HUMAN_SEAT, this.humanBoard.isWon ? "won" : "lost")
      .catch((error) => console.error(`Could not record human outcome for game ${this.gameId}:`, error));
    // Unseal every model board for anyone watching.
    this.emit({ type: "revealed", answer: this.answer, models: this.modelViews(true) });
    await this.maybeComplete();
  }

  private async maybeComplete(): Promise<void> {
    if (this.status !== "in_progress") return;
    if (!this.humanBoard.isGameOver || !this.modelsSettled) return;
    this.status = "completed";
    await repository()
      .setGameStatus(this.gameId, "completed")
      .catch((error) => console.error(`Could not complete game ${this.gameId}:`, error));
    this.emit({ type: "finished", status: this.status });
  }

  /** Flushes pending writes. Called on eviction and on graceful shutdown. */
  async close(): Promise<void> {
    await this.modelsDone;
    await this.persister.drain();
  }

  private refuse(reason: string): WordleGuessResult {
    const revealed = this.revealed;
    return {
      accepted: false,
      reason,
      you: toSeatView(this.humanBoard, revealed),
      revealed,
      ...(revealed ? { answer: this.answer } : {}),
    };
  }
}

function participantFor(participants: ParticipantRow[], seatId: string): ParticipantRow | undefined {
  return participants.find((participant) => participant.seatId === seatId);
}

function maxTurnNumber(turns: { turnNumber: number }[]): number {
  return turns.reduce((max, turn) => Math.max(max, turn.turnNumber), 0);
}
