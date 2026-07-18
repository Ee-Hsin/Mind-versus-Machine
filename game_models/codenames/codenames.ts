// A text-friendly, serializable model of the game Codenames, built to be driven
// programmatically (e.g. by LLMs playing in teams). It maintains the hidden
// board, renders role-specific views (spymasters see the key; operatives see
// only revealed cards), enforces the full turn flow, and logs every clue and
// guess as both structured data and formatted text.
//
// Mirrors the conventions of the sibling wordle model: formatted-string views
// are paired with structured-object views, and the game is serializable via
// getState()/fromState()/toJSON(). The word pool is imported from the generated
// ./codenamesWords module (extensionless; strict NodeNext ESM may need ".js").
import { WORDS } from "./codenamesWords";

// --- Types -----------------------------------------------------------------

/** The two teams. Their cards are the "red" and "blue" colours. */
export type Team = "red" | "blue";

/** A card's hidden identity. `assassin` is the instant-loss ("black") card. */
export type CardColor = "red" | "blue" | "neutral" | "assassin";

/** What a player is doing this call — spymasters see the key, operatives don't. */
export type Role = "spymaster" | "operative";

/** Whose action the game is waiting for: a spymaster clue, or operative guesses. */
export type TurnPhase = "clue" | "guess";

/** The result of revealing one card. */
export type GuessOutcome = "correct" | "wrong-team" | "neutral" | "assassin";

/** A spymaster's clue: one word plus how many cards it points to. */
export interface Clue {
  word: string;
  number: number;
}

/** A card as the spymaster (or the server) sees it — colour always known. */
export interface Card {
  readonly word: string;
  readonly color: CardColor;
  readonly revealed: boolean;
}

/** A card as an operative sees it — colour is `null` until the card is revealed. */
export interface PublicCard {
  readonly word: string;
  readonly revealed: boolean;
  readonly color: CardColor | null;
}

/** What `guess()` returns: what happened, and whether the turn/game ended. */
export interface GuessResult {
  accepted: boolean; // false = rejected (wrong phase, game over, unknown/already-revealed word)
  word?: string;
  color?: CardColor; // the revealed card's colour
  outcome?: GuessOutcome;
  turnEnded: boolean;
  gameOver: boolean;
  winner?: Team | null;
}

/** One recorded guess within a turn. */
export interface GuessRecord {
  word: string;
  color: CardColor;
  outcome: GuessOutcome;
}

/** One team's turn: the clue, the guesses made under it, and how it ended. */
export interface TurnRecord {
  team: Team;
  clue: Clue;
  guesses: GuessRecord[];
  /** How the turn ended; `null` while it is still in progress. */
  endedBy: "limit" | "neutral" | "wrong-team" | "assassin" | "stopped" | "win" | null;
}

/** An ordered game event — replaying the full list reconstructs a game. */
export type Move =
  | { type: "clue"; word: string; number: number }
  | { type: "guess"; word: string }
  | { type: "stop" };

/** Options for constructing a game. All optional; used for seeded/deterministic play. */
export interface CodenamesOptions {
  /** Exactly 25 distinct words (board layout). Default: 25 drawn at random from WORDS. */
  words?: readonly string[];
  /** Exactly 25 colours aligned to `words`. Default: a valid random key. */
  key?: readonly CardColor[];
  /** Which team goes first (has 9 cards). Default: random, or derived from `key`. */
  startingTeam?: Team;
}

/**
 * A FULL, serializable snapshot — for DB persistence, replay, and spectating.
 * Contains the key, so it is SERVER-SIDE ONLY: never send it to a live operative
 * (use {@link Codenames.getPlayerState}). Canonical fields (`words`, `key`,
 * `startingTeam`, `moves`) fully reconstruct the game via {@link Codenames.fromState};
 * the rest are derived for direct rendering.
 */
export interface CodenamesState {
  // canonical
  words: string[];
  key: CardColor[];
  startingTeam: Team;
  moves: Move[];
  // derived
  board: Card[];
  log: TurnRecord[];
  currentTeam: Team;
  phase: TurnPhase;
  currentClue: Clue | null;
  guessesRemaining: number;
  remaining: { red: number; blue: number };
  isGameOver: boolean;
  winner: Team | null;
  endReason: "all-cards" | "assassin" | null;
}

