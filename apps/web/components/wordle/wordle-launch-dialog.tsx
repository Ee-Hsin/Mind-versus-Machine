"use client";

import { ArrowRightIcon, PlayIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { ModelRef } from "@/lib/wordle/types";

interface CatalogResponse {
  models: ModelRef[];
}

export function WordleLaunchDialog({
  buttonLabel = "Start Game",
  buttonClassName,
  compact = false,
}: Readonly<{
  buttonLabel?: string;
  buttonClassName?: string;
  compact?: boolean;
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelRef[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [catalogState, setCatalogState] = useState<"idle" | "loading" | "ready" | "error">("idle");
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
      setError(!name ? "Enter your name." : "Choose at least one model.");
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
            aria-label={buttonLabel}
            className={cn(
              !compact && "relative h-14 w-full rounded-full bg-wordle-correct px-6 text-base font-bold text-wordle-correct-foreground shadow-lg shadow-wordle-correct/15 hover:bg-wordle-correct/90 sm:w-auto sm:pr-12",
              buttonClassName,
            )}
            size={compact ? "sm" : "default"}
            variant={compact ? "outline" : "default"}
          />
        }
      >
        {buttonLabel}
        {compact ? <PlayIcon aria-hidden="true" /> : <ArrowRightIcon aria-hidden="true" className="absolute top-1/2 right-6 hidden size-4 -translate-y-1/2 transition-transform group-hover/button:translate-x-1 sm:block" />}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build your Wordle match</DialogTitle>
          <DialogDescription>
            Everyone gets the same word and their own board.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={launch}>
          <FieldGroup>
            <Field data-invalid={Boolean(error && !displayName.trim())}>
              <FieldLabel htmlFor="wordle-player-name">Your name</FieldLabel>
              <Input
                aria-invalid={Boolean(error && !displayName.trim())}
                autoComplete="nickname"
                id="wordle-player-name"
                maxLength={40}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setError(null);
                }}
                placeholder="e.g Jordan, Alex, Sarah etc.."
                required
                value={displayName}
              />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">Models</FieldLegend>
              <FieldDescription>Choose up to five.</FieldDescription>
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
                          <FieldDescription>{model.id.split("/")[0]}</FieldDescription>
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
              <AlertDescription>
                Add OPENROUTER_API_KEY and matching model IDs in ARENA_MODELS before starting a match.
              </AlertDescription>
            </Alert>
          )}
          {error && <FieldError>{error}</FieldError>}

          <DialogFooter showCloseButton>
            <Button
              disabled={submitting || catalogState !== "ready" || models.length === 0}
              type="submit"
            >
              {submitting ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {submitting ? "Starting" : "Start match"}
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
    if (body.error === "unknown_model") return "One of those models is not currently enabled.";
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}
