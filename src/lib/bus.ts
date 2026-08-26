import type { BoardState } from './types';

type Listener = (state: BoardState) => void;

/**
 * Tiny in-process pub/sub so the SSE endpoint can push a fresh board to every
 * connected viewer the instant a bid lands.
 *
 * Single-instance only. If you scale past one node, swap this for Redis
 * pub/sub or Supabase Realtime — the surface is two functions.
 */
class BoardBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish(state: BoardState): void {
    for (const fn of this.listeners) {
      try {
        fn(state);
      } catch {
        // a dead connection must not take down the broadcast
      }
    }
  }

  get connections(): number {
    return this.listeners.size;
  }
}

const globalForBus = globalThis as unknown as { __redstringBus?: BoardBus };

export const bus = globalForBus.__redstringBus ?? new BoardBus();
if (process.env.NODE_ENV !== 'production') globalForBus.__redstringBus = bus;
