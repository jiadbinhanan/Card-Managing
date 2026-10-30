import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CardStore {
  globalSelectedCardIds: string[];
  setGlobalSelectedCardIds: (ids: string[]) => void;
}

export const useCardStore = create<CardStore>()(
  persist(
    (set) => ({
      globalSelectedCardIds: ['all'],
      setGlobalSelectedCardIds: (ids) => set({ globalSelectedCardIds: ids }),
    }),
    {
      name: 'card-store',
    }
  )
);
