import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import {
  CardData,
  calculateTotalLimit,
  calculateCardLimits,
  calculateCardLimitStats,
  calculateNextBillCountdown,
  calculatePersonalDue,
  extractActiveCooldowns,
  filterSuggestedQRs,
  deduplicateLatestBillsPerCard,
  calculateInTransitTotal,
  computeBorrowerSummaries,
  calculateChronologicalRunningBalances,
  QRItem,
  BillingCycle,
  Borrower,
  LentLedgerRecord,
} from '@credics/core';

// 1. Core Cards & User Access Query
export function useCardsQuery() {
  return useQuery({
    queryKey: ['cards'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        return { user: null, cards: [] as CardData[], profile: null };
      }

      const [accessRes, profileRes] = await Promise.all([
        supabase.from('card_access').select('card_id').eq('user_id', user.id),
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      ]);

      const accessData = accessRes.data || [];
      let cards: CardData[] = [];

      if (accessData.length > 0) {
        const cardIds = accessData.map((a: any) => a.card_id);
        const { data: cardsData } = await supabase
          .from('cards')
          .select('*')
          .in('id', cardIds)
          .order('is_primary', { ascending: false });
        if (cardsData) cards = cardsData as CardData[];
      } else {
        const { data: fallbackCards } = await supabase
          .from('cards')
          .select('*')
          .order('is_primary', { ascending: false });
        if (fallbackCards) cards = fallbackCards as CardData[];
      }

      return {
        user,
        profile: profileRes.data || null,
        cards,
      };
    },
  });
}

// 2. Dashboard Query (Batched, no N+1 loop, leverages @credics/core calculations)
export function useDashboardQuery(selectedCardId: string = 'all') {
  return useQuery({
    queryKey: ['dashboard', selectedCardId],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUser = session?.user;
      if (!authUser) return null;

      // Parallel batch fetching of all necessary tables in 1 flight
      const [
        profileRes,
        accessRes,
        allCardsRes,
        txsRes,
        spendsRes,
        billsRes,
        cohRes,
        allProfilesRes,
        pocketAdvancesRes,
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
        supabase.from('pocket_advances').select('*'), // Batched, eliminates N+1 query loop!
        supabase.from('qrs').select('*').eq('status', 'active'),
      ]);

      const myCards: CardData[] = (allCardsRes.data || []) as CardData[];
      const profile = profileRes.data;
      const resolvedFirstName = (profile?.name || '').split(' ')[0];

      // Limit & Family Calculations via @credics/core
      const totalLimit = calculateTotalLimit(selectedCardId, myCards);

      // Active card IDs filter
      let activeCardIds = myCards.map((c) => c.id);
      if (selectedCardId !== 'all') {
        const selected = myCards.find((c) => c.id === selectedCardId);
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

      const billCountdown = calculateNextBillCountdown(myCards, selectedCardId);
      const inTransitAmount = calculateInTransitTotal(activeTxs);

      // Deduplicate active bills
      const rawBills = (billsRes.data || []) as BillingCycle[];
      const activeBills = deduplicateLatestBillsPerCard(rawBills);

      // Cash On Hand and User Stats
      const allCoh = cohRes.data || [];
      const allProfiles = allProfilesRes.data || [];
      const allPocket = pocketAdvancesRes.data || [];

      const usersCash = allCoh
        .filter((c: any) => activeCardIds.includes(c.card_id))
        .reduce((sum: number, c: any) => sum + Number(c.current_balance || 0), 0);

      const userStats = allProfiles.map((p: any) => {
        const userCohRows = allCoh.filter((c: any) => c.user_id === p.id && activeCardIds.includes(c.card_id));
        const cash = userCohRows.reduce((sum: number, c: any) => sum + Number(c.current_balance || 0), 0);

        const due = calculatePersonalDue(p.id, activeSpends, activeTxs);

        const userPocketRows = allPocket.filter((pa: any) => pa.user_id === p.id);
        const pocket = userPocketRows.reduce((sum: number, pa: any) => sum + Number(pa.current_balance || 0), 0);

        const cardBreakdown = myCards.map((c) => ({
          cardId: c.id,
          cardName: c.card_name,
          cardLast4: c.last_4_digits,
          balance: Number(userCohRows.find((r: any) => r.card_id === c.id)?.current_balance || 0),
        }));

        return {
          id: p.id,
          name: (p.name || '').split(' ')[0],
          cash,
          due,
          pocket,
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

      return {
        authUser,
        profile,
        userName: profile?.name || 'User',
        firstName: resolvedFirstName,
        userAvatar: profile?.avatar_url || null,
        accessibleCards: myCards,
        totalLimit,
        availableLimit: limitMetrics.availableLimit,
        inTransit: inTransitAmount,
        usersCash,
        daysToBill: billCountdown.daysToBill,
        nextBillDate: billCountdown.nextBillDate,
        activeBills,
        userStats,
        cardLimitStats,
        suggestedQrs,
        activeCooldowns,
        recentTransactions: activeTxs.slice(0, 6).map((t: any) => ({
          id: t.id,
          title: t.type === 'bill_payment' ? `Bill Payment (${t.cards?.card_name || 'Card'})` : t.remarks || 'Rotation',
          category: t.type === 'bill_payment' ? 'Repayment' : `${t.cards?.card_name || 'Card'} Rotation`,
          amount: Number(t.amount || 0),
          date: t.transaction_date || 'Recent',
          isCredit: t.type === 'bill_payment',
        })),
      };
    },
  });
}

// 3. Transactions Query
export function useTransactionsQuery() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const [txsRes, spendsRes, cardsRes, profilesRes, qrsRes, cohRes, cyclesRes] = await Promise.all([
        supabase.from('card_transactions').select('*').order('transaction_date', { ascending: false }),
        supabase.from('spends').select('*').order('spend_date', { ascending: false }),
        supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        supabase.from('profiles').select('*').order('name'),
        supabase.from('qrs').select('*'),
        supabase.from('cash_on_hand').select('*'),
        supabase.from('billing_cycles').select('*'),
      ]);

      return {
        transactions: txsRes.data || [],
        spends: spendsRes.data || [],
        cards: (cardsRes.data || []) as CardData[],
        profiles: profilesRes.data || [],
        qrs: (qrsRes.data || []) as QRItem[],
        cashOnHand: cohRes.data || [],
        billingCycles: (cyclesRes.data || []) as BillingCycle[],
      };
    },
  });
}

