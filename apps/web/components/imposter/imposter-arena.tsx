"use client";

import type {
  ArenaEvent,
  ImposterAction,
  ImposterPublicLogEntry,
  ImposterPublicState,
  ImposterSeat,
  PendingTurn,
  RunStatus,
  RunSummary,
  ViewerSession,
} from "@ai-ramp/protocol";
import {
  EyeOffIcon,
  MessageSquareTextIcon,
  SendIcon,
  ShieldCheckIcon,
  VoteIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const HUMAN_SEAT: ImposterSeat = "P1";

interface ImposterSnapshot {
  run: RunSummary<"imposter">;
  events: ArenaEvent<"imposter">[];
  viewer: ViewerSession | null;
  pendingTurn: PendingTurn | null;
}

interface StatePayload {
  playerId?: string;
  accepted?: boolean;
  state?: ImposterPublicState;
}

export function ImposterArena({ runId }: Readonly<{ runId: string }>) {
  const [snapshot, setSnapshot] = useState<ImposterSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clue, setClue] = useState("");
  const [message, setMessage] = useState("");
  const [guess, setGuess] = useState("");
  const [target, setTarget] = useState<ImposterSeat | null>(null);
  const [submittingTurn, setSubmittingTurn] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(response.status === 404 ? "This match could not be found." : "Could not load the match.");
    }
    const next = await response.json() as ImposterSnapshot;
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

  const state = useMemo(() => latestState(snapshot?.events ?? []), [snapshot?.events]);
  const latestHumanEvent = useMemo(
    () => [...(snapshot?.events ?? [])].reverse().find((event) => {
      const payload = event.payload as StatePayload | null;
      return event.type === "seat_state" && payload?.playerId === HUMAN_SEAT;
    }),
    [snapshot?.events],
  );
  const pendingTurn = snapshot?.pendingTurn?.seatId === HUMAN_SEAT ? snapshot.pendingTurn : null;
  const canAct = Boolean(
    snapshot?.run.status === "running" && pendingTurn && state && !state.isGameOver && !submittingTurn,
  );

  useEffect(() => {
    setClue("");
    setMessage("");
    setGuess("");
    setTarget(null);
    setActionError(null);
  }, [pendingTurn?.turnId, state?.phase]);

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || !state || !pendingTurn || !canAct) return;
    const action = actionForState(state, { clue, message, guess, target });
    if (typeof action === "string") {
      setActionError(action);
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
          action,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("That action could not be submitted.");
      await fetchSnapshot();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "That action could not be submitted.");
    } finally {
      setSubmittingTurn(null);
    }
  }

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
            Taking your seat
          </div>
        )}
      </div>
    );
  }

  const seats = seatDetails(snapshot, state);
  const rejectedAction = latestHumanEvent && (latestHumanEvent.payload as StatePayload).accepted === false;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 py-7 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold sm:text-4xl">Imposter</h1>
            <StatusBadge status={snapshot.run.status} />
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {state ? tableStatus(state) : runStatus(snapshot.run.status)}
          </p>
        </div>
      </header>

      {snapshot.run.status === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>The table stopped</AlertTitle>
          <AlertDescription>The worker could not finish this game.</AlertDescription>
        </Alert>
      )}

      {snapshot.run.status === "lobby" && (
        <Alert>
          <AlertTitle>Ready when you are</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>This table has not entered the queue yet.</span>
            <Button onClick={() => void readyMatch()} size="sm">Start game</Button>
          </AlertDescription>
        </Alert>
      )}

      {state && <RoleBrief state={state} />}

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-14">
        <main className="flex min-w-0 flex-col gap-9">
          <section aria-labelledby="players-title" className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-medium" id="players-title">The table</h2>
                <p className="text-sm text-muted-foreground">Speaking order runs left to right.</p>
              </div>
              {state?.isGameOver && <span className="text-xs text-muted-foreground">Roles revealed</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {seats.map((seat) => <SeatCard key={seat.seat} {...seat} />)}
            </div>
          </section>

          <section aria-labelledby="table-log-title" className="flex flex-col gap-4">
            <div>
              <h2 className="font-heading text-lg font-medium" id="table-log-title">Table log</h2>
              <p className="text-sm text-muted-foreground">Clues, completed votes, and every public defense.</p>
            </div>
            {!state || state.log.length === 0 ? (
              <p className="border-y py-8 text-center text-sm text-muted-foreground">
                The first clue will appear here.
              </p>
            ) : (
              <div className="border-t">
                {state.log.map((entry, index) => (
                  <LogEntry key={`${entry.kind}-${index}`} entry={entry} names={seats} />
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="order-first flex flex-col gap-4 lg:order-last lg:sticky lg:top-24">
          <div>
            <h2 className="font-heading text-lg font-medium">Your move</h2>
            <p className="text-sm text-muted-foreground">{state ? actionStatus(state, pendingTurn) : "Waiting for the table."}</p>
          </div>

          {state && canAct ? (
            <ActionForm
              clue={clue}
              guess={guess}
              message={message}
              onClueChange={setClue}
              onGuessChange={setGuess}
              onMessageChange={setMessage}
              onSubmit={submitAction}
              onTargetChange={setTarget}
              state={state}
              submitting={Boolean(submittingTurn)}
              target={target}
            />
          ) : (
            <div className="flex min-h-24 items-center justify-center border-y text-sm text-muted-foreground">
              {snapshot.run.status === "queued" || snapshot.run.status === "running" ? (
                <span className="flex items-center gap-2"><Spinner />{waitingLabel(snapshot.run.status, state)}</span>
              ) : state?.isGameOver ? "The vote is final." : "The table is not live yet."}
            </div>
          )}

          {(actionError || rejectedAction) && (
            <Alert variant="destructive">
              <AlertTitle>Try that move again</AlertTitle>
              <AlertDescription>{actionError ?? "The game rejected the previous action."}</AlertDescription>
            </Alert>
          )}
        </aside>
      </div>
    </div>
  );
}

function RoleBrief({ state }: Readonly<{ state: ImposterPublicState }>) {
  if (state.isGameOver) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-5 border-y py-5">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Final result</p>
          <p className="font-heading text-xl font-semibold">
            {state.winner === "crew" ? "Crew found the Imposter" : "The Imposter got away"}
          </p>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-xs text-muted-foreground">Secret word</p>
            <p className="font-mono text-lg font-semibold uppercase">{state.word}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Hint</p>
            <p className="text-sm font-medium">{state.hint}</p>
          </div>
        </div>
      </section>
    );
  }

  if (state.viewerRole === "crew") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-5 border-y py-5">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon aria-hidden="true" className="size-5 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium text-muted-foreground">Your role</p>
            <p className="font-heading text-lg font-semibold">Crew</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Secret word</p>
          <p className="font-mono text-xl font-semibold uppercase">{state.word}</p>
        </div>
      </section>
    );
  }

  if (state.viewerRole === "imposter") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-5 border-y py-5">
        <div className="flex items-center gap-3">
          <EyeOffIcon aria-hidden="true" className="size-5 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium text-muted-foreground">Your role</p>
            <p className="font-heading text-lg font-semibold">Imposter</p>
          </div>
        </div>
        <div className="max-w-sm text-right">
          <p className="text-xs text-muted-foreground">Your hint</p>
          <p className="text-sm font-medium">{state.hint}</p>
        </div>
      </section>
    );
  }

  return null;
}

