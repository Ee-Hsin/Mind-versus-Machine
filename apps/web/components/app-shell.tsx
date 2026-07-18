import Link from "next/link";
import type { ReactNode } from "react";
import { PrimaryNav } from "@/components/primary-nav";

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center justify-between gap-6 px-4 sm:px-6">
          <Link className="flex items-center gap-2.5" href="/">
            <span className="font-heading text-sm font-semibold">
              The Intangible Game
            </span>
          </Link>

          <PrimaryNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[96rem] px-4 sm:px-6">
        {children}
      </main>
    </div>
  );
}
