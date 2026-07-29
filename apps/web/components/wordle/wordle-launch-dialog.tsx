"use client";

import type { ModelRef } from "@ai-ramp/protocol";
import { Grid3X3Icon, PlayIcon, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { GameViewRegistration } from "@/games/registry";

interface CatalogResponse {
  models: ModelRef[];
}

export function WordleLaunchDialog({
  game,
  icon: Icon = Grid3X3Icon,
}: Readonly<{ game: GameViewRegistration; icon?: LucideIcon }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelRef[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("Player");
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  // You can only have one Wordle game at a time, so surface an unfinished one up
  // front as something to resume rather than letting the create fail with a 409.
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/games/active", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { game: null }))
      .then((body: { game: { gameId: string } | null }) => {
        if (active) setActiveGameId(body.game?.gameId ?? null);
      })
      .catch(() => {
        if (active) setActiveGameId(null);
      });
    return () => {
      active = false;
    };
  }, [open]);

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
        setSelectedIds(catalog.models.slice(0, 3).map((model) => model.id));
        setCatalogState("ready");
      })
      .catch(() => {
        if (active) setCatalogState("error");
      });
    return () => {
      active = false;
    };
  }, [open]);

  function toggleModel(modelId: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) return current.includes(modelId) || current.length >= 5 ? current : [...current, modelId];
      return current.filter((id) => id !== modelId);
    });
    setError(null);
  }

  async function launch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    if (!name || selectedIds.length === 0) {
      setError(!name ? "Enter a name for your board." : "Choose at least one model.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // One call: the game is created and the model boards start immediately.
      // The response deliberately carries no answer — the client validates words
      // locally and the server scores them.
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelIds: selectedIds, displayName: name }),
      });

      if (response.status === 409) {
        const body = await response.json() as { gameId?: string };
        if (body.gameId) {
          setActiveGameId(body.gameId);
          setError("You already have a game in progress. Resume or quit it first.");
          setSubmitting(false);
          return;
        }
      }
      if (!response.ok) throw new Error(await responseMessage(response, "Could not start the game."));

      const created = await response.json() as { gameId: string };
      router.push(`/play/wordle/${created.gameId}`);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Could not start the game.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label="Play Wordle"
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
          <DialogTitle>Choose your Wordle opponents</DialogTitle>
          <DialogDescription>
            Everyone gets the same word and one board. Model guesses stay sealed until your board ends.
          </DialogDescription>
        </DialogHeader>

        {activeGameId && (
          <Alert>
            <AlertTitle>You have a game in progress</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>Finish or quit it before starting another.</span>
              <Button onClick={() => router.push(`/play/wordle/${activeGameId}`)} size="sm">
                Resume game
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <form className="flex flex-col gap-5" onSubmit={launch}>
          <FieldGroup>
            <Field data-invalid={Boolean(error && !displayName.trim())}>
              <FieldLabel htmlFor="wordle-player-name">Your board name</FieldLabel>
              <Input
                aria-invalid={Boolean(error && !displayName.trim())}
                autoComplete="nickname"
                id="wordle-player-name"
                maxLength={40}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setError(null);
                }}
                value={displayName}
              />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">Models</FieldLegend>
              <FieldDescription>Pick up to five. This always starts a single shared-word match.</FieldDescription>
              <FieldGroup data-slot="checkbox-group" className="max-h-56 overflow-y-auto rounded-lg border p-2">
                {catalogState === "loading" && (
                  <div className="flex min-h-24 items-center justify-center gap-2 text-muted-foreground">
                    <Spinner />
                    Loading models
                  </div>
                )}
                {catalogState === "ready" && models.map((model) => {
                  const checked = selectedIds.includes(model.id);
                  const disabled = !checked && selectedIds.length >= 5;
                  return (
                    <Field data-disabled={disabled} key={model.id} orientation="horizontal">
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        id={`wordle-model-${model.id}`}
                        onCheckedChange={(nextChecked) => toggleModel(model.id, nextChecked)}
                      />
                      <FieldLabel htmlFor={`wordle-model-${model.id}`}>
                        <FieldContent>
                          <FieldTitle>{model.displayName}</FieldTitle>
                          <FieldDescription>{model.id.split(":")[0]}</FieldDescription>
                        </FieldContent>
                      </FieldLabel>
                    </Field>
                  );
                })}
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
            <Button
              disabled={submitting || catalogState !== "ready" || models.length === 0}
              type="submit"
            >
              {submitting ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {submitting ? "Starting" : "Play one game"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string; message?: string };
    if (body.error === "internal_error") return "The game service is not configured yet.";
    if (body.error === "at_capacity") return body.message ?? "The arena is busy. Try again in a moment.";
    if (body.error === "unknown_model") return "One of those models is not currently enabled.";
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}