/**
 * A role-safe snapshot for a LIVE client. For an operative, unrevealed card
 * colours are masked and the key/moves are omitted, so it is safe to send to
 * that player. For a spymaster, colours are included.
 */
export interface PlayerState {
  role: Role;
  board: (Card | PublicCard)[];
  log: TurnRecord[];
  currentTeam: Team;
  phase: TurnPhase;
  currentClue: Clue | null;
  guessesRemaining: number;
  remaining: { red: number; blue: number };
  isGameOver: boolean;
  winner: Team | null;
  endReason: "all-cards" | "assassin" | null;
}

// --- Constants -------------------------------------------------------------

const BOARD_SIZE = 25;
const GRID_COLS = 5;
const START_COUNT = 9; // starting team
const SECOND_COUNT = 8; // other team
const NEUTRAL_COUNT = 7;
const ASSASSIN_COUNT = 1;

// --- Board -----------------------------------------------------------------

interface InternalCard {
  word: string;
  color: CardColor;
  revealed: boolean;
}

/** Holds the 25 cards; handles reveals, remaining counts, and role-specific views. */
class Board {
  private readonly cards: InternalCard[];

  constructor(words: readonly string[], key: readonly CardColor[]) {
    if (words.length !== BOARD_SIZE || key.length !== BOARD_SIZE) {
      throw new Error(`A board needs exactly ${BOARD_SIZE} words and ${BOARD_SIZE} colours.`);
    }
    const normalized = words.map(normalize);
    if (new Set(normalized).size !== BOARD_SIZE) {
      throw new Error("Board words must be distinct.");
    }
    this.cards = normalized.map((word, i) => ({ word, color: key[i], revealed: false }));
  }

  hasWord(word: string): boolean {
    const target = normalize(word);
    return this.cards.some((c) => c.word === target);
  }

  /** Reveal a card by word. Returns it, or `null` if unknown or already revealed. */
  reveal(word: string): InternalCard | null {
    const target = normalize(word);
    const card = this.cards.find((c) => c.word === target);
    if (!card || card.revealed) return null;
    card.revealed = true;
    return card;
  }

  /** Unrevealed team-card counts. */
  remaining(): { red: number; blue: number } {
    let red = 0;
    let blue = 0;
    for (const c of this.cards) {
      if (c.revealed) continue;
      if (c.color === "red") red++;
      else if (c.color === "blue") blue++;
    }
    return { red, blue };
  }

  words(): string[] {
    return this.cards.map((c) => c.word);
  }

  key(): CardColor[] {
    return this.cards.map((c) => c.color);
  }

  /** Structured cards for a role (copies). Operative sees colour only if revealed. */
  cardsFor(role: Role): (Card | PublicCard)[] {
    return this.cards.map((c) =>
      role === "spymaster"
        ? { word: c.word, color: c.color, revealed: c.revealed }
        : { word: c.word, revealed: c.revealed, color: c.revealed ? c.color : null },
    );
  }

  /** The 5×5 grid as aligned text for a role. */
  formatted(role: Role): string {
    return renderGrid(this.cards.map((c) => cellLabel(c, role)));
  }
}

// --- Codenames game --------------------------------------------------------

export class Codenames {
  static readonly BOARD_SIZE = BOARD_SIZE;

  private startingTeam: Team;
  private _board: Board;
  private _currentTeam: Team;
  private _phase: TurnPhase;
  private _clue: Clue | null;
  private _guessesRemaining: number;
  private _moves: Move[];
  private _log: TurnRecord[];
  private _winner: Team | null;
  private _endReason: "all-cards" | "assassin" | null;

  constructor(options: CodenamesOptions = {}) {
    const words = (options.words ?? pickWords()).map(normalize);

    let startingTeam: Team;
    let key: CardColor[];
    if (options.key) {
      key = [...options.key];
      startingTeam = options.startingTeam ?? deriveStartingTeam(key);
    } else {
      startingTeam = options.startingTeam ?? randomTeam();
      key = buildKey(startingTeam);
    }

    this.startingTeam = startingTeam;
    this._board = new Board(words, key);
    this._currentTeam = startingTeam;
    this._phase = "clue";
    this._clue = null;
    this._guessesRemaining = 0;
    this._moves = [];
    this._log = [];
    this._winner = null;
    this._endReason = null;
  }

