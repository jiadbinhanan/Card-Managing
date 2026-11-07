import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Dimensions,
  StatusBar,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Plus,
  Filter,
  Layers,
  ChevronDown,
  X,
  Calendar,
  Clock,
  User,
  Check,
  Receipt,
} from 'lucide-react-native';

import { supabase } from '../../lib/supabase';
import NetInfo from '@react-native-community/netinfo';
import { processBillPaymentFIFO, deductCashFromSources } from '@credics/core';
import { useCardStore } from '../../lib/cardStore';
import { VaultCardSelectorDrawer } from '../../components/VaultCardSelectorDrawer';
import { useOfflineQueueStore } from '../../lib/offlineQueue';
import {
  TransactionItemCard,
  UnifiedTransactionItem,
} from '../../components/TransactionItemCard';
import {
  RecordEntryDrawer,
  RecordEntrySubmitPayload,
  CardData,
  ProfileData,
  QRData,
} from '../../components/RecordEntryDrawer';
import {
  TransactionTraceBottomSheet,
  TraceTarget,
} from '../../components/TransactionTraceBottomSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAGE_SIZE = 20;

function mapTxToUnified(
  t: any,
  cards: CardData[],
  profiles: ProfileData[],
  qrs: QRData[]
): UnifiedTransactionItem {
  const cardObj = cards.find((c) => c.id === t.card_id);
  const cardInfo = cardObj
    ? `${cardObj.card_name} (**${cardObj.last_4_digits})`
    : 'Card Not Linked';
  const profileObj = profiles.find((p) => p.id === t.recorded_by);
  const qrObj = qrs.find((q) => q.id === t.qr_id);

  const breakdown = t.cash_source_breakdown as Array<{
    card_id: string;
    amount: number;
  }> | null;
  const hasCrossCardCash = !!(
    breakdown &&
    breakdown.length > 0 &&
    breakdown.some((b) => b.card_id !== t.card_id)
  );

  const isWithdrawal = t.type === 'withdrawal';
  const displayDate = t.transaction_date || '';

  return {
    id: `tx-${t.id}`,
    rawId: t.id,
    type: t.type,
    amount: Number(t.amount || 0),
    displayDate,
    sortDate: new Date(displayDate).getTime() || 0,
    status: t.status || 'settled',
    title: isWithdrawal
      ? qrObj?.merchant_name || 'Rotation Withdrawal'
      : 'Card Bill Payment',
    subtitle: isWithdrawal
      ? `Rotated by ${profileObj?.name?.split(' ')[0] || 'User'}`
      : `Paid by ${profileObj?.name?.split(' ')[0] || 'User'}`,
    iconName: isWithdrawal ? 'withdrawal' : 'bill_payment',
    color: isWithdrawal ? '#E05D52' : '#2D7A5D',
    bgColor: isWithdrawal ? '#FCEBEA' : '#E8F5E9',
    remarks: t.remarks || undefined,
    cardId: t.card_id,
    cardDetails: cardInfo,
    paymentMethod: isWithdrawal
      ? 'Credit Card'
      : t.payment_method === 'own_pocket'
      ? 'Own Pocket'
      : 'Cash on Hand',
    recordedBy: profileObj?.name || 'User',
    userId: t.recorded_by || '',
    cashSourceBreakdown: breakdown?.map((b) => {
      const bc = cards.find((c) => c.id === b.card_id);
      return {
        cardLabel: bc ? `${bc.card_name} (**${bc.last_4_digits})` : 'Card',
        amount: Number(b.amount || 0),
      };
    }),
    isCrossCardCash: hasCrossCardCash,
  };
}