interface SeatDetails {
  seat: ImposterSeat;
  name: string;
  provider: string | null;
  isHuman: boolean;
  isActing: boolean;
  isAccused: boolean;
  isEliminated: boolean;
  role: "crew" | "imposter" | null;
}

function SeatCard(details: Readonly<SeatDetails>) {
  return (
    <article className={cn(
      "flex min-h-24 flex-col justify-between gap-4 rounded-md border bg-card/60 p-4",
      details.isActing && "border-primary bg-accent/60",
      details.isEliminated && "opacity-60",
    )}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{details.seat}</p>
          <h3 className="truncate text-sm font-medium">{details.name}</h3>
          {details.provider && <p className="truncate text-xs text-muted-foreground">{details.provider}</p>}
        </div>
        {details.isHuman && <Badge variant="outline">You</Badge>}
      </div>
      <div className="flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {details.role && <span className="capitalize">{details.role}</span>}
        {details.isActing && <span>Acting now</span>}
        {details.isAccused && <span>Accused</span>}
        {details.isEliminated && <span>Eliminated</span>}
      </div>
    </article>
  );
}

function LogEntry({ entry, names }: Readonly<{ entry: ImposterPublicLogEntry; names: SeatDetails[] }>) {
  const name = (seat: ImposterSeat) => names.find((item) => item.seat === seat)?.name ?? seat;
  if (entry.kind === "clue") {
    return (
      <article className="flex items-center justify-between gap-5 border-b py-4">
        <div className="flex items-center gap-3">
          <MessageSquareTextIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{name(entry.seat)}</p>
            <p className="text-xs text-muted-foreground">gave a clue</p>
          </div>
        </div>
        <p className="font-mono text-base font-semibold uppercase">{entry.word}</p>
      </article>
    );
  }
  if (entry.kind === "vote") {
    return (
      <article className="flex flex-col gap-3 border-b py-4">
        <div className="flex items-start gap-3">
          <VoteIcon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{entry.vote === "accuse" ? "Accusation" : "Final vote"}</p>
            <p className="text-xs text-muted-foreground">
              {entry.tied ? `Tie between ${entry.tied.map(name).join(", ")}.` : `${entry.winner ? name(entry.winner) : "No player"} received the vote.`}
              {entry.forced ? " Tie limit reached; speaking order decided it." : ""}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-7 text-xs text-muted-foreground sm:grid-cols-3">
          {Object.entries(entry.votes).map(([seat, votedFor]) => (
            <span key={seat}>{name(seat as ImposterSeat)} -&gt; {name(votedFor)}</span>
          ))}
        </div>
      </article>
    );
  }
  if (entry.kind === "defense") {
    return (
      <article className="flex flex-col gap-2 border-b py-4">
        <div>
          <p className="text-sm font-medium">{name(entry.seat)} {defenseLabel(entry.context)}</p>
          {entry.pointAt && <p className="text-xs text-muted-foreground">Pointed at {name(entry.pointAt)}</p>}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">&quot;{entry.message}&quot;</p>
      </article>
    );
  }
  return (
    <article className="flex items-center justify-between gap-5 border-b py-4">
      <div>
        <p className="text-sm font-medium">The Imposter guessed {entry.word}</p>
        <p className="text-xs text-muted-foreground">Final steal attempt</p>
      </div>
      <Badge variant={entry.correct ? "default" : "outline"}>{entry.correct ? "Correct" : "Missed"}</Badge>
    </article>
  );
}

