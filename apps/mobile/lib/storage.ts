import { StateStorage } from 'zustand/middleware';
import { Persister } from '@tanstack/react-query-persist-client';

// In-memory fallback map for environments where MMKV C++ JSI is not available (e.g. testing)
const memoryFallback = new Map<string, string>();

interface KeyValueStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string | boolean | number) => void;
  delete: (key: string) => void;
  contains: (key: string) => boolean;
  getAllKeys: () => string[];
  clearAll: () => void;
}

let storageInstance: KeyValueStorage;

try {
  const { createMMKV } = require('react-native-mmkv');
  const mmkv = createMMKV({ id: 'credics-mobile-storage' });
  storageInstance = {
    getString: (key) => mmkv.getString(key),
    set: (key, value) => {
      if (typeof value === 'string') mmkv.set(key, value);
      else if (typeof value === 'boolean') mmkv.set(key, value);
      else if (typeof value === 'number') mmkv.set(key, value);
    },
    delete: (key) => mmkv.delete(key),
    contains: (key) => mmkv.contains(key),
    getAllKeys: () => mmkv.getAllKeys(),
    clearAll: () => mmkv.clearAll(),
  };
} catch {
  // Graceful fallback for non-native / Expo Go fallback
  storageInstance = {
    getString: (key) => memoryFallback.get(key),
    set: (key, value) => memoryFallback.set(key, String(value)),
    delete: (key) => {
      memoryFallback.delete(key);
    },
    contains: (key) => memoryFallback.has(key),
    getAllKeys: () => Array.from(memoryFallback.keys()),
    clearAll: () => memoryFallback.clear(),
  };
}

export const appStorage = storageInstance;

/**
 * Synchronous storage adapter for Zustand persist middleware:
 * persist(..., { storage: createJSONStorage(() => zustandStorage) })
 */
export const zustandStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const value = appStorage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => {
    appStorage.set(name, value);
  },
  removeItem: (name: string): void => {
    appStorage.delete(name);
  },
};

/**
 * Fast synchronous persister for TanStack Query persistClient
 */
export const createStoragePersister = (key: string = 'REACT_QUERY_CACHE'): Persister => {
  return {
    persistClient: async (client) => {
      try {
        appStorage.set(key, JSON.stringify(client));
      } catch (err) {
        console.error('Failed to persist react-query cache to disk:', err);
      }
    },
    restoreClient: async () => {
      try {
        const cached = appStorage.getString(key);
        return cached ? JSON.parse(cached) : undefined;
      } catch (err) {
        console.error('Failed to restore react-query cache from disk:', err);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        appStorage.delete(key);
      } catch (err) {
        console.error('Failed to remove react-query cache:', err);
      }
    },
  };
};
