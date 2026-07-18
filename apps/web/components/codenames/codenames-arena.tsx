"use client";

import type {
  ArenaEvent,
  CodenamesAction,
  CodenamesCardColor,
  CodenamesPublicState,
  CodenamesRole,
  CodenamesSeat,
  CodenamesTeam,
  CodenamesTurnRecord,
  EventVisibility,
  PendingTurn,
  RunStatus,
  RunSummary,
} from "@ai-ramp/protocol";
import {
  BanIcon,
  BrainIcon,
  CheckIcon,
  CopyIcon,
  CrownIcon,
  EyeIcon,
  KeyRoundIcon,
  MinusIcon,
  PlusIcon,
  SendIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn, randomId } from "@/lib/utils";

interface Participant {
  id: string;
  displayName: string;
  seatId: string;
  ready: boolean;
  isHost: boolean;
}

interface CodenamesSnapshot {
  run: RunSummary<"codenames">;
  events: ArenaEvent<"codenames">[];
  viewer: Participant | null;
  room: { code?: string; participants: Participant[]; ready: boolean } | null;
  pendingTurn: PendingTurn | null;
  visibility: EventVisibility;
}

interface TurnPayload {
  playerId: string;
  action: CodenamesAction | null;
  accepted: boolean;
  state: CodenamesPublicState;
}

const SEAT_LABELS: Record<CodenamesSeat, string> = {
  "red-spymaster": "Red spymaster",
  "red-operative": "Red operative",
  "blue-spymaster": "Blue spymaster",
  "blue-operative": "Blue operative",
};

