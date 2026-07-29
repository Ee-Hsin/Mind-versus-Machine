// A text-friendly, serializable model of the 6-player word-clue Imposter game
// (a.k.a. Chameleon / "find the faker"), built to be driven programmatically
// (e.g. by LLMs). 5 Crew share a secret word; 1 Imposter gets only a vague hint
// and must bluff. Players give clue words, then an accusation → defense →
// rebuttal → final-vote sequence (with tie re-votes) decides who's eliminated;
// a caught Imposter may guess the word to steal the win.
//
// Uniform with the sibling wordle/codenames models: the model is the board +
// rules + an attributed public log; it renders role-safe formatted (string) and
// structured (object) views and is serializable via getState()/getPlayerState()/
// fromState()/toJSON(). Per-turn reasoning is the runner/adapter's concern (an
// action-schema field it logs), NOT the model — model actions take game content
// only. The word/hint pool is imported from the generated ./imposterWords module.
import { WORD_HINTS } from "./imposterWords";

// --- Types -----------------------------------------------------------------

export type Alignment = "crew" | "imposter";
export type Seat = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
export type Phase =
  | "clue"
  | "accuse"
  | "accuse-tiebreak"
  | "defense"
  | "rebuttal"
  | "final"
  | "final-tiebreak"
  | "steal"
  | "gameover";

export type EndReason =
  | "crew-voted-out" // a crew member was eliminated → Imposter wins
  | "imposter-voted-out" // Imposter eliminated and failed the steal guess → Crew win
  | "word-stolen"; // Imposter eliminated but guessed the word → Imposter wins

export interface Clue {
  seat: Seat;
  word: string;
}

/** One entry in the attributed public log (chronological). */
export type LogEntry =
  | { kind: "clue"; seat: Seat; word: string }
  | {
      kind: "vote";
      vote: "accuse" | "final";
      attempt: number; // 1 = first vote, 2/3 = re-votes
      votes: Record<Seat, Seat>;
      tied: Seat[] | null; // set when this round tied
      winner: Seat | null; // the accused / eliminated once decided
      forced: boolean; // true = decided by earliest-seat fallback after the tie cap
    }
  | { kind: "defense"; context: "accused" | "rebuttal" | "tiebreak"; seat: Seat; message: string; pointAt: Seat | null }
  | { kind: "steal"; word: string; correct: boolean };

export type Move =
  | { type: "clue"; seat: Seat; word: string }
  | { type: "vote"; seat: Seat; target: Seat }
  | { type: "defend"; seat: Seat; message: string; pointAt?: Seat }
  | { type: "guess"; word: string };

export interface ImposterOptions {
  imposter?: Seat;
  word?: string;
  hint?: string;
  speakingOrder?: Seat[];
}

/** FULL, serializable snapshot — DB persistence, replay, spectating. SERVER-SIDE ONLY (has the word + roles). */
export interface ImposterState {
  // canonical — reconstruct via fromState
  imposter: Seat;
  word: string;
  hint: string;
  speakingOrder: Seat[];
  moves: Move[];
  // derived
  phase: Phase;
  roles: Record<Seat, Alignment>;
  clues: Clue[];
  log: LogEntry[];
  accused: Seat | null;
  pointedAt: Seat | null;
  eliminated: Seat | null;
  imposterGuess: string | null;
  playersToAct: Seat[];
  isGameOver: boolean;
  winner: Alignment | null;
  endReason: EndReason | null;
}

/** Role-safe snapshot for one seat — safe to hand that player/LLM. */
export interface PlayerState {
  seat: Seat;
  role: Alignment;
  secretWord: string | null; // Crew (and everyone at game over)
  hint: string | null; // Imposter (and everyone at game over)
  phase: Phase;
  speakingOrder: Seat[];
  currentSpeaker: Seat | null;
  clues: Clue[];
  log: LogEntry[]; // attributed public history; pending votes are never included
  accused: Seat | null;
  pointedAt: Seat | null;
  eliminated: Seat | null;
  yourVote: Seat | null; // your vote in the current voting round, if cast
  imposterGuess: string | null;
  revealedRoles: Record<Seat, Alignment> | null; // at game over
  playersToAct: Seat[];
  isGameOver: boolean;
  winner: Alignment | null;
  endReason: EndReason | null;
}

// --- Constants -------------------------------------------------------------

const SEATS: Seat[] = ["P1", "P2", "P3", "P4", "P5", "P6"];
const CLUE_LAPS = 2;
const MAX_TIE_ROUNDS = 2; // extra defend + re-vote rounds allowed before a deterministic pick

