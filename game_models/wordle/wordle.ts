// A text-based model of the game Wordle, designed to be driven programmatically
// (e.g. by an LLM). Adapted to the ai-ramp-games engine/protocol API: the model
// is a pure function of explicit state ({ answer, guesses }), exposes a public
// projection (`publicState`) whose letter states use protocol casing, and is
// serializable via `serialize()`. Random seeding lives outside the model (in
// match orchestration); `WordleModel.newRandom()` is a convenience for demos.
//
// The types below (`WordleState`, `WordlePublicState`, `WordleLetterState`,
// `WordleGuessRow`) mirror `@ai-ramp/protocol`; when this file moves into
// `packages/games/wordle/src/model.ts`, swap them for imports from that package.
//
// Note: the word lists are imported from the generated ./wordleWords module.
import { ANSWER_WORDS, ALLOWED_GUESSES } from "./wordleWords";

/** The three ways a letter in a guess can be scored (protocol casing). */
export type WordleLetterState = "green" | "yellow" | "gray";

/** A single scored guess: the word plus a per-letter colour (both length 5). */
export interface WordleGuessRow {
  readonly guess: string;
  readonly states: readonly WordleLetterState[];
}

/**
 * Canonical, serializable state: `answer` + `guesses` are all you need to fully
 * reconstruct a game (via the constructor or {@link WordleModel.fromState}).
 * NOTE: `answer` is the secret word — keep it server-side.
 */
export interface WordleState {
  answer: string;
  guesses: string[];
}

/**
 * The role-safe public projection (mirrors the engine's `WordlePublicState`).
 * The secret `answer` is present only when explicitly revealed by the caller.
 */
export interface WordlePublicState {
  board: WordleGuessRow[];
  guessesMade: number;
  triesRemaining: number;
  isWon: boolean;
  isGameOver: boolean;
  answer?: string;
}

/**
 * The 26 letters bucketed by their best-known status — a Wordle keyboard. Every
 * letter is in exactly one group (precedence green > yellow > gray; letters not
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
 * A richer structured snapshot (a superset of {@link WordleState}) for local /
 * demo use. The canonical `answer` + `guesses` reconstruct a game; the rest is
 * derived and included so a snapshot can be rendered without recomputation.
 */
export interface GameState {
  answer: string;
  guesses: string[];
  board: WordleGuessRow[];
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

export class WordleModel {
  static readonly MAX_TRIES = MAX_TRIES;
  static readonly WORD_LENGTH = WORD_LENGTH;

  private answer: string;
  private rows: WordleGuessRow[] = [];

  /**
   * Build a game from canonical {@link WordleState}. `answer` is the secret;
   * `guesses` are replayed and re-scored (they are trusted, not re-validated),
   * so a game reconstructs even if the word lists changed since it was saved.
   */
  constructor(state: WordleState) {
    this.answer = normalize(state.answer);
    for (const guess of state.guesses) {
      const normalized = normalize(guess);
      this.rows.push({ guess: normalized, states: score(normalized, this.answer) });
    }
  }

  /** Convenience alias for the state constructor (round-trips {@link serialize}). */
  static fromState(state: WordleState): WordleModel {
    return new WordleModel(state);
  }

  /** Convenience for demos/tests: a fresh game on a random secret answer. */
  static newRandom(): WordleModel {
    return new WordleModel({ answer: randomAnswer(), guesses: [] });
  }

  // --- Player-facing API ---------------------------------------------------

  /**
   * Submit a guess. Returns `true` if accepted and scored (uses one of the six
   * tries), or `false` if rejected (game over, not exactly five letters,
   * non-letters, or not a recognised word). Case-insensitive. Winning is
   * reported separately via {@link isWon}.
   */
  guessWord(guess: string): boolean {
    if (this.isGameOver) return false;

    const normalized = normalize(guess);
    if (!/^[A-Z]{5}$/.test(normalized)) return false;
    if (!VALID_GUESSES.has(normalized)) return false;

    this.rows.push({ guess: normalized, states: score(normalized, this.answer) });
    return true;
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
   * single call. Structured counterpart: {@link publicState} / {@link getState}.
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
   * The structured form of {@link formattedBoard}: every guess so far with its
   * per-letter colours. Returns copies, so mutating the result is safe.
   */
  get board(): WordleGuessRow[] {
    return this.rows.map((row) => ({ guess: row.guess, states: [...row.states] }));
  }

  /** The most recent scored guess with its colours, or `null` if none yet. */
  get lastGuess(): WordleGuessRow | null {
    const last = this.rows[this.rows.length - 1];
    return last ? { guess: last.guess, states: [...last.states] } : null;
  }

  /**
   * The current keyboard: the alphabet bucketed by best-known status. Equal to
   * the last entry of {@link GameState.keyboardByTurn}.
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
   * The role-safe public projection handed to clients / the engine. `answer` is
   * included only when `revealAnswer` is true (e.g. postgame / operator views).
   */
  publicState(revealAnswer = false): WordlePublicState {
    return {
      board: this.board,
      guessesMade: this.guessesMade,
      triesRemaining: this.triesRemaining,
      isWon: this.isWon,
      isGameOver: this.isGameOver,
      ...(revealAnswer ? { answer: this.answer } : {}),
    };
  }

  /** Canonical serializable state — round-trips through the constructor. */
  serialize(): WordleState {
    return { answer: this.answer, guesses: this.rows.map((row) => row.guess) };
  }

  /**
   * A full structured snapshot (superset of {@link serialize}) for local / demo
   * use. (`JSON.stringify(game)` yields the same object, since this backs `toJSON`.)
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

const RANK: Record<WordleLetterState, number> = { gray: 0, yellow: 1, green: 2 };

/**
 * Bucket the alphabet by best-known status across the given rows. A letter's
 * status is the best it has ever achieved (green > yellow > gray), so a letter
 * that is gray in one spot but confirmed elsewhere (duplicates) lands in
 * green/yellow, not gray. Letters never guessed are `unused`. Groups are
 * alphabetical, and together they partition all 26 letters.
 */
function letterGroupsFrom(rows: readonly WordleGuessRow[]): LetterGroups {
  const best: Record<string, WordleLetterState> = {};
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
    else if (state === "green") groups.green.push(letter);
    else if (state === "yellow") groups.yellow.push(letter);
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
function score(guess: string, answer: string): WordleLetterState[] {
  const states: WordleLetterState[] = new Array(WORD_LENGTH).fill("gray");
  const remaining: Record<string, number> = {};

  // Pass 1: greens, and tally the answer letters not yet matched.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      states[i] = "green";
    } else {
      remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
    }
  }

  // Pass 2: yellows for letters still available in the tally, else gray.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (states[i] === "green") continue;
    const letter = guess[i];
    if ((remaining[letter] ?? 0) > 0) {
      states[i] = "yellow";
      remaining[letter]--;
    }
  }

  return states;
}

// Cells are padded to fit the widest content ("yellow" = 6 chars); the row
// label column is padded to a fixed width so both rows of a turn line up.
const CELL_WIDTH = 6;
const LABEL_WIDTH = 8;

/** Build one aligned grid line: a padded label followed by padded cells. */
function gridRow(label: string, cells: readonly string[]): string {
  const body = cells.map((cell) => cell.padEnd(CELL_WIDTH)).join(" | ");
  return `${label.padEnd(LABEL_WIDTH)} | ${body} |`;
}
