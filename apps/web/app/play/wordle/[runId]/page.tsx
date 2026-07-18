import { WordleArena } from "@/components/wordle/wordle-arena";

export default async function WordlePlayPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  return <WordleArena runId={runId} />;
}
