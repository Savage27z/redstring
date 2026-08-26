'use client';

import { useState } from 'react';
import Modal from './Modal';
import { CATEGORIES, MIN_BID, priceToBeat } from '@/lib/types';
import type { Category, Submission } from '@/lib/types';

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

const field =
  'w-full bg-[rgba(255,255,255,0.42)] px-3 py-2.5 font-[family-name:var(--font-body)] text-[15px] text-[color:var(--color-ink)] outline-none ring-1 ring-inset ring-[rgba(90,66,36,0.4)] transition focus:ring-2 focus:ring-[color:var(--color-string)] placeholder:text-[color:var(--color-ink-faint)]';
const label =
  'mb-1.5 block font-[family-name:var(--font-case)] text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-ink-faint)]';
