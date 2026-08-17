import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-[96rem] items-center justify-between gap-6 px-4 sm:px-6">
          <Link className="group flex items-center gap-3" href="/">
            <span aria-hidden="true" className="grid size-8 grid-cols-2 gap-0.5 rotate-3 transition-transform group-hover:rotate-0">
              <span className="bg-wordle-correct" />
              <span className="bg-wordle-present" />
              <span className="bg-wordle-absent" />
              <span className="border bg-card" />
            </span>
            <span className="font-heading text-sm font-bold tracking-[-0.02em] sm:text-base">
              Mind <span className="text-muted-foreground">vs.</span> Machine
            </span>
          </Link>

          <span className="flex items-center gap-2 font-mono text-[0.62rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            <span aria-hidden="true" className="size-1.5 rotate-45 bg-wordle-correct" />
            Wordle arena
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[96rem] px-4 sm:px-6">
        {children}
      </main>
    </div>
  );
}
