export function notImplemented(capability: string): Response {
  return Response.json(
    {
      error: "not_implemented",
      message: `${capability} is defined by the architecture wireframe but is not implemented yet.`,
    },
    { status: 501 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
