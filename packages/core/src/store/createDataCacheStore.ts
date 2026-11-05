import { create } from 'zustand';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
}

export interface DataCacheState {
  cache: Record<string, CacheEntry>;
  get: <T = any>(key: string, maxAgeMs?: number) => T | null;
  set: <T = any>(key: string, data: T) => void;
  invalidate: (prefix?: string) => void;
}

export const createDataCacheStore = () =>
  create<DataCacheState>((set, get) => ({
    cache: {},

    get: <T = any>(key: string, maxAgeMs: number = 60000): T | null => {
      const entry = get().cache[key];
      if (!entry) return null;
      const now = Date.now();
      if (now - entry.timestamp > maxAgeMs) {
        return null;
      }
      return entry.data as T;
    },

    set: <T = any>(key: string, data: T) => {
      set((state) => ({
        cache: {
          ...state.cache,
          [key]: {
            data,
            timestamp: Date.now(),
          },
        },
      }));
    },

    invalidate: (prefix?: string) => {
      if (!prefix) {
        set({ cache: {} });
        return;
      }
      set((state) => {
        const nextCache: Record<string, CacheEntry> = {};
        Object.keys(state.cache).forEach((k) => {
          if (!k.startsWith(prefix)) {
            nextCache[k] = state.cache[k];
          }
        });
        return { cache: nextCache };
      });
    },
  }));
