import { NextResponse } from 'next/server';
import { enabledChains, isTestnet } from '@/lib/payments/chains';

export const dynamic = 'force-dynamic';

/** Which payment rails the browser should offer. */
export async function GET() {
  return NextResponse.json(
    {
      testnet: isTestnet(),
      chains: enabledChains().map((c) => ({
        id: c.id,
        label: c.label,
        recipient: c.recipient,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
