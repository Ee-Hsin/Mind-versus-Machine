import { randomUUID } from "node:crypto";
import { WordleModel } from "@ai-ramp/game-wordle";
import { requestWordleGuess } from "../openrouter";
import {
  type GameStatus,
  type ModelRef,
  type ModelStatus,
  type WordleGuessResult,
  type WordleSnapshot,
} from "./types";
import { toSeatView } from "./views";

const GAME_LIFETIME_MS = positiveInteger(process.env.GAME_LIFETIME_MS, 2 * 60 * 60_000);
const MAX_INVALID_MODEL_GUESSES = 3;
const MAX_MODEL_REQUEST_FAILURES = 3;

interface ModelSeat {
  ref: ModelRef;
  model: WordleModel;
  status: ModelStatus;
}

interface LiveGame {
  id: string;
  answer: string;
  displayName: string;
  expiresAt: number;
  status: GameStatus;
  human: WordleModel;
  models: ModelSeat[];
}

interface GameStore {
  games: Map<string, LiveGame>;
}

const globalForGames = globalThis as typeof globalThis & {
  __wordleGameStore?: GameStore;
};

function store(): GameStore {
  globalForGames.__wordleGameStore ??= { games: new Map() };
  return globalForGames.__wordleGameStore;
}

export function createGame(displayName: string, models: ModelRef[]): WordleSnapshot {
  removeExpiredGames();
  const answer = new WordleModel().serialize().answer;
  const now = Date.now();
  const game: LiveGame = {
    id: randomUUID(),
    answer,
    displayName,
    expiresAt: now + GAME_LIFETIME_MS,
    status: "in_progress",
    human: new WordleModel({ answer, guesses: [] }),
    models: models.map((ref) => ({
      ref,
      model: new WordleModel({ answer, guesses: [] }),
      status: "waiting",
    })),
  };
  store().games.set(game.id, game);
  for (const seat of game.models) void runModel(game, seat);
  return snapshot(game);
}

export function getGame(gameId: string): WordleSnapshot | null {
  removeExpiredGames();
  const game = store().games.get(gameId);
  return game ? snapshot(game) : null;
}

export function submitGuess(gameId: string, rawGuess: string, expectedTurn: number): WordleGuessResult | null {
  removeExpiredGames();
  const game = store().games.get(gameId);
  if (!game) return null;
  if (game.status !== "in_progress") return refused(game, "This game is already over.");
  if (game.human.isGameOver) return refused(game, "Your board is already complete.");
  if (expectedTurn !== game.human.publicState().guessesMade + 1) {
    return refused(game, "That guess was out of step with the board.");
  }

  const accepted = game.human.guessWord(rawGuess);
  if (!accepted) return refused(game, "That word was not accepted.");
  completeIfReady(game);
  return { accepted: true, snapshot: snapshot(game) };
}

export function forfeitGame(gameId: string): WordleSnapshot | null {
  removeExpiredGames();
  const game = store().games.get(gameId);
  if (!game) return null;
  if (game.status === "in_progress" && !game.human.isGameOver) game.status = "forfeited";
  return snapshot(game);
}

function snapshot(game: LiveGame): WordleSnapshot {
  const revealed = game.human.isGameOver || game.status === "forfeited";
  const allModelsSettled = game.models.every((seat) => isSettled(seat.status));
  return {
    gameId: game.id,
    status: game.status,
    expiresAt: new Date(game.expiresAt).toISOString(),
    revealed,
    allModelsSettled,
    ...(revealed ? { answer: game.answer } : {}),
    you: toSeatView({
      seatId: "human",
      displayName: game.displayName,
      model: game.human,
      status: game.human.isGameOver || game.status === "forfeited" ? "finished" : "playing",
      concealed: false,
    }),
    models: game.models.map((seat) => toSeatView({
      seatId: seat.ref.id,
      displayName: seat.ref.displayName,
      model: seat.model,
      status: seat.status,
      concealed: !revealed,
    })),
  };
}

async function runModel(game: LiveGame, seat: ModelSeat): Promise<void> {
  seat.status = "playing";
  let invalidGuesses = 0;
  let requestFailures = 0;
  try {
    while (!seat.model.isGameOver) {
      if (Date.now() >= game.expiresAt) {
        seat.status = "failed";
        return;
      }
      let guess: string;
      try {
        guess = await requestWordleGuess(seat.ref.id, seat.model.formattedState());
        requestFailures = 0;
      } catch (error) {
        requestFailures += 1;
        console.error(
          `OpenRouter model ${seat.ref.id} request ${requestFailures} failed in game ${game.id}:`,
          error,
        );
        if (requestFailures >= MAX_MODEL_REQUEST_FAILURES) {
          seat.status = "failed";
          completeIfReady(game);
          return;
        }
        continue;
      }
      if (seat.model.guessWord(guess)) {
        invalidGuesses = 0;
        continue;
      }
      invalidGuesses += 1;
      if (invalidGuesses >= MAX_INVALID_MODEL_GUESSES) {
        console.error(
          `OpenRouter model ${seat.ref.id} returned ${invalidGuesses} invalid guesses in game ${game.id}.`,
        );
        seat.status = "failed";
        completeIfReady(game);
        return;
      }
    }
    seat.status = "finished";
  } catch (error) {
    seat.status = "failed";
    console.error(`OpenRouter model ${seat.ref.id} failed in game ${game.id}:`, error);
  }
  completeIfReady(game);
}

function completeIfReady(game: LiveGame): void {
  if (game.status !== "in_progress") return;
  if (game.human.isGameOver && game.models.every((seat) => isSettled(seat.status))) {
    game.status = "completed";
  }
}

function refused(game: LiveGame, reason: string): WordleGuessResult {
  return { accepted: false, reason, snapshot: snapshot(game) };
}

function isSettled(status: ModelStatus): boolean {
  return status === "finished" || status === "failed";
}

function removeExpiredGames(): void {
  const now = Date.now();
  for (const [id, game] of store().games) {
    if (game.expiresAt <= now) store().games.delete(id);
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const WORDLE_MODEL_LIMIT = 5;
