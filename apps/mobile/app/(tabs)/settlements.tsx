import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ActivityIndicator,
  Image,
  Dimensions,
  StatusBar,
  ScrollView,
  RefreshControl,
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
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Plus,
  Layers,
  ChevronDown,
  X,
  Check,
  Clock,
  QrCode,
  ArrowDownLeft,
  CheckCircle2,
  CornerDownRight,
  CreditCard,
} from 'lucide-react-native';

import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import {
  computeSettlementTransition,
  executeSettlementTransaction,
  calculateCardAvailableMap,
} from '@credics/core';
import { useOfflineQueueStore } from '../../lib/offlineQueue';
import {
  broadcastRotationWithdrawAlert,
  broadcastRotationSettlementAlert,
} from '../../lib/alertDispatcher';
import { QRVaultTab, ActiveCooldown } from '../../components/settlements/QRVaultTab';
import { InTransitTab, InTransitTransaction } from '../../components/settlements/InTransitTab';
import { SettledHistoryTab, SettledTransaction } from '../../components/settlements/SettledHistoryTab';
import { QRPaymentModal, QRData, CardData } from '../../components/settlements/QRPaymentModal';
import { SettleConfirmModal, Profile } from '../../components/settlements/SettleConfirmModal';
import { AddQRDrawer } from '../../components/settlements/AddQRDrawer';
import { EditQRDrawer } from '../../components/settlements/EditQRDrawer';
import { ManualRotationDrawer } from '../../components/settlements/ManualRotationDrawer';
import { TherapeuticSuccessModal } from '../../components/settlements/TherapeuticSuccessModal';
import { useCardStore, buildHierarchicalCardList } from '../../lib/cardStore';
import { useBalanceStore } from '../../lib/balanceStore';
import { StaticQRViewModal } from '../../components/settlements/StaticQRViewModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HISTORY_PAGE_SIZE = 20;

