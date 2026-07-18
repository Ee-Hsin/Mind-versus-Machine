"use client";

import type {
  ArenaEvent,
  EventVisibility,
  PendingTurn,
  RunStatus,
  RunSummary,
  ViewerSession,
  WordleLetterState,
  WordlePublicState,
} from "@ai-ramp/protocol";
import {
  DeleteIcon,
  EyeIcon,
  EyeOffIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const HUMAN_ID = "human-wordle";
const MAX_TRIES = 6;
const EMPTY_STATE: WordlePublicState = {
  board: [],
  guessesMade: 0,
  triesRemaining: MAX_TRIES,
  isWon: false,
  isGameOver: false,
};
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

interface WordleSnapshot {
  run: RunSummary<"wordle">;
  events: ArenaEvent<"wordle">[];
  viewer: ViewerSession | null;
  pendingTurn: PendingTurn | null;
  visibility: EventVisibility;
}

interface WordleTurnPayload {
  playerId: string;
  action: { guess: string } | null;
  accepted: boolean;
  attempt: number;
  revealed?: boolean;
  state: WordlePublicState;
}

export function WordleArena({ runId }: Readonly<{ runId: string }>) {
  const [snapshot, setSnapshot] = useState<WordleSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [submittingTurn, setSubmittingTurn] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissedErrorSequence, setDismissedErrorSequence] = useState(0);
  const [replayTurn, setReplayTurn] = useState<number | null>(null);

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 404 ? "This match could not be found." : "Could not load the match.");
    const next = await response.json() as WordleSnapshot;
    setSnapshot(next);
    setLoadError(null);
    return isTerminal(next.run.status);
  }, [runId]);

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const terminal = await fetchSnapshot();
        if (active && !terminal) timeout = setTimeout(poll, 700);
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load the match.");
          timeout = setTimeout(poll, 2_000);
        }
      }
    }
    void poll();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [fetchSnapshot]);

  const humanState = useMemo(
    () => latestStateFor(snapshot?.events ?? [], HUMAN_ID) ?? EMPTY_STATE,
    [snapshot?.events],
  );
  const latestHumanTurn = useMemo(
    () => latestTurnFor(snapshot?.events ?? [], HUMAN_ID),
    [snapshot?.events],
  );
  const keyboard = useMemo(() => keyboardState(humanState), [humanState]);
  const canReveal = snapshot?.visibility !== "live" && humanState.isGameOver;
  const pendingTurn = snapshot?.pendingTurn?.seatId === HUMAN_ID ? snapshot.pendingTurn : null;
  const canInput = Boolean(
    snapshot?.run.status === "running" &&
    pendingTurn &&
    !humanState.isGameOver &&
    !submittingTurn &&
    replayTurn === null,
  );
  const rejectedGuess = latestHumanTurn &&
    !latestHumanTurn.payload.accepted &&
    latestHumanTurn.event.sequence > dismissedErrorSequence
    ? latestHumanTurn.payload.action?.guess
    : null;
  const shownTurns = replayTurn ?? MAX_TRIES;

  useEffect(() => {
    if (replayTurn === null || replayTurn >= MAX_TRIES) return;
    const timeout = setTimeout(() => setReplayTurn((turn) => turn === null ? null : turn + 1), 650);
    return () => clearTimeout(timeout);
  }, [replayTurn]);

  const submitGuess = useCallback(async () => {
    if (!snapshot || !pendingTurn || !canInput || guess.length !== 5) {
      if (guess.length !== 5) setActionError("Enter five letters.");
      return;
    }
    setSubmittingTurn(pendingTurn.turnId);
    setActionError(null);
    try {
      const response = await fetch(`/api/runs/${snapshot.run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnId: pendingTurn.turnId,
          action: { guess },
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("That turn could not be submitted.");
      setGuess("");
      await fetchSnapshot();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That turn could not be submitted.");
    } finally {
      setSubmittingTurn(null);
    }
  }, [canInput, fetchSnapshot, guess, pendingTurn, snapshot]);

  const pressLetter = useCallback((letter: string) => {
    if (!canInput) return;
    setGuess((current) => current.length < 5 ? current + letter : current);
    setActionError(null);
    if (latestHumanTurn) setDismissedErrorSequence(latestHumanTurn.event.sequence);
  }, [canInput, latestHumanTurn]);

  const deleteLetter = useCallback(() => {
    if (!canInput) return;
    setGuess((current) => current.slice(0, -1));
    setActionError(null);
    if (latestHumanTurn) setDismissedErrorSequence(latestHumanTurn.event.sequence);
  }, [canInput, latestHumanTurn]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[a-zA-Z]$/.test(event.key)) pressLetter(event.key.toUpperCase());
      else if (event.key === "Backspace") deleteLetter();
      else if (event.key === "Enter") void submitGuess();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteLetter, pressLetter, submitGuess]);

  async function readyMatch() {
    setActionError(null);
    const response = await fetch(`/api/runs/${runId}/ready`, { method: "POST" });
    if (!response.ok) {
      setActionError("Could not start this match.");
      return;
    }
    await fetchSnapshot();
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        {loadError ? (
          <Alert variant="destructive" className="max-w-md">
            <AlertTitle>Match unavailable</AlertTitle>
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

  const modelStates = snapshot.run.config.models.map((model) => ({
    model,
    state: latestStateFor(snapshot.events, model.id) ?? EMPTY_STATE,
  }));
  const statusCopy = matchStatus(snapshot.run.status, humanState, pendingTurn, submittingTurn, canReveal);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 py-7 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Wordle</h1>
            <StatusBadge status={snapshot.run.status} />
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">{statusCopy}</p>
        </div>

        {canReveal && (
          <Button
            onClick={() => setReplayTurn((turn) => turn === null ? 0 : null)}
            variant="outline"
          >
            <RotateCcwIcon data-icon="inline-start" />
            {replayTurn === null ? "Replay boards" : "Back to results"}
          </Button>
        )}
      </header>

      {snapshot.run.status === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>The match stopped</AlertTitle>
          <AlertDescription>The worker could not finish this round. Return to Games to start another.</AlertDescription>
        </Alert>
      )}

      {snapshot.run.status === "lobby" && (
        <Alert>
          <AlertTitle>Ready when you are</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>This match has not entered the queue yet.</span>
            <Button onClick={() => void readyMatch()} size="sm">Start game</Button>
          </AlertDescription>
        </Alert>
      )}

      {canReveal && humanState.answer && (
        <section className="flex flex-wrap items-center justify-between gap-3 border-y py-4">
          <div className="flex flex-col gap-1">
            <p className="font-heading text-lg font-medium">
              {humanState.isWon ? `Solved in ${humanState.guessesMade}` : "Round complete"}
            </p>
            <p className="text-sm text-muted-foreground">All opponent boards are now unsealed.</p>
          </div>
          <p className="font-mono text-xl font-semibold">{humanState.answer}</p>
        </section>
      )}

      <div className="grid items-start gap-12 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] xl:gap-16">
        <section aria-labelledby="your-board-title" className="flex flex-col items-center gap-6">
          <div className="flex w-full max-w-sm items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium" id="your-board-title">
                {snapshot.viewer?.displayName ?? "Your board"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {replayTurn === null ? `${humanState.triesRemaining} guesses remaining` : `Replay turn ${replayTurn} of 6`}
              </p>
            </div>
            <Badge variant={humanState.isWon ? "default" : "outline"}>{humanBoardLabel(humanState)}</Badge>
          </div>

          <WordleBoard
            currentGuess={replayTurn === null ? guess : ""}
            size="large"
            state={humanState}
            visibleTurns={shownTurns}
          />

          <div className="flex min-h-10 w-full items-center justify-center text-center text-sm">
            {submittingTurn ? (
              <span className="flex items-center gap-2 text-muted-foreground"><Spinner />Checking guess</span>
            ) : actionError ? (
              <span className="text-destructive">{actionError}</span>
            ) : rejectedGuess ? (
              <span className="text-destructive">{rejectedGuess} is not in the word list.</span>
            ) : canInput ? (
              <span className="text-muted-foreground">Type or use the keyboard below.</span>
            ) : snapshot.run.status === "queued" ? (
              <span className="flex items-center gap-2 text-muted-foreground"><Spinner />Waiting for a worker</span>
            ) : null}
          </div>

          <WordleKeyboard
            disabled={!canInput}
            guessComplete={guess.length === 5}
            onDelete={deleteLetter}
            onEnter={() => void submitGuess()}
            onLetter={pressLetter}
            states={keyboard}
          />
        </section>

        <section aria-labelledby="model-boards-title" className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium" id="model-boards-title">Model boards</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {canReveal ? "Every guess is visible." : "Tile feedback is live. Letters stay sealed while you play."}
              </p>
            </div>
            {canReveal
              ? <EyeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              : <EyeOffIcon aria-hidden="true" className="size-4 text-muted-foreground" />}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {modelStates.map(({ model, state }) => (
              <article className="flex min-w-0 flex-col gap-5 rounded-md border bg-card/70 p-4" key={model.id}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">{model.displayName}</h3>
                    <p className="truncate text-xs text-muted-foreground">{model.id.split(":")[0]}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {modelBoardLabel(state, canReveal)}
                  </span>
                </div>
                <WordleBoard
                  concealed={!canReveal}
                  size="compact"
                  state={state}
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

function WordleBoard({
  state,
  currentGuess = "",
  concealed = false,
  size,
  visibleTurns,
}: Readonly<{
  state: WordlePublicState;
  currentGuess?: string;
  concealed?: boolean;
  size: "large" | "compact";
  visibleTurns: number;
}>) {
  return (
    <div
      aria-label="Wordle board"
      className={cn("grid w-fit grid-rows-6 self-center", size === "large" ? "gap-1.5" : "gap-1")}
      role="grid"
    >
      {Array.from({ length: MAX_TRIES }, (_, rowIndex) => {
        const row = rowIndex < visibleTurns ? state.board[rowIndex] : undefined;
        const draft = !row && rowIndex === state.board.length && visibleTurns === MAX_TRIES ? currentGuess : "";
        return (
          <div className={cn("grid w-fit grid-cols-5", size === "large" ? "gap-1.5" : "gap-1")} key={rowIndex} role="row">
            {Array.from({ length: 5 }, (_, columnIndex) => {
              const letter = row && !concealed ? row.guess[columnIndex] ?? "" : draft[columnIndex] ?? "";
              const letterState = row?.states[columnIndex];
              return (
                <div
                  aria-label={tileLabel(letter, letterState, concealed)}
                  className={cn(
                    "grid place-items-center border-2 font-bold uppercase",
                    size === "large" ? "size-13 text-2xl sm:size-15 sm:text-3xl" : "size-8 text-sm sm:size-9 sm:text-base",
                    tileClasses(letterState, Boolean(letter)),
                    letterState && "wordle-tile-reveal",
                  )}
                  key={`${rowIndex}-${columnIndex}-${letterState ?? "empty"}`}
                  role="gridcell"
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
              className="h-12 min-w-14 flex-[1.5] rounded-sm bg-secondary px-2 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-50"
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
                "h-12 min-w-7 flex-1 rounded-sm text-sm font-semibold transition-colors disabled:opacity-50",
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
              className="grid h-12 min-w-12 flex-[1.25] place-items-center rounded-sm bg-secondary transition-colors hover:bg-muted disabled:opacity-50"
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

function StatusBadge({ status }: Readonly<{ status: RunStatus }>) {
  const variants: Record<RunStatus, "default" | "secondary" | "destructive" | "outline"> = {
    lobby: "secondary",
    queued: "secondary",
    running: "outline",
    completed: "default",
    failed: "destructive",
    cancelled: "secondary",
  };
  const labels: Record<RunStatus, string> = {
    lobby: "Lobby",
    queued: "Queued",
    running: "Live",
    completed: "Complete",
    failed: "Stopped",
    cancelled: "Cancelled",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function latestStateFor(events: ArenaEvent<"wordle">[], actorId: string): WordlePublicState | null {
  return latestTurnFor(events, actorId)?.payload.state ?? null;
}

function latestTurnFor(events: ArenaEvent<"wordle">[], actorId: string) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.gameId !== actorId || (event.type !== "turn" && event.type !== "turn_reveal")) continue;
    const payload = event.payload as Partial<WordleTurnPayload> | null;
    if (payload?.playerId === actorId && payload.state) {
      return { event, payload: payload as WordleTurnPayload };
    }
  }
  return null;
}

function keyboardState(state: WordlePublicState): Record<string, WordleLetterState | undefined> {
  const result: Record<string, WordleLetterState | undefined> = {};
  const rank: Record<WordleLetterState, number> = { gray: 0, yellow: 1, green: 2 };
  for (const row of state.board) {
    [...row.guess].forEach((letter, index) => {
      const next = row.states[index];
      const current = result[letter];
      if (!current || rank[next] > rank[current]) result[letter] = next;
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
  if (state === "green") return "bg-wordle-correct text-wordle-correct-foreground hover:bg-wordle-correct/90";
  if (state === "yellow") return "bg-wordle-present text-wordle-present-foreground hover:bg-wordle-present/90";
  if (state === "gray") return "bg-wordle-absent text-wordle-absent-foreground hover:bg-wordle-absent/90";
  return "bg-secondary text-secondary-foreground hover:bg-muted";
}

function tileLabel(letter: string, state: WordleLetterState | undefined, concealed: boolean): string {
  if (!state) return letter ? `${letter}, not submitted` : "Empty tile";
  return concealed ? `Hidden letter, ${state}` : `${letter}, ${state}`;
}

function humanBoardLabel(state: WordlePublicState): string {
  if (state.isWon) return "Solved";
  if (state.isGameOver) return "Not solved";
  return `${state.guessesMade}/6`;
}

function modelBoardLabel(state: WordlePublicState, revealed: boolean): string {
  if (!revealed) {
    if (state.isGameOver) return "Finished";
    return state.guessesMade > 0 ? `Guess ${state.guessesMade}` : "Thinking";
  }
  if (state.isWon) return `Solved in ${state.guessesMade}`;
  if (state.isGameOver) return "Not solved";
  return "Thinking";
}

function matchStatus(
  status: RunStatus,
  humanState: WordlePublicState,
  pending: PendingTurn | null,
  submitting: string | null,
  revealed: boolean,
): string {
  if (status === "lobby") return "One word, one board each. Start when you are ready.";
  if (status === "queued") return "Your match is queued. The boards will appear when a worker picks it up.";
  if (status === "failed") return "This round ended before all boards could finish.";
  if (status === "cancelled") return "This round was cancelled.";
  if (revealed) return "Your board is complete. Compare every guess, result, and route to the answer.";
  if (humanState.isGameOver) return "Your board is complete. Unsealing the model games now.";
  if (submitting) return "Your guess is being scored.";
  if (pending) return `Your turn: guess ${humanState.guessesMade + 1} of 6.`;
  return "The models are joining the round.";
}

function isTerminal(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
