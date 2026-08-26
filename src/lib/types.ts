export type Category =
  | 'ai'
  | 'devtools'
  | 'fintech'
  | 'consumer'
  | 'crypto'
  | 'agency'
  | 'other';

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'ai', label: 'A.I.' },
  { value: 'devtools', label: 'Dev Tools' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'consumer', label: 'Consumer' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'agency', label: 'Agency' },
  { value: 'other', label: 'Unclassified' },
];

export interface Submission {
  id: string;
  title: string;
  tagline: string;
  url: string;
  logoUrl: string | null;
  category: Category;
  /** current winning bid, in whole dollars */
  currentBid: number;
  bidderName: string;
  claimedAt: string; // ISO
  status: 'active' | 'pending';
}

export interface BidEvent {
  id: string;
  submissionId: string;
  amount: number;
  bidderName: string;
  createdAt: string; // ISO
  /** what it displaced, for the string/annotation trail */
  previousBid: number | null;
}

export interface BoardState {
  submissions: Submission[];
  recentBids: BidEvent[];
  stats: {
    totalRaised: number;
    totalCases: number;
    topBid: number;
    priceToTakeNumberOne: number;
    minimumBid: number;
    visitors: number;
  };
}

/** Minimum bid to get pinned to the board at all. */
export const MIN_BID = Number(process.env.NEXT_PUBLIC_MIN_BID ?? 2);

/** You must beat the current holder by at least this much. */
export const OUTBID_INCREMENT = 1;

export function priceToBeat(current: number): number {
  return current + OUTBID_INCREMENT;
}