function ActionForm({
  state,
  clue,
  message,
  guess,
  target,
  submitting,
  onClueChange,
  onMessageChange,
  onGuessChange,
  onTargetChange,
  onSubmit,
}: Readonly<{
  state: ImposterPublicState;
  clue: string;
  message: string;
  guess: string;
  target: ImposterSeat | null;
  submitting: boolean;
  onClueChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onGuessChange: (value: string) => void;
  onTargetChange: (value: ImposterSeat | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  const needsVote = state.phase === "accuse" || state.phase === "final";
  const needsPoint = state.phase === "defense";
  const needsMessage = needsPoint || state.phase === "rebuttal" || state.phase.endsWith("tiebreak");
  const options = state.seats.filter((seat) => seat !== HUMAN_SEAT);

  return (
    <form className="flex flex-col gap-5 border-y py-5" onSubmit={onSubmit}>
      <FieldGroup>
        {state.phase === "clue" && (
          <Field>
            <FieldLabel htmlFor="imposter-clue">One-word clue</FieldLabel>
            <Input
              autoComplete="off"
              id="imposter-clue"
              maxLength={30}
              onChange={(event) => onClueChange(event.target.value)}
              placeholder="One word"
              value={clue}
            />
            <FieldDescription>Letters only. Avoid saying the secret word.</FieldDescription>
          </Field>
        )}

        {(needsVote || needsPoint) && (
          <Field>
            <FieldLabel>{needsVote ? "Choose a suspect" : "Point at another player"}</FieldLabel>
            <ToggleGroup
              aria-label={needsVote ? "Vote target" : "Player to point at"}
              className="grid w-full grid-cols-3"
              onValueChange={(values) => onTargetChange((values[0] as ImposterSeat | undefined) ?? null)}
              value={target ? [target] : []}
              variant="outline"
            >
              {options.map((seat) => (
                <ToggleGroupItem className="w-full" key={seat} value={seat}>{seat}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            {needsVote && <FieldDescription>Your ballot stays hidden until everyone votes.</FieldDescription>}
          </Field>
        )}

        {needsMessage && (
          <Field>
            <FieldLabel htmlFor="imposter-defense">
              {state.phase === "defense" ? "Your defense" : state.phase === "rebuttal" ? "Your rebuttal" : "Your tie-break defense"}
            </FieldLabel>
            <Textarea
              id="imposter-defense"
              maxLength={600}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Make your case to the table"
              value={message}
            />
          </Field>
        )}

        {state.phase === "steal" && (
          <Field>
            <FieldLabel htmlFor="imposter-guess">Guess the secret word</FieldLabel>
            <Input
              autoComplete="off"
              id="imposter-guess"
              maxLength={60}
              onChange={(event) => onGuessChange(event.target.value)}
              placeholder="Secret word"
              value={guess}
            />
            <FieldDescription>A correct guess steals the win.</FieldDescription>
          </Field>
        )}
      </FieldGroup>

      <Button disabled={submitting} type="submit">
        {submitting ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
        {submitting ? "Submitting" : actionButtonLabel(state.phase)}
      </Button>
    </form>
  );
}

function latestState(events: ArenaEvent<"imposter">[]): ImposterPublicState | null {
  const seatState = [...events].reverse().find((event) => event.type === "seat_state");
  const publicState = [...events].reverse().find((event) => event.type === "turn" || event.type === "match_started");
  const payload = (seatState ?? publicState)?.payload as StatePayload | undefined;
  return payload?.state ?? null;
}

function seatDetails(snapshot: ImposterSnapshot, state: ImposterPublicState | null): SeatDetails[] {
  const seats = state?.speakingOrder ?? (["P1", "P2", "P3", "P4", "P5", "P6"] as ImposterSeat[]);
  return seats.map((seat) => {
    const model = seat === HUMAN_SEAT ? null : snapshot.run.config.models[Number(seat.slice(1)) - 2];
    return {
      seat,
      name: seat === HUMAN_SEAT ? snapshot.viewer?.displayName ?? "You" : model?.displayName ?? seat,
      provider: model?.id.split(":")[0] ?? null,
      isHuman: seat === HUMAN_SEAT,
      isActing: state?.playersToAct.includes(seat) ?? false,
      isAccused: state?.accused === seat,
      isEliminated: state?.eliminated === seat,
      role: state?.revealedRoles?.[seat] ?? null,
    };
  });
}

function actionForState(
  state: ImposterPublicState,
  values: { clue: string; message: string; guess: string; target: ImposterSeat | null },
): ImposterAction | string {
  if (state.phase === "clue") {
    const word = values.clue.trim();
    return /^[a-z]+$/i.test(word) ? { type: "clue", word } : "Enter one clue using letters only.";
  }
  if (state.phase === "accuse" || state.phase === "final") {
    return values.target ? { type: "vote", target: values.target } : "Choose a player before voting.";
  }
  if (state.phase === "defense") {
    const message = values.message.trim();
    if (!message) return "Enter your defense.";
    return values.target ? { type: "defend", message, pointAt: values.target } : "Point at another player.";
  }
  if (state.phase === "rebuttal" || state.phase.endsWith("tiebreak")) {
    const message = values.message.trim();
    return message ? { type: "defend", message } : "Enter your response.";
  }
  if (state.phase === "steal") {
    const word = values.guess.trim();
    return word ? { type: "guess", word } : "Enter your guess for the secret word.";
  }
  return "There is no action to submit right now.";
}

function tableStatus(state: ImposterPublicState): string {
  if (state.isGameOver) return `${state.winner === "crew" ? "Crew" : "Imposter"} wins. ${endReasonLabel(state.endReason)}`;
  const labels: Record<ImposterPublicState["phase"], string> = {
    clue: "Two clue laps. Say enough to belong without giving the word away.",
    accuse: "The table is casting its first private accusation vote.",
    "accuse-tiebreak": "The tied suspects are defending themselves before a new accusation vote.",
    defense: `${state.accused ?? "The accused player"} must defend their clues and name another suspect.`,
    rebuttal: `${state.pointedAt ?? "The named player"} gets a rebuttal before the final vote.`,
    final: "The final ballots are private until every player has voted.",
    "final-tiebreak": "The tied suspects are making one last case before the re-vote.",
    steal: "The eliminated Imposter has one chance to steal the win by naming the word.",
    gameover: "The game is over.",
  };
  return labels[state.phase];
}

function actionStatus(state: ImposterPublicState, pendingTurn: PendingTurn | null): string {
  if (state.isGameOver) return "The table has revealed every role.";
  if (pendingTurn) {
    if (state.phase === "clue") return "Give a clue that fits your information.";
    if (state.phase === "accuse") return "Who is bluffing?";
    if (state.phase === "final") return "Cast the elimination vote.";
    if (state.phase === "defense") return "Defend yourself and point at a suspect.";
    if (state.phase === "rebuttal") return "Answer the accusation.";
    if (state.phase.endsWith("tiebreak")) return "Make your tie-break case.";
    if (state.phase === "steal") return "Name the word to steal the win.";
  }
  if (state.yourVote) return `Your vote for ${state.yourVote} is locked in.`;
  return `${state.playersToAct.join(", ") || "The table"} ${state.playersToAct.length === 1 ? "is" : "are"} acting.`;
}

function waitingLabel(status: RunStatus, state: ImposterPublicState | null): string {
  if (status === "queued") return "Waiting for a worker";
  if (!state) return "Dealing roles";
  if (state.yourVote) return "Waiting for the remaining ballots";
  return "Waiting on the table";
}

function actionButtonLabel(phase: ImposterPublicState["phase"]): string {
  if (phase === "clue") return "Give clue";
  if (phase === "accuse" || phase === "final") return "Cast vote";
  if (phase === "steal") return "Guess word";
  return "Address the table";
}

function defenseLabel(context: Extract<ImposterPublicLogEntry, { kind: "defense" }>["context"]): string {
  if (context === "accused") return "made a defense";
  if (context === "rebuttal") return "answered the accusation";
  return "made a tie-break defense";
}

function endReasonLabel(reason: ImposterPublicState["endReason"]): string {
  if (reason === "crew-voted-out") return "The table eliminated a Crew member.";
  if (reason === "word-stolen") return "The Imposter stole the word.";
  if (reason === "imposter-voted-out") return "The Imposter missed the final word.";
  return "";
}

function runStatus(status: RunStatus): string {
  if (status === "queued") return "The table is ready and waiting for a worker.";
  if (status === "running") return "Roles are being dealt.";
  if (status === "failed") return "This game could not be completed.";
  return "Six seats. One hidden Imposter.";
}

function isTerminal(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
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
