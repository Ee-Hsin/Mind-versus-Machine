import { EyeOffIcon, ScaleIcon, ZapIcon } from "lucide-react";
import { WordleLaunchDialog } from "@/components/wordle/wordle-launch-dialog";

const previewRows = [
  [
    { letter: "B", state: "absent" },
    { letter: "R", state: "present" },
    { letter: "A", state: "absent" },
    { letter: "I", state: "absent" },
    { letter: "N", state: "absent" },
  ],
  [
    { letter: "S", state: "correct" },
    { letter: "T", state: "absent" },
    { letter: "A", state: "present" },
    { letter: "R", state: "present" },
    { letter: "E", state: "absent" },
  ],
  [
    { letter: "S", state: "correct" },
    { letter: "H", state: "correct" },
    { letter: "A", state: "correct" },
    { letter: "R", state: "correct" },
    { letter: "P", state: "correct" },
  ],
] as const;

const matchDetails = [
  { icon: ScaleIcon, label: "Same word", detail: "A fair match" },
  { icon: EyeOffIcon, label: "Sealed boards", detail: "No spoilers" },
  { icon: ZapIcon, label: "Live reveal", detail: "Compare every move" },
] as const;

export default function HomePage() {
  return (
    <div className="home-grid relative isolate mx-auto w-full max-w-[82rem] overflow-hidden pb-12 pt-10 sm:pb-16 sm:pt-16 lg:py-20">
      <div aria-hidden="true" className="hero-glow" />

      <div className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,0.78fr)] lg:gap-20">
        <section className="flex max-w-2xl flex-col items-start">
          <p className="mb-7 flex items-center gap-3 font-mono text-[0.7rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            <span className="size-2 rounded-full bg-wordle-correct shadow-[0_0_0_4px_color-mix(in_oklch,var(--wordle-correct),transparent_80%)]" />
            Wordle · Human vs AI
          </p>

          <h1 className="max-w-3xl text-[clamp(3.4rem,8vw,6.8rem)] leading-[0.86] font-semibold tracking-[-0.075em] text-balance">
            Outguess the <span className="text-wordle-correct">machine.</span>
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
            You and leading AI models get the same hidden word. Solve your board, then reveal how every rival thought.
          </p>

          <div className="mt-9 w-full sm:w-auto">
            <WordleLaunchDialog />
          </div>

          <p className="mt-4 font-mono text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase">
            Six tries · One shared word · No account needed
          </p>
        </section>

        <aside aria-label="Wordle match preview" className="relative mx-auto w-full max-w-[31rem]">
          <div aria-hidden="true" className="absolute -inset-5 -z-10 rotate-2 rounded-[2rem] border border-wordle-present/25 bg-wordle-present/[0.035]" />
          <div className="arena-preview overflow-hidden rounded-[1.75rem] border bg-card shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
              <div>
                <p className="font-mono text-[0.62rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Match preview</p>
                <p className="mt-1 text-sm font-semibold">You vs. three models</p>
              </div>
              <span className="rounded-full border border-wordle-correct/30 bg-wordle-correct/10 px-3 py-1 font-mono text-[0.62rem] font-semibold tracking-[0.14em] text-wordle-correct uppercase">
                Same word
              </span>
            </div>

            <div className="p-5 sm:p-7">
              <div aria-hidden="true" className="mx-auto grid w-fit gap-2">
                {previewRows.map((row, rowIndex) => (
                  <div className="grid grid-cols-5 gap-2" key={rowIndex}>
                    {row.map((tile, tileIndex) => (
                      <span
                        className={`wordle-demo-tile wordle-demo-tile--${tile.state}`}
                        key={`${rowIndex}-${tileIndex}`}
                      >
                        {tile.letter}
                      </span>
                    ))}
                  </div>
                ))}
                {Array.from({ length: 3 }, (_, rowIndex) => (
                  <div className="grid grid-cols-5 gap-2" key={`empty-${rowIndex}`}>
                    {Array.from({ length: 5 }, (_, tileIndex) => (
                      <span className="wordle-demo-tile wordle-demo-tile--empty" key={tileIndex} />
                    ))}
                  </div>
                ))}
              </div>

              <div className="mt-7 border-t pt-5">
                <div className="mb-3 flex items-center justify-between font-mono text-[0.62rem] tracking-[0.16em] text-muted-foreground uppercase">
                  <span>Opponent boards</span>
                  <span>Sealed until you finish</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {["GPT", "Claude", "Gemini"].map((model, index) => (
                    <div className="rounded-xl border bg-background/50 px-3 py-3" key={model}>
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold">{model}</span>
                        <EyeOffIcon aria-hidden="true" className="size-3 text-muted-foreground" />
                      </div>
                      <div className="flex gap-1">
                        {Array.from({ length: 5 }, (_, tileIndex) => (
                          <span
                            className={index === 1 && tileIndex < 3 ? "h-1 flex-1 rounded-full bg-wordle-present" : "h-1 flex-1 rounded-full bg-border"}
                            key={tileIndex}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section aria-label="Match details" className="relative mt-16 grid border-y sm:grid-cols-3 lg:mt-24">
        {matchDetails.map(({ icon: Icon, label, detail }) => (
          <div className="flex items-center gap-4 border-b px-2 py-5 last:border-b-0 sm:border-r sm:border-b-0 sm:px-6 sm:first:pl-0 sm:last:border-r-0" key={label}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
