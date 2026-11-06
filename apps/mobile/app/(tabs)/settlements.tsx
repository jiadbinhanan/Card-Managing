import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
} from 'lucide-react-native';

import { supabase } from '../../lib/supabase';
import NetInfo from '@react-native-community/netinfo';
import { computeSettlementTransition, executeSettlementTransaction } from '@credics/core';
import { useOfflineQueueStore } from '../../lib/offlineQueue';
import { QRVaultTab, ActiveCooldown } from '../../components/settlements/QRVaultTab';
import { InTransitTab, InTransitTransaction } from '../../components/settlements/InTransitTab';
import { SettledHistoryTab, SettledTransaction } from '../../components/settlements/SettledHistoryTab';
import { QRPaymentModal, QRData, CardData } from '../../components/settlements/QRPaymentModal';
import { SettleConfirmModal, Profile } from '../../components/settlements/SettleConfirmModal';
import { AddQRDrawer } from '../../components/settlements/AddQRDrawer';
import { EditQRDrawer } from '../../components/settlements/EditQRDrawer';
import { ManualRotationDrawer } from '../../components/settlements/ManualRotationDrawer';
import { TherapeuticSuccessModal } from '../../components/settlements/TherapeuticSuccessModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HISTORY_PAGE_SIZE = 20;

