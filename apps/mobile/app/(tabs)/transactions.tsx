import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
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
  interpolate,
  Extrapolation,
  useAnimatedScrollHandler,
  FadeInUp,
  Easing,
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
  Search,
  CreditCard,
  CornerDownRight,
} from 'lucide-react-native';

import { supabase } from '../../lib/supabase';
import NetInfo from '@react-native-community/netinfo';
import {
  processBillPaymentFIFO,
  deductCashFromSources,
  getFamilyCardIds,
  calculateCardAvailableMap,
  CedarTypography,
} from '@credics/core';
import { useCardStore, buildHierarchicalCardList } from '../../lib/cardStore';
import { useBalanceStore } from '../../lib/balanceStore';
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
import {
  broadcastRotationWithdrawAlert,
  broadcastBillPayAlert,
  broadcastPersonalSpendAlert,
} from '../../lib/alertDispatcher';

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
  const remarksLower = (t.remarks || '').toLowerCase();
  const isLent = remarksLower.includes('lent given') || remarksLower.includes('loan given') || t.payment_method === 'lent_recovery';

  const title = isLent
    ? t.remarks || 'Lent Disbursement'
    : isWithdrawal
    ? qrObj?.merchant_name || 'Rotation Withdrawal'
    : 'Card Bill Payment';

  const subtitle = isLent
    ? `Disbursed by ${profileObj?.name?.split(' ')[0] || 'User'}`
    : isWithdrawal
    ? `Rotated by ${profileObj?.name?.split(' ')[0] || 'User'}`
    : `Paid by ${profileObj?.name?.split(' ')[0] || 'User'}`;

  const iconName = isLent
    ? 'lent'
    : isWithdrawal
    ? 'withdrawal'
    : 'bill_payment';

  const color = isLent
    ? '#6366F1'
    : isWithdrawal
    ? '#E05D52'
    : '#2D7A5D';

  const bgColor = isLent
    ? '#EEF2FF'
    : isWithdrawal
    ? '#FCEBEA'
    : '#E8F5E9';

  return {
    id: `tx-${t.id}`,
    rawId: t.id,
    type: t.type,
    amount: Number(t.amount || 0),
    displayDate,
    sortDate: new Date(displayDate).getTime() || 0,
    status: isLent ? 'settled' : (t.status || 'settled'),
    title,
    subtitle,
    iconName,
    color,
    bgColor,
    remarks: t.remarks || undefined,
    cardId: t.card_id,
    cardDetails: cardInfo,
    paymentMethod: isWithdrawal
      ? 'Credit Card'
      : t.payment_method === 'own_pocket'
      ? 'Own Pocket'
      : t.payment_method === 'lent_recovery'
      ? 'Lent Recovery'
      : 'Cash on Hand',
    recordedBy: profileObj?.name || 'User',
    userId: t.recorded_by || '',
    avatarUrl: profileObj?.avatar_url,
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
    avatarUrl: profileObj?.avatar_url,
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
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [isUserFilterModalOpen, setIsUserFilterModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  // Auxiliary Store via Centralized Global Balance Store (Single Source of Truth)
  const {
    cards: allCards,
    profiles: allProfiles,
    qrs: allQrs,
    cardAvailableMap,
    userCardCashMap,
    cardDueMap,
    cardDueDateMap,
    userCardSpendMap,
    userTotalSpendMap,
    refreshBalances,
  } = useBalanceStore();

  const [currentUser, setCurrentUser] = useState<ProfileData | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: authData }) => {
      const currentAuthUser = authData?.session?.user;
      if (currentAuthUser && allProfiles.length > 0) {
        const found = allProfiles.find((p) => p.id === currentAuthUser.id);
        if (found) setCurrentUser(found);
      } else if (allProfiles.length > 0) {
        setCurrentUser(allProfiles[0]);
      }
    });
  }, [allProfiles]);

  // 120Hz Animation Shared Values & Tabs Pager (Critically Damped 50% Bounciness Reduction)
  const cardDropdownScale = useSharedValue(1);
  const headerExpandedProgress = useSharedValue(0);
  const fabScale = useSharedValue(1);

  const TABS = ['all', 'rotations', 'spends', 'bill_paid'] as const;
  type TabType = typeof TABS[number];

  const pagerRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const TAB_CONTAINER_MARGIN = 16;
  const TAB_TRACK_WIDTH = SCREEN_WIDTH - TAB_CONTAINER_MARGIN * 2;
  const TAB_ITEM_WIDTH = (TAB_TRACK_WIDTH - 8) / 4;

  const cardDropdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardDropdownScale.value }],
  }));

  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${headerExpandedProgress.value * 180}deg` }],
  }));

  const accordionAnimStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(headerExpandedProgress.value, [0, 1], [0, 100]),
    opacity: headerExpandedProgress.value,
    marginTop: interpolate(headerExpandedProgress.value, [0, 1], [0, 8]),
    marginBottom: interpolate(headerExpandedProgress.value, [0, 1], [0, 4]),
    transform: [
      {
        translateY: interpolate(headerExpandedProgress.value, [0, 1], [-8, 0]),
      },
    ],
  }));

  const tabIndicatorAnimStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      scrollX.value,
      [0, SCREEN_WIDTH, SCREEN_WIDTH * 2, SCREEN_WIDTH * 3],
      [0, TAB_ITEM_WIDTH, TAB_ITEM_WIDTH * 2, TAB_ITEM_WIDTH * 3],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateX }],
      width: TAB_ITEM_WIDTH,
    };
  });

  const fabAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const handleCardDropdownPress = () => {
    const next = !isHeaderExpanded;
    setIsHeaderExpanded(next);
    cardDropdownScale.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withSpring(1, { damping: 26, stiffness: 220 })
    );
    headerExpandedProgress.value = withSpring(next ? 1 : 0, {
      damping: 30,
      stiffness: 240,
    });
  };

  const handleTabSwitch = (
    tab: 'all' | 'rotations' | 'spends' | 'bill_paid',
    index: number
  ) => {
    if (activeTab !== tab) {
      setActiveTab(tab);
    }
    pagerRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const pageIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const targetTab = TABS[pageIndex] || 'all';
    if (activeTab !== targetTab) {
      setActiveTab(targetTab);
    }
  };

  const handleFabPress = () => {
    fabScale.value = withSequence(
      withTiming(0.88, { duration: 70 }),
      withSpring(1, { damping: 26, stiffness: 220 })
    );
    setIsRecordModalOpen(true);
  };

  // Build hierarchical cards list (grouped under primaries)
  const hierarchicalCards = useMemo(() => {
    return buildHierarchicalCardList(allCards);
  }, [allCards]);

  const totalUnifiedAvailable = useMemo(() => {
    return allCards
      .filter((c) => c.is_primary || !c.parent_card_id)
      .reduce((sum, c) => sum + (cardAvailableMap[c.id] || 0), 0);
  }, [allCards, cardAvailableMap]);

  // Fetch Auxiliary Ledger Data via Global Balance Store
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      await refreshBalances();
    } catch (err) {
      console.error('Error fetching auxiliary data:', err);
    }
  }, [refreshBalances]);

  // Paginated Master Data Query Engine (Unified Feed for Instant Client-Side Tab Projections)
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

        // Resolve Family Card IDs if selected card is a primary card
        const targetFamilyCardIds =
          selectedVaultCardId !== 'all'
            ? getFamilyCardIds(selectedVaultCardId, allCards as any)
            : [];

        // Always query both card_transactions and spends for active filters so all tabs are pre-filtered in memory
        let txQ = supabase
          .from('card_transactions')
          .select('*')
          .order('transaction_date', { ascending: false });

        let spQ = supabase
          .from('spends')
          .select('*')
          .order('spend_date', { ascending: false });

        if (filterDateType === 'month') {
          txQ = txQ.gte('transaction_date', startOfMonth).lte('transaction_date', endOfMonth);
          spQ = spQ.gte('spend_date', startOfMonth).lte('spend_date', endOfMonth);
        } else if (filterDateType === 'last_month') {
          txQ = txQ.gte('transaction_date', startOfLastMonth).lte('transaction_date', endOfLastMonth);
          spQ = spQ.gte('spend_date', startOfLastMonth).lte('spend_date', endOfLastMonth);
        } else if (filterDateType === 'today') {
          txQ = txQ.eq('transaction_date', todayStr);
          spQ = spQ.eq('spend_date', todayStr);
        } else if (filterDateType === 'custom' && customStartDate && customEndDate) {
          txQ = txQ.gte('transaction_date', customStartDate).lte('transaction_date', customEndDate);
          spQ = spQ.gte('spend_date', customStartDate).lte('spend_date', customEndDate);
        }

        if (selectedVaultCardId !== 'all') {
          if (targetFamilyCardIds.length > 1) {
            txQ = txQ.in('card_id', targetFamilyCardIds);
            spQ = spQ.in('card_id', targetFamilyCardIds);
          } else {
            txQ = txQ.eq('card_id', selectedVaultCardId);
            spQ = spQ.eq('card_id', selectedVaultCardId);
          }
        }

        if (filterUser !== 'all') {
          txQ = txQ.eq('recorded_by', filterUser);
          spQ = spQ.eq('user_id', filterUser);
        }

        const [{ data: rawTxs }, { data: rawSpends }] = await Promise.all([
          txQ.range(from, to),
          spQ.range(from, to),
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
    const unsub = useBalanceStore.getState().setupRealtimeSubscription();
    return () => unsub();
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

  // Submit Handler for RecordEntryDrawer with Offline Queue, Alerts, & Exact Timestamps
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
      ownPocketAmount,
      isDebtRepayment,
      validCashSources,
    } = payload;

    const originalCreatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const isSpendCash = recordType === 'spend' && spendMethod === 'cash_on_hand';
    const isBillCash =
      recordType === 'bill' &&
      (billMethod === 'cash_on_hand' || billMethod === 'hybrid');
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
          ownPocketAmount,
          isDebtRepayment,
          breakdownForInsert,
          validCashSources,
        },
        original_created_at: originalCreatedAt,
        transaction_date: finalDate,
        timeStr,
      });

      // Allowed haptics on submit per Rule 4
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRecordModalOpen(false);
      return;
    }

    try {
      if (recordType === 'rotate') {
        const isManual = !selectedQrId || selectedQrId === 'manual';
        const finalQrId = isManual ? null : selectedQrId;
        const defaultRemarks = isManual ? 'Manual Rotation Withdrawal' : 'Rotation Withdrawal';

        const { error: rotErr } = await supabase.from('card_transactions').insert({
          card_id: activeCardId,
          type: 'withdrawal',
          amount: numAmount,
          qr_id: finalQrId,
          remarks: remarks || defaultRemarks,
          status: 'pending_settlement',
          transaction_date: finalDate,
          created_at: originalCreatedAt,
          recorded_by: actingUserId || null,
        });

        if (rotErr) throw rotErr;

        if (finalQrId) {
          await supabase
            .from('qrs')
            .update({ last_used_date: originalCreatedAt })
            .eq('id', finalQrId);
        }

        // Multi-Channel Notification Dispatch
        const payingCard = allCards.find((c) => c.id === activeCardId);
        const chosenQr = allQrs.find((q) => q.id === finalQrId);
        const currentBal = (cardAvailableMap[activeCardId] || 0) - numAmount;
        broadcastRotationWithdrawAlert({
          cardName: payingCard?.card_name || 'Card',
          last4: payingCard?.last_4_digits || '0000',
          qrName: chosenQr?.merchant_name || 'Manual (No QR / POS / ATM)',
          entryUserName: allProfiles.find((p) => p.id === actingUserId)?.name || 'User',
          amount: numAmount,
          currentBalance: currentBal,
          profiles: allProfiles,
        }).catch((alertErr) => console.warn('Alert broadcast notice:', alertErr));
      } else if (recordType === 'spend') {
        const { error: spErr } = await supabase.from('spends').insert({
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

        if (spErr) throw spErr;

        if (spendMethod === 'cash_on_hand' && validCashSources.length > 0) {
          await deductCashFromSources(supabase, {
            userId: actingUserId,
            sources: validCashSources,
            note: `Personal spend ${remarks ? '- ' + remarks : ''}`,
            txDate: finalDate,
            createdAt: originalCreatedAt,
          });
        }

        // Multi-Channel Notification Dispatch
        const spendCard = allCards.find((c) => c.id === activeCardId);
        broadcastPersonalSpendAlert({
          cardName: spendCard?.card_name || 'Card',
          entryUserName: allProfiles.find((p) => p.id === actingUserId)?.name || 'User',
          amount: numAmount,
          paymentMethod: spendMethod || 'credit_card',
          remarks,
          remainingBalance: (cardAvailableMap[activeCardId] || 0) - numAmount,
          profiles: allProfiles,
        }).catch((alertErr) => console.warn('Alert broadcast notice:', alertErr));
      } else if (recordType === 'bill') {
        // FIFO Bill allocation via @credics/core
        const billCycleResult = await processBillPaymentFIFO(supabase, activeCardId, numAmount);

        let billTxIdForLink: string | null = null;

        if (billMethod === 'hybrid') {
          const cardCashPortion = (validCashSources || []).reduce(
            (sum: number, s: any) => sum + Number(s.amount || 0),
            0
          );
          const ownPocketPortion =
            ownPocketAmount || Math.max(0, numAmount - cardCashPortion);

          if (cardCashPortion > 0) {
            const { data: bTxCash, error: txCashErr } = await supabase
              .from('card_transactions')
              .insert({
                card_id: activeCardId,
                type: 'bill_payment',
                amount: cardCashPortion,
                status: 'settled',
                payment_method: 'cash_on_hand',
                remarks: remarks
                  ? `${remarks} (Cash on Hand)`
                  : 'Card Bill Repayment (Cash on Hand)',
                transaction_date: finalDate,
                created_at: originalCreatedAt,
                recorded_by: actingUserId || null,
                billing_cycle_id: billCycleResult.cycleId,
                cash_source_breakdown: validCashSources.map((s) => ({
                  card_id: s.cardId,
                  amount: s.amount,
                })),
              })
              .select('id')
              .single();

            if (txCashErr) throw txCashErr;
            billTxIdForLink = bTxCash?.id || null;

            await deductCashFromSources(supabase, {
              userId: actingUserId,
              sources: validCashSources,
              note: `Bill payment ${remarks ? '- ' + remarks : ''}`,
              linkedCardTxId: billTxIdForLink,
              txDate: finalDate,
              createdAt: originalCreatedAt,
            });
          }

          if (ownPocketPortion > 0) {
            const { data: bTxPocket, error: txPocketErr } = await supabase
              .from('card_transactions')
              .insert({
                card_id: activeCardId,
                type: 'bill_payment',
                amount: ownPocketPortion,
                status: 'settled',
                payment_method: 'own_pocket',
                remarks: remarks
                  ? `${remarks} (Own Pocket)`
                  : 'Card Bill Repayment (Own Pocket)',
                transaction_date: finalDate,
                created_at: originalCreatedAt,
                recorded_by: actingUserId || null,
                billing_cycle_id: billCycleResult.cycleId,
                cash_source_breakdown: null,
              })
              .select('id')
              .single();

            if (txPocketErr) throw txPocketErr;
            if (!billTxIdForLink) billTxIdForLink = bTxPocket?.id || null;

            await supabase.from('pocket_advances_ledger').insert({
              user_id: actingUserId,
              card_id: activeCardId,
              amount: -ownPocketPortion,
              entry_type: 'advance',
              transaction_date: finalDate,
              created_at: originalCreatedAt,
              linked_card_transaction_id: bTxPocket?.id || null,
              remarks: `Card bill payment advanced from pocket ${remarks ? '- ' + remarks : ''}`,
            });

            const { data: curAdv } = await supabase
              .from('pocket_advances')
              .select('current_balance')
              .eq('user_id', actingUserId)
              .eq('card_id', activeCardId)
              .maybeSingle();

            const nextAdv = (Number(curAdv?.current_balance) || 0) - ownPocketPortion;
            await supabase.from('pocket_advances').upsert({
              user_id: actingUserId,
              card_id: activeCardId,
              current_balance: nextAdv,
            });
          }
        } else {
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
              cash_source_breakdown:
                billMethod === 'cash_on_hand' ? breakdownForInsert : null,
            })
            .select('id')
            .single();

          if (txErr) throw txErr;
          billTxIdForLink = billTx?.id || null;

          if (billMethod === 'cash_on_hand' && validCashSources.length > 0) {
            await deductCashFromSources(supabase, {
              userId: actingUserId,
              sources: validCashSources,
              note: `Bill payment ${remarks ? '- ' + remarks : ''}`,
              linkedCardTxId: billTxIdForLink,
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
              linked_card_transaction_id: billTxIdForLink,
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
        }

        if (isDebtRepayment) {
          await supabase.from('spends').insert({
            user_id: actingUserId,
            card_id: activeCardId,
            amount: -numAmount,
            spend_type: 'repayment',
            payment_method: billMethod === 'hybrid' ? 'cash_on_hand' : billMethod,
            remarks: `Debt Cleared ${remarks ? ': ' + remarks : ''}`,
            spend_date: finalDate,
            created_at: originalCreatedAt,
            linked_card_transaction_id: billTxIdForLink,
          });
        }

        // Multi-Channel Notification Dispatch
        const targetCard = allCards.find((c) => c.id === activeCardId);
        const currentDue = cardDueMap[activeCardId] || 0;
        const remDue = Math.max(0, currentDue - numAmount);
        const isFull = billCycleResult?.status === 'paid' || remDue <= 0;
        broadcastBillPayAlert({
          cardName: targetCard?.card_name || 'Card',
          last4Digits: targetCard?.last_4_digits || '0000',
          entryUserName: allProfiles.find((p) => p.id === actingUserId)?.name || 'User',
          paidAmount: numAmount,
          dueDate: cardDueDateMap[activeCardId] || 'Due Soon',
          remainingDue: remDue,
          availableLimit: (cardAvailableMap[activeCardId] || 0) + numAmount,
          isFull,
          profiles: allProfiles,
        }).catch((alertErr) => console.warn('Alert broadcast notice:', alertErr));
      }

      // Success Haptics on save as permitted by Rule 4
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

  // Delete Record Handler
  const handleDeleteTransaction = useCallback(
    (item: UnifiedTransactionItem) => {
      Alert.alert(
        'Delete Record',
        `Are you sure you want to delete this ${item.title} of ₹${item.amount.toLocaleString('en-IN')}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                if (item.type === 'spend') {
                  await supabase.from('spends').delete().eq('id', item.rawId);
                } else {
                  await supabase.from('card_transactions').delete().eq('id', item.rawId);
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await fetchTransactionsPage(0, true);
                await fetchAuxiliaryData();
              } catch (delErr: any) {
                Alert.alert('Error', delErr?.message || 'Failed to delete transaction.');
              }
            },
          },
        ]
      );
    },
    [fetchTransactionsPage, fetchAuxiliaryData]
  );

  // Fast Client-Side Search Filter
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return unifiedList;
    const q = searchQuery.toLowerCase().trim();
    return unifiedList.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        (item.remarks && item.remarks.toLowerCase().includes(q)) ||
        item.cardDetails.toLowerCase().includes(q) ||
        item.recordedBy.toLowerCase().includes(q) ||
        item.amount.toString().includes(q)
      );
    });
  }, [unifiedList, searchQuery]);

  const getTabFilteredList = useCallback(
    (tab: TabType) => {
      switch (tab) {
        case 'rotations':
          return filteredList.filter(
            (item) => item.type === 'withdrawal' && item.iconName !== 'lent'
          );
        case 'spends':
          return filteredList.filter(
            (item) => item.type === 'spend' && !item.isRepaymentFlag
          );
        case 'bill_paid':
          return filteredList.filter(
            (item) => item.type === 'bill_payment' || item.isRepaymentFlag
          );
        case 'all':
        default:
          return filteredList;
      }
    },
    [filteredList]
  );

  const getRenderItemForData = useCallback(
    (currentData: UnifiedTransactionItem[]) =>
      ({ item, index }: { item: UnifiedTransactionItem; index: number }) => {
        const prevItem = index > 0 ? currentData[index - 1] : null;
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
              onDelete={() => handleDeleteTransaction(item)}
            />
          </View>
        );
      },
    [expandedId, handleDeleteTransaction]
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
    if (!hasMore && filteredList.length > 0) {
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
          {searchQuery.trim()
            ? 'No records match your search criteria. Clear search or try different keywords.'
            : 'No records match the current filters. Tap "+" on bottom right to record an entry.'}
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
              <Text style={styles.headerTitle}>Transactions</Text>
            </View>
          </TouchableOpacity>

          {/* Vault Card Selector Pill with 120Hz Rotating Chevron */}
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
              <Animated.View style={chevronAnimStyle}>
                <ChevronDown size={12} color="#CAD6C9" />
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* 120Hz Slide Accordion for Card Vault Selection */}
        <Animated.View style={[styles.headerAccordion, accordionAnimStyle]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accordionScrollContent}
          >
            {/* All Cards Option */}
            <TouchableOpacity
              style={[
                styles.accordionCardItem,
                selectedVaultCardId === 'all' && styles.accordionCardItemActive,
              ]}
              onPress={() => {
                setSelectedVaultCardId('all');
                setIsHeaderExpanded(false);
                headerExpandedProgress.value = withSpring(0, { damping: 30, stiffness: 240 });
              }}
              activeOpacity={0.8}
            >
              <View style={styles.accordionCardTopRow}>
                <Layers size={13} color={selectedVaultCardId === 'all' ? '#10B981' : '#CAD6C9'} />
                {selectedVaultCardId === 'all' && (
                  <View style={styles.accordionActiveCheck}>
                    <Check size={10} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
              <Text style={styles.accordionCardTitle} numberOfLines={1}>
                All Cards
              </Text>
              <Text style={styles.accordionCardSub}>
                Avail: ₹{totalUnifiedAvailable.toLocaleString('en-IN')}
              </Text>
            </TouchableOpacity>

            {/* Hierarchical Cards List */}
            {hierarchicalCards.map((c) => {
              const isSelected = selectedVaultCardId === c.id;
              const avail = cardAvailableMap[c.id] || 0;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.accordionCardItem,
                    isSelected && styles.accordionCardItemActive,
                  ]}
                  onPress={() => {
                    setSelectedVaultCardId(c.id);
                    setIsHeaderExpanded(false);
                    headerExpandedProgress.value = withSpring(0, { damping: 30, stiffness: 240 });
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.accordionCardTopRow}>
                    {c.isSub ? (
                      <CornerDownRight size={13} color={isSelected ? '#10B981' : '#8CA394'} />
                    ) : (
                      <CreditCard size={13} color={isSelected ? '#10B981' : '#CAD6C9'} />
                    )}
                    {isSelected && (
                      <View style={styles.accordionActiveCheck}>
                        <Check size={10} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.accordionCardTitle} numberOfLines={1}>
                    {c.isSub ? `↳ ${c.card_name}` : c.card_name}
                  </Text>
                  <Text style={styles.accordionCardSub} numberOfLines={1}>
                    ••{c.last_4_digits} • ₹{avail.toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

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

      {/* ================= 2. 120HZ SLIDING SEGMENTED TABS ================= */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabsTrack}>
          {/* Animated 120Hz Sliding Background Pill */}
          <Animated.View style={[styles.slidingTabIndicator, tabIndicatorAnimStyle]} />

          {(['all', 'rotations', 'spends', 'bill_paid'] as const).map((tab, idx) => {
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
                style={styles.tabButton}
                onPress={() => handleTabSwitch(tab, idx)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ================= 3. SEARCH BAR ================= */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={14} color="#6B8272" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title, remark, card or amount..."
            placeholderTextColor="#8CA394"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={14} color="#6B8272" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ================= 4. FILTER PILLS (USER & DATE) ================= */}
      <View style={styles.filterPillsRow}>
        <View style={styles.filterBadge}>
          <Filter size={11} color="#4A6B56" />
          <Text style={styles.filterBadgeText}>Filter</Text>
        </View>

        {/* User Filter Pill */}
        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            filterUser !== 'all' && styles.activeFilterChip,
            pressed && styles.filterChipPressed,
          ]}
          onPress={() => setIsUserFilterModalOpen(true)}
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
        </Pressable>

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
            <Pressable
              key={dType}
              style={({ pressed }) => [
                styles.filterChip,
                isDateActive && styles.activeFilterChip,
                pressed && styles.filterChipPressed,
              ]}
              onPress={() => {
                if (filterDateType !== dType) {
                  setFilterDateType(dType);
                }
              }}
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
            </Pressable>
          );
        })}

        {/* Custom Date Range Pill */}
        <Pressable
          style={({ pressed }) => [
            styles.filterChip,
            filterDateType === 'custom' && styles.activeFilterChip,
            pressed && styles.filterChipPressed,
          ]}
          onPress={() => setIsCustomDateModalOpen(true)}
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
        </Pressable>
      </View>

      {/* ================= 5. 120HZ HORIZONTAL PAGER FEED ================= */}
      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={{ flex: 1 }}
      >
        {TABS.map((tab) => {
          const tabData = getTabFilteredList(tab);
          const isCurrentTab = activeTab === tab;

          return (
            <View key={tab} style={{ width: SCREEN_WIDTH, flex: 1 }}>
              {isCurrentTab && isLoading && tabData.length === 0 ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color="#0B3F28" />
                  <Text style={styles.loaderText}>Loading Live Ledger Feed...</Text>
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <FlatList
                    data={tabData}
                    keyExtractor={(item) => item.id}
                    renderItem={getRenderItemForData(tabData)}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 130 }]}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={7}
                    removeClippedSubviews
                    onEndReached={isCurrentTab ? handleLoadMore : undefined}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={isCurrentTab ? renderFooter : undefined}
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
                </View>
              )}
            </View>
          );
        })}
      </Animated.ScrollView>

      {/* ================= 6. ELEVATED FLOATING ACTION BUTTON (FAB) ================= */}
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

      {/* ================= CUSTOM DATE MODAL ================= */}
      <Modal
        visible={isCustomDateModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCustomDateModalOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsCustomDateModalOpen(false)}
        >
          <View style={styles.dateModalBox} onStartShouldSetResponder={() => true}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Custom Date Range</Text>
              <TouchableOpacity onPress={() => setIsCustomDateModalOpen(false)} hitSlop={10}>
                <X size={16} color="#4A6B56" />
              </TouchableOpacity>
            </View>

            <View style={styles.dateInputGroup}>
              <Text style={styles.dateInputLabel}>Start Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateTextInput}
                placeholder="2026-01-01"
                placeholderTextColor="#6B8272"
                value={customStartDate}
                onChangeText={setCustomStartDate}
              />
            </View>

            <View style={styles.dateInputGroup}>
              <Text style={styles.dateInputLabel}>End Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateTextInput}
                placeholder="2026-12-31"
                placeholderTextColor="#6B8272"
                value={customEndDate}
                onChangeText={setCustomEndDate}
              />
            </View>

            {/* Quick 30/90 Days Presets */}
            <View style={styles.quickDateRow}>
              <TouchableOpacity
                style={styles.quickDateBtn}
                onPress={() => {
                  const now = new Date();
                  const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                  setCustomStartDate(past30.toISOString().slice(0, 10));
                  setCustomEndDate(now.toISOString().slice(0, 10));
                }}
              >
                <Text style={styles.quickDateBtnText}>Last 30 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickDateBtn}
                onPress={() => {
                  const now = new Date();
                  const past90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                  setCustomStartDate(past90.toISOString().slice(0, 10));
                  setCustomEndDate(now.toISOString().slice(0, 10));
                }}
              >
                <Text style={styles.quickDateBtnText}>Last 90 Days</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.applyDateBtn}
              onPress={() => {
                if (customStartDate && customEndDate) {
                  setFilterDateType('custom');
                  setIsCustomDateModalOpen(false);
                } else {
                  Alert.alert('Required', 'Please enter both start and end dates.');
                }
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
        cardDueDateMap={cardDueDateMap}
        cardAvailableMap={cardAvailableMap}
        userCardCashMap={userCardCashMap}
        userCardSpendMap={userCardSpendMap}
        userTotalSpendMap={userTotalSpendMap}
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
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#072C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#CAD6C9',
    fontSize: 16,
    fontWeight: '900',
  },
  userTextCol: {
    justifyContent: 'center',
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
  headerAccordion: {
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  accordionScrollContent: {
    paddingVertical: 4,
    gap: 8,
  },
  accordionCardItem: {
    width: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
  },
  accordionCardItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderColor: '#10B981',
  },
  accordionCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  accordionActiveCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionCardTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  accordionCardSub: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
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
  tabsContainer: {
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
  },
  tabsTrack: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: '#DFE8E0',
    borderRadius: 14,
    padding: 4,
  },
  slidingTabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: '#0B3F28',
    borderRadius: 10,
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabButtonText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#4A6B56',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: '#072C1C',
    paddingVertical: 2,
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
  filterChipPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
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
    marginTop: 14,
    marginBottom: 8,
    gap: 8,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DFE8E0',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  dateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0B3F28',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(7, 44, 28, 0.08)',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loaderText: {
    fontSize: 13,
    color: '#4A6B56',
    fontWeight: '600',
    marginTop: 10,
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
    color: '#4A6B56',
    fontWeight: '600',
  },
  footerEnd: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  footerEndText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B8272',
    letterSpacing: 0.6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DFE8E0',
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
  },
  floatingFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingFabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3EE',
    marginBottom: 8,
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
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  menuOptionActive: {
    backgroundColor: '#E4ECE3',
  },
  menuOptionText: {
    fontSize: 13,
    color: '#072C1C',
    fontWeight: '600',
  },
  menuOptionTextActive: {
    color: '#0B3F28',
    fontWeight: '800',
  },
  dateModalBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  dateInputGroup: {
    marginTop: 10,
  },
  dateInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
    marginBottom: 4,
  },
  dateTextInput: {
    backgroundColor: '#EFF3EE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#072C1C',
    fontWeight: '600',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  quickDateBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#DFE8E0',
  },
  quickDateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0B3F28',
  },
  applyDateBtn: {
    backgroundColor: '#0B3F28',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  applyDateBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
