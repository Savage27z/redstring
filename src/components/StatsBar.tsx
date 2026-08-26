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
