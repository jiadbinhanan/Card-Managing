import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from './supabase';
import { zustandStorage } from './storage';
import { CardLimitStat } from '../components/HeroCardLimitChart';
import {
  CardData,
  BillingCycle,
  QRItem,
  ActiveCooldown,
  RecentTx,
  calculateTotalLimit,
  calculateCardLimits,
  calculateCardLimitStats,
  calculateNextBillCountdown,
  calculatePersonalDue,
  extractActiveCooldowns,
  filterSuggestedQRs,
  deduplicateLatestBillsPerCard,
} from '@credics/core';

export { CardData, BillingCycle, QRItem, ActiveCooldown, RecentTx };

export interface UserStat {
  id: string;
  name: string;
  cash: number;
  due: number;
  pocket: number;
  avatar_url?: string;
  cardBreakdown: Array<{ cardId: string; cardName: string; cardLast4: string; balance: number }>;
}

export interface DashboardState {
  isInitialized: boolean;
  isLoading: boolean;
  lastFetchedAt: number | null;
  currentUser: any;
  userName: string;
  firstName: string;
  userAvatar: string | null;
  accessibleCards: CardData[];
  selectedCardId: string;
  cardLimitStats: CardLimitStat[];
  availableLimit: number;
  totalLimit: number;
  inTransit: number;
  usersCash: number;
  daysToBill: number;
  nextBillDate: string;
  activeBills: BillingCycle[];
  userStats: UserStat[];
  suggestedQrs: QRItem[];
  activeCooldowns: ActiveCooldown[];
  recentTransactions: RecentTx[];
  setSelectedCardId: (cardId: string) => void;
  fetchDashboardData: (overrideCardId?: string) => Promise<void>;
}

