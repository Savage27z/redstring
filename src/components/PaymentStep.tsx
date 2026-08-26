'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The pay-with-USDC step.
 *
 * Solana needs nothing from the browser but a QR code: the payment carries a
 * reference key, and the server finds and verifies it on chain. Base has no
 * equivalent, so the injected wallet sends calldata the server built and hands
 * back a transaction hash for the server to verify.
 *
 * Either way the browser never decides that a payment happened — it polls, and
 * the server confirms against the chain.
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
  base?: { to: string; data: string; chainIdHex: string; chainId: number };
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

const label =
  'mb-1.5 block font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]';

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
  const [walletBusy, setWalletBusy] = useState(false);
  const [manualHash, setManualHash] = useState('');
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

  /* ---- Base: send via the injected wallet ------------------------------ */
  async function payWithWallet() {
    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!eth || !payload.base) {
      setError('No browser wallet found. Install MetaMask, or send the USDC manually.');
      return;
    }

    setWalletBusy(true);
    setError(null);
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error('No account available.');

      // Wrong network is the most common failure; offer to switch rather than
      // letting the transfer go out on the wrong chain.
      try {
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: payload.base.chainIdHex }],
        });
      } catch {
        throw new Error(`Switch your wallet to Base (chain ${payload.base.chainId}) and retry.`);
      }

      const txHash = (await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: payload.base.to, data: payload.base.data, value: '0x0' }],
      })) as string;

      await submitHash(txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The wallet rejected that transaction.');
    } finally {
      setWalletBusy(false);
    }
  }

  async function submitHash(txHash: string) {
    const res = await fetch(`/api/payments/${payload.intent.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    });
    const data = await res.json();
    if (data.intent?.status) setStatus(data.intent.status);
    if (data.error) setError(data.error);
    if (data.intent?.status === 'confirmed') finish();
  }

  const isSolana = payload.intent.chain === 'solana';
  const done = status === 'confirmed';

  return (
    <div className="p-5">
      <p className="text-[13px] leading-relaxed text-[color:var(--color-ink-soft)]">
        Send exactly{' '}
        <span className="font-[family-name:var(--font-case)] text-[color:var(--color-string)]">
          {money(payload.intent.amount)} USDC
        </span>{' '}
        on {isSolana ? 'Solana' : 'Base'}. The board updates the moment the transfer confirms
        on chain.
      </p>

      {isSolana && payload.solana && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={payload.solana.qr}
            alt="Solana Pay QR code"
            className="h-48 w-48 border-2 border-[rgba(90,66,36,0.4)] bg-white p-1"
          />
          <a
            href={payload.solana.url}
            className="px-4 py-2 font-[family-name:var(--font-case)] text-[12px] uppercase tracking-[0.14em] text-[color:var(--color-paper)]"
            style={{ background: 'var(--color-string)' }}
          >
            Open in wallet
          </a>
          <p className="text-center text-[11px] text-[color:var(--color-ink-faint)]">
            Scan with Phantom or Solflare, or tap to open on this device.
          </p>
        </div>
      )}

      {!isSolana && payload.base && (
        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={payWithWallet}
            disabled={walletBusy || done}
            className="w-full px-4 py-3 font-[family-name:var(--font-case)] text-[13px] uppercase tracking-[0.14em] text-[color:var(--color-paper)] shadow-[0_4px_0_#7d0d13] transition-transform active:translate-y-[2px] disabled:opacity-60"
            style={{ background: 'var(--color-string)' }}
          >
            {walletBusy ? 'Check your wallet…' : `Pay ${money(payload.intent.amount)} USDC`}
          </button>

          <details className="text-[12px] text-[color:var(--color-ink-soft)]">
            <summary className="cursor-pointer font-[family-name:var(--font-case)] text-[11px] uppercase tracking-[0.14em]">
              Paid another way?
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <span className={label}>Send USDC to</span>
                <code className="block break-all rounded bg-[rgba(0,0,0,0.06)] p-2 text-[11px]">
                  {payload.intent.recipient}
                </code>
              </div>
              <div>
                <span className={label}>Then paste the transaction hash</span>
                <input
                  value={manualHash}
                  onChange={(e) => setManualHash(e.target.value)}
                  placeholder="0x…"
                  className="w-full bg-[rgba(255,255,255,0.42)] px-3 py-2 text-[13px] outline-none ring-1 ring-inset ring-[rgba(90,66,36,0.4)] focus:ring-2 focus:ring-[color:var(--color-string)]"
                />
                <button
                  type="button"
                  onClick={() => submitHash(manualHash.trim())}
                  disabled={!manualHash.trim()}
                  className="mt-2 px-3 py-2 font-[family-name:var(--font-case)] text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-soft)] ring-1 ring-inset ring-[rgba(90,66,36,0.45)] disabled:opacity-50"
                >
                  Verify payment
                </button>
              </div>
            </div>
          </details>
        </div>
      )}

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
