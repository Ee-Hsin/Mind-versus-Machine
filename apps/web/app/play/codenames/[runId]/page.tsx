import { CodenamesArena } from "@/components/codenames/codenames-arena";

export default async function CodenamesPlayPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  return <CodenamesArena runId={runId} />;
}