let activeFetchPromise: Promise<void> | null = null;

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      isInitialized: false,
      isLoading: true,
      lastFetchedAt: null,
      currentUser: null,
      userName: 'User',
      firstName: '',
      userAvatar: null,
      accessibleCards: [],
      selectedCardId: 'all',
      cardLimitStats: [],
      availableLimit: 0,
      totalLimit: 0,
      inTransit: 0,
      usersCash: 0,
      daysToBill: 26,
      nextBillDate: '',
      activeBills: [],
      userStats: [],
      suggestedQrs: [],
      activeCooldowns: [],
      recentTransactions: [],

      setSelectedCardId: (cardId: string) => {
        set({ selectedCardId: cardId });
        get().fetchDashboardData(cardId);
      },

      fetchDashboardData: async (overrideCardId?: string) => {
        if (activeFetchPromise && !overrideCardId) {
          return activeFetchPromise;
        }

        const currentCardId = overrideCardId ?? get().selectedCardId;

        activeFetchPromise = (async () => {
          try {
            set({ isLoading: true });

            // 1. Session & Auth User
            const {
              data: { session },
            } = await supabase.auth.getSession();
            const authUser = session?.user;

            if (!authUser) {
              set({ isLoading: false });
              return;
            }

            // 2. Parallel Batched Queries (Eliminates N+1 loops)
            const [
              profileRes,
              accessRes,
              allCardsRes,
              txsRes,
              spendsRes,
              billsRes,
              cohRes,
              allProfilesRes,
              allPocketRes,
              qrsRes,
            ] = await Promise.all([
              supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
              supabase.from('card_access').select('card_id').eq('user_id', authUser.id),
              supabase.from('cards').select('*').order('is_primary', { ascending: false }),
              supabase.from('card_transactions').select('*, cards(card_name, last_4_digits)').order('transaction_date', { ascending: false }),
              supabase.from('spends').select('*'),
              supabase.from('billing_cycles').select('*, cards(card_name, last_4_digits, bill_gen_day, bill_due_day)').order('billing_month', { ascending: false }),
              supabase.from('cash_on_hand').select('*'),
              supabase.from('profiles').select('*').order('name'),
              supabase.from('pocket_advances').select('*'), // Batched single query!
              supabase.from('qrs').select('*').eq('status', 'active'),
            ]);

            const profile = profileRes.data;
            const resolvedUserName = profile?.name || 'User';
            const resolvedFirstName = (profile?.name || '').split(' ')[0];
            const resolvedAvatar = profile?.avatar_url || null;

            // 3. Accessible Cards
            const accessData = accessRes.data || [];
            let myCards: CardData[] = (allCardsRes.data || []) as CardData[];
            if (accessData.length > 0) {
              const cardIds = accessData.map((a: any) => a.card_id);
              myCards = myCards.filter((c) => cardIds.includes(c.id));
            }

            // 4. Calculations via @credics/core
            const totalLimit = calculateTotalLimit(currentCardId, myCards);

            // Active Card IDs
            let activeCardIds = myCards.map((c) => c.id);
            if (currentCardId !== 'all') {
              const selected = myCards.find((c) => c.id === currentCardId);
              if (selected) {
                const primaryId = selected.is_primary ? selected.id : (selected.parent_card_id || selected.id);
                activeCardIds = myCards.filter((c) => c.id === primaryId || c.parent_card_id === primaryId).map((c) => c.id);
              }
            }

            const allTxs = txsRes.data || [];
            const allSpends = spendsRes.data || [];

            const activeTxs = allTxs.filter((t: any) => t.card_id && activeCardIds.includes(t.card_id));
            const activeSpends = allSpends.filter((s: any) => s.card_id && activeCardIds.includes(s.card_id));

            const limitMetrics = calculateCardLimits({
              totalLimit,
              transactions: activeTxs,
              spends: activeSpends,
            });

            const cardLimitStats = calculateCardLimitStats({
              cards: myCards,
              transactions: allTxs,
              spends: allSpends,
            });

            const billInfo = calculateNextBillCountdown(myCards, currentCardId);

            // Active Bills
            const rawBills = (billsRes.data || []) as BillingCycle[];
            const formattedBills = deduplicateLatestBillsPerCard(rawBills);

            // User Stats & Cash Breakdown
            const allCoh = cohRes.data || [];
            const allProfiles = allProfilesRes.data || [];
            const allPocket = allPocketRes.data || [];

            const usersCashTotal = allCoh
              .filter((c: any) => activeCardIds.includes(c.card_id))
              .reduce((sum: number, c: any) => sum + Number(c.current_balance || 0), 0);

            const formattedUserStats: UserStat[] = allProfiles.map((p: any) => {
              const userCohRows = allCoh.filter((c: any) => c.user_id === p.id && activeCardIds.includes(c.card_id));
              const cashTotal = userCohRows.reduce((sum: number, c: any) => sum + Number(c.current_balance || 0), 0);

              const due = calculatePersonalDue(p.id, activeSpends, activeTxs);

              const userPocketRows = allPocket.filter((pa: any) => pa.user_id === p.id);
              const pocketBal = userPocketRows.reduce((sum: number, r: any) => sum + Number(r.current_balance || 0), 0);

              const cardBreakdown = myCards.map((c) => ({
                cardId: c.id,
                cardName: c.card_name,
                cardLast4: c.last_4_digits,
                balance: Number(userCohRows.find((r: any) => r.card_id === c.id)?.current_balance || 0),
              }));

              return {
                id: p.id,
                name: (p.name || '').split(' ')[0],
                cash: cashTotal,
                due,
                pocket: pocketBal,
                avatar_url: p.avatar_url,
                cardBreakdown,
              };
            });

            // Smart QR Suggestions via @credics/core
            const rawQrs = (qrsRes.data || []) as QRItem[];
            const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
            const recentQrTxs = allTxs
              .filter((t: any) => t.recorded_by === authUser.id && t.qr_id && t.created_at >= fiveDaysAgo)
              .map((t: any) => ({ qr_id: t.qr_id, created_at: t.created_at }));

            const activeCooldowns = extractActiveCooldowns(recentQrTxs, rawQrs);
            const suggestedQrs = filterSuggestedQRs({
              qrs: rawQrs,
              activeCooldowns,
              userFirstName: resolvedFirstName,
            }).slice(0, 3);

            // Recent Transactions
            const txFeed: RecentTx[] = activeTxs.slice(0, 6).map((t: any) => {
              const isPayment = t.type === 'bill_payment';
              return {
                id: t.id,
                title: isPayment
                  ? `Bill Payment Repaid (${t.cards?.card_name || 'Card'})`
                  : t.remarks || 'Rotation Withdrawal',
                category: isPayment
                  ? 'Repayment'
                  : t.cards?.card_name
                  ? `${t.cards.card_name} Rotation`
                  : 'Card Rotation',
                amount: Number(t.amount || 0),
                date: t.transaction_date
                  ? new Date(t.transaction_date).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Recent',
                isCredit: isPayment,
              };
            });

            // Commit state to store & persistent disk
            set({
              isInitialized: true,
              isLoading: false,
              lastFetchedAt: Date.now(),
              currentUser: authUser,
              userName: resolvedUserName,
              firstName: resolvedFirstName,
              userAvatar: resolvedAvatar,
              accessibleCards: myCards,
              totalLimit,
              availableLimit: limitMetrics.availableLimit,
              inTransit: limitMetrics.inTransitAmount,
              cardLimitStats,
              activeBills: formattedBills,
              usersCash: usersCashTotal,
              userStats: formattedUserStats,
              suggestedQrs,
              activeCooldowns,
              recentTransactions: txFeed,
              daysToBill: billInfo.daysToBill,
              nextBillDate: billInfo.nextBillDate,
            });
          } catch (err) {
            console.error('Error fetching dashboard data in store:', err);
            set({ isLoading: false });
          } finally {
            activeFetchPromise = null;
          }
        })();

        return activeFetchPromise;
      },
    }),
    {
      name: 'credics-dashboard-cache',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        userName: state.userName,
        firstName: state.firstName,
        userAvatar: state.userAvatar,
        accessibleCards: state.accessibleCards,
        totalLimit: state.totalLimit,
        availableLimit: state.availableLimit,
        inTransit: state.inTransit,
        usersCash: state.usersCash,
        cardLimitStats: state.cardLimitStats,
        activeBills: state.activeBills,
        userStats: state.userStats,
        suggestedQrs: state.suggestedQrs,
        activeCooldowns: state.activeCooldowns,
        recentTransactions: state.recentTransactions,
        daysToBill: state.daysToBill,
        nextBillDate: state.nextBillDate,
      }),
    }
  )
);
