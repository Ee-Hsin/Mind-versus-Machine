// A text-based model of the game Wordle, designed to be driven programmatically
// (e.g. by an LLM). The game exposes a small API to submit guesses and to read
// the current board back as plain text.
//
// Note: the word lists are imported from the generated ./wordleWords module.
// The import is extensionless for portability across module systems; under
// strict NodeNext ESM resolution you may need to change it to "./wordleWords.js".
import { ANSWER_WORDS, ALLOWED_GUESSES } from "./wordleWords";

/** The three ways a letter in a guess can be scored against the answer. */
export type LetterState = "Green" | "Yellow" | "Gray";

/** A single scored guess: the word plus a per-letter colour (both length 5). */
export interface GuessRow {
  readonly guess: string;
  readonly states: readonly LetterState[];
}

/**
 * The 26 letters bucketed by their best-known status — a Wordle keyboard. Every
 * letter is in exactly one group (precedence Green > Yellow > Gray; letters not
 * yet guessed are `unused`), and each group is alphabetical.
 */
export interface LetterGroups {
  /** Not guessed yet. */
  unused: string[];
  /** Guessed in the correct spot at least once. */
  green: string[];
  /** In the word but only ever in the wrong spot (never green). */
  yellow: string[];
  /** Guessed and confirmed absent (never green or yellow). */
  gray: string[];
}

/**
 * A structured, serializable snapshot of a game — the non-text representation.
 *
 * `answer` + `guesses` are canonical: they are all you need to persist and fully
 * reconstruct a game (via {@link Wordle.fromState}). The remaining fields are
 * *derived* from those two and included so the snapshot can be returned directly
 * from an API without recomputing anything.
 *
 * NOTE: `answer` is the secret word. Keep it server-side; strip it before
 * returning the snapshot to a live player (or send `board` + the flags instead).
 */
export interface GameState {
  answer: string;
  guesses: string[];
  board: GuessRow[];
  /** Keyboard state after each turn (index i = after guess i+1) — drives a replay. */
  keyboardByTurn: LetterGroups[];
  guessesMade: number;
  triesRemaining: number;
  currentTurn: number;
  isWon: boolean;
  isLost: boolean;
  isGameOver: boolean;
}

const WORD_LENGTH = 5;
const MAX_TRIES = 6;

// The set of accepted guesses (answers ∪ allowed guesses, ~13k words) is the
// same for every game, so it's built once here and shared by all instances.
// The source lists are already uppercase (guaranteed by the generator).
const VALID_GUESSES = new Set<string>([...ANSWER_WORDS, ...ALLOWED_GUESSES]);

const VALID_GUESSES_SORTED: readonly string[] = [...VALID_GUESSES].sort();

/**
 * Every word the game accepts as a guess. Safe to send to a browser: it is the
 * union of the answer pool and the allowed-only guesses, so it reveals which
 * strings are words without revealing which of them any game's answer is — and
 * merging the two lists means a client cannot even tell them apart.
 *
 * Shipping this is what lets a client reject a non-word with no round trip,
 * without ever holding the answer.
 */
export function validGuesses(): readonly string[] {
  return VALID_GUESSES_SORTED;
}

export class Wordle {
  static readonly MAX_TRIES = MAX_TRIES;
  static readonly WORD_LENGTH = WORD_LENGTH;

  private answer: string;
  private rows: GuessRow[] = [];

  /**
   * @param answer optional fixed secret word for deterministic tests / seeded
   *   play. When omitted, a random word is chosen from the answer list.
   */
  constructor(answer?: string) {
    this.answer = answer !== undefined ? normalize(answer) : randomAnswer();
  }

  /**
   * Rebuild a game from a persisted snapshot (e.g. a DB row). Only `answer` and
   * `guesses` are read; the colours are re-scored from them, so this works even
   * if the word lists were regenerated since the game was saved (the stored
   * guesses are trusted and not re-validated).
   */
  static fromState(state: { answer: string; guesses: readonly string[] }): Wordle {
    const game = new Wordle(state.answer);
    for (const guess of state.guesses) {
      const normalized = normalize(guess);
      game.rows.push({ guess: normalized, states: score(normalized, game.answer) });
    }
    return game;
  }

  // --- Player-facing API ---------------------------------------------------

