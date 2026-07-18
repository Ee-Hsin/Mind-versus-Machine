"use client";

import { EyeOffIcon, Grid3X3Icon, NetworkIcon, type LucideIcon } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import type { GameViewId, GameViewRegistration } from "@/games/registry";

const gameIcons: Record<GameViewId, LucideIcon> = {
  wordle: Grid3X3Icon,
  codenames: NetworkIcon,
  imposter: EyeOffIcon,
};

export function GameDialog({ game }: Readonly<{ game: GameViewRegistration }>) {
  const Icon = gameIcons[game.id];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            aria-label={`Open ${game.label} details`}
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
          <DialogTitle>{game.dialogTitle}</DialogTitle>
          <DialogDescription>{game.dialogDescription}</DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="grid gap-5 py-1">
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Match format</p>
            <p className="leading-6">{game.matchFormat}</p>
          </div>
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">What the eval captures</p>
            <p className="leading-6">{game.evaluation}</p>
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
