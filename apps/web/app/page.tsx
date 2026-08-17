import { EyeOffIcon } from "lucide-react";
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

const modelProgress = [
  ["bg-wordle-correct", "bg-wordle-present", "bg-wordle-absent", "bg-wordle-absent", "bg-wordle-absent"],
  ["bg-wordle-present", "bg-wordle-present", "bg-wordle-present", "bg-wordle-absent", "bg-wordle-absent"],
  ["bg-wordle-absent", "bg-wordle-correct", "bg-wordle-present", "bg-wordle-absent", "bg-wordle-absent"],
] as const;

export default function HomePage() {
  return (
    <div className="home-grid relative isolate mx-auto w-full max-w-[82rem] overflow-hidden py-8 sm:py-10 lg:py-8">
      <div aria-hidden="true" className="hero-glow" />

      <div className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,0.78fr)] lg:gap-20">
        <section className="flex max-w-2xl flex-col items-center sm:items-start">
          <h1 className="max-w-3xl text-center text-[clamp(3.4rem,8vw,6.8rem)] leading-[0.86] font-semibold tracking-[-0.075em] text-balance sm:text-left">
            Outsmart the <span className="text-wordle-correct">machine.</span>
          </h1>

          <p className="hero-description mt-8 max-w-xl text-center text-lg leading-8 text-muted-foreground sm:text-left sm:text-xl">
            The latest AI models are pretty great at a lot of things... but can they beat you in Wordle?
          </p>

          <div className="mx-auto mt-5 w-[calc(100%-3rem)] sm:mx-0 sm:w-auto">
            <WordleLaunchDialog />
          </div>
        </section>

        <aside aria-label="Wordle match preview" className="relative mx-auto w-full max-w-[31rem]">
          <div aria-hidden="true" className="absolute -inset-5 -z-10 rounded-[2rem] border border-wordle-correct/25 bg-wordle-correct/[0.035]" />
          <div className="arena-preview overflow-hidden rounded-[1.75rem] border bg-card shadow-2xl shadow-black/30">
            <div className="border-b px-5 py-4 sm:px-6">
              <p className="font-mono text-[0.62rem] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Your board</p>
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
                            className={`h-1 flex-1 rounded-full ${modelProgress[index][tileIndex]}`}
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
    </div>
  );
}