  /** Rebuild a game from a persisted snapshot by replaying its canonical moves. */
  static fromState(state: {
    words: readonly string[];
    key: readonly CardColor[];
    startingTeam: Team;
    moves: readonly Move[];
  }): Codenames {
    const game = new Codenames({
      words: [...state.words],
      key: [...state.key],
      startingTeam: state.startingTeam,
    });
    for (const move of state.moves) {
      const ok =
        move.type === "clue"
          ? game.giveClue(move.word, move.number)
          : move.type === "guess"
            ? game.guess(move.word).accepted
            : game.endGuessing();
      if (!ok) throw new Error(`fromState: could not replay move ${JSON.stringify(move)}`);
    }
    return game;
  }

  // --- Actions (state machine) ---------------------------------------------

  /**
   * Spymaster gives a clue. Returns `false` (no state change) if it's not the
   * clue phase, the game is over, or the clue is illegal: it must be a single
   * alphabetic word that is not on the board, with a number ≥ 1. On success the
   * turn moves to the guess phase and operatives get `number + 1` guesses.
   */
  giveClue(word: string, number: number): boolean {
    if (this.isGameOver || this._phase !== "clue") return false;

    const clue = normalize(word);
    if (!/^[A-Z]+$/.test(clue)) return false; // single alphabetic token only
    if (!Number.isInteger(number) || number < 1) return false;
    if (this._board.hasWord(clue)) return false; // may not be a word on the board

    this._clue = { word: clue, number };
    this._guessesRemaining = number + 1;
    this._phase = "guess";
    this._moves.push({ type: "clue", word: clue, number });
    this._log.push({ team: this._currentTeam, clue: { word: clue, number }, guesses: [], endedBy: null });
    return true;
  }

  /**
   * Operative guesses a card by word. Reveals it, applies the outcome, and may
   * end the turn or the game. Returns a structured {@link GuessResult}; also
   * appends to the log. Rejected (accepted:false, no change) if it's not the
   * guess phase, the game is over, or the word is unknown / already revealed.
   */
  guess(word: string): GuessResult {
    if (this.isGameOver) {
      return { accepted: false, turnEnded: false, gameOver: true, winner: this._winner };
    }
    if (this._phase !== "guess") {
      return { accepted: false, turnEnded: false, gameOver: false };
    }

    const card = this._board.reveal(word);
    if (!card) return { accepted: false, turnEnded: false, gameOver: false };

    this._moves.push({ type: "guess", word: card.word });

    const team = this._currentTeam;
    const color = card.color;
    let outcome: GuessOutcome;
    let turnEnded = false;

    if (color === "assassin") {
      outcome = "assassin";
      this.endGame(otherTeam(team), "assassin");
      turnEnded = true;
    } else if (color === team) {
      outcome = "correct";
      if (this._board.remaining()[team] === 0) {
        this.endGame(team, "all-cards");
        turnEnded = true;
      } else {
        this._guessesRemaining -= 1;
        if (this._guessesRemaining <= 0) turnEnded = true;
      }
    } else if (color === "neutral") {
      outcome = "neutral";
      turnEnded = true;
    } else {
      // the other team's card — it gets revealed for them
      outcome = "wrong-team";
      const other = otherTeam(team);
      if (this._board.remaining()[other] === 0) this.endGame(other, "all-cards");
      turnEnded = true;
    }

    this.currentTurn().guesses.push({ word: card.word, color, outcome });

    if (this.isGameOver) {
      this.currentTurn().endedBy = outcome === "assassin" ? "assassin" : "win";
    } else if (turnEnded) {
      this.currentTurn().endedBy =
        outcome === "correct" ? "limit" : outcome === "neutral" ? "neutral" : "wrong-team";
      this.endTurn();
    }

    return {
      accepted: true,
      word: card.word,
      color,
      outcome,
      turnEnded,
      gameOver: this.isGameOver,
      winner: this._winner,
    };
  }

  /**
   * Operatives stop guessing early and end their turn. Only allowed during the
   * guess phase after at least one guess. Returns `false` otherwise.
   */
  endGuessing(): boolean {
    if (this.isGameOver || this._phase !== "guess") return false;
    const turn = this.currentTurn();
    if (turn.guesses.length === 0) return false; // must guess at least once
    this._moves.push({ type: "stop" });
    turn.endedBy = "stopped";
    this.endTurn();
    return true;
  }