// --- Imposter game ---------------------------------------------------------

export class Imposter {
  private imposter!: Seat;
  private word!: string;
  private hint!: string;
  private speakingOrder!: Seat[];
  private moves!: Move[];

  private phase!: Phase;
  private cluePos!: number;
  private log!: LogEntry[];

  private pendingVotes!: Partial<Record<Seat, Seat>>;
  private tieRound!: number;
  private tiedPlayers!: Seat[];
  private tiebreakPos!: number;

  private accused!: Seat | null;
  private pointedAt!: Seat | null;
  private eliminated!: Seat | null;
  private imposterGuess!: string | null;

  private winnerValue!: Alignment | null;
  private endReasonValue!: EndReason | null;

  constructor(options: ImposterOptions = {}) {
    const pair = options.word !== undefined ? { word: options.word, hint: options.hint ?? "" } : randomPair();
    this.setup(
      options.imposter ?? randomSeat(),
      normalizeWord(pair.word),
      pair.hint,
      options.speakingOrder ? [...options.speakingOrder] : shuffle(SEATS),
    );
  }

  /** Rebuild a game from a persisted snapshot by replaying its canonical moves. */
  static fromState(state: {
    imposter: Seat;
    word: string;
    hint: string;
    speakingOrder: Seat[];
    moves: readonly Move[];
  }): Imposter {
    const game = new Imposter({
      imposter: state.imposter,
      word: state.word,
      hint: state.hint,
      speakingOrder: state.speakingOrder,
    });
    for (const move of state.moves) {
      const ok = game.applyMove(move);
      if (!ok) throw new Error(`fromState: could not replay move ${JSON.stringify(move)}`);
    }
    return game;
  }

  /** Start a fresh game with a new random pair, imposter, and speaking order. */
  restartGame(): void {
    const pair = randomPair();
    this.setup(randomSeat(), normalizeWord(pair.word), pair.hint, shuffle(SEATS));
  }

  private setup(imposter: Seat, word: string, hint: string, speakingOrder: Seat[]): void {
    this.imposter = imposter;
    this.word = word;
    this.hint = hint;
    this.speakingOrder = speakingOrder;
    this.moves = [];
    this.phase = "clue";
    this.cluePos = 0;
    this.log = [];
    this.pendingVotes = {};
    this.tieRound = 0;
    this.tiedPlayers = [];
    this.tiebreakPos = 0;
    this.accused = null;
    this.pointedAt = null;
    this.eliminated = null;
    this.imposterGuess = null;
    this.winnerValue = null;
    this.endReasonValue = null;
  }

  // --- Actions --------------------------------------------------------------

  /** Play a one-word clue. Only the current speaker may act, during the clue phase. */
  clue(seat: Seat, word: string): boolean {
    if (this.phase !== "clue" || seat !== this.currentSpeaker) return false;
    const w = normalizeWord(word);
    if (!/^[A-Z]+$/.test(w)) return false;
    this.log.push({ kind: "clue", seat, word: w });
    this.moves.push({ type: "clue", seat, word: w });
    this.cluePos += 1;
    if (this.cluePos >= CLUE_LAPS * SEATS.length) this.beginVote("accuse");
    return true;
  }

  /** Cast a vote (accusation or final) for another player. Hidden until all four are in. */
  vote(seat: Seat, target: Seat): boolean {
    if (this.phase !== "accuse" && this.phase !== "final") return false;
    if (target === seat || !SEATS.includes(target)) return false;
    if (this.pendingVotes[seat] !== undefined) return false;
    this.pendingVotes[seat] = target;
    this.moves.push({ type: "vote", seat, target });
    if (SEATS.every((s) => this.pendingVotes[s] !== undefined)) {
      this.resolveVote(this.phase === "accuse" ? "accuse" : "final");
    }
    return true;
  }

