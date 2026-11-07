import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './storage';
import { CardData, getFamilyCardIds, calculateTotalLimit } from '@credics/core';

export interface CardStoreState {
  selectedCardId: string;
  setSelectedCardId: (id: string) => void;
  resetSelectedCard: () => void;
}

export const useCardStore = create<CardStoreState>()(
  persist(
    (set) => ({
      selectedCardId: 'all',
      setSelectedCardId: (id: string) => {
        set({ selectedCardId: id || 'all' });
      },
      resetSelectedCard: () => set({ selectedCardId: 'all' }),
    }),
    {
      name: 'credics-card-selection',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);

export interface BaseCardItem {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit?: number;
  is_primary?: boolean;
  parent_card_id?: string | null;
  [key: string]: any;
}

export type HierarchicalCardItem<T extends BaseCardItem = BaseCardItem> = T & {
  isSub: boolean;
  parentCard?: T;
  subCardsCount?: number;
};

/**
 * Builds an ordered list of cards with subcards grouped immediately under their primary card.
 */
export function buildHierarchicalCardList<T extends BaseCardItem>(cards: T[]): HierarchicalCardItem<T>[] {
  if (!cards || cards.length === 0) return [];

  const primaries = cards.filter((c) => c.is_primary || !c.parent_card_id);
  const result: HierarchicalCardItem<T>[] = [];

  primaries.forEach((primary) => {
    const subCards = cards.filter((c) => !c.is_primary && c.parent_card_id === primary.id);
    result.push({
      ...primary,
      isSub: false,
      subCardsCount: subCards.length,
    });

    subCards.forEach((sub) => {
      result.push({
        ...sub,
        isSub: true,
        parentCard: primary,
      });
    });
  });

  // Handle any orphan subcards whose parent wasn't found in primaries
  const addedIds = new Set(result.map((c) => c.id));
  cards
    .filter((c) => !addedIds.has(c.id))
    .forEach((orphan) => {
      result.push({
        ...orphan,
        isSub: !orphan.is_primary && !!orphan.parent_card_id,
      });
    });

  return result;
}

export { getFamilyCardIds, calculateTotalLimit };