  /**
   * Submit a guess.
   *
   * Returns `true` if the guess was accepted and scored (it counts as one of
   * the six tries), or `false` if it was rejected. A guess is rejected — and
   * does NOT consume a try — when the game is already over, the guess is not
   * exactly five letters, it contains non-letters, or it is not a recognised
   * word. Input is case-insensitive.
   *
   * Winning is reported separately via {@link isWon}.
   */
  guessWord(guess: string): boolean {
    if (this.isGameOver) return false;

    const normalized = normalize(guess);
    if (!/^[A-Z]{5}$/.test(normalized)) return false;
    if (!VALID_GUESSES.has(normalized)) return false;

    this.rows.push({ guess: normalized, states: score(normalized, this.answer) });
    return true;
  }

  /** Start a new game with a fresh random answer. */
  restartGame(): void {
    this.rows = [];
    this.answer = randomAnswer();
  }

  // --- Formatted (string) views: print these or hand them to an LLM. Each has
  //     a structured (object) counterpart below with the matching name.

  /** The board as a formatted string: an aligned grid of the guesses so far. */
  get formattedBoard(): string {
    if (this.rows.length === 0) return "No guesses yet.";

    const lines: string[] = [];
    this.rows.forEach((row, index) => {
      const n = index + 1;
      lines.push(gridRow(`Word ${n}:`, [...row.guess]));
      lines.push(gridRow(`Color ${n}:`, [...row.states]));
    });
    return lines.join("\n");
  }

  /**
   * The keyboard as a formatted string — the {@link letters} groups laid out
   * with aligned labels. Empty groups show "—". Structured form: {@link letters}.
   */
  get formattedLetters(): string {
    const { unused, green, yellow, gray } = this.letters;
    const fmt = (group: string[]) => (group.length ? group.join(" ") : "—");
    return [
      `Unused: ${fmt(unused)}`,
      `Green:  ${fmt(green)}`,
      `Yellow: ${fmt(yellow)}`,
      `Gray:   ${fmt(gray)}`,
    ].join("\n");
  }

  /**
   * The whole game as one formatted string — a status line, the board, and
   * (while the game is live) the keyboard. Handy to print or pass to an LLM in a
   * single call. Structured counterpart: {@link getState}.
   */
  formattedState(): string {
    const parts = [this.statusLine(), "", this.formattedBoard];
    if (!this.isGameOver) parts.push("", this.formattedLetters);
    return parts.join("\n");
  }

  /** One-line status: turn & tries left, or the win/loss result once over. */
  private statusLine(): string {
    if (this.isWon) {
      const n = this.guessesMade;
      return `Won in ${n} ${n === 1 ? "try" : "tries"}! The word was ${this.answer}.`;
    }
    if (this.isLost) return `Out of tries. The word was ${this.answer}.`;
    const left = this.triesRemaining;
    return `Turn ${this.currentTurn} of ${MAX_TRIES} — ${left} ${left === 1 ? "try" : "tries"} left`;
  }

  // --- Structured (object) views: use these for the DB / programmatic access.

  /**
   * The structured (non-text) form of {@link formattedBoard}: every guess so far
   * with its per-letter colours. Returns copies, so mutating the result is safe.
   */
  get board(): GuessRow[] {
    return this.rows.map((row) => ({ guess: row.guess, states: [...row.states] }));
  }

  /** The most recent scored guess with its colours, or `null` if none yet. */
  get lastGuess(): GuessRow | null {
    const last = this.rows[this.rows.length - 1];
    return last ? { guess: last.guess, states: [...last.states] } : null;
  }

  /**
   * The current keyboard: the alphabet bucketed by best-known status. Equal to
   * the last entry of {@link GameState.keyboardByTurn}. See {@link letterGroupsFrom}
   * for how statuses are resolved.
   */
  get letters(): LetterGroups {
    return letterGroupsFrom(this.rows);
  }

  /** True once a scored guess exactly matches the answer. */
  get isWon(): boolean {
    const last = this.rows[this.rows.length - 1];
    return last !== undefined && last.guess === this.answer;
  }

  /** True when the game is over without a win (all tries used up). */
  get isLost(): boolean {
    return this.isGameOver && !this.isWon;
  }

  /** True when the game has ended, whether by a win or by running out of tries. */
  get isGameOver(): boolean {
    return this.isWon || this.rows.length >= MAX_TRIES;
  }