  /** Start a brand-new game (fresh random words, key, and starting team). */
  restartGame(): void {
    const startingTeam = randomTeam();
    this.startingTeam = startingTeam;
    this._board = new Board(pickWords(), buildKey(startingTeam));
    this._currentTeam = startingTeam;
    this._phase = "clue";
    this._clue = null;
    this._guessesRemaining = 0;
    this._moves = [];
    this._log = [];
    this._winner = null;
    this._endReason = null;
  }

  // --- Formatted (string) views: print these or hand them to an LLM ---------

  /** The board as an aligned 5×5 text grid for the given role. */
  formattedBoard(role: Role): string {
    return this._board.formatted(role);
  }

  /** The clue/guess history as text (structured form: {@link log}). */
  get formattedLog(): string {
    if (this._log.length === 0) return "No clues yet.";
    const lines: string[] = [];
    this._log.forEach((turn, i) => {
      lines.push(`Turn ${i + 1} — ${turn.team.toUpperCase()} clue: ${turn.clue.word} ${turn.clue.number}`);
      for (const g of turn.guesses) lines.push(`  ${g.word} → ${g.color} (${g.outcome})`);
      if (turn.endedBy === "stopped") lines.push("  (stopped guessing)");
      else if (turn.endedBy === "win") lines.push("  (game won)");
      else if (turn.endedBy === "assassin") lines.push("  (assassin — game lost)");
    });
    return lines.join("\n");
  }

  /**
   * The whole game as one role-appropriate string — status line, the role's
   * board, and the log. The one thing to hand an LLM each turn. Structured
   * counterpart: {@link getPlayerState}.
   */
  formattedState(role: Role): string {
    return [this.statusLine(), "", this.formattedBoard(role), "", this.legend(role), "", "Log:", this.formattedLog].join(
      "\n",
    );
  }

  // --- Structured (object) views: use these for the DB / programmatic --------

  /** The structured board for a role (copies). Operative: unrevealed colours are `null`. */
  board(role: Role): (Card | PublicCard)[] {
    return this._board.cardsFor(role);
  }

  /** The structured clue/guess history (copies; the last turn may be in progress). */
  get log(): TurnRecord[] {
    return this._log.map((t) => ({
      team: t.team,
      clue: { ...t.clue },
      guesses: t.guesses.map((g) => ({ ...g })),
      endedBy: t.endedBy,
    }));
  }

  /** FULL snapshot — DB persistence, replay, spectating. SERVER-SIDE ONLY (has the key). */
  getState(): CodenamesState {
    return {
      words: this._board.words(),
      key: this._board.key(),
      startingTeam: this.startingTeam,
      moves: this._moves.map((m) => ({ ...m })),
      board: this._board.cardsFor("spymaster") as Card[],
      log: this.log,
      currentTeam: this._currentTeam,
      phase: this._phase,
      currentClue: this.currentClue,
      guessesRemaining: this._guessesRemaining,
      remaining: this.remaining,
      isGameOver: this.isGameOver,
      winner: this._winner,
      endReason: this._endReason,
    };
  }

  /** Role-safe snapshot for a LIVE client (operative colours masked; no key/moves). */
  getPlayerState(role: Role): PlayerState {
    return {
      role,
      board: this._board.cardsFor(role),
      log: this.log,
      currentTeam: this._currentTeam,
      phase: this._phase,
      currentClue: this.currentClue,
      guessesRemaining: this._guessesRemaining,
      remaining: this.remaining,
      isGameOver: this.isGameOver,
      winner: this._winner,
      endReason: this._endReason,
    };
  }

  /** Alias so `JSON.stringify(game)` yields the full snapshot from {@link getState}. */
  toJSON(): CodenamesState {
    return this.getState();
  }

  // --- State getters --------------------------------------------------------

  get currentTeam(): Team {
    return this._currentTeam;
  }

  get phase(): TurnPhase {
    return this._phase;
  }

  get currentClue(): Clue | null {
    return this._clue ? { ...this._clue } : null;
  }

  get guessesRemaining(): number {
    return this._guessesRemaining;
  }

  /** Unrevealed cards left for each team (the "score"). */
  get remaining(): { red: number; blue: number } {
    return this._board.remaining();
  }

