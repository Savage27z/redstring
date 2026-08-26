import { NextResponse } from 'next/server';
import { getBoardState } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getBoardState(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
