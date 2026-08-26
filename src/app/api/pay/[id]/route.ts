import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { createTransfer } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { solanaConfig } from '@/lib/payments/chains';
import { getIntent } from '@/lib/payments/intents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Solana Pay transaction request.
 *
 * The QR holds nothing but this URL. The wallet GETs it for a label, then POSTs
 * the payer's account and receives a transaction we built — recipient, USDC
 * mint, exact amount and the reference key are all fixed server-side, so none
 * of them ride in the QR and none of them are the payer's to change.
 *
 * Wallets fetch this cross-origin, so it needs permissive CORS.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding, Accept-Encoding',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const intent = getIntent(id);
  if (!intent) {
    return NextResponse.json({ error: 'Unknown payment.' }, { status: 404, headers: CORS });
  }
  return NextResponse.json(
    {
      label: 'redstring.lol',
      icon: 'https://redstring.lol/icon.svg',
    },
    { headers: CORS },
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const intent = getIntent(id);
  if (!intent || intent.chain !== 'solana' || !intent.reference) {
    return NextResponse.json({ error: 'Unknown payment.' }, { status: 404, headers: CORS });
  }
  if (intent.status !== 'pending') {
    return NextResponse.json(
      { error: 'This payment is no longer open.' },
      { status: 409, headers: CORS },
    );
  }

  const config = solanaConfig();
  if (!config) {
    return NextResponse.json({ error: 'Solana is not configured.' }, { status: 503, headers: CORS });
  }

  let account: string;
  try {
    ({ account } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400, headers: CORS });
  }
  if (!account) {
    return NextResponse.json({ error: 'Missing account.' }, { status: 400, headers: CORS });
  }

  try {
    const connection = new Connection(config.rpc, 'confirmed');
    const sender = new PublicKey(account);

    // The reference key is attached here rather than in the QR, which is what
    // lets settlement still find this exact payment on chain.
    const transaction = await createTransfer(connection, sender, {
      recipient: new PublicKey(config.recipient),
      amount: new BigNumber(intent.amount),
      splToken: new PublicKey(config.usdc),
      reference: new PublicKey(intent.reference),
    });

    transaction.feePayer = sender;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;

    const serialized = transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');

    return NextResponse.json(
      {
        transaction: serialized,
        message: `redstring.lol — $${intent.amount} USDC`,
      },
      { headers: CORS },
    );
  } catch (err) {
    console.error('[solana pay] could not build transaction', err);
    return NextResponse.json(
      { error: 'Could not build that transaction. Check your USDC balance.' },
      { status: 500, headers: CORS },
    );
  }
}
