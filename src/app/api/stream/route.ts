import { bus } from '@/lib/bus';
import { getBoardState, bumpVisitors } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * SSE feed. Every connected board gets the new state pushed the moment a bid
 * lands, so the reflow is simultaneous for everyone watching.
 *
 * The visitor counter is incremented here rather than during page render:
 * one increment per live viewer that actually opened a stream, and no
 * side effect inside a server component.
 *
 * NOTE for auth: keep this route public — the board renders for logged-out
 * visitors.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  await bumpVisitors().catch(() => {
    /* a counter failure must never keep the board from loading */
  });

  const stream = new ReadableStream({
    async start(controller) {
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

      const unsubscribe = bus.subscribe((state) => send('board', state));

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

      // Comment frames keep proxies from dropping an idle connection.
      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          cleanup();
        }
      }, 25_000);

      req.signal.addEventListener('abort', cleanup);

      // Immediate sync so a late joiner isn't left on stale server HTML.
      try {
        send('board', await getBoardState());
      } catch (err) {
        console.error('[stream] initial state failed', err);
      }
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
