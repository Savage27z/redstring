import { NextResponse } from 'next/server';
import { placeBid, getSubmission } from '@/lib/store';
import { MIN_BID, priceToBeat } from '@/lib/types';
import type { Category } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Body {
  submissionId?: string;
  amount: number;
  bidderName?: string;
  newCase?: {
    title: string;
    tagline: string;
    url: string;
    logoUrl: string | null;
    category: Category;
  };
}