// 4. Lents Query
export function useLentsQuery() {
  return useQuery({
    queryKey: ['lents'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;

      const [borrowersRes, cardLedgerRes, pocketLedgerRes, cardsRes, profilesRes] = await Promise.all([
        supabase.from('borrowers').select('*').order('name'),
        supabase.from('card_lent_ledger').select('*').order('transaction_date', { ascending: false }),
        currentUserId
          ? supabase.from('pocket_lent_ledger').select('*').eq('recorded_by', currentUserId).order('transaction_date', { ascending: false })
          : Promise.resolve({ data: [] }),
        supabase.from('cards').select('*'),
        supabase.from('profiles').select('*'),
      ]);

      const rawBorrowers = (borrowersRes.data || []) as Borrower[];
      const cardRecords = (cardLedgerRes.data || []) as LentLedgerRecord[];
      const pocketRecords = (pocketLedgerRes.data || []) as LentLedgerRecord[];

      const combinedRecords = [
        ...cardRecords.map((r) => ({ ...r, ledgerSource: 'card' as const })),
        ...pocketRecords.map((r) => ({ ...r, ledgerSource: 'pocket' as const })),
      ];

      const borrowerSummaries = computeBorrowerSummaries(rawBorrowers, combinedRecords);

      return {
        borrowers: rawBorrowers,
        borrowerSummaries,
        cardRecords,
        pocketRecords,
        combinedRecords,
        cards: (cardsRes.data || []) as CardData[],
        profiles: profilesRes.data || [],
      };
    },
  });
}

// 5. Settlements Query
export function useSettlementsQuery() {
  return useQuery({
    queryKey: ['settlements'],
    queryFn: async () => {
      const [txsRes, qrsRes, cardsRes, profilesRes] = await Promise.all([
        supabase.from('card_transactions').select('*').eq('type', 'withdrawal').order('transaction_date', { ascending: false }),
        supabase.from('qrs').select('*'),
        supabase.from('cards').select('*'),
        supabase.from('profiles').select('*'),
      ]);

      const allTxs = txsRes.data || [];
      const pendingTxs = allTxs.filter((t: any) => t.status !== 'settled');
      const settledTxs = allTxs.filter((t: any) => t.status === 'settled');

      return {
        allTxs,
        pendingTxs,
        settledTxs,
        qrs: (qrsRes.data || []) as QRItem[],
        cards: (cardsRes.data || []) as CardData[],
        profiles: profilesRes.data || [],
      };
    },
  });
}
