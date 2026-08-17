"use client";

import { usePathname } from "next/navigation";
import { WordleLaunchDialog } from "@/components/wordle/wordle-launch-dialog";

export function HeaderActions() {
  const pathname = usePathname();

  if (pathname === "/") {
    return <WordleLaunchDialog buttonClassName="hidden h-9 rounded-xl px-3 sm:inline-flex" buttonLabel="New Game" compact />;
  }

  return null;
}
