import { NextResponse } from 'next/server';
import { enabledChains, isTestnet } from '@/lib/payments/chains';
import { storeBackend } from '@/lib/store';
import { intentBackend } from '@/lib/payments/intentStore';

export const dynamic = 'force-dynamic';

/** Which payment rails the browser should offer. */
export async function GET() {
  return NextResponse.json(
    {
      testnet: isTestnet(),
      // Ops readout. Worth knowing at a glance whether a live board is durable
      // or about to be erased by the next redeploy.
      store: storeBackend(),
      intents: intentBackend(),
      chains: enabledChains().map((c) => ({
        id: c.id,
        label: c.label,
        recipient: c.recipient,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
