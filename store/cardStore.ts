import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CardStore {
  globalSelectedCardId: string;
  setGlobalSelectedCardId: (id: string) => void;
}

export const useCardStore = create<CardStore>()(
  persist(
    (set) => ({
      globalSelectedCardId: 'all',
      setGlobalSelectedCardId: (id) => set({ globalSelectedCardId: id }),
    }),
    {
      name: 'card-store',
    }
  )
);
