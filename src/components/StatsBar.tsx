'use client';

import type { BoardState } from '@/lib/types';

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3 sm:px-4">
      <span className="font-[family-name:var(--font-case)] text-[9px] uppercase tracking-[0.2em] text-[rgba(239,230,210,0.5)]">
        {label}
      </span>
      <span
        className="font-[family-name:var(--font-case)] text-[15px] leading-none sm:text-[17px]"
        style={{ color: accent ? 'var(--color-string-glow)' : 'var(--color-paper)' }}
      >
        {value}
      </span>
    </div>
  );
}

export default function StatsBar({
  state,
  onPin,
  onTakeNumberOne,
}: {
  state: BoardState;
  onPin: () => void;
  onTakeNumberOne: () => void;
}) {
  const { stats, submissions } = state;
  const leader = submissions[0];

  return (
    <div
      className="sticky top-0 z-[100] border-b border-[rgba(235,235,240,0.12)] backdrop-blur-md"
      style={{ background: 'rgba(26,26,29,0.86)' }}
    >
      <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-3 py-2.5 sm:px-5">
        {/* wordmark */}
        <div className="flex shrink-0 items-center gap-2 pr-2 sm:pr-4">
          <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
            <path
              d="M3 29 C9 24 12 20 15 16"
              stroke="var(--color-string)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="18" cy="12" r="8" fill="var(--color-string-bright)" />
            <circle cx="15" cy="9" r="2.6" fill="#ff8f95" />
          </svg>
          <span className="font-[family-name:var(--font-case)] text-[15px] tracking-tight text-[color:var(--color-paper)] sm:text-[17px]">
            redstring<span className="text-[color:var(--color-string-glow)]">.lol</span>
          </span>
        </div>

        {/* Desktop stats. On mobile these move to their own row below — squeezed
            into this one they scrolled out of sight, taking the #1 price with
            them, which is the single number the whole site is about. */}
        <div className="hidden min-w-0 flex-1 items-center divide-x divide-[rgba(235,235,240,0.12)] overflow-x-auto [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden">
          <Stat label="Raised" value={money(stats.totalRaised)} />
          <Stat label="Cases" value={String(stats.totalCases)} />
          <Stat label="Watching" value={stats.visitors.toLocaleString('en-US')} />
          <Stat label="Clicks" value={stats.totalClicks.toLocaleString('en-US')} />
          <Stat
            label={leader ? `#1 · ${leader.title}` : '#1'}
            value={money(stats.topBid)}
            accent
          />
        </div>

        {/* CTAs */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
          <button
            onClick={onTakeNumberOne}
            className="hidden whitespace-nowrap border border-[rgba(235,235,240,0.24)] px-3 py-2 font-[family-name:var(--font-case)] text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-paper)] transition-colors hover:border-[color:var(--color-string-glow)] hover:text-[color:var(--color-string-glow)] md:block"
          >
            Take #1 · {money(stats.priceToTakeNumberOne)}
          </button>
          {/* On mobile the CTA lives in the sticky bar at the bottom of the
              page, where a thumb actually reaches. */}
          <button
            onClick={onPin}
            className="hidden whitespace-nowrap px-3 py-2 font-[family-name:var(--font-case)] text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-paper)] shadow-[0_3px_0_#7d0d13] transition-transform active:translate-y-[2px] active:shadow-[0_1px_0_#7d0d13] sm:block sm:px-4"
            style={{ background: 'var(--color-string)' }}
          >
            Pin your case
          </button>
        </div>
      </div>

      {/* mobile stats: their own full-width row, nothing clipped */}
      <div className="flex items-stretch divide-x divide-[rgba(235,235,240,0.12)] border-t border-[rgba(235,235,240,0.09)] py-1.5 sm:hidden">
        <div className="flex-1">
          <Stat label="Raised" value={money(stats.totalRaised)} />
        </div>
        <div className="flex-1">
          <Stat label="Cases" value={String(stats.totalCases)} />
        </div>
        <div className="flex-1">
          <Stat label="Clicks" value={stats.totalClicks.toLocaleString('en-US')} />
        </div>
        <button onClick={onTakeNumberOne} className="flex-[1.5] text-left">
          <Stat
            label={leader ? `Take #1 · ${leader.title}` : 'Take #1'}
            value={money(stats.priceToTakeNumberOne)}
            accent
          />
        </button>
      </div>
    </div>
  );
}
