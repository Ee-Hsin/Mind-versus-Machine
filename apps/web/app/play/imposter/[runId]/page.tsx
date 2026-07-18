import { ImposterArena } from "@/components/imposter/imposter-arena";

export default async function ImposterPlayPage({
  params,
}: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  return <ImposterArena runId={runId} />;
}
