'use client';

import type { BidEvent, Submission } from '@/lib/types';

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

/**
 * Case-log strip along the bottom of the wall. Reads as a teletype feed of
 * incoming evidence rather than a notification list.
 */
export default function Ticker({
  bids,
  submissions,
}: {
  bids: BidEvent[];
  submissions: Submission[];
}) {
  if (bids.length === 0) return null;

  const nameOf = (id: string) =>
    submissions.find((s) => s.id === id)?.title ?? 'unknown party';

  return (
    <div
      className="relative z-[60] border-t border-[rgba(235,235,240,0.12)]"
      style={{ background: 'rgba(26,26,29,0.9)' }}
    >
      <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-4 py-2">
        <span className="shrink-0 font-[family-name:var(--font-case)] text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-string-glow)]">
          Case log
        </span>
        <div className="flex min-w-0 flex-1 gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {bids.map((b) => (
            <span
              key={b.id}
              className="shrink-0 whitespace-nowrap font-[family-name:var(--font-case)] text-[11px] text-[rgba(239,230,210,0.62)]"
            >
              <span className="text-[color:var(--color-paper)]">{b.bidderName}</span>
              {' claimed '}
              <span className="text-[color:var(--color-paper)]">{nameOf(b.submissionId)}</span>
              {' at '}
              <span className="text-[color:var(--color-string-glow)]">{money(b.amount)}</span>
              {b.previousBid !== null && (
                <span className="text-[rgba(239,230,210,0.38)]">
                  {' '}
                  (over {money(b.previousBid)})
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