function mapSpendToUnified(
  s: any,
  cards: CardData[],
  profiles: ProfileData[]
): UnifiedTransactionItem {
  const isRepayment = Number(s.amount || 0) < 0;
  const cardObj = cards.find((c) => c.id === s.card_id);
  const cardInfo = cardObj
    ? `${cardObj.card_name} (**${cardObj.last_4_digits})`
    : 'Card Not Linked';
  const profileObj = profiles.find((p) => p.id === s.user_id);

  const breakdown = s.cash_source_breakdown as Array<{
    card_id: string;
    amount: number;
  }> | null;
  const hasCrossCardCash = !!(
    breakdown &&
    breakdown.length > 0 &&
    breakdown.some((b) => b.card_id !== s.card_id)
  );

  const displayDate = s.spend_date || '';

  return {
    id: `sp-${s.id}`,
    rawId: s.id,
    type: 'spend',
    amount: Math.abs(Number(s.amount || 0)),
    displayDate,
    sortDate: new Date(displayDate).getTime() || 0,
    status: 'settled',
    title: isRepayment ? 'Debt Repayment' : s.remarks || 'Personal Spend',
    subtitle: `Spent by ${profileObj?.name?.split(' ')[0] || 'User'}`,
    iconName: isRepayment ? 'repayment' : 'spend',
    color: isRepayment ? '#2D7A5D' : '#D97706',
    bgColor: isRepayment ? '#E8F5E9' : '#FEF3C7',
    isRepaymentFlag: isRepayment,
    remarks: s.remarks || undefined,
    cardId: s.card_id,
    cardDetails: cardInfo,
    paymentMethod:
      s.payment_method === 'credit_card' ? 'Credit Card' : 'Cash on Hand',
    recordedBy: profileObj?.name || 'User',
    userId: s.user_id || '',
    cashSourceBreakdown: breakdown?.map((b) => {
      const bc = cards.find((c) => c.id === b.card_id);
      return {
        cardLabel: bc ? `${bc.card_name} (**${bc.last_4_digits})` : 'Card',
        amount: Number(b.amount || 0),
      };
    }),
    isCrossCardCash: hasCrossCardCash,
  };
}