  get isGameOver(): boolean {
    return this._winner !== null;
  }

  get winner(): Team | null {
    return this._winner;
  }

  get endReason(): "all-cards" | "assassin" | null {
    return this._endReason;
  }

  // --- Internals ------------------------------------------------------------

  private currentTurn(): TurnRecord {
    return this._log[this._log.length - 1];
  }

  private endTurn(): void {
    this._currentTeam = otherTeam(this._currentTeam);
    this._phase = "clue";
    this._clue = null;
    this._guessesRemaining = 0;
  }

  private endGame(winner: Team, reason: "all-cards" | "assassin"): void {
    this._winner = winner;
    this._endReason = reason;
  }

  private statusLine(): string {
    const { red, blue } = this.remaining;
    if (this.isGameOver) {
      return `Game over — ${this._winner!.toUpperCase()} wins (${this._endReason}). Remaining: red ${red}, blue ${blue}.`;
    }
    const base = `${this._currentTeam.toUpperCase()} team's turn — red ${red} / blue ${blue} left.`;
    if (this._phase === "clue") {
      return `${base} \n\nAwaiting the ${this._currentTeam.toUpperCase()} spymaster's clue.`;
    }
    return `${base} \n\nClue: ${this._clue!.word} ${this._clue!.number} — up to ${this._guessesRemaining} guess(es) left.`;
  }

  /** A one-line key explaining the board's colour tags, tailored to the role. */
  private legend(role: Role): string {
    return role === "spymaster"
      ? "Key: every card shows its colour — RED / BLU (blue) / NEU (neutral) / ASN (assassin); * = already revealed."
      : "Key: a colour tag (RED / BLU / NEU / ASN) marks a revealed card; untagged cards are not yet guessed.";
  }
}

// --- Free helpers ----------------------------------------------------------

/** Trim surrounding space and uppercase, for consistent comparison/display. */
function normalize(word: string): string {
  return word.trim().toUpperCase();
}

function otherTeam(team: Team): Team {
  return team === "red" ? "blue" : "red";
}

function randomTeam(): Team {
  return Math.random() < 0.5 ? "red" : "blue";
}

/** Fisher–Yates shuffle into a new array. */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 25 distinct random words from the pool. */
function pickWords(): string[] {
  return shuffle(WORDS).slice(0, BOARD_SIZE);
}

/** A shuffled key: 9 starting-team, 8 other, 7 neutral, 1 assassin. */
function buildKey(startingTeam: Team): CardColor[] {
  const other = otherTeam(startingTeam);
  const colors: CardColor[] = [
    ...(Array(START_COUNT).fill(startingTeam) as CardColor[]),
    ...(Array(SECOND_COUNT).fill(other) as CardColor[]),
    ...(Array(NEUTRAL_COUNT).fill("neutral") as CardColor[]),
    ...(Array(ASSASSIN_COUNT).fill("assassin") as CardColor[]),
  ];
  return shuffle(colors);
}

/** Whichever team has more cards in the key goes first (ties default to red). */
function deriveStartingTeam(key: readonly CardColor[]): Team {
  const red = key.filter((c) => c === "red").length;
  const blue = key.filter((c) => c === "blue").length;
  return blue > red ? "blue" : "red";
}

function colorAbbrev(color: CardColor): string {
  return color === "red" ? "RED" : color === "blue" ? "BLU" : color === "neutral" ? "NEU" : "ASN";
}

/** A card's cell text for a role. Spymaster: always tagged (`*` = revealed).
 *  Operative: tagged with its colour only once revealed, else just the word. */
function cellLabel(card: InternalCard, role: Role): string {
  if (role === "spymaster") return `${card.word} (${colorAbbrev(card.color)}${card.revealed ? "*" : ""})`;
  return card.revealed ? `${card.word} (${colorAbbrev(card.color)})` : card.word;
}

/** Lay out cell strings as an aligned 5×5 grid. */
function renderGrid(cells: string[]): string {
  const width = Math.max(...cells.map((c) => c.length));
  const rows: string[] = [];
  for (let r = 0; r < GRID_COLS; r++) {
    const rowCells = cells.slice(r * GRID_COLS, r * GRID_COLS + GRID_COLS);
    rows.push(rowCells.map((c) => c.padEnd(width)).join("  "));
  }
  return rows.join("\n");
}