export function CodenamesArena({ runId }: Readonly<{ runId: string }>) {
  const [snapshot, setSnapshot] = useState<CodenamesSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [clueWord, setClueWord] = useState("");
  const [clueNumber, setClueNumber] = useState(1);
  const [copied, setCopied] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 404 ? "This room could not be found." : "Could not load the game.");
    const next = await response.json() as CodenamesSnapshot;
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
        if (active && !terminal) timeout = setTimeout(poll, 900);
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load the game.");
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

  const state = useMemo(() => latestState(snapshot?.events ?? []), [snapshot?.events]);
  const colorByWord = useMemo(() => revealedKey(snapshot?.events ?? []), [snapshot?.events]);

  const viewer = snapshot?.viewer ?? null;
  const viewerSeat = viewer?.seatId as CodenamesSeat | undefined;
  const viewerRole: CodenamesRole | null = viewerSeat
    ? viewerSeat.endsWith("spymaster") ? "spymaster" : "operative"
    : null;
  const pendingTurn = snapshot?.pendingTurn ?? null;
  const isMyTurn = Boolean(pendingTurn && viewerSeat && pendingTurn.seatId === viewerSeat && snapshot?.run.status === "running");

  const submitAction = useCallback(async (action: CodenamesAction) => {
    if (!snapshot || !pendingTurn) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId: pendingTurn.turnId, action, idempotencyKey: randomId() }),
      });
      if (!response.ok) throw new Error("That move could not be submitted.");
      if (action.type === "clue") {
        setClueWord("");
        setClueNumber(1);
      }
      await fetchSnapshot();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That move could not be submitted.");
    } finally {
      setBusy(false);
    }
  }, [fetchSnapshot, pendingTurn, runId, snapshot]);

  const markReady = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/runs/${runId}/ready`, { method: "POST" });
      if (!response.ok) throw new Error("Could not mark you ready.");
      await fetchSnapshot();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not mark you ready.");
    } finally {
      setBusy(false);
    }
  }, [fetchSnapshot, runId]);

  const guessCard = useCallback((word: string) => {
    if (!isMyTurn || viewerRole !== "operative" || busy) return;
    void submitAction({ type: "guess", word });
  }, [busy, isMyTurn, submitAction, viewerRole]);

  if (!snapshot) {
    return (
      <div className="flex min-h-[70svh] items-center justify-center">
        {loadError ? (
          <Alert variant="destructive" className="max-w-md">
            <AlertTitle>Room unavailable</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Opening the room
          </div>
        )}
      </div>
    );
  }

  const status = snapshot.run.status;
  const participants = snapshot.room?.participants ?? [];
  const inLobby = status === "lobby" || status === "queued";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-7 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Codenames</h1>
            <StatusBadge status={status} />
            {viewerSeat && <Badge variant="outline">You: {SEAT_LABELS[viewerSeat]}</Badge>}
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            You and your teammate play red against one AI running both blue seats.
          </p>
        </div>
        <Link className={cn(buttonVariants({ variant: "ghost", size: "sm" }))} href="/#games">Leave</Link>
      </header>

      {status === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>The game stopped</AlertTitle>
          <AlertDescription>The worker could not finish this game. Return to Games to start another.</AlertDescription>
        </Alert>
      )}
      {status === "cancelled" && (
        <Alert>
          <AlertTitle>Game cancelled</AlertTitle>
          <AlertDescription>This game was cancelled before it finished.</AlertDescription>
        </Alert>
      )}

      {inLobby ? (
        <Lobby
          busy={busy}
          code={snapshot.room?.code}
          copied={copied}
          onCopy={async () => {
            if (!snapshot.room?.code) return;
            try {
              await navigator.clipboard.writeText(snapshot.room.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1_500);
            } catch { /* clipboard may be unavailable */ }
          }}
          onReady={markReady}
          participants={participants}
          status={status}
          viewer={viewer}
        />
      ) : state ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(16rem,1fr)]">
          <div className="flex flex-col gap-5">
            <TurnBanner isMyTurn={isMyTurn} state={state} viewerRole={viewerRole} />
            <Board
              canGuess={isMyTurn && viewerRole === "operative" && state.phase === "guess" && !state.isGameOver}
              colorByWord={colorByWord}
              onGuess={guessCard}
              spymasterView={viewerRole === "spymaster"}
              state={state}
            />
            {actionError && <p className="text-center text-sm text-destructive">{actionError}</p>}
            {isMyTurn && viewerRole === "spymaster" && state.phase === "clue" && !state.isGameOver && (
              <ClueForm
                busy={busy}
                number={clueNumber}
                onNumber={setClueNumber}
                onSubmit={(word, number) => void submitAction({ type: "clue", word, number })}
                onWord={setClueWord}
                state={state}
                word={clueWord}
              />
            )}
            {isMyTurn && viewerRole === "operative" && state.phase === "guess" && !state.isGameOver && (
              <OperativeControls busy={busy} onStop={() => void submitAction({ type: "stop" })} state={state} />
            )}
          </div>
          <aside className="flex flex-col gap-5">
            <Scoreboard state={state} />
            <TurnLog log={state.log} />
          </aside>
        </div>
      ) : (
        <div className="flex min-h-[40svh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Dealing the board
        </div>
      )}
    </div>
  );
}

function Lobby({
  busy,
  code,
  copied,
  onCopy,
  onReady,
  participants,
  status,
  viewer,
}: Readonly<{
  busy: boolean;
  code?: string;
  copied: boolean;
  onCopy: () => void;
  onReady: () => void;
  participants: Participant[];
  status: RunStatus;
  viewer: Participant | null;
}>) {
  const spymaster = participants.find((p) => p.seatId === "red-spymaster");
  const operative = participants.find((p) => p.seatId === "red-operative");
  const bothJoined = Boolean(spymaster && operative);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-xl border bg-card/60 p-6 sm:p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <UsersIcon className="size-6 text-muted-foreground" />
        <h2 className="font-heading text-xl font-semibold">
          {status === "queued" ? "Starting the game" : bothJoined ? "Ready up to begin" : "Waiting for your teammate"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {status === "queued"
            ? "Both players are ready. Waiting for a worker to deal the board."
            : "Codenames needs both red seats filled before the AI joins for blue."}
        </p>
      </div>

      {code && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">Share this room code</p>
          <button
            className="flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 font-mono text-2xl font-semibold tracking-[0.3em] transition-colors hover:bg-muted"
            onClick={onCopy}
            type="button"
          >
            {code}
            {copied ? <CheckIcon className="size-4 text-muted-foreground" /> : <CopyIcon className="size-4 text-muted-foreground" />}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SeatRow label="Red spymaster" occupant={spymaster} viewer={viewer} />
        <SeatRow label="Red operative" occupant={operative} viewer={viewer} />
        <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          <span>Blue spymaster &amp; operative</span>
          <Badge variant="secondary">AI</Badge>
        </div>
      </div>

      {status === "lobby" && viewer && (
        <Button className="w-full" disabled={busy || viewer.ready} onClick={onReady}>
          {busy ? <Spinner data-icon="inline-start" /> : viewer.ready ? <CheckIcon data-icon="inline-start" /> : null}
          {viewer.ready ? (bothJoined ? "Ready — waiting for teammate" : "Ready — waiting for teammate to join") : "I'm ready"}
        </Button>
      )}
      {status === "queued" && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Dealing the board
        </div>
      )}
      {!viewer && (
        <p className="text-center text-sm text-muted-foreground">
          You are viewing this room as a spectator.
        </p>
      )}
    </div>
  );
}

function SeatRow({
  label,
  occupant,
  viewer,
}: Readonly<{ label: string; occupant?: Participant; viewer: Participant | null }>) {
  const isYou = occupant && viewer && occupant.id === viewer.id;
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
      <div className="flex flex-col">
        <span className="font-medium">
          {occupant ? occupant.displayName : "Waiting…"}
          {isYou && <span className="text-muted-foreground"> (you)</span>}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {occupant ? (
        occupant.ready ? <Badge>Ready</Badge> : <Badge variant="secondary">Joined</Badge>
      ) : (
        <Spinner />
      )}
    </div>
  );
}

function TurnBanner({
  isMyTurn,
  state,
  viewerRole,
}: Readonly<{ isMyTurn: boolean; state: CodenamesPublicState; viewerRole: CodenamesRole | null }>) {
  if (state.isGameOver) {
    const won = state.winner === "red";
    return (
      <div className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        won ? "border-codenames-red/50 bg-codenames-red/10" : "border-codenames-blue/50 bg-codenames-blue/10",
      )}>
        <CrownIcon className={cn("size-5", won ? "text-codenames-red" : "text-codenames-blue")} />
        <div className="flex flex-col">
          <p className="font-heading text-lg font-semibold">
            {won ? "Red wins — nice teamwork!" : "Blue wins"}
          </p>
          <p className="text-sm text-muted-foreground">
            {state.endReason === "assassin"
              ? `The ${state.winner === "red" ? "blue" : "red"} team hit the assassin.`
              : `${(state.winner ?? "").toUpperCase()} revealed all of their cards.`}
          </p>
        </div>
      </div>
    );
  }

  const aiTurn = state.currentTeam === "blue";
  const activeRole: CodenamesRole = state.phase === "clue" ? "spymaster" : "operative";
  let title: string;
  let subtitle: string;
  if (aiTurn) {
    title = activeRole === "spymaster" ? "Blue AI is thinking of a clue" : "Blue AI is guessing";
    subtitle = "Watch the board update as the model plays.";
  } else if (isMyTurn) {
    title = viewerRole === "spymaster" ? "Your turn — give a clue" : "Your turn — make a guess";
    subtitle = viewerRole === "spymaster"
      ? "Link as many red cards as you safely can."
      : state.currentClue
        ? `Clue: ${state.currentClue.word.toUpperCase()} ${state.currentClue.number} · ${state.guessesRemaining} guess${state.guessesRemaining === 1 ? "" : "es"} left.`
        : "Wait for the clue.";
  } else {
    title = `Your teammate (red ${activeRole}) is up`;
    subtitle = activeRole === "operative" && state.currentClue
      ? `Clue: ${state.currentClue.word.toUpperCase()} ${state.currentClue.number}.`
      : "Hang tight while they play.";
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-3">
      {aiTurn ? <BrainIcon className="size-5 text-codenames-blue" /> : <span className={cn("size-2.5 rounded-full", isMyTurn ? "animate-pulse bg-codenames-red" : "bg-muted-foreground/50")} />}
      <div className="flex flex-col">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function Board({
  canGuess,
  colorByWord,
  onGuess,
  spymasterView,
  state,
}: Readonly<{
  canGuess: boolean;
  colorByWord: Map<string, CodenamesCardColor>;
  onGuess: (word: string) => void;
  spymasterView: boolean;
  state: CodenamesPublicState;
}>) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5">
      {state.board.map((card) => {
        // Revealed cards show their true colour to everyone. Otherwise a colour is
        // only known to the spymaster (live) or to anyone once the game is over
        // (colorByWord is populated from the seat key / final reveal).
        const known = card.revealed ? card.color : colorByWord.get(card.word) ?? null;
        const clickable = canGuess && !card.revealed;
        return (
          <button
            aria-label={`${card.word}${card.revealed && card.color ? `, ${card.color}` : ""}`}
            className={cn(
              "flex aspect-[7/5] items-center justify-center rounded-md border-2 px-1 text-center text-[0.7rem] font-semibold uppercase leading-tight transition-colors sm:text-sm",
              card.revealed
                ? cn(revealedClasses(card.color), "opacity-95")
                : known && spymasterView
                  ? hintClasses(known)
                  : known
                    ? cn(hintClasses(known), "border-dashed")
                    : "border-border bg-card text-foreground",
              clickable ? "cursor-pointer hover:border-foreground/60 hover:shadow-sm" : "cursor-default",
            )}
            disabled={!clickable}
            key={card.word}
            onClick={() => clickable && onGuess(card.word)}
            type="button"
          >
            <span className="line-clamp-2">{card.word}</span>
          </button>
        );
      })}
    </div>
  );
}

function ClueForm({
  busy,
  number,
  onNumber,
  onSubmit,
  onWord,
  state,
  word,
}: Readonly<{
  busy: boolean;
  number: number;
  onNumber: (value: number) => void;
  onSubmit: (word: string, number: number) => void;
  onWord: (value: string) => void;
  state: CodenamesPublicState;
  word: string;
}>) {
  const boardWords = useMemo(() => new Set(state.board.map((card) => card.word.toUpperCase())), [state.board]);
  const cleaned = word.trim().toUpperCase();
  const validWord = /^[A-Z]+$/.test(cleaned);
  const onBoard = boardWords.has(cleaned);
  const error = word.length === 0 ? null
    : !validWord ? "Use a single word, letters only."
    : onBoard ? "Your clue can't be a word on the board."
    : null;
  const canSubmit = !busy && validWord && !onBoard && number >= 1;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border bg-card/60 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit(cleaned, number);
      }}
    >
      <div className="flex items-center gap-2">
        <KeyRoundIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Give your clue</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-invalid={Boolean(error)}
          aria-label="Clue word"
          autoFocus
          className="h-10 flex-1 text-base uppercase"
          maxLength={24}
          onChange={(event) => onWord(event.target.value)}
          placeholder="One word"
          value={word}
        />
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            aria-label="Fewer cards"
            disabled={number <= 1}
            onClick={() => onNumber(Math.max(1, number - 1))}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MinusIcon />
          </Button>
          <span className="w-6 text-center text-lg font-semibold tabular-nums">{number}</span>
          <Button
            aria-label="More cards"
            disabled={number >= 9}
            onClick={() => onNumber(Math.min(9, number + 1))}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PlusIcon />
          </Button>
        </div>
        <Button className="h-10" disabled={!canSubmit} type="submit">
          {busy ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
          Give clue
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function OperativeControls({
  busy,
  onStop,
  state,
}: Readonly<{ busy: boolean; onStop: () => void; state: CodenamesPublicState }>) {
  const activeTurn = state.log.at(-1);
  const guessesThisTurn = activeTurn && activeTurn.endedBy === null ? activeTurn.guesses.length : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 p-4">
      <div className="text-sm">
        <p className="font-medium">
          {state.currentClue
            ? `Clue: ${state.currentClue.word.toUpperCase()} ${state.currentClue.number}`
            : "Waiting for a clue"}
        </p>
        <p className="text-muted-foreground">
          Click a card to guess · {state.guessesRemaining} guess{state.guessesRemaining === 1 ? "" : "es"} left this turn.
        </p>
      </div>
      <Button disabled={busy || guessesThisTurn === 0} onClick={onStop} variant="secondary">
        <BanIcon data-icon="inline-start" />
        Stop guessing
      </Button>
    </div>
  );
}

function Scoreboard({ state }: Readonly<{ state: CodenamesPublicState }>) {
  return (
    <div className="flex items-stretch gap-2">
      <TeamScore active={state.currentTeam === "red" && !state.isGameOver} count={state.remaining.red} label="Red · you" team="red" />
      <TeamScore active={state.currentTeam === "blue" && !state.isGameOver} count={state.remaining.blue} label="Blue · AI" team="blue" />
    </div>
  );
}

function TeamScore({
  active,
  count,
  label,
  team,
}: Readonly<{ active: boolean; count: number; label: string; team: CodenamesTeam }>) {
  return (
    <div className={cn(
      "flex flex-1 flex-col items-center gap-0.5 rounded-lg border-2 py-3",
      team === "red" ? "border-codenames-red/40" : "border-codenames-blue/40",
      active && (team === "red" ? "bg-codenames-red/10" : "bg-codenames-blue/10"),
    )}>
      <span className={cn("text-3xl font-bold tabular-nums", team === "red" ? "text-codenames-red" : "text-codenames-blue")}>
        {count}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function TurnLog({ log }: Readonly<{ log: CodenamesTurnRecord[] }>) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <EyeIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Game log</span>
      </div>
      {log.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clues yet.</p>
      ) : (
        <ol className="flex max-h-[26rem] flex-col gap-2.5 overflow-y-auto pr-1">
          {log.map((turn, index) => (
            <li className="flex flex-col gap-1 text-sm" key={index}>
              <span className="flex items-center gap-1.5 font-medium">
                <span className={cn("size-2 rounded-full", turn.team === "red" ? "bg-codenames-red" : "bg-codenames-blue")} />
                {turn.team === "red" ? "Red" : "Blue"}: {turn.clue.word.toUpperCase()} {turn.clue.number}
              </span>
              {turn.guesses.map((guess, guessIndex) => (
                <span className="ml-3.5 flex items-center gap-1.5 text-muted-foreground" key={guessIndex}>
                  <span className={cn("size-1.5 rounded-full", dotClasses(guess.color))} />
                  {guess.word} → {guess.outcome}
                </span>
              ))}
              {turn.endedBy === "stopped" && <span className="ml-3.5 text-xs text-muted-foreground">(stopped early)</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: RunStatus }>) {
  const variants: Record<RunStatus, "default" | "secondary" | "destructive" | "outline"> = {
    lobby: "secondary", queued: "secondary", running: "outline",
    completed: "default", failed: "destructive", cancelled: "secondary",
  };
  const labels: Record<RunStatus, string> = {
    lobby: "Lobby", queued: "Starting", running: "Live",
    completed: "Complete", failed: "Stopped", cancelled: "Cancelled",
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

function revealedClasses(color: CodenamesCardColor | null): string {
  switch (color) {
    case "red": return "border-codenames-red bg-codenames-red text-codenames-red-foreground";
    case "blue": return "border-codenames-blue bg-codenames-blue text-codenames-blue-foreground";
    case "neutral": return "border-codenames-neutral bg-codenames-neutral text-codenames-neutral-foreground";
    case "assassin": return "border-codenames-assassin bg-codenames-assassin text-codenames-assassin-foreground";
    default: return "border-border bg-card text-foreground";
  }
}

function hintClasses(color: CodenamesCardColor): string {
  switch (color) {
    case "red": return "border-codenames-red/70 bg-codenames-red/12 text-foreground";
    case "blue": return "border-codenames-blue/70 bg-codenames-blue/12 text-foreground";
    case "neutral": return "border-codenames-neutral/70 bg-codenames-neutral/20 text-foreground";
    case "assassin": return "border-codenames-assassin bg-codenames-assassin/30 text-foreground";
  }
}

function dotClasses(color: CodenamesCardColor): string {
  switch (color) {
    case "red": return "bg-codenames-red";
    case "blue": return "bg-codenames-blue";
    case "neutral": return "bg-codenames-neutral";
    case "assassin": return "bg-codenames-assassin";
  }
}

function latestState(events: ArenaEvent<"codenames">[]): CodenamesPublicState | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type !== "state" && event.type !== "turn") continue;
    const payload = event.payload as { state?: CodenamesPublicState } | null;
    if (payload?.state) return payload.state;
  }
  return null;
}

/** Words → colour for cards the viewer is allowed to see face-down: the spymaster
 *  key event during play, or the full key from match_completed once the game ends. */
function revealedKey(events: ArenaEvent<"codenames">[]): Map<string, CodenamesCardColor> {
  const map = new Map<string, CodenamesCardColor>();
  for (const event of events) {
    if (event.type === "key") {
      const payload = event.payload as { words?: string[]; colors?: CodenamesCardColor[] } | null;
      if (payload?.words && payload.colors) {
        payload.words.forEach((word, index) => {
          const color = payload.colors?.[index];
          if (color) map.set(word.toUpperCase(), color);
        });
      }
    }
    if (event.type === "match_completed") {
      const payload = event.payload as { games?: { finalState?: { words?: string[]; key?: CodenamesCardColor[] } }[] } | null;
      const final = payload?.games?.[0]?.finalState;
      if (final?.words && final.key) {
        final.words.forEach((word, index) => {
          const color = final.key?.[index];
          if (color) map.set(word.toUpperCase(), color);
        });
      }
    }
  }
  return map;
}

function isTerminal(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
