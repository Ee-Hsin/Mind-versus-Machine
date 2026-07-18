"use client";

import type { CodenamesRole, ModelRef } from "@ai-ramp/protocol";
import { KeyRoundIcon, LogInIcon, NetworkIcon, PlayIcon, SearchIcon, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { GameViewRegistration } from "@/games/registry";

interface CatalogResponse {
  models: ModelRef[];
}

const ROLES: { id: CodenamesRole; label: string; blurb: string }[] = [
  { id: "spymaster", label: "Spymaster", blurb: "You see the secret key and give one-word clues." },
  { id: "operative", label: "Operative", blurb: "You read the clues and pick the cards to reveal." },
];

export function CodenamesLaunchDialog({
  game,
  icon: Icon = NetworkIcon,
}: Readonly<{ game: GameViewRegistration; icon?: LucideIcon }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "join">("create");

  // Create-room state
  const [displayName, setDisplayName] = useState("Player");
  const [role, setRole] = useState<CodenamesRole>("spymaster");
  const [models, setModels] = useState<ModelRef[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Join-room state
  const [roomCode, setRoomCode] = useState("");
  const [joinName, setJoinName] = useState("Player");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCatalogState("loading");
    fetch("/api/catalog")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the model catalog.");
        return response.json() as Promise<CatalogResponse>;
      })
      .then((catalog) => {
        if (!active) return;
        setModels(catalog.models);
        setModelId((current) => current ?? catalog.models[0]?.id ?? null);
        setCatalogState("ready");
      })
      .catch(() => {
        if (active) setCatalogState("error");
      });
    return () => {
      active = false;
    };
  }, [open]);

  function switchMode(next: "create" | "join") {
    setMode(next);
    setError(null);
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) return setError("Enter a name so your teammate knows who you are.");
    if (!modelId) return setError("Choose the AI model to play against.");

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // One chosen model plays both AI seats — it just receives a different
        // spymaster vs. operative prompt for each.
        body: JSON.stringify({ gameType: "codenames", modelIds: [modelId, modelId], displayName: name, hostRole: role }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not create the room."));
      const created = await response.json() as { run: { id: string } };
      router.push(`/play/codenames/${created.run.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the room.");
      setSubmitting(false);
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    const name = joinName.trim();
    if (code.length < 4) return setError("Enter the room code your teammate shared.");
    if (!name) return setError("Enter a name so your teammate knows who you are.");

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, displayName: name }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not join that room."));
      const joined = await response.json() as { run: { id: string } };
      router.push(`/play/codenames/${joined.run.id}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join that room.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label="Play Codenames"
            className="h-44 w-full whitespace-normal px-5 py-5 text-left"
            variant="outline"
          />
        }
      >
        <span className="flex h-full w-full flex-col items-start gap-6">
          <Icon aria-hidden="true" data-icon="inline-start" />
          <span className="flex flex-col items-start gap-2">
            <span className="font-heading text-base leading-none font-medium">{game.label}</span>
            <span className="max-w-72 text-left text-sm leading-5 text-muted-foreground">{game.summary}</span>
          </span>
        </span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Play Codenames with a friend</DialogTitle>
          <DialogDescription>
            Two humans on the red team face one AI playing both spymaster and operative for blue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg border bg-card/60 p-1">
          <ModeTab active={mode === "create"} icon={KeyRoundIcon} label="Create room" onClick={() => switchMode("create")} />
          <ModeTab active={mode === "join"} icon={LogInIcon} label="Join with code" onClick={() => switchMode("join")} />
        </div>

        {mode === "create" ? (
          <form className="flex flex-col gap-5" onSubmit={createRoom}>
            <FieldGroup>
              <Field data-invalid={Boolean(error && !displayName.trim())}>
                <FieldLabel htmlFor="codenames-host-name">Your name</FieldLabel>
                <Input
                  autoComplete="nickname"
                  id="codenames-host-name"
                  maxLength={40}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setError(null);
                  }}
                  value={displayName}
                />
              </Field>

              <FieldSet>
                <FieldLegend variant="label">Your role</FieldLegend>
                <FieldDescription>Your teammate takes the other role when they join.</FieldDescription>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((option) => (
                    <button
                      aria-pressed={role === option.id}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        role === option.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-muted",
                      )}
                      key={option.id}
                      onClick={() => {
                        setRole(option.id);
                        setError(null);
                      }}
                      type="button"
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-xs leading-4 text-muted-foreground">{option.blurb}</span>
                    </button>
                  ))}
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label">AI opponent</FieldLegend>
                <FieldDescription>One model plays both blue seats.</FieldDescription>
                <FieldGroup className="max-h-44 gap-1 overflow-y-auto rounded-lg border p-2">
                  {catalogState === "loading" && (
                    <div className="flex min-h-20 items-center justify-center gap-2 text-muted-foreground">
                      <Spinner />
                      Loading models
                    </div>
                  )}
                  {catalogState === "ready" && models.map((model) => (
                    <button
                      aria-pressed={modelId === model.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                        modelId === model.id
                          ? "border-primary bg-primary/10"
                          : "border-transparent hover:bg-muted",
                      )}
                      key={model.id}
                      onClick={() => {
                        setModelId(model.id);
                        setError(null);
                      }}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{model.displayName}</span>
                        <span className="block truncate text-xs text-muted-foreground">{model.id.split(":")[0]}</span>
                      </span>
                      {modelId === model.id && <span className="text-xs font-medium text-primary">Selected</span>}
                    </button>
                  ))}
                </FieldGroup>
              </FieldSet>
            </FieldGroup>

            {catalogState === "error" && (
              <Alert variant="destructive">
                <AlertTitle>Model catalog unavailable</AlertTitle>
                <AlertDescription>Check the web server configuration and try again.</AlertDescription>
              </Alert>
            )}
            {catalogState === "ready" && models.length === 0 && (
              <Alert>
                <AlertTitle>No models configured</AlertTitle>
                <AlertDescription>Add model IDs to ARENA_MODELS before starting a match.</AlertDescription>
              </Alert>
            )}
            {error && <FieldError>{error}</FieldError>}

            <DialogFooter showCloseButton>
              <Button disabled={submitting || catalogState !== "ready" || models.length === 0} type="submit">
                {submitting ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
                {submitting ? "Creating" : "Create room"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={joinRoom}>
            <FieldGroup>
              <Field data-invalid={Boolean(error && roomCode.trim().length < 4)}>
                <FieldLabel htmlFor="codenames-room-code">Room code</FieldLabel>
                <Input
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="font-mono tracking-[0.3em] uppercase"
                  id="codenames-room-code"
                  maxLength={12}
                  onChange={(event) => {
                    setRoomCode(event.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="ABC123"
                  value={roomCode}
                />
                <FieldDescription>Ask the host for the six-character code shown in their lobby.</FieldDescription>
              </Field>
              <Field data-invalid={Boolean(error && !joinName.trim())}>
                <FieldLabel htmlFor="codenames-join-name">Your name</FieldLabel>
                <Input
                  autoComplete="nickname"
                  id="codenames-join-name"
                  maxLength={40}
                  onChange={(event) => {
                    setJoinName(event.target.value);
                    setError(null);
                  }}
                  value={joinName}
                />
              </Field>
            </FieldGroup>

            {error && <FieldError>{error}</FieldError>}

            <DialogFooter showCloseButton>
              <Button disabled={submitting} type="submit">
                {submitting ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}
                {submitting ? "Joining" : "Join room"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeTab({
  active,
  icon: Icon,
  label,
  onClick,
}: Readonly<{ active: boolean; icon: LucideIcon; label: string; onClick: () => void }>) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string };
    if (body.error === "internal_error") return "The game service is not configured yet.";
    if (body.error === "room_not_found") return "No open room has that code.";
    if (body.error === "room_full") return "That room already has two players.";
    if (body.error === "unknown_model") return "That model is not enabled on this server.";
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}
