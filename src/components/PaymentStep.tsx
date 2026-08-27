'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The pay-with-USDC step.
 *
 * There is deliberately NO wallet connection anywhere in this flow. The site
 * never asks to connect, never learns the payer's address, and cannot prompt
 * for a signature — asking a stranger to attach their wallet to a site they
 * just found is a bigger ask than the bid itself.
 *
 * Solana shows a Solana Pay *transfer* request: the wallet reads the amount and
 * mint from the QR, builds the send locally, and shows a plain confirmation.
 * (A transaction request would make a shorter QR, but the wallet has to hand
 * its account to the server for one, which wallets present as "connect".)
 *
 * Base has no equivalent, so the payer sends from whatever wallet or exchange
 * they already use and pastes the transaction hash. The server verifies it
 * against the chain either way — the browser never decides a payment happened.
 */

export interface PaymentIntentView {
  id: string;
  chain: 'solana' | 'base';
  amount: number;
  recipient: string;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  expiresAt: string;
  txHash?: string;
  error?: string;
}

export interface PaymentPayload {
  intent: PaymentIntentView;
  solana?: { url: string; qr: string };
  base?: { uri: string; qr: string; token: string; chainId: number };
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

const label =
  'mb-1.5 block font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]';

/**
 * An address the payer can always get hold of.
 *
 * The async clipboard API is unavailable or blocked in a lot of in-app
 * browsers — Twitter and Telegram webviews among them — which is exactly where
 * a link like this gets opened. So: try the modern API, fall back to
 * execCommand, and if both fail say so instead of appearing to work. The
 * address itself is selectable text (one tap selects all of it), never trapped
 * inside a button, so manual copy is always possible.
 */
function Copyable({ value, title }: { value: string; title: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    const done = (ok: boolean) => {
      setState(ok ? 'copied' : 'failed');
      setTimeout(() => setState('idle'), 2400);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return done(true);
      }
    } catch {
      /* blocked; fall through to the legacy path */
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return done(ok);
    } catch {
      return done(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]">
          {title}
        </span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-string)] underline decoration-dotted underline-offset-4"
        >
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select it above' : 'Copy'}
        </button>
      </div>
      {/* select-all: one tap highlights the whole address, so copying by hand
          works even where the clipboard API does not. */}
      <code className="block w-full select-all break-all bg-[rgba(0,0,0,0.06)] p-2.5 text-[12px] leading-snug ring-1 ring-inset ring-[rgba(90,66,36,0.35)]">
        {value}
      </code>
    </div>
  );
}

