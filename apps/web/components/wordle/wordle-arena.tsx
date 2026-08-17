"use client";

import {
  DeleteIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWordleGame } from "@/lib/wordle/use-wordle-game";
import {
  WORDLE_MAX_TRIES,
  WORDLE_WORD_LENGTH,
  type GameStatus,
  type WordleGuessRow,
  type WordleLetterState,
  type WordleSeatView,
} from "@/lib/wordle/types";
import { cn } from "@/lib/utils";

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function WordleArena({ gameId }: Readonly<{ gameId: string }>) {
  const { snapshot, loadError, actionError, pendingGuess, submitGuess, forfeit, clearActionError } =
    useWordleGame(gameId);
  const [draft, setDraft] = useState("");
  const [replayTurn, setReplayTurn] = useState<number | null>(null);
  const [confirmingQuit, setConfirmingQuit] = useState(false);

  const you = snapshot?.you;
  const revealed = snapshot?.revealed ?? false;
  const keyboard = useMemo(() => keyboardState(you?.board ?? []), [you?.board]);
  const canInput = Boolean(
    snapshot &&
    snapshot.status === "in_progress" &&
    you &&
    !you.isGameOver &&
    !pendingGuess &&
    replayTurn === null,
  );
  const shownTurns = replayTurn ?? WORDLE_MAX_TRIES;

  // Step the replay one row at a time.
  useEffect(() => {
    if (replayTurn === null || replayTurn >= WORDLE_MAX_TRIES) return;
    const timeout = setTimeout(() => setReplayTurn((turn) => (turn === null ? null : turn + 1)), 650);
    return () => clearTimeout(timeout);
  }, [replayTurn]);

  const send = useCallback(async () => {
    if (!canInput) return;
    await submitGuess(draft);
    setDraft("");
  }, [canInput, draft, submitGuess]);

  const pressLetter = useCallback((letter: string) => {
    if (!canInput) return;
    setDraft((current) => (current.length < WORDLE_WORD_LENGTH ? current + letter : current));
    clearActionError();
  }, [canInput, clearActionError]);

  const deleteLetter = useCallback(() => {
    if (!canInput) return;
    setDraft((current) => current.slice(0, -1));
    clearActionError();
  }, [canInput, clearActionError]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[a-zA-Z]$/.test(event.key)) pressLetter(event.key.toUpperCase());
      else if (event.key === "Backspace") deleteLetter();
      else if (event.key === "Enter") void send();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteLetter, pressLetter, send]);

  if (!snapshot || !you) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        {loadError ? (
          <Alert variant="destructive" className="max-w-md">
            <AlertTitle>Game unavailable</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Opening the board
          </div>
        )}
      </div>
    );
  }

  const canQuit = snapshot.status === "in_progress" && !you.isGameOver;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 py-7 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Wordle</h1>
            <StatusBadge status={snapshot.status} />
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            {matchStatus(snapshot.status, you, revealed, Boolean(pendingGuess))}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canQuit && (
            <Button onClick={() => setConfirmingQuit(true)} size="sm" variant="ghost">
              <FlagIcon data-icon="inline-start" />
              Quit
            </Button>
          )}
          {revealed && (
            <Button onClick={() => setReplayTurn((turn) => (turn === null ? 0 : null))} variant="outline">
              <RotateCcwIcon data-icon="inline-start" />
              {replayTurn === null ? "Replay boards" : "Back to results"}
            </Button>
          )}
        </div>
      </header>

      {confirmingQuit && canQuit && (
        <Alert>
          <AlertTitle>Quit this game?</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your board will be forfeited and left out of the human stats. The models finish their
              boards either way, and you can start a new game straight after.
            </span>
            <span className="flex gap-2">
              <Button onClick={() => setConfirmingQuit(false)} size="sm" variant="ghost">Keep playing</Button>
              <Button
                onClick={() => {
                  setConfirmingQuit(false);
                  void forfeit();
                }}
                size="sm"
                variant="destructive"
              >
                Quit game
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {revealed && snapshot.answer && (
        <section className="flex flex-wrap items-center justify-between gap-3 border-y py-4">
          <div className="flex flex-col gap-1">
            <p className="font-heading text-lg font-medium">
              {you.isWon ? `Solved in ${you.guessesMade}` : "Round complete"}
            </p>
            <p className="text-sm text-muted-foreground">All opponent boards are now unsealed.</p>
          </div>
          <p className="font-mono text-xl font-semibold">{snapshot.answer}</p>
        </section>
      )}

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] xl:gap-16">
        <section aria-labelledby="your-board-title" className="flex flex-col items-center gap-6">
          <div className="flex w-full max-w-sm items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium" id="your-board-title">
                {you.displayName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {replayTurn === null
                  ? `${you.triesRemaining} guesses remaining`
                  : `Replay turn ${replayTurn} of ${WORDLE_MAX_TRIES}`}
              </p>
            </div>
            <Badge variant={you.isWon ? "default" : "outline"}>{humanBoardLabel(you)}</Badge>
          </div>

          <WordleBoard
            currentGuess={replayTurn === null ? (pendingGuess ?? draft) : ""}
            rows={you.board}
            size="large"
            visibleTurns={shownTurns}
          />

          <div className="flex min-h-10 w-full items-center justify-center text-center text-sm">
            {pendingGuess ? (
              <span className="flex items-center gap-2 text-muted-foreground"><Spinner />Checking guess</span>
            ) : actionError ? (
              <span className="text-destructive">{actionError}</span>
            ) : canInput ? (
              <span className="text-muted-foreground">Type or use the keyboard below.</span>
            ) : null}
          </div>

          <WordleKeyboard
            disabled={!canInput}
            guessComplete={draft.length === WORDLE_WORD_LENGTH}
            onDelete={deleteLetter}
            onEnter={() => void send()}
            onLetter={pressLetter}
            states={keyboard}
          />
        </section>

        <section aria-labelledby="model-boards-title" className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium" id="model-boards-title">Model boards</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {revealed ? "Every finished guess is visible." : "Model progress refreshes while their letters stay sealed."}
              </p>
            </div>
            {revealed
              ? <EyeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              : <EyeOffIcon aria-hidden="true" className="size-4 text-muted-foreground" />}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {snapshot.models.map((seat) => (
              <article className="flex min-w-0 flex-col gap-5 rounded-md border bg-card/70 p-4" key={seat.seatId}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">{seat.displayName}</h3>
                    <p className="truncate text-xs text-muted-foreground">{seat.seatId.split("/")[0]}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {modelBoardLabel(seat, revealed)}
                  </span>
                </div>
                <WordleBoard
                  concealed={seat.concealed}
                  rows={seat.board}
                  size="compact"
                  visibleTurns={shownTurns}
                />
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Concealed rows arrive from the server with empty `guess` strings — the letters
 * are never sent while a game is live. `concealed` here only adjusts the
 * accessible label; it is not what does the hiding.
 */
function WordleBoard({
  rows,
  currentGuess = "",
  concealed = false,
  size,
  visibleTurns,
}: Readonly<{
  rows: WordleGuessRow[];
  currentGuess?: string;
  concealed?: boolean;
  size: "large" | "compact";
  visibleTurns: number;
}>) {
  const previousRowCount = useRef(rows.length);
  const [revealingRowIndex, setRevealingRowIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    setRevealingRowIndex(
      rows.length > previousRowCount.current ? rows.length - 1 : null,
    );
    previousRowCount.current = rows.length;
  }, [rows.length]);

  return (
    <div
      aria-label="Wordle board"
      className={cn("grid w-fit grid-rows-6 self-center", size === "large" ? "gap-1.5" : "gap-1")}
      role="grid"
    >
      {Array.from({ length: WORDLE_MAX_TRIES }, (_, rowIndex) => {
        const row = rowIndex < visibleTurns ? rows[rowIndex] : undefined;
        const draft = !row && rowIndex === rows.length && visibleTurns === WORDLE_MAX_TRIES ? currentGuess : "";
        return (
          <div className={cn("grid w-fit grid-cols-5", size === "large" ? "gap-1.5" : "gap-1")} key={rowIndex} role="row">
            {Array.from({ length: WORDLE_WORD_LENGTH }, (_, columnIndex) => {
              const letter = row ? row.guess[columnIndex] ?? "" : draft[columnIndex] ?? "";
              const letterState = row?.states[columnIndex];
              const shouldReveal = Boolean(
                letterState && size === "large" && rowIndex === revealingRowIndex,
              );
              return (
                <div
                  aria-label={tileLabel(letter, letterState, concealed)}
                  className={cn(
                    "grid place-items-center border-2 font-bold uppercase",
                    size === "large" ? "size-13 text-2xl sm:size-15 sm:text-3xl" : "size-8 text-sm sm:size-9 sm:text-base",
                    tileClasses(letterState, Boolean(letter)),
                    shouldReveal && "wordle-tile-reveal",
                  )}
                  data-state={letterState}
                  key={`${rowIndex}-${columnIndex}-${letterState ?? "empty"}`}
                  role="gridcell"
                  style={shouldReveal ? { animationDelay: `${columnIndex * 250}ms` } : undefined}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function WordleKeyboard({
  states,
  disabled,
  guessComplete,
  onLetter,
  onDelete,
  onEnter,
}: Readonly<{
  states: Record<string, WordleLetterState | undefined>;
  disabled: boolean;
  guessComplete: boolean;
  onLetter: (letter: string) => void;
  onDelete: () => void;
  onEnter: () => void;
}>) {
  return (
    <div aria-label="Wordle keyboard" className="flex w-full max-w-md flex-col gap-1.5">
      {KEY_ROWS.map((row, rowIndex) => (
        <div className="flex w-full justify-center gap-1.5" key={row}>
          {rowIndex === 2 && (
            <button
              className="h-12 min-w-14 flex-[1.5] rounded-sm bg-wordle-key-unused px-2 text-xs font-semibold text-wordle-key-unused-foreground transition-opacity hover:opacity-80 disabled:cursor-default"
              disabled={disabled || !guessComplete}
              onClick={onEnter}
              type="button"
            >
              Enter
            </button>
          )}
          {[...row].map((letter) => (
            <button
              aria-label={letter}
              className={cn(
                "h-12 min-w-7 flex-1 rounded-sm text-sm font-semibold transition-opacity disabled:cursor-default",
                keyboardClasses(states[letter]),
              )}
              disabled={disabled}
              key={letter}
              onClick={() => onLetter(letter)}
              type="button"
            >
              {letter}
            </button>
          ))}
          {rowIndex === 2 && (
            <button
              aria-label="Delete letter"
              className="grid h-12 min-w-12 flex-[1.25] place-items-center rounded-sm bg-wordle-key-unused text-wordle-key-unused-foreground transition-opacity hover:opacity-80 disabled:cursor-default"
              disabled={disabled}
              onClick={onDelete}
              type="button"
            >
              <DeleteIcon className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: GameStatus }>) {
  const variants: Record<GameStatus, "default" | "secondary" | "outline"> = {
    in_progress: "outline",
    completed: "default",
    forfeited: "secondary",
  };
  const labels: Record<GameStatus, string> = {
    in_progress: "Live",
    completed: "Complete",
    forfeited: "Forfeited",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function keyboardState(rows: WordleGuessRow[]): Record<string, WordleLetterState | undefined> {
  const result: Record<string, WordleLetterState | undefined> = {};
  const rank: Record<WordleLetterState, number> = { gray: 0, yellow: 1, green: 2 };
  for (const row of rows) {
    [...row.guess].forEach((letter, index) => {
      const next = row.states[index];
      const current = result[letter];
      if (next && (!current || rank[next] > rank[current])) result[letter] = next;
    });
  }
  return result;
}

function tileClasses(state: WordleLetterState | undefined, hasLetter: boolean): string {
  if (state === "green") return "border-wordle-correct bg-wordle-correct text-wordle-correct-foreground";
  if (state === "yellow") return "border-wordle-present bg-wordle-present text-wordle-present-foreground";
  if (state === "gray") return "border-wordle-absent bg-wordle-absent text-wordle-absent-foreground";
  return hasLetter ? "border-foreground/50 bg-background text-foreground" : "border-foreground/20 bg-background";
}

function keyboardClasses(state: WordleLetterState | undefined): string {
  if (state === "green") return "bg-wordle-key-correct text-wordle-key-evaluated-foreground hover:opacity-80";
  if (state === "yellow") return "bg-wordle-key-present text-wordle-key-evaluated-foreground hover:opacity-80";
  if (state === "gray") return "bg-wordle-key-absent text-wordle-key-evaluated-foreground hover:opacity-80";
  return "bg-wordle-key-unused text-wordle-key-unused-foreground hover:opacity-80";
}

function tileLabel(letter: string, state: WordleLetterState | undefined, concealed: boolean): string {
  if (!state) return letter ? `${letter}, not submitted` : "Empty tile";
  return concealed ? `Hidden letter, ${state}` : `${letter}, ${state}`;
}

function humanBoardLabel(seat: WordleSeatView): string {
  if (seat.isWon) return "Solved";
  if (seat.isGameOver) return "Not solved";
  return `${seat.guessesMade}/${WORDLE_MAX_TRIES}`;
}

function modelBoardLabel(seat: WordleSeatView, revealed: boolean): string {
  if (seat.status === "failed") return "Unavailable";
  if (!revealed) {
    if (seat.isGameOver) return "Finished";
    return "Thinking...";
  }
  if (seat.isWon) return `Solved in ${seat.guessesMade}`;
  if (seat.isGameOver) return "Not solved";
  return "Unfinished";
}

function matchStatus(
  status: GameStatus,
  you: WordleSeatView,
  revealed: boolean,
  submitting: boolean,
): string {
  if (status === "forfeited") return "You quit this round. The word is revealed below.";
  if (submitting) return "Your guess is being scored.";
  if (revealed) return "Your board is complete. Model results appear as they finish.";
  if (you.isGameOver) return "Your board is complete. Unsealing the model games now.";
  return `Your turn: guess ${you.guessesMade + 1} of ${WORDLE_MAX_TRIES}.`;
}