const formatDateHeader = (dateStr: string) => {
  if (!dateStr) return 'Recent Activity';
  const itemDate = new Date(dateStr);
  const now = new Date();
  if (
    itemDate.getFullYear() === now.getFullYear() &&
    itemDate.getMonth() === now.getMonth() &&
    itemDate.getDate() === now.getDate()
  ) {
    return 'Today';
  }
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (
    itemDate.getFullYear() === yest.getFullYear() &&
    itemDate.getMonth() === yest.getMonth() &&
    itemDate.getDate() === yest.getDate()
  ) {
    return 'Yesterday';
  }
  return itemDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export default function TransactionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Primary Filters
  const [activeTab, setActiveTab] = useState<'all' | 'rotations' | 'spends' | 'bill_paid'>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterDateType, setFilterDateType] = useState<
    'month' | 'last_month' | 'today' | 'all' | 'custom'
  >('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
  const { selectedCardId: selectedVaultCardId, setSelectedCardId: setSelectedVaultCardId } =
    useCardStore();

  // Modals & Expansion
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);
  const [isUserFilterModalOpen, setIsUserFilterModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Trace Flow State
  const [traceTarget, setTraceTarget] = useState<TraceTarget | null>(null);
  const [isTraceOpen, setIsTraceOpen] = useState(false);

  // Data & Pagination States
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [unifiedList, setUnifiedList] = useState<UnifiedTransactionItem[]>([]);

  // Auxiliary Store
  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileData[]>([]);
  const [allQrs, setAllQrs] = useState<QRData[]>([]);
  const [currentUser, setCurrentUser] = useState<ProfileData | null>(null);
  const [cardDueMap, setCardDueMap] = useState<Record<string, number>>({});
  const [userCardCashMap, setUserCardCashMap] = useState<Record<string, Record<string, number>>>({});
  const [userFamilySpendMap, setUserFamilySpendMap] = useState<Record<string, number>>({});

  // 120Hz Animation Values
  const cardDropdownScale = useSharedValue(1);
  const fabScale = useSharedValue(1);

  const cardDropdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardDropdownScale.value }],
  }));

  const fabAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const handleCardDropdownPress = () => {
    cardDropdownScale.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withSpring(1, { damping: 14 })
    );
    setIsCardDropdownOpen(true);
  };

  const handleFabPress = () => {
    fabScale.value = withSequence(
      withTiming(0.88, { duration: 70 }),
      withSpring(1, { damping: 14 })
    );
    setIsRecordModalOpen(true);
  };

  // Fetch Auxiliary Ledger Data (Cards, Profiles, QRs, Cash, Billing Cycles)
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getSession();
      const currentAuthUser = authData?.session?.user;

      const [cardsRes, profilesRes, qrsRes, cohRes, cyclesRes, spendsRes] = await Promise.all([
        supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        supabase.from('profiles').select('*').order('name'),
        supabase.from('qrs').select('*').order('merchant_name'),
        supabase.from('cash_on_hand').select('*'),
        supabase.from('billing_cycles').select('*').in('status', ['unpaid', 'partially_paid']),
        supabase.from('spends').select('user_id, amount'),
      ]);

      const cards: CardData[] = cardsRes.data || [];
      const profiles: ProfileData[] = profilesRes.data || [];
      const qrs: QRData[] = qrsRes.data || [];
      const coh = cohRes.data || [];
      const activeCycles = cyclesRes.data || [];

      setAllCards(cards);
      setAllProfiles(profiles);
      setAllQrs(qrs);

      if (currentAuthUser) {
        const found = profiles.find((p) => p.id === currentAuthUser.id);
        if (found) setCurrentUser(found);
      } else if (profiles.length > 0) {
        setCurrentUser(profiles[0]);
      }

      // Calculate Cash on Hand Map
      const cardCashMap: Record<string, Record<string, number>> = {};
      coh.forEach((c) => {
        if (c.user_id && c.card_id) {
          if (!cardCashMap[c.user_id]) cardCashMap[c.user_id] = {};
          cardCashMap[c.user_id][c.card_id] = Number(c.current_balance || 0);
        }
      });
      setUserCardCashMap(cardCashMap);

      // Calculate Due Map
      const dMap: Record<string, number> = {};
      activeCycles.forEach((c) => {
        if (c.card_id) {
          const dueAmt = Number(c.generated_amount || 0) - Number(c.paid_amount || 0);
          dMap[c.card_id] = (dMap[c.card_id] || 0) + dueAmt;
        }
      });
      setCardDueMap(dMap);

      // Calculate Personal Family Debt Map
      const fMap: Record<string, number> = {};
      (spendsRes.data || []).forEach((s: any) => {
        if (s.user_id) {
          fMap[s.user_id] = (fMap[s.user_id] || 0) + Number(s.amount || 0);
        }
      });
      setUserFamilySpendMap(fMap);
    } catch (err) {
      console.error('Error fetching auxiliary data:', err);
    }
  }, []);

  // Paginated Master Data Query Engine
  const fetchTransactionsPage = useCallback(
    async (pageNumber: number, replace: boolean = false) => {
      try {
        if (pageNumber === 0) {
          if (!replace) setIsLoading(true);
        } else {
          setLoadingMore(true);
        }

        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .slice(0, 10);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .slice(0, 10);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          .toISOString()
          .slice(0, 10);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
          .toISOString()
          .slice(0, 10);

        const from = pageNumber * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const shouldQueryTxs =
          activeTab === 'all' || activeTab === 'rotations' || activeTab === 'bill_paid';
        const shouldQuerySpends =
          activeTab === 'all' || activeTab === 'spends' || activeTab === 'bill_paid';

        let txPromise: any = Promise.resolve({ data: [] });
        let spendsPromise: any = Promise.resolve({ data: [] });

        if (shouldQueryTxs) {
          let q = supabase
            .from('card_transactions')
            .select('*')
            .order('transaction_date', { ascending: false });

          if (activeTab === 'rotations') {
            q = q.eq('type', 'withdrawal');
          } else if (activeTab === 'bill_paid') {
            q = q.eq('type', 'bill_payment');
          }

          if (filterDateType === 'month') {
            q = q.gte('transaction_date', startOfMonth).lte('transaction_date', endOfMonth);
          } else if (filterDateType === 'last_month') {
            q = q.gte('transaction_date', startOfLastMonth).lte('transaction_date', endOfLastMonth);
          } else if (filterDateType === 'today') {
            q = q.eq('transaction_date', todayStr);
          } else if (filterDateType === 'custom' && customStartDate && customEndDate) {
            q = q.gte('transaction_date', customStartDate).lte('transaction_date', customEndDate);
          }

          if (selectedVaultCardId !== 'all') {
            q = q.eq('card_id', selectedVaultCardId);
          }

          if (filterUser !== 'all') {
            q = q.eq('recorded_by', filterUser);
          }

          txPromise = q.range(from, to);
        }

        if (shouldQuerySpends) {
          let q = supabase
            .from('spends')
            .select('*')
            .order('spend_date', { ascending: false });

          if (activeTab === 'spends') {
            q = q.gt('amount', 0);
          } else if (activeTab === 'bill_paid') {
            q = q.lt('amount', 0);
          }

          if (filterDateType === 'month') {
            q = q.gte('spend_date', startOfMonth).lte('spend_date', endOfMonth);
          } else if (filterDateType === 'last_month') {
            q = q.gte('spend_date', startOfLastMonth).lte('spend_date', endOfLastMonth);
          } else if (filterDateType === 'today') {
            q = q.eq('spend_date', todayStr);
          } else if (filterDateType === 'custom' && customStartDate && customEndDate) {
            q = q.gte('spend_date', customStartDate).lte('spend_date', customEndDate);
          }

          if (selectedVaultCardId !== 'all') {
            q = q.eq('card_id', selectedVaultCardId);
          }

          if (filterUser !== 'all') {
            q = q.eq('user_id', filterUser);
          }

          spendsPromise = q.range(from, to);
        }

        const [{ data: rawTxs }, { data: rawSpends }] = await Promise.all([
          txPromise,
          spendsPromise,
        ]);

        const txList = (rawTxs || []) as any[];
        const spList = (rawSpends || []) as any[];

        const mappedTxs = txList.map((t) =>
          mapTxToUnified(t, allCards, allProfiles, allQrs)
        );
        const mappedSpends = spList.map((s) =>
          mapSpendToUnified(s, allCards, allProfiles)
        );

        const merged = [...mappedTxs, ...mappedSpends].sort(
          (a, b) => b.sortDate - a.sortDate
        );

        const moreAvailable =
          txList.length === PAGE_SIZE || spList.length === PAGE_SIZE;
        setHasMore(moreAvailable);

        if (replace || pageNumber === 0) {
          setUnifiedList(merged);
          setPage(0);
        } else {
          setUnifiedList((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const uniqueNew = merged.filter((m) => !existingIds.has(m.id));
            return [...prev, ...uniqueNew].sort((a, b) => b.sortDate - a.sortDate);
          });
          setPage(pageNumber);
        }
      } catch (err) {
        console.error('Error fetching transactions page:', err);
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [
      activeTab,
      filterDateType,
      customStartDate,
      customEndDate,
      selectedVaultCardId,
      filterUser,
      allCards,
      allProfiles,
      allQrs,
    ]
  );

  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  useEffect(() => {
    fetchTransactionsPage(0, true);
  }, [fetchTransactionsPage]);

  // Realtime Subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('mobile-transactions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_transactions' },
        () => fetchTransactionsPage(0, true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spends' },
        () => fetchTransactionsPage(0, true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_on_hand' },
        () => fetchAuxiliaryData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_cycles' },
        () => fetchAuxiliaryData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTransactionsPage, fetchAuxiliaryData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAuxiliaryData();
    await fetchTransactionsPage(0, true);
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || isLoading || refreshing) return;
    fetchTransactionsPage(page + 1, false);
  };

  // Submit Handler for RecordEntryDrawer with Offline Queue & Exact Timestamp Preservation
  const handleSaveRecord = async (payload: RecordEntrySubmitPayload) => {
    const {
      recordType,
      amount: numAmount,
      finalDate,
      actingUserId,
      activeCardId,
      remarks,
      selectedQrId,
      spendMethod,
      billMethod,
      isDebtRepayment,
      validCashSources,
    } = payload;

    const originalCreatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const isSpendCash = recordType === 'spend' && spendMethod === 'cash_on_hand';
    const isBillCash = recordType === 'bill' && billMethod === 'cash_on_hand';
    const breakdownForInsert =
      isBillCash || isSpendCash
        ? validCashSources.map((s) => ({ card_id: s.cardId, amount: s.amount }))
        : null;

    // Check connectivity first
    const netState = await NetInfo.fetch();
    const isOnline = !!netState.isConnected;

    if (!isOnline) {
      // Offline: Enqueue mutation with EXACT original timestamp
      useOfflineQueueStore.getState().enqueueMutation({
        type: recordType,
        payload: {
          activeCardId,
          numAmount,
          selectedQrId,
          remarks,
          actingUserId,
          spendMethod,
          billMethod,
          isDebtRepayment,
          breakdownForInsert,
          validCashSources,
        },
        original_created_at: originalCreatedAt,
        transaction_date: finalDate,
        timeStr,
      });

      // Allowed haptics on submit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRecordModalOpen(false);
      return;
    }

    try {
      if (recordType === 'rotate') {
        await supabase.from('card_transactions').insert({
          card_id: activeCardId,
          type: 'withdrawal',
          amount: numAmount,
          qr_id: selectedQrId || null,
          remarks: remarks || 'Rotation Withdrawal',
          status: 'pending_settlement',
          transaction_date: finalDate,
          created_at: originalCreatedAt,
          recorded_by: actingUserId || null,
        });
      } else if (recordType === 'spend') {
        await supabase.from('spends').insert({
          user_id: actingUserId,
          card_id: activeCardId,
          amount: numAmount,
          spend_type: 'personal',
          payment_method: spendMethod,
          remarks: remarks || 'Personal Spend',
          spend_date: finalDate,
          created_at: originalCreatedAt,
          cash_source_breakdown: breakdownForInsert,
        });

        if (spendMethod === 'cash_on_hand' && validCashSources.length > 0) {
          await deductCashFromSources(supabase, {
            userId: actingUserId,
            sources: validCashSources,
            note: `Personal spend ${remarks ? '- ' + remarks : ''}`,
            txDate: finalDate,
            createdAt: originalCreatedAt,
          });
        }
      } else if (recordType === 'bill') {
        // FIFO Bill allocation via @credics/core
        const billCycleResult = await processBillPaymentFIFO(supabase, activeCardId, numAmount);

        const { data: billTx, error: txErr } = await supabase
          .from('card_transactions')
          .insert({
            card_id: activeCardId,
            type: 'bill_payment',
            amount: numAmount,
            status: 'settled',
            payment_method: billMethod,
            remarks: remarks || 'Card Bill Repayment',
            transaction_date: finalDate,
            created_at: originalCreatedAt,
            recorded_by: actingUserId || null,
            billing_cycle_id: billCycleResult.cycleId,
            cash_source_breakdown: billMethod === 'cash_on_hand' ? breakdownForInsert : null,
          })
          .select('id')
          .single();

        if (txErr) throw txErr;

        if (billMethod === 'cash_on_hand' && validCashSources.length > 0) {
          await deductCashFromSources(supabase, {
            userId: actingUserId,
            sources: validCashSources,
            note: `Bill payment ${remarks ? '- ' + remarks : ''}`,
            linkedCardTxId: billTx?.id || null,
            txDate: finalDate,
            createdAt: originalCreatedAt,
          });
        } else if (billMethod === 'own_pocket') {
          await supabase.from('pocket_advances_ledger').insert({
            user_id: actingUserId,
            card_id: activeCardId,
            amount: -numAmount,
            entry_type: 'advance',
            transaction_date: finalDate,
            created_at: originalCreatedAt,
            linked_card_transaction_id: billTx?.id || null,
            remarks: `Card bill payment advanced from pocket ${remarks ? '- ' + remarks : ''}`,
          });

          const { data: curAdv } = await supabase
            .from('pocket_advances')
            .select('current_balance')
            .eq('user_id', actingUserId)
            .eq('card_id', activeCardId)
            .maybeSingle();

          const nextAdv = (Number(curAdv?.current_balance) || 0) - numAmount;
          await supabase.from('pocket_advances').upsert({
            user_id: actingUserId,
            card_id: activeCardId,
            current_balance: nextAdv,
          });
        }

        if (isDebtRepayment) {
          await supabase.from('spends').insert({
            user_id: actingUserId,
            card_id: activeCardId,
            amount: -numAmount,
            spend_type: 'repayment',
            payment_method: billMethod,
            remarks: `Debt Cleared ${remarks ? ': ' + remarks : ''}`,
            spend_date: finalDate,
            created_at: originalCreatedAt,
            linked_card_transaction_id: billTx?.id || null,
          });
        }
      }

      // Success Haptics on save as permitted by rule
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setIsRecordModalOpen(false);
      await fetchTransactionsPage(0, true);
      await fetchAuxiliaryData();
    } catch (onlineError) {
      console.warn('Online transaction failed, falling back to offline mutation queue:', onlineError);
      // Fallback to queue if network drops mid-flight
      useOfflineQueueStore.getState().enqueueMutation({
        type: recordType,
        payload: {
          activeCardId,
          numAmount,
          selectedQrId,
          remarks,
          actingUserId,
          spendMethod,
          billMethod,
          isDebtRepayment,
          breakdownForInsert,
          validCashSources,
        },
        original_created_at: originalCreatedAt,
        transaction_date: finalDate,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRecordModalOpen(false);
    }
  };

  const renderTransactionItem = useCallback(
    ({ item, index }: { item: UnifiedTransactionItem; index: number }) => {
      const prevItem = index > 0 ? unifiedList[index - 1] : null;
      const showDateHeader =
        index === 0 ||
        formatDateHeader(item.displayDate) !== formatDateHeader(prevItem?.displayDate || '');

      return (
        <View key={item.id}>
          {showDateHeader && (
            <View style={styles.dateHeaderRow}>
              <View style={styles.dateBadge}>
                <Calendar size={11} color="#0B3F28" strokeWidth={2.2} />
                <Text style={styles.dateBadgeText}>{formatDateHeader(item.displayDate)}</Text>
              </View>
              <View style={styles.dateDivider} />
            </View>
          )}
          <TransactionItemCard
            item={item}
            isExpanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            onTrace={() => {
              setTraceTarget({
                id: item.rawId,
                sourceType: item.type === 'spend' ? 'spend' : 'card_transaction',
                title: item.title,
                amount: item.amount,
                date: item.displayDate,
                remarks: item.remarks,
              });
              setIsTraceOpen(true);
            }}
          />
        </View>
      );
    },
    [unifiedList, expandedId]
  );

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#0B3F28" />
          <Text style={styles.footerLoaderText}>Loading more transactions...</Text>
        </View>
      );
    }
    if (!hasMore && unifiedList.length > 0) {
      return (
        <View style={styles.footerEnd}>
          <Text style={styles.footerEndText}>• End of Ledger Feed •</Text>
        </View>
      );
    }
    return null;
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Receipt size={32} color="#4A6B56" />
        </View>
        <Text style={styles.emptyTitle}>No Transactions Found</Text>
        <Text style={styles.emptySub}>
          No records match the current filters. Tap &quot;+&quot; on bottom right to record an entry.
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.screenContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#03180F" translucent />

      {/* ================= 1. LUXURY GREEN GRADIENT HEADER ================= */}
      <LinearGradient
        colors={['#03180F', '#072C1C', '#0B3F28', '#062618']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.headerHeroContainer, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.userProfileBtn}
            onPress={() => router.push('/settings')}
            activeOpacity={0.8}
          >
            <View style={styles.avatarBorder}>
              {currentUser?.avatar_url ? (
                <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.userTextCol}>
              <View style={styles.liveStatusRow}>
                <View style={styles.livePulseDot} />
                <Text style={styles.liveStatusText}>LIVE LEDGER • REALTIME</Text>
              </View>
              <Text style={styles.headerTitle}>Transactions</Text>
            </View>
          </TouchableOpacity>

          {/* Vault Card Selector Dropdown with 120Hz Tactile Pop */}
          <Animated.View style={cardDropdownAnimStyle}>
            <TouchableOpacity
              style={styles.vaultPill}
              onPress={handleCardDropdownPress}
              activeOpacity={0.8}
            >
              <Layers size={13} color="#CAD6C9" />
              <Text style={styles.vaultPillText} numberOfLines={1}>
                {selectedVaultCardId === 'all'
                  ? 'All Cards'
                  : (() => {
                      const c = allCards.find((card) => card.id === selectedVaultCardId);
                      if (!c) return 'Card';
                      return !c.is_primary && c.parent_card_id ? `↳ ${c.card_name}` : c.card_name;
                    })()}
              </Text>
              <ChevronDown size={12} color="#CAD6C9" />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Symmetrical Organic SVG Wave Transition */}
        <View style={styles.svgWaveWrapper}>
          <Svg
            width={SCREEN_WIDTH}
            height={32}
            viewBox={`0 0 ${SCREEN_WIDTH} 32`}
            preserveAspectRatio="none"
          >
            <Path
              d={`M 0,0 C ${SCREEN_WIDTH * 0.25},24 ${SCREEN_WIDTH * 0.75},24 ${SCREEN_WIDTH},0 L ${SCREEN_WIDTH},32 L 0,32 Z`}
              fill="#EFF3EE"
            />
          </Svg>
        </View>
      </LinearGradient>

      {/* ================= 2. MAIN SEGMENTED FILTER TABS ================= */}
      <View style={styles.tabsRow}>
        {(['all', 'rotations', 'spends', 'bill_paid'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label =
            tab === 'all'
              ? 'All'
              : tab === 'rotations'
              ? 'Rotations'
              : tab === 'spends'
              ? 'Spends'
              : 'Bill Paid';
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, isActive && styles.activeTabChip]}
              onPress={() => {
                if (activeTab !== tab) {
                  setActiveTab(tab);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabChipText, isActive && styles.activeTabChipText]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ================= 3. FILTER PILLS (USER & DATE) ================= */}
      <View style={styles.filterPillsRow}>
        <View style={styles.filterBadge}>
          <Filter size={11} color="#4A6B56" />
          <Text style={styles.filterBadgeText}>Filter</Text>
        </View>

        {/* User Filter Pill */}
        <TouchableOpacity
          style={[styles.filterChip, filterUser !== 'all' && styles.activeFilterChip]}
          onPress={() => setIsUserFilterModalOpen(true)}
          activeOpacity={0.8}
        >
          <User size={12} color={filterUser !== 'all' ? '#072C1C' : '#4A6B56'} />
          <Text
            style={[styles.filterChipText, filterUser !== 'all' && styles.activeFilterChipText]}
          >
            {filterUser === 'all'
              ? 'All Users'
              : allProfiles.find((p) => p.id === filterUser)?.name?.split(' ')[0] || 'User'}
          </Text>
          <ChevronDown size={11} color={filterUser !== 'all' ? '#072C1C' : '#4A6B56'} />
        </TouchableOpacity>

        {/* Date Filter Pills */}
        {(['month', 'last_month', 'today', 'all'] as const).map((dType) => {
          const isDateActive = filterDateType === dType;
          const dateLabel =
            dType === 'month'
              ? 'This Month'
              : dType === 'last_month'
              ? 'Last Month'
              : dType === 'today'
              ? 'Today'
              : 'All Time';
          return (
            <TouchableOpacity
              key={dType}
              style={[styles.filterChip, isDateActive && styles.activeFilterChip]}
              onPress={() => {
                if (filterDateType !== dType) {
                  setFilterDateType(dType);
                }
              }}
              activeOpacity={0.8}
            >
              <Clock size={11} color={isDateActive ? '#072C1C' : '#4A6B56'} />
              <Text
                style={[
                  styles.filterChipText,
                  isDateActive && styles.activeFilterChipText,
                ]}
              >
                {dateLabel}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Custom Date Range Pill */}
        <TouchableOpacity
          style={[styles.filterChip, filterDateType === 'custom' && styles.activeFilterChip]}
          onPress={() => setIsCustomDateModalOpen(true)}
          activeOpacity={0.8}
        >
          <Calendar size={11} color={filterDateType === 'custom' ? '#072C1C' : '#4A6B56'} />
          <Text
            style={[
              styles.filterChipText,
              filterDateType === 'custom' && styles.activeFilterChipText,
            ]}
          >
            {filterDateType === 'custom' && customStartDate && customEndDate
              ? `${customStartDate.slice(5)} - ${customEndDate.slice(5)}`
              : 'Custom'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ================= 4. VIRTUALIZED FLATLIST FEED ================= */}
      {isLoading && unifiedList.length === 0 ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#0B3F28" />
          <Text style={styles.loaderText}>Loading Live Ledger Feed...</Text>
        </View>
      ) : (
        <FlatList
          data={unifiedList}
          keyExtractor={(item) => item.id}
          renderItem={renderTransactionItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: 130 }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0B3F28']}
              tintColor="#0B3F28"
            />
          }
        />
      )}

      {/* ================= 5. ELEVATED FLOATING ACTION BUTTON (FAB) ================= */}
      <Animated.View style={[styles.floatingFabContainer, fabAnimStyle]}>
        <TouchableOpacity
          style={styles.floatingFab}
          activeOpacity={0.9}
          onPress={handleFabPress}
        >
          <LinearGradient
            colors={['#10B981', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.floatingFabGradient}
          >
            <Plus size={24} color="#FFFFFF" strokeWidth={2.8} />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ================= CARD FILTER DRAWER ================= */}
      <VaultCardSelectorDrawer
        visible={isCardDropdownOpen}
        onClose={() => setIsCardDropdownOpen(false)}
        cards={allCards}
        selectedCardId={selectedVaultCardId}
        onSelectCard={(id) => setSelectedVaultCardId(id)}
        title="Select Vault Card"
      />

      {/* ================= USER FILTER MODAL ================= */}
      <Modal
        visible={isUserFilterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsUserFilterModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsUserFilterModalOpen(false)}
          />
          <View style={styles.filterMenuBox}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Filter By User</Text>
              <TouchableOpacity onPress={() => setIsUserFilterModalOpen(false)} hitSlop={10}>
                <X size={16} color="#4A6B56" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.55 }}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <TouchableOpacity
                style={[
                  styles.menuOption,
                  filterUser === 'all' && styles.menuOptionActive,
                ]}
                onPress={() => {
                  setFilterUser('all');
                  setIsUserFilterModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.menuOptionText,
                    filterUser === 'all' && styles.menuOptionTextActive,
                  ]}
                >
                  All Users
                </Text>
                {filterUser === 'all' && <Check size={14} color="#0B3F28" />}
              </TouchableOpacity>

              {allProfiles.map((prof) => {
                const isSelected = filterUser === prof.id;
                return (
                  <TouchableOpacity
                    key={prof.id}
                    style={[styles.menuOption, isSelected && styles.menuOptionActive]}
                    onPress={() => {
                      setFilterUser(prof.id);
                      setIsUserFilterModalOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.menuOptionText,
                        isSelected && styles.menuOptionTextActive,
                      ]}
                    >
                      {prof.name}
                    </Text>
                    {isSelected && <Check size={14} color="#0B3F28" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= CUSTOM DATE RANGE MODAL ================= */}
      <Modal
        visible={isCustomDateModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCustomDateModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsCustomDateModalOpen(false)}
        >
          <View
            style={[styles.modalCard, { width: SCREEN_WIDTH - 48 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Custom Date Range</Text>
              <TouchableOpacity onPress={() => setIsCustomDateModalOpen(false)}>
                <X size={16} color="#4A6B56" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10, marginVertical: 12 }}>
              <View>
                <Text style={styles.dateInputLabel}>Start Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.dateTextInput}
                  placeholder="2026-10-01"
                  placeholderTextColor="#7E9185"
                  value={customStartDate}
                  onChangeText={setCustomStartDate}
                />
              </View>

              <View>
                <Text style={styles.dateInputLabel}>End Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.dateTextInput}
                  placeholder="2026-10-31"
                  placeholderTextColor="#7E9185"
                  value={customEndDate}
                  onChangeText={setCustomEndDate}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const now = new Date();
                  const end = now.toISOString().slice(0, 10);
                  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .slice(0, 10);
                  setCustomStartDate(start);
                  setCustomEndDate(end);
                }}
              >
                <Text style={styles.presetBtnText}>Last 30 Days</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => {
                  const now = new Date();
                  const end = now.toISOString().slice(0, 10);
                  const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .slice(0, 10);
                  setCustomStartDate(start);
                  setCustomEndDate(end);
                }}
              >
                <Text style={styles.presetBtnText}>Last 90 Days</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.applyDateBtn}
              onPress={() => {
                if (customStartDate && customEndDate) {
                  setFilterDateType('custom');
                }
                setIsCustomDateModalOpen(false);
              }}
            >
              <Text style={styles.applyDateBtnText}>Apply Date Filter</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ================= RECORD ENTRY MODULAR DRAWER ================= */}
      <RecordEntryDrawer
        visible={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onSave={handleSaveRecord}
        initialType="bill"
        allCards={allCards}
        allProfiles={allProfiles}
        allQrs={allQrs}
        currentUserId={currentUser?.id}
        cardDueMap={cardDueMap}
        userCardCashMap={userCardCashMap}
        userFamilySpendMap={userFamilySpendMap}
      />

      {/* ================= LIVE TRANSACTION TRACE BOTTOM SHEET ================= */}
      <TransactionTraceBottomSheet
        target={traceTarget}
        isOpen={isTraceOpen}
        onClose={() => {
          setIsTraceOpen(false);
          setTraceTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#EFF3EE',
  },
  headerHeroContainer: {
    position: 'relative',
    paddingBottom: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  userProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBorder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    backgroundColor: '#072C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#CAD6C9',
    fontSize: 14,
    fontWeight: '800',
  },
  userTextCol: {
    justifyContent: 'center',
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveStatusText: {
    color: '#CAD6C9',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  vaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  vaultPillText: {
    color: '#CAD6C9',
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 90,
  },
  svgWaveWrapper: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    height: 32,
    overflow: 'hidden',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  tabChip: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  activeTabChip: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  tabChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  activeTabChipText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 6,
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#DFE8E0',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#072C1C',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  activeFilterChip: {
    backgroundColor: '#E4ECE3',
    borderColor: '#0B3F28',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  activeFilterChipText: {
    color: '#072C1C',
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 8,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E4ECE3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0B3F28',
    letterSpacing: 0.3,
  },
  dateDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#DFE8E0',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  loaderText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#0B3F28',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerLoaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
  },
  footerEnd: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerEndText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8CA394',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 70,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#072C1C',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    color: '#4A6B56',
    textAlign: 'center',
    lineHeight: 18,
  },
  floatingFabContainer: {
    position: 'absolute',
    bottom: 86,
    right: 18,
    zIndex: 99,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingFab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
  },
  floatingFabGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  filterMenuBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DFE8E0',
  },
  filterMenuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
  },
  menuOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  menuOptionActive: {
    backgroundColor: '#E4ECE3',
  },
  menuOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  menuOptionTextActive: {
    color: '#0B3F28',
    fontWeight: '800',
  },
  menuOptionSub: {
    fontSize: 10,
    color: '#4A6B56',
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DFE8E0',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
  },
  dateInputLabel: {
    fontSize: 11,
    color: '#4A6B56',
    fontWeight: '700',
    marginBottom: 4,
  },
  dateTextInput: {
    backgroundColor: '#EFF3EE',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#072C1C',
    fontWeight: '600',
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#EFF3EE',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  presetBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4A6B56',
  },
  applyDateBtn: {
    backgroundColor: '#0B3F28',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  applyDateBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F6F9F5',
  },
});
