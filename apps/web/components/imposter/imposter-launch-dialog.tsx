"use client";

import type { ModelRef } from "@ai-ramp/protocol";
import { EyeOffIcon, PlayIcon, type LucideIcon } from "lucide-react";
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

export function ImposterLaunchDialog({
  game,
  icon: Icon = EyeOffIcon,
}: Readonly<{ game: GameViewRegistration; icon?: LucideIcon }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelRef[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("Player");
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
        setSelectedIds(catalog.models.slice(0, 5).map((model) => model.id));
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
    if (!name || selectedIds.length !== 5) {
      setError(!name ? "Enter a player name." : "Choose exactly five models.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const createResponse = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: "imposter", modelIds: selectedIds, displayName: name }),
      });
      if (!createResponse.ok) throw new Error(await responseMessage(createResponse, "Could not create the match."));
      const created = await createResponse.json() as { run: { id: string } };

      const readyResponse = await fetch(`/api/runs/${created.run.id}/ready`, { method: "POST" });
      if (!readyResponse.ok) throw new Error(await responseMessage(readyResponse, "Could not start the match."));
      router.push(`/play/imposter/${created.run.id}`);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Could not start the match.");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label="Play Imposter"
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
          <DialogTitle>Choose the table</DialogTitle>
          <DialogDescription>
            You join five models. Crew sees the word; the hidden Imposter gets only a hint.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={launch}>
          <FieldGroup>
            <Field data-invalid={Boolean(error && !displayName.trim())}>
              <FieldLabel htmlFor="imposter-player-name">Your player name</FieldLabel>
              <Input
                aria-invalid={Boolean(error && !displayName.trim())}
                autoComplete="nickname"
                id="imposter-player-name"
                maxLength={40}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setError(null);
                }}
                value={displayName}
              />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">Model players</FieldLegend>
              <FieldDescription>Choose exactly five. Roles and speaking order are assigned after launch.</FieldDescription>
              <FieldGroup data-slot="checkbox-group" className="max-h-64 overflow-y-auto rounded-lg border p-2">
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
                        id={`imposter-model-${model.id}`}
                        onCheckedChange={(nextChecked) => toggleModel(model.id, nextChecked)}
                      />
                      <FieldLabel htmlFor={`imposter-model-${model.id}`}>
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
          {catalogState === "ready" && models.length < 5 && (
            <Alert>
              <AlertTitle>Five models required</AlertTitle>
              <AlertDescription>Add at least five model IDs to ARENA_MODELS before starting.</AlertDescription>
            </Alert>
          )}
          {error && <FieldError>{error}</FieldError>}

          <DialogFooter showCloseButton>
            <Button
              disabled={submitting || catalogState !== "ready" || models.length < 5 || selectedIds.length !== 5}
              type="submit"
            >
              {submitting ? <Spinner data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {submitting ? "Starting" : "Take your seat"}
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
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}
