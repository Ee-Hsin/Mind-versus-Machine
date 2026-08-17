"use client";

import { usePathname } from "next/navigation";
import { WordleLaunchDialog } from "@/components/wordle/wordle-launch-dialog";

export function HeaderActions() {
  const pathname = usePathname();

  if (pathname === "/") {
    return <WordleLaunchDialog buttonClassName="hidden h-9 rounded-xl px-3 sm:inline-flex" buttonLabel="New Game" compact />;
  }

  return (
    <span className="flex items-center gap-2 font-mono text-[0.62rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
      <span aria-hidden="true" className="size-1.5 rotate-45 bg-wordle-correct" />
      Wordle arena
    </span>
  );
}
