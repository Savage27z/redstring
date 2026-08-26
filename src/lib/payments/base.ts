import { createPublicClient, http, parseAbiItem, decodeEventLog, getAddress } from 'viem';
import type { ChainConfig } from './chains';

/**
 * Base (EVM) settlement.
 *
 * EVM has no Solana Pay equivalent — no reference field that lets the server
 * find an arbitrary payment on its own — so the payer reports the transaction
 * hash and the server verifies it.
 *
 * Deliberately NO wallet connection. The site never asks to connect, never
 * sees an address, and cannot prompt for a signature: the payer sends USDC from
 * whatever wallet or exchange they already trust and pastes the hash. That
 * costs a step, and buys not having to ask a stranger to attach their wallet to
 * a site they just found.
 *
 * Verification is what matters, and it is strict: the transaction must be mined
 * and successful, must touch the real USDC contract, and must carry a Transfer
 * event of at least the requested amount to our address. A hash for someone
 * else's payment, a different token, or a short payment all fail.
 */

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/**
 * EIP-681 payment URI, for a QR a mobile wallet can scan.
 *
 * Same shape as the Solana QR: it describes a payment, it does not connect
 * anything. Wallets that don't understand it simply won't scan, and the payer
 * falls back to copying the address.
 */
export function buildPaymentUri(
  config: ChainConfig,
  chainId: number,
  amountUnits: bigint,
): string {
  const token = getAddress(config.usdc);
  const recipient = getAddress(config.recipient);
  return `ethereum:${token}@${chainId}/transfer?address=${recipient}&uint256=${amountUnits.toString()}`;
}

export interface BaseVerifyResult {
  ok: boolean;
  pending?: boolean;
  error?: string;
}

export async function verifyBasePayment(
  config: ChainConfig,
  txHash: string,
  amountUnits: bigint,
): Promise<BaseVerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, error: 'That is not a valid transaction hash.' };
  }

  const client = createPublicClient({ transport: http(config.rpc) });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    // Not mined yet (or the node has not seen it) — keep polling.
    return { ok: false, pending: true };
  }

  if (receipt.status !== 'success') {
    return { ok: false, error: 'That transaction failed on chain.' };
  }

  const usdc = getAddress(config.usdc);
  const recipient = getAddress(config.recipient);

  for (const log of receipt.logs) {
    // Only trust logs emitted by the real USDC contract; anyone can emit a
    // lookalike Transfer event from a contract they control.
    if (getAddress(log.address) !== usdc) continue;

    try {
      const decoded = decodeEventLog({
        abi: [TRANSFER_EVENT],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;

      const { to, value } = decoded.args as { to: string; value: bigint };
      if (getAddress(to) !== recipient) continue;
      // Overpaying is fine; underpaying is not.
      if (value >= amountUnits) return { ok: true };
    } catch {
      // not a Transfer we can read; ignore
    }
  }

  return {
    ok: false,
    error: 'That transaction did not send the requested amount of USDC to the board.',
  };
}
