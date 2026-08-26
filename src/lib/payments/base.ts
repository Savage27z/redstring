import {
  createPublicClient,
  http,
  parseAbiItem,
  decodeEventLog,
  getAddress,
  encodeFunctionData,
} from 'viem';
import type { ChainConfig } from './chains';

/**
 * Base (EVM) settlement.
 *
 * EVM has no Solana Pay equivalent — no reference field that lets the server
 * find an arbitrary payment on its own — so the payer's wallet reports the
 * transaction hash and the server verifies it. Verification is what matters,
 * and it is strict: the transaction must be mined and successful, must touch
 * the real USDC contract, and must carry a Transfer event of at least the
 * requested amount to our address. A hash for someone else's payment, a
 * different token, or a short payment all fail.
 */

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/** Calldata the browser wallet signs. Built server-side so the amount is ours. */
export function encodeUsdcTransfer(recipient: string, amountUnits: bigint): string {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [getAddress(recipient), amountUnits],
  });
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
