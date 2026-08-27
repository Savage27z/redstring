'use client';

import { useSyncExternalStore } from 'react';
import Modal from './Modal';
import { ownsCase } from '@/lib/ownedCases';
import { CATEGORIES, priceToBeat } from '@/lib/types';
import type { Submission } from '@/lib/types';

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

export default function CaseModal({
  submission,
  rank,
  onClose,
  onRaise,
  onPinOwn,
}: {
  submission: Submission | null;
  rank: number;
  onClose: () => void;
  /** raise a case this browser owns */
  onRaise: (s: Submission) => void;
  /** pin your own case, priced to land above this one */
  onPinOwn: (beatAmount: number) => void;
}) {
  // Ownership lives in localStorage, which the server cannot see. useSyncExternalStore
  // reads it on the client while returning false during server rendering, so the
  // two agree on first paint without a setState-in-effect round trip.
  const mine = useSyncExternalStore(
    () => () => {},
    () => (submission ? ownsCase(submission.id) : false),
    () => false,
  );

  if (!submission) return null;
  const beat = priceToBeat(submission.currentBid);
  const categoryLabel =
    CATEGORIES.find((c) => c.value === submission.category)?.label ?? 'Unclassified';

  return (
    <Modal open={!!submission} onClose={onClose} labelledBy="case-title">
      <div
        className="paper relative border-2 border-[rgba(90,66,36,0.5)] shadow-[0_30px_60px_rgba(10,6,2,0.7)]"
        style={{ transform: 'rotate(-0.5deg)' }}
      >
        {/* file header */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-dashed border-[rgba(90,66,36,0.4)] p-5 pb-4">
          <div className="min-w-0">
            <div className="font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-ink-faint)]">
              Case No. {submission.id.slice(-5).toUpperCase()} · {categoryLabel}
            </div>
            <h2
              id="case-title"
              className="mt-1 truncate font-[family-name:var(--font-case)] text-3xl text-[color:var(--color-ink)]"
            >
              {submission.title}
            </h2>
          </div>
          <div
            className="stamp shrink-0 rotate-[6deg] px-2.5 py-1.5 text-center text-[11px] leading-tight"
            style={{ color: rank === 1 ? 'var(--color-string)' : 'var(--color-ink-soft)' }}
          >
            RANK
            <br />
            <span className="text-lg">#{rank}</span>
          </div>
        </div>

        <div className="p-5">
          <p className="text-[15px] leading-relaxed text-[color:var(--color-ink-soft)]">
            {submission.tagline || 'No statement on file.'}
          </p>

          {/* evidence table */}
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[rgba(90,66,36,0.3)] py-4">
            <div>
              <dt className="font-[family-name:var(--font-case)] text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]">
                Standing bid
              </dt>
              <dd className="font-[family-name:var(--font-case)] text-2xl leading-tight text-[color:var(--color-string)]">
                {money(submission.currentBid)}
              </dd>
            </div>
            <div>
              <dt className="font-[family-name:var(--font-case)] text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]">
                Held by
              </dt>
              <dd className="truncate font-[family-name:var(--font-case)] text-lg leading-tight text-[color:var(--color-ink)]">
                {submission.bidderName}
              </dd>
            </div>
            <div>
              <dt className="font-[family-name:var(--font-case)] text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]">
                Claimed
              </dt>
              <dd className="font-[family-name:var(--font-case)] text-[13px] text-[color:var(--color-ink-soft)]">
                {new Date(submission.claimedAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </dd>
            </div>
            <div>
              <dt className="font-[family-name:var(--font-case)] text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]">
                Clicks
              </dt>
              <dd className="font-[family-name:var(--font-case)] text-lg leading-tight text-[color:var(--color-ink)]">
                {submission.clicks.toLocaleString('en-US')}
              </dd>
            </div>
            <div>
              <dt className="font-[family-name:var(--font-case)] text-[9px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]">
                Lead
              </dt>
              <dd className="truncate">
                <a
                  href={submission.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-[family-name:var(--font-case)] text-[13px] text-[color:var(--color-string)] underline decoration-dotted underline-offset-4 hover:text-[color:var(--color-string-bright)]"
                >
                  {submission.url.replace(/^https?:\/\//, '')}
                </a>
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {mine ? (
              <button
                onClick={() => onRaise(submission)}
                className="flex-1 px-4 py-3 font-[family-name:var(--font-case)] text-[13px] uppercase tracking-[0.14em] text-[color:var(--color-paper)] shadow-[0_4px_0_#7d0d13] transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_#7d0d13]"
                style={{ background: 'var(--color-string)' }}
              >
                Add to your bid
              </button>
            ) : (
              <button
                onClick={() => onPinOwn(beat)}
                className="flex-1 px-4 py-3 font-[family-name:var(--font-case)] text-[13px] uppercase tracking-[0.14em] text-[color:var(--color-paper)] shadow-[0_4px_0_#7d0d13] transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_#7d0d13]"
                style={{ background: 'var(--color-string)' }}
              >
                Beat it · from {money(beat)}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-3 font-[family-name:var(--font-case)] text-[13px] uppercase tracking-[0.14em] text-[color:var(--color-ink-soft)] ring-1 ring-inset ring-[rgba(90,66,36,0.45)] transition-colors hover:bg-[rgba(90,66,36,0.1)]"
            >
              Close file
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
