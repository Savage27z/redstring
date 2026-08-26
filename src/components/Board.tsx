'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import StatsBar from './StatsBar';
import CaseModal from './CaseModal';
import BidModal from './BidModal';
import Ticker from './Ticker';
import type { BoardState, Submission } from '@/lib/types';

// WebGL can't render on the server, and pulling three into the SSR bundle
// only slows the first byte down.
const BoardScene = dynamic(() => import('./three/BoardScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#2b2b2e]">
      <span className="font-[family-name:var(--font-case)] text-[12px] uppercase tracking-[0.28em] text-[rgba(239,230,210,0.45)]">
        Assembling the board…
      </span>
    </div>
  ),
});

export default function Board({ initial }: { initial: BoardState }) {
  const [state, setState] = useState<BoardState>(initial);
  const [hovered, setHovered] = useState<string | null>(null);
  const [openCase, setOpenCase] = useState<Submission | null>(null);
  const [bidTarget, setBidTarget] = useState<Submission | null>(null);
  const [bidOpen, setBidOpen] = useState(false);

  /* ---- realtime: SSE, with polling fallback ---------------------------- */
  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let failures = 0;
    let disposed = false;

    const refetch = async () => {
      try {
        const res = await fetch('/api/board', { cache: 'no-store' });
        if (res.ok && !disposed) setState(await res.json());
      } catch {
        /* offline; next tick retries */
      }
    };

    const startPolling = () => {
      if (poll || disposed) return;
      poll = setInterval(refetch, 5000);
    };

    const stopPolling = () => {
      if (!poll) return;
      clearInterval(poll);
      poll = null;
    };

    try {
      es = new EventSource('/api/stream');

      es.addEventListener('board', (e) => {
        // A frame arriving means the stream is healthy again.
        failures = 0;
        stopPolling();
        try {
          setState(JSON.parse((e as MessageEvent).data));
        } catch {
          /* malformed frame — the next one will be fine */
        }
      });

      // EventSource reconnects on its own, so a single blip must NOT start a
      // parallel poll — that ran both transports at once and applied every
      // update twice. Only fall back once it has actually given up (CLOSED) or
      // failed repeatedly, and stand down again as soon as a frame arrives.
      es.onerror = () => {
        failures += 1;
        if (es?.readyState === EventSource.CLOSED || failures >= 3) startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      disposed = true;
      es?.close();
      stopPolling();
    };
  }, []);

  // Rank is just bid order — no need to run the whole layout to find it.
  const rankOf = useCallback(
    (id: string) =>
      [...state.submissions]
        .sort((a, b) => b.currentBid - a.currentBid || a.id.localeCompare(b.id))
        .findIndex((s) => s.id === id) + 1,
    [state.submissions],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/board', { cache: 'no-store' });
      if (res.ok) setState(await res.json());
    } catch {
      /* SSE will catch us up */
    }
  }, []);

  const openBid = useCallback((s: Submission | null) => {
    setBidTarget(s);
    setBidOpen(true);
    setOpenCase(null);
  }, []);

  const leader = state.submissions[0] ?? null;
  const submissions = useMemo(() => state.submissions, [state.submissions]);

  return (
    // Desktop: a locked full-height board. Mobile: the page scrolls, because a
    // 3:2 board can only ever fill so much of a tall phone screen — forcing it
    // full-height just strands the board in a sea of empty room.
    // 100dvh, not 100vh: vh ignores mobile browser chrome and overflows.
    // pb-14 keeps the sticky mobile CTA from permanently covering the last row
    // of the list; without it the bottom entry is unreachable.
    <div className="flex min-h-[100dvh] flex-col bg-[#2b2b2e] pb-14 sm:h-[100dvh] sm:min-h-0 sm:overflow-hidden sm:pb-0">
      <StatsBar
        state={state}
        onPin={() => openBid(null)}
        onTakeNumberOne={() => openBid(leader)}
      />

      {/* Sized to the board's own proportions on mobile (the framed panel is
          ~1.45:1) so the canvas isn't mostly empty room above and below it. */}
      <main
        className="relative aspect-[7/5] w-full shrink-0 sm:aspect-auto sm:h-auto sm:min-h-0 sm:flex-1"
        aria-label={`Detective corkboard showing ${state.stats.totalCases} case files, sized by bid. The full ranking follows as a list.`}
      >
        <BoardScene
          submissions={submissions}
          hovered={hovered}
          onHover={setHovered}
          onOpen={setOpenCase}
        />

        <p className="pointer-events-none absolute bottom-3 left-4 z-10 font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.2em] text-[rgba(239,230,210,0.32)]">
          <span className="hidden sm:inline">Click a file to open it · drag to lean the board</span>
          <span className="sm:hidden">Drag to lean the board</span>
        </p>
      </main>

      <Ticker bids={state.recentBids} submissions={state.submissions} />

      {/* On a phone the smaller cards are a few millimetres across — accurate
          to the mechanic, useless as a tap target. The board stays the hero;
          this gives the ranking somewhere it can actually be read and used.

          On desktop it is visually hidden rather than `display: none`, because
          the WebGL canvas exposes nothing to a screen reader: removing this
          left assistive tech with no access to the board at all. Focusing any
          row brings it back on screen. */}
      <h2 className="sr-only">Case files by bid</h2>
      <ol className="sm:pointer-events-none sm:absolute sm:h-px sm:w-px sm:overflow-hidden sm:opacity-0 sm:focus-within:pointer-events-auto sm:focus-within:static sm:focus-within:h-auto sm:focus-within:w-auto sm:focus-within:opacity-100">
        {state.submissions.map((s, i) => (
          <li key={s.id}>
            <button
              onClick={() => setOpenCase(s)}
              className="flex w-full items-center gap-3 border-b border-[rgba(235,235,240,0.09)] px-4 py-3 text-left active:bg-[rgba(235,235,240,0.06)]"
            >
              <span
                className="w-7 shrink-0 py-0.5 text-center font-[family-name:var(--font-case)] text-[12px] leading-none"
                style={{
                  background: i === 0 ? 'var(--color-string)' : 'rgba(235,235,240,0.1)',
                  color: i === 0 ? 'var(--color-paper)' : 'rgba(239,230,210,0.75)',
                }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-[family-name:var(--font-case)] text-[15px] text-[color:var(--color-paper)]">
                  {s.title}
                </span>
                <span className="block truncate text-[12px] text-[rgba(239,230,210,0.45)]">
                  {s.tagline || s.url.replace(/^https?:\/\//, '')}
                </span>
              </span>
              <span className="shrink-0 font-[family-name:var(--font-case)] text-[15px] text-[color:var(--color-string-glow)]">
                ${s.currentBid.toLocaleString('en-US')}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <button
        onClick={() => openBid(null)}
        className="sticky bottom-0 z-20 w-full px-4 py-4 font-[family-name:var(--font-case)] text-[13px] uppercase tracking-[0.14em] text-[color:var(--color-paper)] sm:hidden"
        style={{ background: 'var(--color-string)' }}
      >
        Pin your case · from ${state.stats.minimumBid}
      </button>

      <CaseModal
        submission={openCase}
        rank={openCase ? rankOf(openCase.id) : 0}
        onClose={() => setOpenCase(null)}
        onOutbid={(s) => openBid(s)}
      />

      <BidModal
        open={bidOpen}
        target={bidTarget}
        minimum={state.stats.minimumBid}
        onClose={() => setBidOpen(false)}
        onSubmitted={refresh}
      />
    </div>
  );
}
