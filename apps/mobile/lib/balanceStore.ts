import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './storage';
import { supabase } from './supabase';
import { CardData, calculateCardAvailableMap } from '@credics/core';

export interface ProfileData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
}

export interface QRData {
  id: string;
  merchant_name: string;
  upi_id: string;
  bank_name?: string;
  account_number?: string;
  account_holder_name?: string;
  qr_image_url?: string;
  daily_limit?: number;
  monthly_limit?: number;
  status: string;
}

export interface BalanceStoreState {
  // Collections
  cards: CardData[];
  profiles: ProfileData[];
  qrs: QRData[];

  // Computed Canonical Maps
  cardAvailableMap: Record<string, number>;
  userCardCashMap: Record<string, Record<string, number>>;
  userCashMap: Record<string, number>;
  cardDueMap: Record<string, number>;
  cardDueDateMap: Record<string, string>;
  userCardSpendMap: Record<string, Record<string, number>>; // userId -> primaryCardId -> debt
  userTotalSpendMap: Record<string, number>; // userId -> total debt across all cards

  // State metadata
  isLoaded: boolean;
  isSyncing: boolean;
  lastFetchedAt: number | null;

  // Actions
  refreshBalances: (force?: boolean) => Promise<void>;
  setupRealtimeSubscription: () => () => void;
}

let activeRefreshPromise: Promise<void> | null = null;

export const useBalanceStore = create<BalanceStoreState>()(
  persist(
    (set, get) => ({
      cards: [],
      profiles: [],
      qrs: [],
      cardAvailableMap: {},
      userCardCashMap: {},
      userCashMap: {},
      cardDueMap: {},
      cardDueDateMap: {},
      userCardSpendMap: {},
      userTotalSpendMap: {},
      isLoaded: false,
      isSyncing: false,
      lastFetchedAt: null,

      refreshBalances: async (force: boolean = false) => {
        // Prevent duplicate simultaneous fetch storms
        if (activeRefreshPromise && !force) {
          return activeRefreshPromise;
        }

        activeRefreshPromise = (async () => {
          try {
            set({ isSyncing: true });

            const [cardsRes, profilesRes, qrsRes, cohRes, cyclesRes, spendsRes, txsForLimitsRes] =
              await Promise.all([
                supabase.from('cards').select('*').order('is_primary', { ascending: false }),
                supabase.from('profiles').select('*').order('name'),
                supabase.from('qrs').select('*').order('merchant_name'),
                supabase.from('cash_on_hand').select('*'),
                supabase.from('billing_cycles').select('*').in('status', ['unpaid', 'partially_paid']),
                supabase
                  .from('spends')
                  .select('id, user_id, card_id, amount, payment_method, spend_type, spend_date'),
                supabase
                  .from('card_transactions')
                  .select('id, card_id, type, amount, status, qr_id, remarks, settled_to_user, transaction_date, settlement_details'),
              ]);

            const cards: CardData[] = (cardsRes.data || []) as CardData[];
            const profiles: ProfileData[] = (profilesRes.data || []) as ProfileData[];
            const qrs: QRData[] = (qrsRes.data || []) as QRData[];
            const coh = cohRes.data || [];
            const activeCycles = cyclesRes.data || [];
            const allSpends = spendsRes.data || [];
            const allTxs = txsForLimitsRes.data || [];

            // 1. Calculate Card Available Limits Map via @credics/core Canonical Engine
            const availableMap = calculateCardAvailableMap(cards as any, allTxs as any, allSpends as any);

            // 2. Calculate Cash on Hand Map
            const cardCashMap: Record<string, Record<string, number>> = {};
            const totalCashMap: Record<string, number> = {};
            coh.forEach((c: any) => {
              if (c.user_id) {
                const bal = Number(c.current_balance || 0);
                totalCashMap[c.user_id] = (totalCashMap[c.user_id] || 0) + bal;
                if (c.card_id) {
                  if (!cardCashMap[c.user_id]) cardCashMap[c.user_id] = {};
                  cardCashMap[c.user_id][c.card_id] = bal;
                }
              }
            });

            // 3. Calculate Due Map & Due Dates
            const dMap: Record<string, number> = {};
            const dDateMap: Record<string, string> = {};
            activeCycles.forEach((c: any) => {
              if (c.card_id) {
                const dueAmt = Number(c.generated_amount || 0) - Number(c.paid_amount || 0);
                dMap[c.card_id] = (dMap[c.card_id] || 0) + dueAmt;
                if (c.due_date && !dDateMap[c.card_id]) {
                  dDateMap[c.card_id] = new Date(c.due_date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  });
                }
              }
            });

            // 4. Calculate Card Family Scoped Personal Debt Map (2D Map matching Web App)
            const cardToPrimaryMap: Record<string, string> = {};
            cards.forEach((c) => {
              cardToPrimaryMap[c.id] = c.is_primary ? c.id : (c.parent_card_id || c.id);
            });

            const uCardSpendMap: Record<string, Record<string, number>> = {};
            const uTotalSpendMap: Record<string, number> = {};

            allSpends.forEach((s: any) => {
              if (s.user_id && s.card_id) {
                const primaryId = cardToPrimaryMap[s.card_id] || s.card_id;
                const amt = Number(s.amount || 0);

                if (!uCardSpendMap[s.user_id]) uCardSpendMap[s.user_id] = {};
                uCardSpendMap[s.user_id][primaryId] = (uCardSpendMap[s.user_id][primaryId] || 0) + amt;
                uTotalSpendMap[s.user_id] = (uTotalSpendMap[s.user_id] || 0) + amt;
              }
            });

            set({
              cards,
              profiles,
              qrs,
              cardAvailableMap: availableMap,
              userCardCashMap: cardCashMap,
              userCashMap: totalCashMap,
              cardDueMap: dMap,
              cardDueDateMap: dDateMap,
              userCardSpendMap: uCardSpendMap,
              userTotalSpendMap: uTotalSpendMap,
              isLoaded: true,
              isSyncing: false,
              lastFetchedAt: Date.now(),
            });
          } catch (err) {
            console.error('[balanceStore] Error refreshing balances:', err);
            set({ isSyncing: false });
          } finally {
            activeRefreshPromise = null;
          }
        })();

        return activeRefreshPromise;
      },

      setupRealtimeSubscription: () => {
        const channel = supabase
          .channel('global-balance-store-realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'card_transactions' },
            () => get().refreshBalances(true)
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'spends' },
            () => get().refreshBalances(true)
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'cash_on_hand' },
            () => get().refreshBalances(true)
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'billing_cycles' },
            () => get().refreshBalances(true)
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      },
    }),
    {
      name: 'credics-global-balances',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        cards: state.cards,
        profiles: state.profiles,
        qrs: state.qrs,
        cardAvailableMap: state.cardAvailableMap,
        userCardCashMap: state.userCardCashMap,
        userCashMap: state.userCashMap,
        cardDueMap: state.cardDueMap,
        cardDueDateMap: state.cardDueDateMap,
        userCardSpendMap: state.userCardSpendMap,
        userTotalSpendMap: state.userTotalSpendMap,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);