export default function SettlementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Primary Tab Order: 1. QR Vault -> 2. In Transit -> 3. History
  const [activeTab, setActiveTab] = useState<'vault' | 'pending' | 'history'>('vault');

  // Vault Selection
  const [selectedVaultCardId, setSelectedVaultCardId] = useState<string>('all');
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);

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

  // 120Hz Animations
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
    setIsAddQrOpen(true);
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
            .in('status', ['pending_settlement', 'partially_settled'])
            .order('transaction_date', { ascending: false }),
          supabase
            .from('card_transactions')
            .select('amount, type, card_id, status, qr_id, remarks'),
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

      // Calculate Card Available Limits Map
      const availableMap: Record<string, number> = {};
      cardsData
        .filter((c) => c.is_primary)
        .forEach((primaryCard) => {
          const familyCardIds = cardsData
            .filter((c) => c.id === primaryCard.id || c.parent_card_id === primaryCard.id)
            .map((c) => c.id);

          const withdrawals = allTxs
            .filter((t) => {
              if (t.type !== 'withdrawal') return false;
              if (!t.card_id || !familyCardIds.includes(t.card_id)) return false;
              const isRot = t.qr_id || (t.remarks || '').toLowerCase().includes('rotation');
              if (isRot) return true;
              return t.status === 'pending_settlement' || t.status === 'partially_settled';
            })
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

          const billPayments = allTxs
            .filter(
              (t) => t.type === 'bill_payment' && t.card_id && familyCardIds.includes(t.card_id)
            )
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

          const ccSpends = allSpends
            .filter(
              (s) =>
                s.payment_method === 'credit_card' &&
                s.card_id &&
                familyCardIds.includes(s.card_id)
            )
            .reduce((sum, s) => sum + Number(s.amount || 0), 0);

          const available =
            Number(primaryCard.total_limit || 0) - withdrawals - ccSpends + billPayments;

          familyCardIds.forEach((id) => {
            availableMap[id] = available;
          });
        });
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

      const { data: recentTxs } = await supabase
        .from('card_transactions')
        .select('qr_id, created_at, transaction_date')
        .eq('type', 'withdrawal')
        .gte('created_at', fiveDaysAgo.toISOString())
        .not('qr_id', 'is', null)
        .order('created_at', { ascending: false });

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
          .eq('status', 'settled')
          .order('settled_date', { ascending: false });

        if (selectedVaultCardId !== 'all') {
          const selected = cards.find((c) => c.id === selectedVaultCardId);
          const primaryId = selected?.is_primary ? selected.id : (selected?.parent_card_id || selectedVaultCardId);
          const familyIds = cards
            .filter((c) => c.id === primaryId || c.parent_card_id === primaryId)
            .map((c) => c.id);
          q = q.in('card_id', familyIds.length > 0 ? familyIds : [selectedVaultCardId]);
        }

        const { data: rawSettled } = await q.range(from, to);
        const settledList = rawSettled || [];

        const enriched: SettledTransaction[] = settledList.map((t) => {
          const card = cards.find((c) => c.id === t.card_id);
          const qr = qrs.find((q) => q.id === t.qr_id);
          const settledTo = profiles.find((p) => p.id === t.settled_to_user);

          return {
            id: t.id,
            amount: Number(t.amount || 0),
            transaction_date: t.transaction_date,
            settled_date: t.settled_date,
            merchant_name: qr?.merchant_name,
            card_name: card?.card_name,
            last_4_digits: card?.last_4_digits,
            settled_to_name: settledTo?.name,
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

      // Rule 4: Haptics on save
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show Therapeutic Success Checkmark Celebration
      setSuccessTitle('Rotation Recorded');
      setSuccessSubtitle('Queued into In-Transit ledger for settlement');
      setSuccessAmount(amount);
      setSuccessModalVisible(true);

      await fetchCoreData();
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

      // Rule 4: Success Haptics on settlement save
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show Therapeutic Success Checkmark Celebration
      setSuccessTitle('Settlement Completed');
      setSuccessSubtitle('Successfully credited into Cash on Hand balance');
      setSuccessAmount(amtToSettle);
      setSuccessModalVisible(true);

      await fetchCoreData();
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

  // Filtered lists by selected vault card family
  const filteredPending = useMemo(() => {
    if (selectedVaultCardId === 'all') return pendingTxs;
    const selected = cards.find((c) => c.id === selectedVaultCardId);
    const primaryId = selected?.is_primary ? selected.id : (selected?.parent_card_id || selectedVaultCardId);
    const familyIds = cards
      .filter((c) => c.id === primaryId || c.parent_card_id === primaryId)
      .map((c) => c.id);
    return pendingTxs.filter((t) => t.card_id && (t.card_id === selectedVaultCardId || familyIds.includes(t.card_id)));
  }, [pendingTxs, selectedVaultCardId, cards]);

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
                <Text style={styles.liveStatusText}>LIQUIDITY ENGINE • REALTIME</Text>
              </View>
              <Text style={styles.headerTitle}>Settlements & QRs</Text>
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
                  : cards.find((c) => c.id === selectedVaultCardId)?.card_name || 'Card'}
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

      {/* ================= 2. LIQUIDITY SUMMARY BANNER ================= */}
      <View style={styles.summaryCardWrapper}>
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

      {/* ================= 3. REORDERED SEGMENTED TABS ================= */}
      {/* 1. QR Vault -> 2. In Transit -> 3. History */}
      <View style={styles.tabsRow}>
        {(['vault', 'pending', 'history'] as const).map((tab) => {
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
              style={[styles.tabChip, isActive && styles.activeTabChip]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabChipText, isActive && styles.activeTabChipText]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ================= 4. TAB CONTENT ================= */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#0B3F28" />
          <Text style={styles.loaderText}>Loading Liquidity Ledger...</Text>
        </View>
      ) : activeTab === 'history' ? (
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
      ) : (
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
          {/* TAB 1: QR VAULT */}
          {activeTab === 'vault' && (
            <QRVaultTab
              qrs={qrs}
              activeCooldowns={activeCooldowns}
              currentUserName={currentUser?.name || ''}
              onSelectQr={(qr) => setSelectedQrForPayment(qr)}
              onToggleStatus={handleToggleQrStatus}
              onEditQr={(qr) => setEditingQr(qr)}
            />
          )}

          {/* TAB 2: IN TRANSIT */}
          {activeTab === 'pending' && (
            <InTransitTab
              transactions={filteredPending}
              onSettle={(tx) => setSelectedTxForSettle(tx)}
              onNewManualEntry={() => setIsManualRotationOpen(true)}
            />
          )}
        </ScrollView>
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

      {/* Vault Card Dropdown Filter Modal */}
      <Modal visible={isCardDropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsCardDropdownOpen(false)}
        >
          <View style={styles.filterMenuBox}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Select Vault Card</Text>
              <TouchableOpacity onPress={() => setIsCardDropdownOpen(false)}>
                <X size={16} color="#4A6B56" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.menuOption,
                selectedVaultCardId === 'all' && styles.menuOptionActive,
              ]}
              onPress={() => {
                setSelectedVaultCardId('all');
                setIsCardDropdownOpen(false);
              }}
            >
              <Text
                style={[
                  styles.menuOptionText,
                  selectedVaultCardId === 'all' && styles.menuOptionTextActive,
                ]}
              >
                All Vault Cards
              </Text>
              {selectedVaultCardId === 'all' && <Check size={14} color="#0B3F28" />}
            </TouchableOpacity>

            {cards.map((card) => {
              const isSelected = selectedVaultCardId === card.id;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.menuOption, isSelected && styles.menuOptionActive]}
                  onPress={() => {
                    setSelectedVaultCardId(card.id);
                    setIsCardDropdownOpen(false);
                  }}
                >
                  <View>
                    <Text
                      style={[
                        styles.menuOptionText,
                        isSelected && styles.menuOptionTextActive,
                      ]}
                    >
                      {card.card_name}
                    </Text>
                    <Text style={styles.menuOptionSub}>**{card.last_4_digits}</Text>
                  </View>
                  {isSelected && <Check size={14} color="#0B3F28" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginVertical: 8,
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
});