  /**
   * A public defense. Used in three contexts (by phase): the accused defends and
   * MUST point at another player (defense phase); the pointed-at player rebuts
   * with no pointing (rebuttal phase); a tied player defends before a re-vote
   * (accuse-/final-tiebreak phase).
   */
  defend(seat: Seat, message: string, pointAt?: Seat): boolean {
    switch (this.phase) {
      case "defense": {
        if (seat !== this.accused) return false;
        if (pointAt === undefined || pointAt === seat || !SEATS.includes(pointAt)) return false;
        this.log.push({ kind: "defense", context: "accused", seat, message, pointAt });
        this.moves.push({ type: "defend", seat, message, pointAt });
        this.pointedAt = pointAt;
        this.phase = "rebuttal";
        return true;
      }
      case "rebuttal": {
        if (seat !== this.pointedAt) return false;
        this.log.push({ kind: "defense", context: "rebuttal", seat, message, pointAt: null });
        this.moves.push({ type: "defend", seat, message });
        this.beginVote("final");
        return true;
      }
      case "accuse-tiebreak":
      case "final-tiebreak": {
        if (seat !== this.tiedPlayers[this.tiebreakPos]) return false;
        this.log.push({ kind: "defense", context: "tiebreak", seat, message, pointAt: null });
        this.moves.push({ type: "defend", seat, message });
        this.tiebreakPos += 1;
        if (this.tiebreakPos >= this.tiedPlayers.length) {
          // all tied players have defended → re-open the same vote
          this.pendingVotes = {};
          this.phase = this.phase === "accuse-tiebreak" ? "accuse" : "final";
        }
        return true;
      }
      default:
        return false;
    }
  }

  /** The caught Imposter guesses the secret word to try to steal the win. */
  guessWord(word: string): boolean {
    if (this.phase !== "steal") return false;
    const w = normalizeWord(word);
    const correct = w === this.word;
    this.imposterGuess = w;
    this.log.push({ kind: "steal", word: w, correct });
    this.moves.push({ type: "guess", word: w });
    if (correct) this.endGame("imposter", "word-stolen");
    else this.endGame("crew", "imposter-voted-out");
    return true;
  }

  // --- State getters --------------------------------------------------------

  get currentPhase(): Phase {
    return this.phase;
  }
  get speakingOrderList(): Seat[] {
    return [...this.speakingOrder];
  }
  get currentSpeaker(): Seat | null {
    return this.phase === "clue" ? this.speakingOrder[this.cluePos % SEATS.length] : null;
  }
  get clues(): Clue[] {
    return this.log.filter((e): e is Extract<LogEntry, { kind: "clue" }> => e.kind === "clue").map((e) => ({ seat: e.seat, word: e.word }));
  }
  get accusedSeat(): Seat | null {
    return this.accused;
  }
  get eliminatedSeat(): Seat | null {
    return this.eliminated;
  }
  get isGameOver(): boolean {
    return this.winnerValue !== null;
  }
  get winner(): Alignment | null {
    return this.winnerValue;
  }
  get endReason(): EndReason | null {
    return this.endReasonValue;
  }

  playersToAct(): Seat[] {
    switch (this.phase) {
      case "clue":
        return this.currentSpeaker ? [this.currentSpeaker] : [];
      case "accuse":
      case "final":
        return SEATS.filter((s) => this.pendingVotes[s] === undefined);
      case "accuse-tiebreak":
      case "final-tiebreak":
        return [this.tiedPlayers[this.tiebreakPos]];
      case "defense":
        return this.accused ? [this.accused] : [];
      case "rebuttal":
        return this.pointedAt ? [this.pointedAt] : [];
      case "steal":
        return [this.imposter];
      default:
        return [];
    }
  }

  // --- Structured (object) views -------------------------------------------

  getState(): ImposterState {
    return {
      imposter: this.imposter,
      word: this.word,
      hint: this.hint,
      speakingOrder: [...this.speakingOrder],
      moves: this.moves.map((m) => ({ ...m })),
      phase: this.phase,
      roles: this.allRoles(),
      clues: this.clues,
      log: this.copyLog(),
      accused: this.accused,
      pointedAt: this.pointedAt,
      eliminated: this.eliminated,
      imposterGuess: this.imposterGuess,
      playersToAct: this.playersToAct(),
      isGameOver: this.isGameOver,
      winner: this.winner,
      endReason: this.endReason,
    };
  }

  /** Role-safe snapshot for one seat: Crew see the word (not who's imposter); the Imposter sees only its hint. */
  getPlayerState(seat: Seat): PlayerState {
    const role: Alignment = seat === this.imposter ? "imposter" : "crew";
    const over = this.isGameOver;
    return {
      seat,
      role,
      secretWord: role === "crew" || over ? this.word : null,
      hint: role === "imposter" || over ? this.hint : null,
      phase: this.phase,
      speakingOrder: [...this.speakingOrder],
      currentSpeaker: this.currentSpeaker,
      clues: this.clues,
      log: this.copyLog(),
      accused: this.accused,
      pointedAt: this.pointedAt,
      eliminated: this.eliminated,
      yourVote: this.pendingVotes[seat] ?? null,
      imposterGuess: this.imposterGuess,
      revealedRoles: over ? this.allRoles() : null,
      playersToAct: this.playersToAct(),
      isGameOver: over,
      winner: this.winner,
      endReason: this.endReason,
    };
  }

