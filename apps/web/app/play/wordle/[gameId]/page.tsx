import { WordleArena } from "@/components/wordle/wordle-arena";

export default async function WordlePlayPage({
  params,
}: Readonly<{ params: Promise<{ gameId: string }> }>) {
  const { gameId } = await params;
  return <WordleArena gameId={gameId} />;
}
