export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();

export async function POST(req: Request) {
  let dataUrl: string;
  try {
    const body = (await req.json()) as { dataUrl: string };
    dataUrl = body.dataUrl;
    if (!dataUrl) throw new Error("missing dataUrl");
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const msg = encoder.encode(`data: ${JSON.stringify({ dataUrl })}\n\n`);
  const dead: ReadableStreamDefaultController<Uint8Array>[] = [];
  for (const ctrl of sseClients) {
    try {
      ctrl.enqueue(msg);
    } catch {
      dead.push(ctrl);
    }
  }
  dead.forEach((c) => sseClients.delete(c));

  return new Response(null, { status: 204 });
}

export async function GET() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      sseClients.add(c);
      c.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      sseClients.delete(ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