  toJSON(): ImposterState {
    return this.getState();
  }

  // --- Formatted (string) views --------------------------------------------

  /** The attributed public history as text (structured form: {@link log} via getState). */
  get formattedLog(): string {
    if (this.log.length === 0) return "No clues yet.";
    return this.log.map((e) => this.renderLogEntry(e)).join("\n");
  }

  /** The whole game as one role-appropriate string — the thing to hand a seat's player each turn. */
  formattedState(seat: Seat): string {
    const ps = this.getPlayerState(seat);
    const parts: string[] = [];
    parts.push(this.identityLine(ps));
    parts.push("");
    parts.push(this.statusLine());
    parts.push(`Players: ${SEATS.map((s) => (s === seat ? `${s} (you)` : s)).join(", ")}. Speaking order: ${this.speakingOrder.join(" → ")}.`);
    parts.push("");
    parts.push("Log:");
    parts.push(this.formattedLog);
    parts.push("");
    parts.push(this.actionPrompt(ps));
    return parts.join("\n");
  }

  // --- Internals: flow ------------------------------------------------------

  private beginVote(kind: "accuse" | "final"): void {
    this.phase = kind;
    this.pendingVotes = {};
    this.tieRound = 0;
  }

  private resolveVote(kind: "accuse" | "final"): void {
    const votes = { ...(this.pendingVotes as Record<Seat, Seat>) };
    const top = tallyTop(votes);
    const attempt = this.log.filter((e) => e.kind === "vote" && e.vote === kind).length + 1;

    if (top.length === 1) {
      this.log.push({ kind: "vote", vote: kind, attempt, votes, tied: null, winner: top[0], forced: false });
      this.onVoteWinner(kind, top[0]);
      return;
    }
    // tie
    if (this.tieRound < MAX_TIE_ROUNDS) {
      this.tieRound += 1;
      this.tiedPlayers = top;
      this.tiebreakPos = 0;
      this.log.push({ kind: "vote", vote: kind, attempt, votes, tied: top, winner: null, forced: false });
      this.phase = kind === "accuse" ? "accuse-tiebreak" : "final-tiebreak";
    } else {
      const winner = top[0]; // deterministic: earliest tied seat
      this.log.push({ kind: "vote", vote: kind, attempt, votes, tied: top, winner, forced: true });
      this.onVoteWinner(kind, winner);
    }
  }

  private onVoteWinner(kind: "accuse" | "final", seat: Seat): void {
    this.tieRound = 0;
    if (kind === "accuse") {
      this.accused = seat;
      this.phase = "defense";
    } else {
      this.eliminated = seat;
      if (seat === this.imposter) this.phase = "steal";
      else this.endGame("imposter", "crew-voted-out");
    }
  }

  private endGame(winner: Alignment, reason: EndReason): void {
    this.winnerValue = winner;
    this.endReasonValue = reason;
    this.phase = "gameover";
  }

  /** Replay one move through the public action methods (used by fromState). */
  private applyMove(move: Move): boolean {
    switch (move.type) {
      case "clue":
        return this.clue(move.seat, move.word);
      case "vote":
        return this.vote(move.seat, move.target);
      case "defend":
        return this.defend(move.seat, move.message, move.pointAt);
      case "guess":
        return this.guessWord(move.word);
    }
  }

  // --- Internals: helpers ---------------------------------------------------

  private allRoles(): Record<Seat, Alignment> {
    const roles = {} as Record<Seat, Alignment>;
    for (const s of SEATS) roles[s] = s === this.imposter ? "imposter" : "crew";
    return roles;
  }

  private copyLog(): LogEntry[] {
    return this.log.map((e) => (e.kind === "vote" ? { ...e, votes: { ...e.votes }, tied: e.tied ? [...e.tied] : null } : { ...e }));
  }

