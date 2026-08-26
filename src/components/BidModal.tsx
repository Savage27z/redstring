'use client';

import { useState } from 'react';
import Modal from './Modal';
import { CATEGORIES, MIN_BID, priceToBeat } from '@/lib/types';
import type { Category, Submission } from '@/lib/types';

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

const field =
  'w-full bg-[rgba(255,255,255,0.42)] px-3 py-2.5 font-[family-name:var(--font-body)] text-[15px] text-[color:var(--color-ink)] outline-none ring-1 ring-inset ring-[rgba(90,66,36,0.4)] transition focus:ring-2 focus:ring-[color:var(--color-string)] placeholder:text-[color:var(--color-ink-faint)]';
const label =
  'mb-1.5 block font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]';

/**
 * Handles both flows, because they are the same transaction:
 *   - `target` set  -> outbid an existing case file
 *   - `target` null -> pin a new case to the board
 */
export default function BidModal({
  open,
  target,
  minimum,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  target: Submission | null;
  /** floor for a brand-new pin (usually MIN_BID) */
  minimum: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const floor = target ? priceToBeat(target.currentBid) : Math.max(MIN_BID, minimum);

  const [amount, setAmount] = useState<string>(String(floor));
  const [bidderName, setBidderName] = useState('');
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the amount whenever the modal is opened against a new target.
  const [seenFloor, setSeenFloor] = useState(floor);
  if (open && seenFloor !== floor) {
    setSeenFloor(floor);
    setAmount(String(floor));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value < floor) {
      setError(`Minimum for this slot is ${money(floor)}.`);
      return;
    }
    if (!target) {
      if (!title.trim()) return setError('Every case needs a name.');
      if (!url.trim()) return setError('Every case needs a URL.');
    }

    setBusy(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: target?.id,
          amount: value,
          bidderName: bidderName.trim() || 'anon',
          newCase: target
            ? undefined
            : {
                title: title.trim(),
                tagline: tagline.trim(),
                url: url.trim(),
                logoUrl: null,
                category,
              },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong.');

      // Polar configured -> hand off to checkout. Otherwise the server already
      // applied the bid (dev mode) and the board is about to reflow via SSE.
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      onSubmitted();
      onClose();
      setTitle('');
      setTagline('');
      setUrl('');
      setBidderName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const quick = [floor, Math.ceil(floor * 1.5), floor * 2, floor * 5];

  return (
    <Modal open={open} onClose={onClose} labelledBy="bid-title">
      <form
        onSubmit={submit}
        className="paper relative border-2 border-[rgba(90,66,36,0.5)] shadow-[0_30px_60px_rgba(10,6,2,0.7)]"
        style={{ transform: 'rotate(0.4deg)' }}
      >
        <div className="border-b-2 border-dashed border-[rgba(90,66,36,0.4)] p-5 pb-4">
          <div className="font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.24em] text-[color:var(--color-ink-faint)]">
            {target ? 'Contest the claim' : 'New case file'}
          </div>
          <h2
            id="bid-title"
            className="mt-1 font-[family-name:var(--font-case)] text-3xl text-[color:var(--color-ink)]"
          >
            {target ? `Outbid ${target.title}` : 'Pin your case'}
          </h2>
          <p className="mt-1.5 text-[13px] text-[color:var(--color-ink-soft)]">
            {target
              ? `${target.bidderName} holds this slot at ${money(target.currentBid)}. Beat it and the board reflows around you.`
              : `Bids are area. Pay more, get a bigger case file. Minimum ${money(floor)}.`}
          </p>
        </div>

        <div className="max-h-[58vh] space-y-4 overflow-y-auto p-5">
          {!target && (
            <>
              <div>
                <label className={label} htmlFor="f-title">
                  Company / project
                </label>
                <input
                  id="f-title"
                  className={field}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Acme Inc."
                  maxLength={60}
                  required
                />
              </div>
              <div>
                <label className={label} htmlFor="f-tagline">
                  One-line statement
                </label>
                <input
                  id="f-tagline"
                  className={field}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="What you do, in one breath."
                  maxLength={140}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="f-url">
                    URL
                  </label>
                  <input
                    id="f-url"
                    className={field}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://acme.com"
                    type="url"
                    required
                  />
                </div>
                <div>
                  <label className={label} htmlFor="f-cat">
                    Filed under
                  </label>
                  <select
                    id="f-cat"
                    className={field}
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className={label} htmlFor="f-name">
              Your name on the file
            </label>
            <input
              id="f-name"
              className={field}
              value={bidderName}
              onChange={(e) => setBidderName(e.target.value)}
              placeholder="anon"
              maxLength={40}
            />
          </div>

          <div>
            <label className={label} htmlFor="f-amount">
              Bid — minimum {money(floor)}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-[family-name:var(--font-case)] text-xl text-[color:var(--color-string)]">
                $
              </span>
              <input
                id="f-amount"
                className={`${field} pl-8 font-[family-name:var(--font-case)] text-xl`}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                required
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {quick.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className="px-2.5 py-1 font-[family-name:var(--font-case)] text-[12px] text-[color:var(--color-ink-soft)] ring-1 ring-inset ring-[rgba(90,66,36,0.4)] transition-colors hover:bg-[rgba(179,18,27,0.1)] hover:text-[color:var(--color-string)]"
                >
                  {money(q)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p
              className="border-l-[3px] px-3 py-2 font-[family-name:var(--font-case)] text-[13px]"
              style={{ borderColor: 'var(--color-string)', color: 'var(--color-string)', background: 'rgba(179,18,27,0.07)' }}
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[rgba(90,66,36,0.3)] p-5 sm:flex-row">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 px-4 py-3 font-[family-name:var(--font-case)] text-[13px] uppercase tracking-[0.14em] text-[color:var(--color-paper)] shadow-[0_4px_0_#7d0d13] transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_#7d0d13] disabled:opacity-60"
            style={{ background: 'var(--color-string)' }}
          >
            {busy ? 'Pinning…' : target ? 'Take the slot' : 'Pin it to the board'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 font-[family-name:var(--font-case)] text-[13px] uppercase tracking-[0.14em] text-[color:var(--color-ink-soft)] ring-1 ring-inset ring-[rgba(90,66,36,0.45)] transition-colors hover:bg-[rgba(90,66,36,0.1)]"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