  /** How many guesses have been scored so far (0–6). */
  get guessesMade(): number {
    return this.rows.length;
  }

  /** How many tries remain (6–0). */
  get triesRemaining(): number {
    return MAX_TRIES - this.rows.length;
  }

  /** The 1-indexed turn about to be played (guessesMade + 1). */
  get currentTurn(): number {
    return this.rows.length + 1;
  }

  /** The secret answer — only revealed once the game is over, otherwise `null`. */
  get solution(): string | null {
    return this.isGameOver ? this.answer : null;
  }

  /**
   * A full structured snapshot of the game — persist it to a DB row and/or
   * return it via an API after each turn. Round-trips through {@link fromState}.
   * (`JSON.stringify(game)` yields the same object, since this backs `toJSON`.)
   */
  getState(): GameState {
    return {
      answer: this.answer,
      guesses: this.rows.map((row) => row.guess),
      board: this.board,
      keyboardByTurn: this.rows.map((_, i) => letterGroupsFrom(this.rows.slice(0, i + 1))),
      guessesMade: this.guessesMade,
      triesRemaining: this.triesRemaining,
      currentTurn: this.currentTurn,
      isWon: this.isWon,
      isLost: this.isLost,
      isGameOver: this.isGameOver,
    };
  }

  /** Alias so `JSON.stringify(game)` produces the snapshot from {@link getState}. */
  toJSON(): GameState {
    return this.getState();
  }
}

/** Normalize a word for storage/comparison: trim surrounding space, uppercase. */
function normalize(word: string): string {
  return word.trim().toUpperCase();
}

/** Pick a random secret answer from the official answer list. */
function randomAnswer(): string {
  return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
}

const RANK: Record<LetterState, number> = { Gray: 0, Yellow: 1, Green: 2 };

/**
 * Bucket the alphabet by best-known status across the given rows. A letter's
 * status is the best it has ever achieved (Green > Yellow > Gray), so a letter
 * that is Gray in one spot but confirmed elsewhere (duplicates) lands in
 * green/yellow, not gray. Letters never guessed are `unused`. Groups are
 * alphabetical, and together they partition all 26 letters.
 */
function letterGroupsFrom(rows: readonly GuessRow[]): LetterGroups {
  const best: Record<string, LetterState> = {};
  for (const row of rows) {
    for (let i = 0; i < row.guess.length; i++) {
      const letter = row.guess[i];
      const state = row.states[i];
      if (best[letter] === undefined || RANK[state] > RANK[best[letter]]) {
        best[letter] = state;
      }
    }
  }

  const groups: LetterGroups = { unused: [], green: [], yellow: [], gray: [] };
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const state = best[letter];
    if (state === undefined) groups.unused.push(letter);
    else if (state === "Green") groups.green.push(letter);
    else if (state === "Yellow") groups.yellow.push(letter);
    else groups.gray.push(letter);
  }
  return groups;
}

/**
 * Score a guess against the answer using standard Wordle rules, including
 * correct handling of duplicate letters: greens are assigned first, then each
 * remaining letter is marked yellow only while unmatched occurrences of it
 * remain in the answer.
 */
function score(guess: string, answer: string): LetterState[] {
  const states: LetterState[] = new Array(WORD_LENGTH).fill("Gray");
  const remaining: Record<string, number> = {};

  // Pass 1: greens, and tally the answer letters not yet matched.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      states[i] = "Green";
    } else {
      remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
    }
  }

  // Pass 2: yellows for letters still available in the tally, else gray.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] === "Green") continue;
    const letter = guess[i];
    if ((remaining[letter] ?? 0) > 0) {
      states[i] = "Yellow";
      remaining[letter]--;
    }
  }

  return states;
}

// Cells are padded to fit the widest content ("Yellow" = 6 chars); the row
// label column is padded to a fixed width so both rows of a turn line up.
const CELL_WIDTH = 6;
const LABEL_WIDTH = 8;

/** Build one aligned grid line: a padded label followed by padded cells. */
function gridRow(label: string, cells: readonly string[]): string {
  const body = cells.map((cell) => cell.padEnd(CELL_WIDTH)).join(" | ");
  return `${label.padEnd(LABEL_WIDTH)} | ${body} |`;
}
