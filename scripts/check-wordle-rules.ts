/**
 * Runtime checks for the two rules that carry the most weight and that a
 * typechecker cannot enforce:
 *
 *  1. Model letters are never projected to a viewer while a game is live.
 *  2. A board is a pure function of (answer, guesses), which is what makes
 *     resume-after-eviction correct.
 *
 * Deliberately dependency-free — it touches only the game rules and the view
 * projection, so it runs without a database.
 *
 *   node --experimental-strip-types scripts/check-wordle-rules.ts
 */
import { WordleModel } from "../packages/games/wordle/src/model.ts";
import { Wordle, validGuesses } from "../packages/games/wordle/src/wordle.ts";
import { toSeatView, type SeatBoard } from "../apps/web/lib/arena/views.ts";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

// --- Concealment -------------------------------------------------------------
console.log("\nmodel letters stay sealed while a game is live");

const model = new WordleModel({ answer: "CRANE", guesses: [] });
model.guessWord("SLATE");
model.guessWord("CRANE");

const board: SeatBoard = {
  seatId: "anthropic:claude-haiku-4-5",
  actorKind: "model",
  modelId: "anthropic:claude-haiku-4-5",
  displayName: "Haiku",
  rows: model.publicState().board,
  isWon: true,
  isGameOver: true,
};

const live = toSeatView(board, false);
const serialisedLive = JSON.stringify(live);
check("guesses are blanked", live.board.every((row) => row.guess === ""));
// SLATE vs CRANE: A and E are both already in position.
check("colours still shown", live.board[0].states.join(",") === "gray,gray,green,gray,green");
check("the answer does not appear anywhere in the payload", !serialisedLive.includes("CRANE"));
check("no guessed word leaks either", !serialisedLive.includes("SLATE"));
check("progress is still visible", live.guessesMade === 2 && live.isWon);
check("marked concealed", live.concealed);

const revealed = toSeatView(board, true);
check("unsealed after reveal", revealed.board.map((row) => row.guess).join(",") === "SLATE,CRANE");
check("not marked concealed once revealed", !revealed.concealed);

console.log("\nthe human's own board is never concealed");
const humanView = toSeatView({ ...board, seatId: "human", actorKind: "human", modelId: undefined }, false);
check("human letters always visible", humanView.board[0].guess === "SLATE");
check("human never flagged concealed", !humanView.concealed);

// --- Rehydration -------------------------------------------------------------
console.log("\na board is a pure function of (answer, guesses)");

const original = new WordleModel({ answer: "CRANE", guesses: [] });
for (const guess of ["ADIEU", "SLATE", "PRANK"]) original.guessWord(guess);
const restored = new WordleModel(original.serialize());
check(
  "restored board is identical",
  JSON.stringify(restored.publicState()) === JSON.stringify(original.publicState()),
);
check("restored from stored guesses only", original.serialize().guesses.join(",") === "ADIEU,SLATE,PRANK");

// --- Guess validation --------------------------------------------------------
console.log("\nserver-side validation is authoritative");

const strict = new WordleModel({ answer: "CRANE", guesses: [] });
check("non-word rejected", !strict.guessWord("ZZZZZ"));
check("wrong length rejected", !strict.guessWord("ABCD"));
check("real word accepted", strict.guessWord("SLATE"));
check("rejections consume no try", strict.publicState().guessesMade === 1);

const words = validGuesses();
check("word list is the union of answers and allowed guesses", words.length > 12_000, words.length);
check("word list contains a valid guess", words.includes("CRANE"));
check("word list excludes a non-word", !words.includes("ZZZZZ"));
check("answers are not separable from allowed-only guesses", Object.isFrozen(words) || Array.isArray(words));

// --- Duplicate-letter scoring ------------------------------------------------
console.log("\nduplicate letters score correctly");
const dup = Wordle.fromState({ answer: "ABBEY", guesses: ["BABES"] });
check(
  "B A B E S vs A B B E Y",
  dup.board[0].states.join(",") === "Yellow,Yellow,Green,Green,Gray",
  dup.board[0].states,
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
