import { bus } from '@/lib/bus';
import { getBoardState } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * SSE feed. Every connected board gets the new state pushed the moment a bid
 * lands, so the reflow is simultaneous for everyone watching.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // Immediate sync so a late joiner isn't staring at stale server HTML.
      send('board', getBoardState());

      const unsubscribe = bus.subscribe((state) => send('board', state));

      // Comment frames keep proxies from closing an idle connection.
      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          closed = true;
        }
      }, 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
