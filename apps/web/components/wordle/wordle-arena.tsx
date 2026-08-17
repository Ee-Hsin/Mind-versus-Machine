"use client";

import {
  DeleteIcon,
  FlagIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { WordleLaunchDialog } from "@/components/wordle/wordle-launch-dialog";
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
  const showKeyboard = Boolean(
    snapshot &&
    you &&
    snapshot.status === "in_progress" &&
    !you.isGameOver &&
    replayTurn === null,
  );
  const shownTurns = replayTurn ?? WORDLE_MAX_TRIES;

  // Step the replay one row at a time.
  useEffect(() => {
    if (replayTurn === null) return;
    if (replayTurn >= WORDLE_MAX_TRIES) {
      setReplayTurn(null);
      return;
    }
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
  const canRestart = you.isGameOver || snapshot.status === "forfeited";
  const hasSingleModel = snapshot.models.length === 1;
  const result = resultBanner(snapshot.status, you);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col py-7 sm:py-10 lg:box-border lg:h-[calc(100svh-4.5rem)] lg:overflow-hidden lg:py-5">

      <Dialog open={confirmingQuit} onOpenChange={setConfirmingQuit}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center text-center">
            <DialogTitle>Quit this game?</DialogTitle>
            <DialogDescription>Your board will be forfeited.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center sm:justify-center">
            <Button onClick={() => setConfirmingQuit(false)} variant="ghost">Keep playing</Button>
            <Button
              onClick={() => {
                setConfirmingQuit(false);
                void forfeit();
              }}
              variant="destructive"
            >
              Quit game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {revealed && snapshot.answer && (
        <section className={cn("mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-4", result.className)}>
          <div className="flex flex-col gap-1">
            <p className="font-heading text-lg font-medium">
              {result.title}
            </p>
            <p className="text-sm text-muted-foreground">{result.description}</p>
          </div>
          <p className="font-mono text-xl font-semibold">{snapshot.answer}</p>
        </section>
      )}

      <div className="grid items-start gap-12 lg:min-h-0 lg:flex-1 lg:items-stretch lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] xl:gap-16">
        <section aria-labelledby="your-board-title" className="flex flex-col items-center gap-6">
          <div className="flex w-full max-w-sm items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium" id="your-board-title">
                {you.displayName}
              </h2>
              {replayTurn !== null && <p className="text-sm text-muted-foreground">Replay turn {replayTurn} of {WORDLE_MAX_TRIES}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={you.isWon ? "default" : "outline"}>{humanBoardLabel(you)}</Badge>
              {canQuit && (
                <Button onClick={() => setConfirmingQuit(true)} size="sm" variant="ghost">
                  <FlagIcon data-icon="inline-start" />
                  Quit
                </Button>
              )}
              {revealed && (
                <Button disabled={replayTurn !== null} onClick={() => setReplayTurn(0)} size="sm" variant="outline">
                  <RotateCcwIcon data-icon="inline-start" />
                  Replay
                </Button>
              )}
              {canRestart && <WordleLaunchDialog buttonLabel="Restart" compact />}
            </div>
          </div>

          <WordleBoard
            currentGuess={replayTurn === null ? (pendingGuess ?? draft) : ""}
            rows={you.board}
            size="large"
            visibleTurns={shownTurns}
          />

          {showKeyboard && (
            <>
              <div className="-my-2 flex min-h-6 w-full items-center justify-center text-center text-sm">
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
            </>
          )}
        </section>

        <section aria-labelledby="model-boards-title" className="flex min-w-0 flex-col gap-5 lg:min-h-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium" id="model-boards-title">Model boards</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {revealed ? "Every finished guess is visible." : "Model progress refreshes while their letters stay sealed."}
              </p>
            </div>
          </div>

          <div className={cn(
            "grid auto-rows-max gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2",
            hasSingleModel ? "sm:grid-cols-1" : "sm:grid-cols-2",
          )}>
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
                  size={hasSingleModel ? "large" : "compact"}
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

function resultBanner(status: GameStatus, you: WordleSeatView) {
  if (status === "forfeited") {
    return {
      className: "border-destructive/60 bg-destructive/15",
      title: "Game forfeited",
      description: "Opponent boards are now unsealed.",
    };
  }
  if (you.isWon) {
    return {
      className: "border-wordle-correct/60 bg-wordle-correct/15",
      title: `Solved in ${you.guessesMade}`,
      description: "Opponent boards are now unsealed.",
    };
  }
  return {
    className: "border-wordle-present/60 bg-wordle-present/15",
    title: "Round complete",
    description: "Opponent boards are now unsealed.",
  };
}
