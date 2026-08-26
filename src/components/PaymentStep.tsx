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

function Copyable({ value, title }: { value: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className={label}>{title}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            },
            () => {
              /* clipboard blocked; the text is selectable anyway */
            },
          );
        }}
        className="flex w-full items-center gap-2 bg-[rgba(0,0,0,0.06)] p-2 text-left ring-1 ring-inset ring-[rgba(90,66,36,0.35)] transition-colors hover:bg-[rgba(0,0,0,0.1)]"
      >
        <code className="min-w-0 flex-1 break-all text-[11px] leading-snug">{value}</code>
        <span className="shrink-0 font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-string)]">
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
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
              ? 'Scan with Phantom or Solflare. No wallet connection — it just sends.'
              : 'Scan with your wallet, or copy the details below.'}
          </p>
        </div>
      )}

      {/* Manual details. On Base this is the primary path, because EVM wallets
          cannot report the payment back to us on their own. */}
      <div className="mt-5 space-y-3 border-t border-[rgba(90,66,36,0.3)] pt-4">
        <Copyable value={payload.intent.recipient} title="Send USDC to" />
        {!isSolana && payload.base && (
          <Copyable value={payload.base.token} title="USDC contract (Base)" />
        )}

        {!isSolana && (
          <div>
            <span className={label}>Then paste the transaction hash</span>
            <input
              value={manualHash}
              onChange={(e) => setManualHash(e.target.value)}
              placeholder="0x…"
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
          </div>
        )}
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