  private renderLogEntry(e: LogEntry): string {
    switch (e.kind) {
      case "clue":
        return `  Clue — ${e.seat}: ${e.word}`;
      case "vote": {
        const label = e.vote === "accuse" ? "Accusation vote" : "Final vote";
        const tally = SEATS.map((s) => `${s}→${e.votes[s]}`).join(", ");
        let outcome: string;
        if (e.winner && !e.forced) outcome = e.vote === "accuse" ? ` → accused: ${e.winner}` : ` → eliminated: ${e.winner}`;
        else if (e.winner && e.forced) outcome = ` → still tied (${e.tied!.join(", ")}) → ${e.winner} chosen (earliest seat)`;
        else outcome = ` → tie between ${e.tied!.join(", ")} → re-vote`;
        return `  ${label} #${e.attempt}: ${tally}${outcome}`;
      }
      case "defense": {
        const tag = e.context === "accused" ? "Defense" : e.context === "rebuttal" ? "Rebuttal" : "Tie-break defense";
        const point = e.pointAt ? ` (points at ${e.pointAt})` : "";
        return `  ${tag} — ${e.seat}: "${e.message}"${point}`;
      }
      case "steal":
        return `  Steal — the imposter guessed "${e.word}" (${e.correct ? "correct" : "wrong"})`;
    }
  }

  private identityLine(ps: PlayerState): string {
    if (ps.role === "crew") {
      return `You are ${ps.seat} — CREW. The secret word is "${ps.secretWord}". Give clues that prove you know it, without making it obvious to the imposter.`;
    }
    return `You are ${ps.seat} — the IMPOSTER. You do NOT know the secret word. Your only hint: "${ps.hint}". Blend in with your clues and avoid being caught.`;
  }

  private statusLine(): string {
    if (this.isGameOver) {
      const who = this.winner === "crew" ? "CREW" : "IMPOSTER";
      return `GAME OVER — ${who} wins (${this.endReason}). The word was "${this.word}"; the imposter was ${this.imposter}.`;
    }
    const phaseText: Record<Phase, string> = {
      clue: `CLUE — ${this.currentSpeaker} to give a one-word clue (lap ${Math.floor(this.cluePos / SEATS.length) + 1}/${CLUE_LAPS})`,
      accuse: "ACCUSATION VOTE — everyone votes for a suspect",
      "accuse-tiebreak": `TIE-BREAK — tied players defend before the accusation re-vote (${this.tiedPlayers.join(", ")})`,
      defense: `DEFENSE — ${this.accused} defends and points at a suspect`,
      rebuttal: `REBUTTAL — ${this.pointedAt} defends`,
      final: "FINAL VOTE — everyone votes to eliminate",
      "final-tiebreak": `TIE-BREAK — tied players defend before the final re-vote (${this.tiedPlayers.join(", ")})`,
      steal: `STEAL — the caught imposter (${this.imposter}) guesses the word`,
      gameover: "",
    };
    return `Phase: ${phaseText[this.phase]}.`;
  }

  private actionPrompt(ps: PlayerState): string {
    if (ps.isGameOver) return "The game is over.";
    if (!ps.playersToAct.includes(ps.seat)) return `Waiting on: ${ps.playersToAct.join(", ")}.`;
    switch (ps.phase) {
      case "clue":
        return ">>> Your turn: clue(word) — one word.";
      case "accuse":
        return ">>> Vote for the suspect you think is the imposter: vote(target).";
      case "final":
        return ">>> Final vote — vote to eliminate: vote(target).";
      case "accuse-tiebreak":
      case "final-tiebreak":
        return ">>> You're tied — defend yourself: defend(message).";
      case "defense":
        return ">>> You are accused. Defend yourself and point at a suspect: defend(message, pointAt).";
      case "rebuttal":
        return ">>> You were pointed at. Defend yourself: defend(message).";
      case "steal":
        return ">>> You were caught! Guess the secret word to steal the win: guessWord(word).";
      default:
        return "";
    }
  }
}

// --- Free helpers ----------------------------------------------------------

function normalizeWord(word: string): string {
  return word.trim().toUpperCase();
}

function randomSeat(): Seat {
  return SEATS[Math.floor(Math.random() * SEATS.length)];
}

function randomPair(): { word: string; hint: string } {
  const p = WORD_HINTS[Math.floor(Math.random() * WORD_HINTS.length)];
  return { word: p.word, hint: p.hint };
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The seats tied for the most votes, in seat order (length 1 = a clear winner). */
function tallyTop(votes: Record<Seat, Seat>): Seat[] {
  const counts: Record<string, number> = {};
  for (const target of Object.values(votes)) counts[target] = (counts[target] ?? 0) + 1;
  let max = 0;
  for (const s of SEATS) max = Math.max(max, counts[s] ?? 0);
  return SEATS.filter((s) => (counts[s] ?? 0) === max);
}