export default function PaymentStep({
  payload,
  onConfirmed,
  onCancel,
}: {
  payload: PaymentPayload;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState(payload.intent.status);
  const [error, setError] = useState<string | null>(payload.intent.error ?? null);
  const [manualHash, setManualHash] = useState('');
  const [checking, setChecking] = useState(false);
  const settled = useRef(false);

  const finish = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    onConfirmed();
  }, [onConfirmed]);

  /* ---- poll until the chain confirms ---------------------------------- */
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop || settled.current) return;
      try {
        const res = await fetch(`/api/payments/${payload.intent.id}`, { cache: 'no-store' });
        const data = await res.json();
        const next = data.intent?.status as PaymentIntentView['status'] | undefined;
        if (next) setStatus(next);
        if (data.intent?.error) setError(data.intent.error);
        if (next === 'confirmed') finish();
      } catch {
        /* transient; the next tick retries */
      }
    };

    // 3s is comfortably inside Solana finality and gentle on the RPC quota.
    const timer = setInterval(tick, 3000);
    void tick();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [payload.intent.id, finish]);

  async function submitHash(txHash: string) {
    if (!txHash) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${payload.intent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      });
      const data = await res.json();
      if (data.intent?.status) setStatus(data.intent.status);
      if (data.error) setError(data.error);
      if (data.intent?.status === 'confirmed') finish();
      else if (!data.error) setError('Not confirmed yet — this will settle as soon as it is.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setChecking(false);
    }
  }

  const isSolana = payload.intent.chain === 'solana';
  const qr = isSolana ? payload.solana?.qr : payload.base?.qr;
  const uri = isSolana ? payload.solana?.url : payload.base?.uri;
  const done = status === 'confirmed';

  return (
    <div className="p-5">
      <p className="text-[13px] leading-relaxed text-[color:var(--color-ink-soft)]">
        Send exactly{' '}
        <span className="font-[family-name:var(--font-case)] text-[color:var(--color-string)]">
          {money(payload.intent.amount)} USDC
        </span>{' '}
        on {isSolana ? 'Solana' : 'Base'} from any wallet. The board updates the moment the
        transfer confirms on chain.
      </p>

      {qr && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`Payment QR for ${money(payload.intent.amount)} USDC`}
            className="h-44 w-44 border-2 border-[rgba(90,66,36,0.4)] bg-white p-1"
          />
          {uri && (
            <a
              href={uri}
              className="px-4 py-2 font-[family-name:var(--font-case)] text-[12px] uppercase tracking-[0.14em] text-[color:var(--color-paper)]"
              style={{ background: 'var(--color-string)' }}
            >
              Open in wallet
            </a>
          )}
          <p className="text-center text-[11px] text-[color:var(--color-ink-faint)]">
            {isSolana
              ? 'Scan with Phantom or Solflare — no wallet connection, and it settles on its own.'
              : 'Scan with your wallet, or copy the details below.'}
          </p>
        </div>
      )}

      {/* Sending to the address by hand works on both chains, but neither can
          report itself: on Solana a hand-made transfer carries no reference to
          scan for, and EVM has no reference at all. Either way we need the
          transaction back, so the field is shown for both. */}
      <div className="mt-5 space-y-3 border-t border-[rgba(90,66,36,0.3)] pt-4">
        <p className="font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-ink-faint)]">
          Or send it yourself
        </p>
        {/* Only ever ONE address here. Showing the USDC token contract beside
            the recipient invited sending funds to the contract itself, which
            burns them — and nobody needs it: wallets and exchanges already list
            USDC by name. */}
        <Copyable value={payload.intent.recipient} title={`Send USDC to (${isSolana ? 'Solana' : 'Base'})`} />

        {
          <div>
            <span className={label}>
              Then paste the transaction ID (or its explorer link)
            </span>
            <input
              value={manualHash}
              onChange={(e) => setManualHash(e.target.value)}
              placeholder={isSolana ? '5Kq… or solscan.io/tx/…' : '0x… or basescan.org/tx/…'}
              spellCheck={false}
              className="w-full bg-[rgba(255,255,255,0.42)] px-3 py-2 font-[family-name:var(--font-case)] text-[12px] outline-none ring-1 ring-inset ring-[rgba(90,66,36,0.4)] focus:ring-2 focus:ring-[color:var(--color-string)]"
            />
            <button
              type="button"
              onClick={() => submitHash(manualHash.trim())}
              disabled={!manualHash.trim() || checking || done}
              className="mt-2 w-full px-3 py-2.5 font-[family-name:var(--font-case)] text-[12px] uppercase tracking-[0.14em] text-[color:var(--color-paper)] shadow-[0_3px_0_#7d0d13] transition-transform active:translate-y-[2px] disabled:opacity-50"
              style={{ background: 'var(--color-string)' }}
            >
              {checking ? 'Checking the chain…' : 'Verify payment'}
            </button>
            <p className="mt-2 text-[11px] leading-snug text-[color:var(--color-ink-faint)]">
              A payment sent this way can&rsquo;t be matched to your bid on its own — paste
              the transaction and it settles immediately.
            </p>
          </div>
        }
      </div>

      {/* status */}
      <div className="mt-5 border-t border-[rgba(90,66,36,0.3)] pt-4">
        {done ? (
          <p className="font-[family-name:var(--font-case)] text-[13px] text-[color:var(--color-string)]">
            Payment confirmed. Pinning your case…
          </p>
        ) : status === 'expired' ? (
          <p className="font-[family-name:var(--font-case)] text-[13px] text-[color:var(--color-ink-soft)]">
            This payment request expired. Close and start again.
          </p>
        ) : (
          <p className="font-[family-name:var(--font-case)] text-[12px] uppercase tracking-[0.16em] text-[color:var(--color-ink-faint)]">
            <span className="inline-block animate-pulse">●</span> Watching the chain…
          </p>
        )}

        {error && (
          <p
            className="mt-2 border-l-[3px] px-3 py-2 text-[12px]"
            style={{
              borderColor: 'var(--color-string)',
              color: 'var(--color-string)',
              background: 'rgba(179,18,27,0.07)',
            }}
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-4 w-full px-4 py-2 font-[family-name:var(--font-case)] text-[12px] uppercase tracking-[0.14em] text-[color:var(--color-ink-soft)] ring-1 ring-inset ring-[rgba(90,66,36,0.45)]"
      >
        {done ? 'Close' : 'Cancel'}
      </button>
    </div>
  );
}