export default function SettlementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Primary Tab Order: 1. QR Vault -> 2. In Transit -> 3. History
  const [activeTab, setActiveTab] = useState<'vault' | 'pending' | 'history'>('vault');

  // Vault Selection (Global Persistent)
  const { selectedCardId: selectedVaultCardId, setSelectedCardId: setSelectedVaultCardId } =
    useCardStore();
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  // Data Stores
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cards, setCards] = useState<CardData[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [qrs, setQrs] = useState<QRData[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});
  const [activeCooldowns, setActiveCooldowns] = useState<ActiveCooldown[]>([]);

  // In Transit & History Lists
  const [pendingTxs, setPendingTxs] = useState<InTransitTransaction[]>([]);
  const [settledHistory, setSettledHistory] = useState<SettledTransaction[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);

  // Modals & Drawers State
  const [selectedQrForPayment, setSelectedQrForPayment] = useState<QRData | null>(null);
  const [selectedTxForSettle, setSelectedTxForSettle] = useState<InTransitTransaction | null>(null);
  const [isAddQrOpen, setIsAddQrOpen] = useState(false);
  const [isManualRotationOpen, setIsManualRotationOpen] = useState(false);
  const [editingQr, setEditingQr] = useState<QRData | null>(null);

  // Therapeutic Celebration State
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState('Rotation Recorded');
  const [successSubtitle, setSuccessSubtitle] = useState('Added to In-Transit liquidity queue');
  const [successAmount, setSuccessAmount] = useState<number | undefined>(undefined);

  // Static QR Viewer Modal State
  const [viewingStaticQr, setViewingStaticQr] = useState<QRData | null>(null);
  const [isStaticModalOpen, setIsStaticModalOpen] = useState(false);

  // 120Hz Animations & Paging
  const horizontalScrollRef = useRef<ScrollView>(null);
  const cardDropdownScale = useSharedValue(1);
  const headerExpandedProgress = useSharedValue(0);
  const fabScale = useSharedValue(activeTab === 'history' ? 0 : 1);
  const fabOpacity = useSharedValue(activeTab === 'history' ? 0 : 1);
  const fabWidth = useSharedValue(activeTab === 'pending' ? 168 : 52);
  const fabTextWidth = useSharedValue(activeTab === 'pending' ? 104 : 0);
  const fabTextOpacity = useSharedValue(activeTab === 'pending' ? 1 : 0);
  const tabIndicatorX = useSharedValue(0);

  const TAB_CONTAINER_MARGIN = 16;
  const TAB_TRACK_WIDTH = SCREEN_WIDTH - TAB_CONTAINER_MARGIN * 2;
  const TAB_ITEM_WIDTH = (TAB_TRACK_WIDTH - 8) / 3;

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
    overflow: 'hidden',
  }));

  const fabAnimStyle = useAnimatedStyle(() => ({
    width: fabWidth.value,
    transform: [{ scale: fabScale.value }],
    opacity: fabOpacity.value,
  }));

  const fabTextContainerAnimStyle = useAnimatedStyle(() => ({
    width: fabTextWidth.value,
    opacity: fabTextOpacity.value,
    marginLeft: fabTextWidth.value > 0 ? 6 : 0,
  }));

  const tabIndicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }],
    width: TAB_ITEM_WIDTH,
  }));

  const handleCardDropdownPress = () => {
    cardDropdownScale.value = withSequence(
      withTiming(0.92, { duration: 80 }),
      withSpring(1, { damping: 14 })
    );
    const next = !isHeaderExpanded;
    setIsHeaderExpanded(next);
    headerExpandedProgress.value = withSpring(next ? 1 : 0, {
      damping: 20,
      stiffness: 220,
    });
  };

  const handleTabSwitch = (tab: 'vault' | 'pending' | 'history', index: number) => {
    setActiveTab(tab);
    tabIndicatorX.value = withSpring(index * TAB_ITEM_WIDTH, { damping: 22, stiffness: 240 });
    horizontalScrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });

    if (tab === 'history') {
      fabScale.value = withTiming(0, { duration: 180 });
      fabOpacity.value = withTiming(0, { duration: 180 });
      fabTextOpacity.value = withTiming(0, { duration: 100 });
      fabTextWidth.value = withTiming(0, { duration: 120 });
    } else if (tab === 'pending') {
      fabScale.value = withSpring(1, { damping: 15 });
      fabOpacity.value = withTiming(1, { duration: 180 });
      fabWidth.value = withSpring(168, { damping: 16, stiffness: 220 });
      fabTextWidth.value = withSpring(104, { damping: 16, stiffness: 220 });
      fabTextOpacity.value = withTiming(1, { duration: 180 });
    } else {
      fabScale.value = withSpring(1, { damping: 15 });
      fabOpacity.value = withTiming(1, { duration: 180 });
      fabWidth.value = withSpring(52, { damping: 16, stiffness: 220 });
      fabTextWidth.value = withSpring(0, { damping: 16, stiffness: 220 });
      fabTextOpacity.value = withTiming(0, { duration: 120 });
    }
  };

  const handlePageScrollEnd = (e: any) => {
    const pageIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const tabs: Array<'vault' | 'pending' | 'history'> = ['vault', 'pending', 'history'];
    const newTab = tabs[pageIndex] || 'vault';
    if (newTab !== activeTab) {
      setActiveTab(newTab);
      tabIndicatorX.value = withSpring(pageIndex * TAB_ITEM_WIDTH, { damping: 22, stiffness: 240 });
      if (newTab === 'history') {
        fabScale.value = withTiming(0, { duration: 180 });
        fabOpacity.value = withTiming(0, { duration: 180 });
        fabTextOpacity.value = withTiming(0, { duration: 100 });
        fabTextWidth.value = withTiming(0, { duration: 120 });
      } else if (newTab === 'pending') {
        fabScale.value = withSpring(1, { damping: 15 });
        fabOpacity.value = withTiming(1, { duration: 180 });
        fabWidth.value = withSpring(168, { damping: 16, stiffness: 220 });
        fabTextWidth.value = withSpring(104, { damping: 16, stiffness: 220 });
        fabTextOpacity.value = withTiming(1, { duration: 180 });
      } else {
        fabScale.value = withSpring(1, { damping: 15 });
        fabOpacity.value = withTiming(1, { duration: 180 });
        fabWidth.value = withSpring(52, { damping: 16, stiffness: 220 });
        fabTextWidth.value = withSpring(0, { damping: 16, stiffness: 220 });
        fabTextOpacity.value = withTiming(0, { duration: 120 });
      }
    }
  };

  const handleFabPress = () => {
    fabScale.value = withSequence(
      withTiming(0.88, { duration: 70 }),
      withSpring(1, { damping: 14 })
    );
    if (activeTab === 'pending') {
      setIsManualRotationOpen(true);
    } else if (activeTab === 'vault') {
      setIsAddQrOpen(true);
    }
  };

  // Fetch Auxiliary Data (Cards, Profiles, QRs, In-Transit)
  const fetchCoreData = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getSession();
      const currentAuthUser = authData?.session?.user;

      const [cardsRes, profilesRes, qrsRes, pendingRes, allTxsRes, spendsRes] =
        await Promise.all([
          supabase.from('cards').select('*').order('is_primary', { ascending: false }),
          supabase.from('profiles').select('*').order('name'),
          supabase.from('qrs').select('*').order('merchant_name'),
          supabase
            .from('card_transactions')
            .select('*')
            .eq('type', 'withdrawal')
            .not('remarks', 'ilike', 'Lent given to%')
            .in('status', ['pending_settlement', 'partially_settled'])
            .order('transaction_date', { ascending: false }),
          supabase
            .from('card_transactions')
            .select('amount, type, card_id, status, qr_id, remarks, settled_to_user'),
          supabase.from('spends').select('amount, payment_method, card_id'),
        ]);

      const cardsData: CardData[] = cardsRes.data || [];
      const profilesData: Profile[] = profilesRes.data || [];
      const qrsData: QRData[] = qrsRes.data || [];
      const rawPending = pendingRes.data || [];
      const allTxs = allTxsRes.data || [];
      const allSpends = spendsRes.data || [];

      setCards(cardsData);
      setProfiles(profilesData);
      setQrs(qrsData);

      if (currentAuthUser) {
        const found = profilesData.find((p) => p.id === currentAuthUser.id);
        if (found) setCurrentUser(found);
      } else if (profilesData.length > 0) {
        setCurrentUser(profilesData[0]);
      }

      // Calculate Card Available Limits Map via @credics/core Canonical Engine
      const availableMap = calculateCardAvailableMap(cardsData as any, allTxs, allSpends);
      setCardAvailableMap(availableMap);

      // Enrich In-Transit Transactions
      const enrichedPending: InTransitTransaction[] = rawPending.map((t) => {
        const card = cardsData.find((c) => c.id === t.card_id);
        const qr = qrsData.find((q) => q.id === t.qr_id);
        const recorder = profilesData.find((p) => p.id === t.recorded_by);
        const settledTo = profilesData.find((p) => p.id === t.settled_to_user);

        return {
          ...t,
          card_name: card?.card_name,
          last_4_digits: card?.last_4_digits,
          merchant_name: qr?.merchant_name,
          recorder_name: recorder?.name,
          settled_to_name: settledTo?.name,
        };
      });
      setPendingTxs(enrichedPending);

      // Check Active Cooldowns (BharatPe 5-day / Standard 24h)
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      let cooldownQuery = supabase
        .from('card_transactions')
        .select('qr_id, created_at, transaction_date, recorded_by')
        .eq('type', 'withdrawal')
        .gte('created_at', fiveDaysAgo.toISOString())
        .not('qr_id', 'is', null);

      if (currentUser?.id) {
        cooldownQuery = cooldownQuery.eq('recorded_by', currentUser.id);
      }

      const { data: recentTxs } = await cooldownQuery.order('created_at', { ascending: false });

      const cooldownList: ActiveCooldown[] = [];
      const processedQrIds = new Set<string>();

      (recentTxs || []).forEach((tx) => {
        if (!tx.qr_id || processedQrIds.has(tx.qr_id)) return;
        const qrInfo = qrsData.find((q) => q.id === tx.qr_id);
        if (!qrInfo) return;

        const isBharatPe =
          (qrInfo.platform || '').toLowerCase().includes('bharatpe') ||
          (qrInfo.merchant_name || '').toLowerCase().includes('bharatpe');

        const txTime = new Date(tx.created_at || tx.transaction_date).getTime();
        const expiresAt = txTime + 24 * 60 * 60 * 1000;

        if (expiresAt > Date.now()) {
          cooldownList.push({
            qrId: tx.qr_id,
            merchantName: qrInfo.merchant_name,
            expiresAt,
            isBharatPe,
          });
          processedQrIds.add(tx.qr_id);
        }
      });
      setActiveCooldowns(cooldownList);
    } catch (err) {
      console.error('Error fetching settlements core data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Paginated History Engine (20 items + Infinite Scroll)
  const fetchSettledHistoryPage = useCallback(
    async (pageNumber: number, replace: boolean = false) => {
      try {
        if (pageNumber > 0) setLoadingMoreHistory(true);

        const from = pageNumber * HISTORY_PAGE_SIZE;
        const to = from + HISTORY_PAGE_SIZE - 1;

        let q = supabase
          .from('card_transactions')
          .select('*')
          .eq('type', 'withdrawal')
          .not('remarks', 'ilike', 'Lent given to%')
          .eq('status', 'settled')
          .order('settled_date', { ascending: false, nullsFirst: false });

        if (selectedVaultCardId !== 'all') {
          q = q.eq('card_id', selectedVaultCardId);
        }

        const { data: rawSettled } = await q.range(from, to);
        const settledList = (rawSettled || []).slice().sort((a, b) => {
          const tA = new Date(a.settled_date || a.transaction_date).getTime();
          const tB = new Date(b.settled_date || b.transaction_date).getTime();
          return tB - tA;
        });

        const enriched: SettledTransaction[] = settledList.map((t) => {
          const card = cards.find((c) => c.id === t.card_id);
          const qr = qrs.find((q) => q.id === t.qr_id);
          const settledTo = profiles.find((p) => p.id === t.settled_to_user);
          const rotatedBy = profiles.find((p) => p.id === t.recorded_by);

          return {
            id: t.id,
            amount: Number(t.amount || 0),
            transaction_date: t.transaction_date,
            settled_date: t.settled_date,
            merchant_name: qr?.merchant_name,
            card_name: card?.card_name,
            last_4_digits: card?.last_4_digits,
            rotated_by_name: rotatedBy?.name,
            rotated_by_avatar: rotatedBy?.avatar_url,
            settled_to_user: t.settled_to_user,
            settled_to_name: settledTo?.name,
            settled_to_avatar: settledTo?.avatar_url,
            remarks: t.remarks,
          };
        });

        setHasMoreHistory(settledList.length === HISTORY_PAGE_SIZE);

        if (replace || pageNumber === 0) {
          setSettledHistory(enriched);
          setHistoryPage(0);
        } else {
          setSettledHistory((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const uniqueNew = enriched.filter((e) => !existingIds.has(e.id));
            return [...prev, ...uniqueNew];
          });
          setHistoryPage(pageNumber);
        }
      } catch (err) {
        console.error('Error fetching settled history page:', err);
      } finally {
        setLoadingMoreHistory(false);
      }
    },
    [selectedVaultCardId, cards, qrs, profiles]
  );

  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData]);

  useEffect(() => {
    if (cards.length > 0 || profiles.length > 0) {
      fetchSettledHistoryPage(0, true);
    }
  }, [fetchSettledHistoryPage, cards.length, profiles.length]);

  // Realtime Subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('mobile-settlements-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_transactions' },
        () => {
          fetchCoreData();
          fetchSettledHistoryPage(0, true);
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qrs' }, () => {
        fetchCoreData();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_on_hand' },
        () => {
          fetchCoreData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCoreData, fetchSettledHistoryPage]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCoreData();
    await fetchSettledHistoryPage(0, true);
  };

  const handleLoadMoreHistory = () => {
    if (loadingMoreHistory || !hasMoreHistory) return;
    fetchSettledHistoryPage(historyPage + 1, false);
  };

  // Toggle QR Active vs On-Hold with Optimistic Update
  const handleToggleQrStatus = async (qrId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'on_hold' : 'active';
    setQrs((prev) => prev.map((q) => (q.id === qrId ? { ...q, status: newStatus } : q)));

    try {
      const { error } = await supabase.from('qrs').update({ status: newStatus }).eq('id', qrId);
      if (error) throw error;
    } catch (err) {
      console.error('Error toggling QR status:', err);
      setQrs((prev) => prev.map((q) => (q.id === qrId ? { ...q, status: currentStatus } : q)));
    }
  };

  // Record Rotation Withdrawal from Recommended QR or QR Payment Modal
  const handleRecordRotation = async ({
    cardId,
    qrId,
    amount,
    remarks,
  }: {
    cardId: string;
    qrId?: string | null;
    amount: number;
    remarks: string;
  }) => {
    const cleanQrId = qrId && qrId.trim() ? qrId.trim() : null;
    const today = new Date().toISOString().slice(0, 10);
    const originalCreatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const netState = await NetInfo.fetch();
    const isOnline = !!netState.isConnected;

    if (!isOnline) {
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'rotate',
        payload: {
          activeCardId: cardId,
          numAmount: amount,
          selectedQrId: cleanQrId,
          remarks,
          actingUserId: currentUser?.id,
        },
        original_created_at: originalCreatedAt,
        transaction_date: today,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Rotation Recorded (Offline)');
      setSuccessSubtitle('Saved locally. Will sync to ledger when connected.');
      setSuccessAmount(amount);
      setSuccessModalVisible(true);
      return;
    }

    try {
      const { error: txError } = await supabase.from('card_transactions').insert({
        card_id: cardId,
        qr_id: cleanQrId,
        amount,
        transaction_date: today,
        created_at: originalCreatedAt,
        type: 'withdrawal',
        status: 'pending_settlement',
        recorded_by: currentUser?.id,
        remarks,
      });
      if (txError) throw txError;

      if (cleanQrId) {
        await supabase.from('qrs').update({ last_used_date: originalCreatedAt }).eq('id', cleanQrId);
      }

      // Dispatch WhatsApp, Push & QStash Cooling Alerts
      const payingCard = cards.find((c) => c.id === cardId);
      const chosenQr = qrs.find((q) => q.id === cleanQrId);
      const currentBal = (cardAvailableMap[cardId] || 0) - amount;

      broadcastRotationWithdrawAlert({
        cardName: payingCard?.card_name || 'Card',
        last4: payingCard?.last_4_digits || '0000',
        qrName: chosenQr?.merchant_name || 'Merchant QR',
        entryUserName: currentUser?.name || 'User',
        amount,
        currentBalance: currentBal,
        profiles,
      }).catch((alertErr) => console.warn('Alert broadcast notice:', alertErr));

      // Rule 4: Haptics on save
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show Therapeutic Success Checkmark Celebration
      setSuccessTitle('Rotation Recorded');
      setSuccessSubtitle('Queued into In-Transit ledger for settlement');
      setSuccessAmount(amount);
      setSuccessModalVisible(true);

      await fetchCoreData();
      useBalanceStore.getState().refreshBalances(true).catch(() => {});
    } catch (onlineError) {
      console.warn('Online rotation failed, saving to offline queue:', onlineError);
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'rotate',
        payload: {
          activeCardId: cardId,
          numAmount: amount,
          selectedQrId: cleanQrId,
          remarks,
          actingUserId: currentUser?.id,
        },
        original_created_at: originalCreatedAt,
        transaction_date: today,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Rotation Recorded (Offline)');
      setSuccessSubtitle('Saved locally. Will auto-sync when online.');
      setSuccessAmount(amount);
      setSuccessModalVisible(true);
    }
  };

  // Confirm Settlement (Full or Partial)
  const handleConfirmSettlement = async ({
    tx,
    amtToSettle,
    cashReceiverId,
    settleTargetCardId,
    remarks,
  }: {
    tx: InTransitTransaction;
    amtToSettle: number;
    cashReceiverId: string;
    settleTargetCardId: string;
    remarks: string;
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    const originalCreatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    // Pure state transition calculation via @credics/core
    const currentDue = tx.settlement_details?.total_due !== undefined ? tx.settlement_details.total_due : tx.amount;
    const isFullSettlement = amtToSettle >= currentDue;
    const settlementResult = computeSettlementTransition({
      transaction: {
        id: tx.id,
        amount: tx.amount,
        settlement_details: tx.settlement_details,
        qrMerchantName: tx.merchant_name,
        remarks,
      },
      settlementType: isFullSettlement ? 'full' : 'partial',
      partialAmount: amtToSettle,
      cashReceiverId,
      targetCardId: settleTargetCardId,
      customRemarks: remarks,
      todayDateStr: today,
      nowIsoString: originalCreatedAt,
    });

    const netState = await NetInfo.fetch();
    const isOnline = !!netState.isConnected;

    if (!isOnline) {
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'settlement',
        payload: {
          transactionId: tx.id,
          settleTargetCardId,
          cashReceiverId,
          settlementResult,
          todayDateStr: today,
        },
        original_created_at: originalCreatedAt,
        transaction_date: today,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Settlement Recorded (Offline)');
      setSuccessSubtitle('Saved locally. Will auto-sync when network returns.');
      setSuccessAmount(amtToSettle);
      setSuccessModalVisible(true);
      return;
    }

    try {
      // Execute atomic settlement via @credics/core service
      await executeSettlementTransaction(supabase, {
        transactionId: tx.id,
        settleTargetCardId,
        cashReceiverId,
        settlementResult,
        todayDateStr: today,
      });

      // Dispatch Settlement Alert to all team profiles
      const targetCard = cards.find((c) => c.id === settleTargetCardId);
      const receiver = profiles.find((p) => p.id === cashReceiverId);

      broadcastRotationSettlementAlert({
        cardName: targetCard?.card_name || 'Card',
        last4: targetCard?.last_4_digits || '0000',
        qrName: tx.merchant_name || 'Merchant QR',
        entryUserName: currentUser?.name || 'User',
        amount: amtToSettle,
        receiverName: receiver?.name || 'Receiver',
        profiles,
      }).catch((alertErr) => console.warn('Settlement alert broadcast notice:', alertErr));

      // Rule 4: Success Haptics on settlement save
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show Therapeutic Success Checkmark Celebration
      setSuccessTitle('Settlement Completed');
      setSuccessSubtitle('Successfully credited into Cash on Hand balance');
      setSuccessAmount(amtToSettle);
      setSuccessModalVisible(true);

      await fetchCoreData();
      useBalanceStore.getState().refreshBalances(true).catch(() => {});
      await fetchSettledHistoryPage(0, true);
    } catch (onlineError) {
      console.warn('Online settlement failed, saving to offline queue:', onlineError);
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'settlement',
        payload: {
          transactionId: tx.id,
          settleTargetCardId,
          cashReceiverId,
          settlementResult,
          todayDateStr: today,
        },
        original_created_at: originalCreatedAt,
        transaction_date: today,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Settlement Recorded (Offline)');
      setSuccessSubtitle('Saved locally. Will auto-sync when online.');
      setSuccessAmount(amtToSettle);
      setSuccessModalVisible(true);
    }
  };

  // Save New QR (Dynamic or Static)
  const handleSaveNewQR = async ({
    merchant_name,
    upi_id,
    platform,
    settlement_time,
    base_payment_link,
    is_static,
    card_id,
  }: {
    merchant_name: string;
    upi_id: string;
    platform: string;
    settlement_time: string;
    base_payment_link?: string;
    is_static: boolean;
    card_id?: string;
  }) => {
    const payload: any = {
      merchant_name,
      upi_id,
      platform,
      settlement_time,
      base_payment_link: basePaymentLink(base_payment_link),
      status: is_static ? 'static' : 'active',
      card_id: card_id || cards[0]?.id || null,
    };

    const { error } = await supabase.from('qrs').insert(payload);
    if (error) throw error;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await fetchCoreData();
  };

  const basePaymentLink = (link?: string) => {
    if (!link || !link.trim()) return null;
    return link.trim();
  };

  // Filtered lists by selected vault card
  const filteredPending = useMemo(() => {
    if (selectedVaultCardId === 'all') return pendingTxs;
    return pendingTxs.filter((t) => t.card_id === selectedVaultCardId);
  }, [pendingTxs, selectedVaultCardId]);

  // Total In Transit Calculation
  const totalInTransit = useMemo(() => {
    return filteredPending.reduce((sum, t) => {
      const due =
        t.settlement_details?.total_due !== undefined
          ? Number(t.settlement_details.total_due)
          : Number(t.amount);
      return sum + due;
    }, 0);
  }, [filteredPending]);

  // Hierarchical cards for header accordion
  const hierarchicalCards = useMemo(() => {
    return buildHierarchicalCardList(cards);
  }, [cards]);

  const totalUnifiedAvailable = useMemo(() => {
    return cards
      .filter((c) => c.is_primary || !c.parent_card_id)
      .reduce((sum, c) => sum + (cardAvailableMap[c.id] || 0), 0);
  }, [cards, cardAvailableMap]);

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
              <Text style={styles.headerTitle}>Settlements & QRs</Text>
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
                      const c = cards.find((card) => card.id === selectedVaultCardId);
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
                headerExpandedProgress.value = withSpring(0, { damping: 20, stiffness: 220 });
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
                    headerExpandedProgress.value = withSpring(0, { damping: 20, stiffness: 220 });
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

      {/* ================= 2. REORDERED SEGMENTED TABS (120HZ SLIDING PILL) ================= */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabsTrack}>
          {/* Animated 120Hz Sliding Background Pill */}
          <Animated.View style={[styles.slidingTabIndicator, tabIndicatorAnimStyle]} />

          {(['vault', 'pending', 'history'] as const).map((tab, idx) => {
            const isActive = activeTab === tab;
            const label =
              tab === 'vault'
                ? 'QR Vault'
                : tab === 'pending'
                ? 'In Transit'
                : 'Settled History';
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

      {/* ================= 3. HORIZONTAL SWIPEABLE PAGER ================= */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#0B3F28" />
          <Text style={styles.loaderText}>Loading Liquidity Ledger...</Text>
        </View>
      ) : (
        <ScrollView
          ref={horizontalScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handlePageScrollEnd}
          style={styles.horizontalPager}
          contentContainerStyle={{ width: SCREEN_WIDTH * 3 }}
        >
          {/* PAGE 0: QR VAULT */}
          <View style={{ width: SCREEN_WIDTH }}>
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 130 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#0B3F28']}
                  tintColor="#0B3F28"
                />
              }
            >
              <QRVaultTab
                qrs={qrs}
                activeCooldowns={activeCooldowns}
                currentUserName={currentUser?.name || ''}
                onSelectQr={(qr) => setSelectedQrForPayment(qr)}
                onSelectStaticQr={(qr) => {
                  setViewingStaticQr(qr);
                  setIsStaticModalOpen(true);
                }}
                onToggleStatus={handleToggleQrStatus}
                onEditQr={(qr) => setEditingQr(qr)}
                onAddStatic={() => setIsAddQrOpen(true)}
              />
            </ScrollView>
          </View>

          {/* PAGE 1: IN TRANSIT */}
          <View style={{ width: SCREEN_WIDTH }}>
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 130 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#0B3F28']}
                  tintColor="#0B3F28"
                />
              }
            >
              {/* LIQUIDITY SUMMARY BANNER - Relocated INSIDE In-Transit Tab! */}
              <View style={styles.inTransitSummaryCardWrapper}>
                <LinearGradient
                  colors={['#071A12', '#0C2B20', '#071A12']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.summaryCard}
                >
                  <View style={styles.summaryTopRow}>
                    <View>
                      <Text style={styles.summaryLabel}>Total Due In Transit</Text>
                      <Text style={styles.summaryAmount}>₹{totalInTransit.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.pendingBadge}>
                      <Clock size={12} color="#F59E0B" />
                      <Text style={styles.pendingBadgeText}>{filteredPending.length} Pending</Text>
                    </View>
                  </View>
                  <Text style={styles.summarySub}>
                    Tap any rotation below to record receipt into cash on hand
                  </Text>
                </LinearGradient>
              </View>

              <InTransitTab
                transactions={filteredPending}
                onSettle={(tx) => setSelectedTxForSettle(tx)}
              />
            </ScrollView>
          </View>

          {/* PAGE 2: SETTLED HISTORY */}
          <View style={{ width: SCREEN_WIDTH }}>
            <View style={styles.historyContainer}>
              <SettledHistoryTab
                transactions={settledHistory}
                loadingMore={loadingMoreHistory}
                hasMore={hasMoreHistory}
                onLoadMore={handleLoadMoreHistory}
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            </View>
          </View>
        </ScrollView>
      )}

      {/* ================= 4. CONTEXT-AWARE MORPHING FAB ================= */}
      <Animated.View
        style={[styles.floatingFabContainer, fabAnimStyle]}
        pointerEvents={activeTab === 'history' ? 'none' : 'auto'}
      >
        <TouchableOpacity
          style={styles.floatingFabTouchable}
          activeOpacity={0.88}
          onPress={handleFabPress}
        >
          <LinearGradient
            colors={['#10B981', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.floatingFabGradient}
          >
            <Plus size={20} color="#FFFFFF" strokeWidth={2.8} />
            <Animated.View style={[styles.floatingFabTextWrapper, fabTextContainerAnimStyle]}>
              <Text style={styles.floatingFabPillText} numberOfLines={1}>
                Record Rotation
              </Text>
            </Animated.View>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ================= MODALS & DRAWERS ================= */}

      {/* QR Payment & Rotation Swipe Modal */}
      <QRPaymentModal
        visible={!!selectedQrForPayment}
        onClose={() => setSelectedQrForPayment(null)}
        qr={selectedQrForPayment}
        cards={cards}
        cardAvailableMap={cardAvailableMap}
        onRecordRotation={handleRecordRotation}
      />

      {/* Settle Confirm Modal */}
      <SettleConfirmModal
        visible={!!selectedTxForSettle}
        onClose={() => setSelectedTxForSettle(null)}
        tx={selectedTxForSettle}
        profiles={profiles}
        cards={cards}
        currentUserId={currentUser?.id}
        defaultCardId={selectedVaultCardId}
        onConfirm={handleConfirmSettlement}
      />

      {/* Add New QR Drawer (Dynamic & Static) */}
      <AddQRDrawer
        visible={isAddQrOpen}
        onClose={() => setIsAddQrOpen(false)}
        cards={cards}
        onSaveQR={handleSaveNewQR}
      />

      {/* Manual Rotation Drawer (Off-QR or Direct Entry) */}
      <ManualRotationDrawer
        visible={isManualRotationOpen}
        onClose={() => setIsManualRotationOpen(false)}
        cards={cards}
        qrs={qrs}
        cardAvailableMap={cardAvailableMap}
        onSaveRotation={async ({ cardId, qrId, amount, remarks }) => {
          await handleRecordRotation({ cardId, qrId: qrId || '', amount, remarks });
          setIsManualRotationOpen(false);
        }}
      />

      {/* Edit QR Drawer */}
      <EditQRDrawer
        visible={!!editingQr}
        onClose={() => setEditingQr(null)}
        qr={editingQr}
        onSaveSuccess={async () => {
          await fetchCoreData();
      useBalanceStore.getState().refreshBalances(true).catch(() => {});
        }}
      />

      {/* Therapeutic Success Celebration Modal */}
      <TherapeuticSuccessModal
        visible={successModalVisible}
        onDismiss={() => setSuccessModalVisible(false)}
        title={successTitle}
        subtitle={successSubtitle}
        amount={successAmount}
      />

      {/* Static Standee Full-Screen Viewer Modal */}
      <StaticQRViewModal
        visible={isStaticModalOpen}
        qr={viewingStaticQr}
        onClose={() => setIsStaticModalOpen(false)}
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
    overflow: 'hidden',
    backgroundColor: '#072C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#CAD6C9',
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
  headerAccordion: {
    overflow: 'hidden',
  },
  accordionScrollContent: {
    paddingHorizontal: 20,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  accordionCardItem: {
    width: 144,
    height: 74,
    borderRadius: 14,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'space-between',
  },
  accordionCardItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  accordionCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  accordionCardSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A7F3D0',
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
  summaryCardWrapper: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  summaryCard: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CAD6C9',
    letterSpacing: 0.2,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B',
  },
  summarySub: {
    fontSize: 10,
    fontWeight: '500',
    color: '#A3B8A5',
  },
  inTransitSummaryCardWrapper: {
    paddingHorizontal: 0,
    marginBottom: 12,
  },
  tabsContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  tabsTrack: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    position: 'relative',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  slidingTabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: '#0B3F28',
    borderRadius: 12,
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A6B56',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  horizontalPager: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  historyContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
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
  floatingFabContainer: {
    position: 'absolute',
    bottom: 86,
    right: 18,
    height: 52,
    zIndex: 99,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingFabTouchable: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  floatingFabGradient: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  floatingFabTextWrapper: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  floatingFabPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
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
});
