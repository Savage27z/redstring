/**
 * Supported payment rails.
 *
 * Everything is denominated in USD and settled in USDC, which is a dollar
 * stablecoin — so a $12 bid is 12 USDC on either chain. No price oracle, no
 * volatility window, no partial-payment maths.
 */

export type ChainId = 'solana' | 'base';

export interface ChainConfig {
  id: ChainId;
  label: string;
  /** USDC contract / mint address for this chain */
  usdc: string;
  /** where funds land */
  recipient: string;
  /** JSON-RPC endpoint */
  rpc: string;
  /** USDC has 6 decimals on both chains */
  decimals: 6;
  explorerTx: (hash: string) => string;
}

/** USDC mint on Solana mainnet-beta. */
const USDC_SOLANA_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** USDC on Solana devnet, for testing. */
const USDC_SOLANA_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

/** Circle's native USDC on Base mainnet (chain id 8453). */
const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** USDC on Base Sepolia testnet (chain id 84532). */
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export const BASE_CHAIN_ID_MAINNET = 8453;
export const BASE_CHAIN_ID_SEPOLIA = 84532;

function testnetsEnabled(): boolean {
  // Same posture as the payment provider config: test by default, and going
  // live has to be a deliberate act rather than a forgotten variable.
  return process.env.CRYPTO_NETWORK !== 'mainnet';
}

export function solanaConfig(): ChainConfig | null {
  const recipient = process.env.SOLANA_RECIPIENT;
  if (!recipient) return null;

  const test = testnetsEnabled();
  return {
    id: 'solana',
    label: 'Solana',
    usdc: process.env.SOLANA_USDC_MINT ?? (test ? USDC_SOLANA_DEVNET : USDC_SOLANA_MAINNET),
    recipient,
    rpc:
      process.env.SOLANA_RPC_URL ??
      (test ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com'),
    decimals: 6,
    explorerTx: (sig) =>
      `https://explorer.solana.com/tx/${sig}${test ? '?cluster=devnet' : ''}`,
  };
}

export function baseConfig(): ChainConfig | null {
  const recipient = process.env.BASE_RECIPIENT;
  if (!recipient) return null;

  const test = testnetsEnabled();
  return {
    id: 'base',
    label: 'Base',
    usdc: process.env.BASE_USDC_ADDRESS ?? (test ? USDC_BASE_SEPOLIA : USDC_BASE_MAINNET),
    recipient,
    rpc:
      process.env.BASE_RPC_URL ??
      (test ? 'https://sepolia.base.org' : 'https://mainnet.base.org'),
    decimals: 6,
    explorerTx: (hash) =>
      test ? `https://sepolia.basescan.org/tx/${hash}` : `https://basescan.org/tx/${hash}`,
  };
}

export function baseNumericChainId(): number {
  return testnetsEnabled() ? BASE_CHAIN_ID_SEPOLIA : BASE_CHAIN_ID_MAINNET;
}

export function chainConfig(chain: ChainId): ChainConfig | null {
  return chain === 'solana' ? solanaConfig() : baseConfig();
}

/** Which rails are actually usable right now. */
export function enabledChains(): ChainConfig[] {
  return [solanaConfig(), baseConfig()].filter((c): c is ChainConfig => c !== null);
}

export function isTestnet(): boolean {
  return testnetsEnabled();
}

/** Dollars -> smallest USDC unit, as a bigint so nothing rounds badly. */
export function toUsdcUnits(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1_000_000));
}
