'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import StatsBar from './StatsBar';
import CaseModal from './CaseModal';
import BidModal from './BidModal';
import Ticker from './Ticker';
import type { BoardState, Submission } from '@/lib/types';

// WebGL can't render on the server, and pulling three into the SSR bundle
// only slows the first byte down.
const BoardScene = dynamic(() => import('./three/BoardScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#2b2b2e]">
      <span className="font-[family-name:var(--font-case)] text-[12px] uppercase tracking-[0.28em] text-[rgba(239,230,210,0.45)]">
        Assembling the board…
      </span>
    </div>
  ),
});
