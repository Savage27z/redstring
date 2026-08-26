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
