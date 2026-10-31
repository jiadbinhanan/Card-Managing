import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticButton } from '../../components/HapticButton';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  QrCode,
  ShieldCheck,
  Clock,
  CheckCircle2,
  ChevronDown,
  Plus,
  X,
  CreditCard,
  User,
  ArrowRight,
  ArrowDownLeft,
  Timer,
  Check,
  Layers,
  Banknote,
  Send,
  Zap,
} from 'lucide-react-native';

interface SettlementHistoryEntry {
  settle_id: string;
  amount: number;
  settled_date: string;
  settled_to_user: string;
  card_id: string;
  remarks?: string;
}

interface SettlementDetails {
  total_settled: number;
  total_due: number;
  history: SettlementHistoryEntry[];
}

interface Transaction {
  id: string;
  type: 'withdrawal' | 'bill_payment';
  amount: number;
  transaction_date: string;
  status: 'pending_settlement' | 'partially_settled' | 'settled';
  settled_date?: string;
  recorded_by: string;
  qr_id?: string;
  settled_to_user?: string;
  card_id?: string;
  remarks?: string;
  settlement_details?: SettlementDetails | null;
  card_name?: string;
  last_4_digits?: string;
  merchant_name?: string;
  recorder_name?: string;
  settled_to_name?: string;
}

interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary: boolean;
  parent_card_id?: string;
  total_limit?: number;
}

interface QRData {
  id: string;
  merchant_name: string;
  platform?: string;
  status?: string;
  upi_id?: string;
  settlement_time?: string;
  base_payment_link?: string | null;
  last_used_date?: string | null;
}

interface ActiveCooldown {
  qrId: string;
  merchantName: string;
  expiresAt: number;
  isBharatPe: boolean;
}

export default function SettlementsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'vault' | 'history'>('pending');

  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [settledTxs, setSettledTxs] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [qrs, setQrs] = useState<QRData[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  // Vault Selection
  const [selectedVaultCardId, setSelectedVaultCardId] = useState<string>('all');
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});

  // Settle Modal State
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleTx, setSettleTx] = useState<Transaction | null>(null);
  const [settlementType, setSettlementType] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState('');
  const [cashReceiverId, setCashReceiverId] = useState('');
  const [settleTargetCardId, setSettleTargetCardId] = useState('');
  const [settleRemarks, setSettleRemarks] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  // New Rotation Withdrawal Modal
  const [isNewWithdrawalOpen, setIsNewWithdrawalOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualCardId, setManualCardId] = useState('');
  const [manualQrId, setManualQrId] = useState('');
  const [manualRemarks, setManualRemarks] = useState('');
  const [isSavingWithdrawal, setIsSavingWithdrawal] = useState(false);

  // QR Modal State (from QR Vault tab)
  const [selectedQrForPayment, setSelectedQrForPayment] = useState<QRData | null>(null);
  const [paymentMode, setPaymentMode] = useState<'once' | 'multiple'>('once');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [qrPayAmount, setQrPayAmount] = useState<string>('5000');
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [selectedPaymentCardId, setSelectedPaymentCardId] = useState<string>('');
  const [isMarkingRotation, setIsMarkingRotation] = useState(false);

  // Active Cooldowns
  const [activeCooldowns, setActiveCooldowns] = useState<ActiveCooldown[]>([]);

  // Fetch Auxiliary Data
  const fetchData = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getSession();
      const currentAuthUser = authData?.session?.user;

      const [cardsRes, profilesRes, qrsRes, txsRes, allTxsRes, spendsRes] = await Promise.all([
        supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        supabase.from('profiles').select('*').order('name'),
        supabase.from('qrs').select('*').order('merchant_name'),
        supabase
          .from('card_transactions')
          .select('*')
          .eq('type', 'withdrawal')
          .order('transaction_date', { ascending: false }),
        supabase.from('card_transactions').select('amount, type, card_id, status, qr_id, remarks'),
        supabase.from('spends').select('amount, payment_method, card_id'),
      ]);

      const cardsData: CardData[] = cardsRes.data || [];
      const profilesData: Profile[] = profilesRes.data || [];
      const qrsData: QRData[] = qrsRes.data || [];
      const rawTxs = txsRes.data || [];
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
            .filter((t) => t.type === 'bill_payment' && t.card_id && familyCardIds.includes(t.card_id))
            .reduce((sum, t) => sum + Number(t.amount || 0), 0);

          const ccSpends = allSpends
            .filter(
              (s) =>
                s.payment_method === 'credit_card' && s.card_id && familyCardIds.includes(s.card_id)
            )
            .reduce((sum, s) => sum + Number(s.amount || 0), 0);

          const available = Number(primaryCard.total_limit || 0) - withdrawals - ccSpends + billPayments;

          familyCardIds.forEach((id) => {
            availableMap[id] = available;
          });
        });
      setCardAvailableMap(availableMap);

      // Process Transactions
      const enriched: Transaction[] = rawTxs.map((t) => {
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

      const pending = enriched.filter(
        (t) => t.status === 'pending_settlement' || t.status === 'partially_settled'
      );
      const history = enriched.filter((t) => t.status === 'settled');

      setPendingTxs(pending);
      setSettledTxs(history);

      // Defaults for manual entry
      if (cardsData.length > 0 && !manualCardId) setManualCardId(cardsData[0].id);
      if (qrsData.length > 0 && !manualQrId) setManualQrId(qrsData[0].id);

      // Check Active Cooldowns (BharatPe 5-day / 24h cooling)
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      const recentWithdrawals = rawTxs.filter(
        (t) => t.qr_id && new Date(t.created_at || t.transaction_date) >= fiveDaysAgo
      );

      const cooldownList: ActiveCooldown[] = [];
      const processedQrIds = new Set<string>();

      recentWithdrawals.forEach((tx) => {
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
      console.error('Error fetching settlements data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [manualCardId, manualQrId]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('mobile-settlements-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Filtered lists based on vault card
  const filteredPending = useMemo(() => {
    if (selectedVaultCardId === 'all') return pendingTxs;
    return pendingTxs.filter((t) => t.card_id === selectedVaultCardId);
  }, [pendingTxs, selectedVaultCardId]);

  const filteredSettled = useMemo(() => {
    if (selectedVaultCardId === 'all') return settledTxs;
    return settledTxs.filter((t) => t.card_id === selectedVaultCardId);
  }, [settledTxs, selectedVaultCardId]);

  // Total in transit calculation
  const totalInTransit = useMemo(() => {
    return filteredPending.reduce((sum, t) => {
      const due =
        t.settlement_details?.total_due !== undefined
          ? Number(t.settlement_details.total_due)
          : Number(t.amount);
      return sum + due;
    }, 0);
  }, [filteredPending]);

  // Open Settle Modal
  const openSettleModal = (tx: Transaction) => {
    setSettleTx(tx);
    setCashReceiverId(currentUser?.id || (profiles.length > 0 ? profiles[0].id : ''));
    const defaultCard =
      selectedVaultCardId !== 'all'
        ? selectedVaultCardId
        : tx.card_id || (cards.length > 0 ? cards[0].id : '');
    setSettleTargetCardId(defaultCard);
    setSettlementType('full');
    setPartialAmount('');
    setSettleRemarks('');
    setIsSettleModalOpen(true);
  };

  // Confirm Settlement
  const handleConfirmSettlement = async () => {
    if (!settleTx || !cashReceiverId || !settleTargetCardId) {
      Alert.alert('Required', 'Please ensure recipient and target card are selected.');
      return;
    }

    setIsSettling(true);

    const today = new Date().toISOString().slice(0, 10);
    const currentDue =
      settleTx.settlement_details?.total_due !== undefined
        ? Number(settleTx.settlement_details.total_due)
        : Number(settleTx.amount);

    const isPartial =
      settlementType === 'partial' &&
      Number(partialAmount) > 0 &&
      Number(partialAmount) < currentDue;
    const amtToSettle = isPartial ? Number(partialAmount) : currentDue;

    const prevHistory = Array.isArray(settleTx.settlement_details?.history)
      ? settleTx.settlement_details.history
      : [];
    const prevSettled = Number(settleTx.settlement_details?.total_settled || 0);

    const newSettled = prevSettled + amtToSettle;
    const newDue = Math.max(0, Number(settleTx.amount) - newSettled);

    const newHistoryEntry: SettlementHistoryEntry = {
      settle_id: `settle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      amount: amtToSettle,
      settled_date: today,
      settled_to_user: cashReceiverId,
      card_id: settleTargetCardId,
      remarks: settleRemarks.trim() || undefined,
    };

    const updatedSettlementDetails: SettlementDetails = {
      total_settled: newSettled,
      total_due: newDue,
      history: [...prevHistory, newHistoryEntry],
    };

    try {
      if (newDue <= 0) {
        await supabase
          .from('card_transactions')
          .update({
            card_id: settleTargetCardId,
            status: 'settled',
            settled_date: today,
            settled_to_user: cashReceiverId,
            settlement_details: updatedSettlementDetails,
          })
          .eq('id', settleTx.id);
      } else {
        await supabase
          .from('card_transactions')
          .update({
            status: 'partially_settled',
            settlement_details: updatedSettlementDetails,
          })
          .eq('id', settleTx.id);
      }

      const baseRemark = `Settlement received from ${settleTx.merchant_name || 'Rotation Entry'}`;
      const finalLedgerRemark = settleRemarks.trim()
        ? `${baseRemark} - ${settleRemarks.trim()}`
        : baseRemark;

      await supabase.from('cash_on_hand_ledger').insert({
        user_id: cashReceiverId,
        card_id: settleTargetCardId,
        amount: amtToSettle,
        transaction_type: 'credit',
        remarks: finalLedgerRemark,
        transaction_date: new Date().toISOString(),
        linked_card_transaction_id: settleTx.id,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSettleModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error during settlement:', err);
      Alert.alert('Error', err?.message || 'Failed to confirm settlement.');
    } finally {
      setIsSettling(false);
    }
  };

  // Submit Manual Rotation Withdrawal
  const handleSaveManualWithdrawal = async () => {
    if (!manualAmount || Number(manualAmount) <= 0 || !manualCardId) {
      Alert.alert('Required', 'Please enter a valid amount and select a card.');
      return;
    }

    setIsSavingWithdrawal(true);

    try {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('card_transactions').insert({
        card_id: manualCardId,
        qr_id: manualQrId || null,
        amount: Number(manualAmount),
        transaction_date: today,
        type: 'withdrawal',
        status: 'pending_settlement',
        recorded_by: currentUser?.id,
        remarks: manualRemarks || 'Manual Rotation Entry',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsNewWithdrawalOpen(false);
      setManualAmount('');
      setManualRemarks('');
      fetchData();
    } catch (err: any) {
      console.error('Save error:', err);
      Alert.alert('Error', err?.message || 'Failed to record withdrawal.');
    } finally {
      setIsSavingWithdrawal(false);
    }
  };

  // Split Amounts Generator
  const generateSplits = (total: number, count: number) => {
    if (count <= 1) return [total];
    let remaining = total;
    const splits: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      const avg = remaining / (count - i);
      const min = Math.max(500, Math.floor(avg * 0.7));
      const max = Math.min(remaining - 500 * (count - i - 1), Math.floor(avg * 1.3));
      const val = Math.floor((Math.random() * (max - min) + min) / 100) * 100;
      splits.push(val);
      remaining -= val;
    }
    splits.push(remaining);
    return splits;
  };

  // Open QR Payment Modal
  const openQrPaymentModal = (qr: QRData) => {
    setSelectedQrForPayment(qr);
    setPaymentMode('once');
    setSplitCount(2);
    setQrPayAmount('5000');
    setGeneratedAmounts([5000]);
    setSelectedPaymentCardId(cards.length > 0 ? cards[0].id : '');
  };

  // Recalculate QR splits
  const handleAmountChange = (text: string) => {
    setQrPayAmount(text);
    const num = Number(text) || 0;
    if (paymentMode === 'multiple') {
      setGeneratedAmounts(generateSplits(num, splitCount));
    } else {
      setGeneratedAmounts([num]);
    }
  };

  const handleSplitCountChange = (count: number) => {
    setSplitCount(count);
    const num = Number(qrPayAmount) || 0;
    setGeneratedAmounts(generateSplits(num, count));
  };

  // Mark Used & Save Rotation
  const handleMarkUsedAndSave = async () => {
    if (!selectedQrForPayment || !selectedPaymentCardId || !qrPayAmount) {
      Alert.alert('Required', 'Please enter amount and pick card.');
      return;
    }

    setIsMarkingRotation(true);

    try {
      const numAmt = Number(qrPayAmount);
      const today = new Date().toISOString().slice(0, 10);

      await supabase.from('card_transactions').insert({
        card_id: selectedPaymentCardId,
        qr_id: selectedQrForPayment.id,
        amount: numAmt,
        transaction_date: today,
        type: 'withdrawal',
        status: 'pending_settlement',
        recorded_by: currentUser?.id,
        remarks: `Smart QR Swipe • ${selectedQrForPayment.merchant_name}`,
      });

      await supabase
        .from('qrs')
        .update({ last_used_date: today })
        .eq('id', selectedQrForPayment.id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedQrForPayment(null);
      fetchData();
    } catch (err: any) {
      console.error('Error saving rotation:', err);
      Alert.alert('Error', err?.message || 'Failed to save rotation.');
    } finally {
      setIsMarkingRotation(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ================= 1. HEADER ================= */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => router.push('/settings')}
            activeOpacity={0.8}
          >
            {currentUser?.avatar_url ? (
              <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{currentUser?.name?.[0] || 'U'}</Text>
              </View>
            )}
            <View style={styles.avatarStatusDot} />
          </TouchableOpacity>

          <View>
            <Text style={styles.headerSub}>Liquidity Engine</Text>
            <Text style={styles.headerTitle}>Settlements & QRs</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Vault Selector Pill */}
          <TouchableOpacity
            style={styles.vaultPill}
            onPress={() => setIsCardDropdownOpen(!isCardDropdownOpen)}
            activeOpacity={0.8}
          >
            <Layers size={13} color="#2D7A5D" />
            <Text style={styles.vaultPillText} numberOfLines={1}>
              {selectedVaultCardId === 'all'
                ? 'All Cards'
                : cards.find((c) => c.id === selectedVaultCardId)?.card_name || 'Card'}
            </Text>
            <ChevronDown size={12} color={CedarColors.ink500} />
          </TouchableOpacity>

          {/* New Rotation Withdrawal Button */}
          <HapticButton
            style={styles.withdrawBtn}
            onPress={() => {
              setIsNewWithdrawalOpen(true);
            }}
            feedbackType="rigid"
          >
            <Plus size={16} color="#F6F9F5" strokeWidth={2.5} />
            <Text style={styles.withdrawBtnText}>Withdraw</Text>
          </HapticButton>
        </View>
      </View>

      {/* ================= 2. SUMMARY BANNER ================= */}
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

          <View style={styles.summaryBottomRow}>
            <Text style={styles.summarySub}>
              Tap any rotation below to record receipt into cash on hand
            </Text>
          </View>
        </LinearGradient>
      </View>

      {/* ================= 3. SEGMENTED TABS ================= */}
      <View style={styles.tabsRow}>
        {(['pending', 'vault', 'history'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label =
            tab === 'pending'
              ? 'In Transit'
              : tab === 'vault'
              ? 'QR Vault'
              : 'Settled History';
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, isActive && styles.activeTabChip]}
              onPress={() => {
                setActiveTab(tab);
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

      {/* ================= 4. TAB CONTENT ================= */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#1B4D3E" />
          <Text style={styles.loaderText}>Loading Settlements...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B4D3E']} />}
        >
          {/* TAB 1: IN TRANSIT / PENDING */}
          {activeTab === 'pending' && (
            <View style={styles.tabSection}>
              {filteredPending.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <CheckCircle2 size={32} color="#2D7A5D" />
                  </View>
                  <Text style={styles.emptyTitle}>All Rotations Settled</Text>
                  <Text style={styles.emptySub}>
                    Zero pending withdrawals in transit. All cash has been accounted for.
                  </Text>
                </View>
              ) : (
                filteredPending.map((tx) => {
                  const currentDue =
                    tx.settlement_details?.total_due !== undefined
                      ? Number(tx.settlement_details.total_due)
                      : Number(tx.amount);
                  const isPartial = tx.status === 'partially_settled';

                  return (
                    <View key={tx.id} style={styles.rotationCard}>
                      <View style={styles.rotationTopRow}>
                        <View style={styles.rotationMerchantCol}>
                          <Text style={styles.rotationMerchant}>
                            {tx.merchant_name || 'Rotation Withdrawal'}
                          </Text>
                          <Text style={styles.rotationSub}>
                            Rotated by {tx.recorder_name?.split(' ')[0] || 'User'} •{' '}
                            {tx.card_name || 'Card'} (**{tx.last_4_digits || '0000'})
                          </Text>
                        </View>

                        <View style={styles.rotationAmountCol}>
                          <Text style={styles.rotationAmount}>₹{currentDue.toLocaleString('en-IN')}</Text>
                          <View
                            style={[
                              styles.statusBadge,
                              isPartial ? styles.partialBadge : styles.pendingBadgeSmall,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isPartial ? styles.partialBadgeText : styles.pendingBadgeTextSmall,
                              ]}
                            >
                              {isPartial ? 'Partially Settled' : 'Pending'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {tx.remarks ? (
                        <Text style={styles.rotationRemarks}>"{tx.remarks}"</Text>
                      ) : null}

                      <View style={styles.rotationDivider} />

                      <View style={styles.rotationBottomRow}>
                        <Text style={styles.rotationDate}>
                          Date: {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent'}
                        </Text>

                        <HapticButton
                          style={styles.settleBtn}
                          onPress={() => openSettleModal(tx)}
                          feedbackType="rigid"
                        >
                          <CheckCircle2 size={13} color="#FFFFFF" />
                          <Text style={styles.settleBtnText}>Settle Now</Text>
                        </HapticButton>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 2: QR VAULT */}
          {activeTab === 'vault' && (
            <View style={styles.tabSection}>
              {/* Cooldown Alert Banner */}
              {activeCooldowns.length > 0 && (
                <View style={styles.coolingBanner}>
                  <Timer size={14} color="#D97706" />
                  <Text style={styles.coolingBannerText}>
                    {activeCooldowns.length} QR{activeCooldowns.length > 1 ? 's' : ''} currently in 24h cooling cycle.
                  </Text>
                </View>
              )}

              <Text style={styles.qrSectionTitle}>Operational Merchant QRs</Text>

              <View style={styles.qrGrid}>
                {qrs.map((qr) => {
                  const cooldown = activeCooldowns.find((c) => c.qrId === qr.id);
                  const isCooling = !!cooldown;

                  return (
                    <TouchableOpacity
                      key={qr.id}
                      style={[styles.qrCard, isCooling && styles.qrCardCooling]}
                      onPress={() => openQrPaymentModal(qr)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.qrCardTop}>
                        <View style={styles.qrIconBadge}>
                          <QrCode size={18} color="#1B4D3E" />
                        </View>
                        <View
                          style={[
                            styles.qrStatusPill,
                            isCooling ? styles.qrStatusCooling : styles.qrStatusActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.qrStatusText,
                              isCooling ? styles.qrStatusTextCooling : styles.qrStatusTextActive,
                            ]}
                          >
                            {isCooling ? 'Cooling' : 'Active'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.qrName} numberOfLines={1}>
                        {qr.merchant_name}
                      </Text>
                      <Text style={styles.qrPlatform}>{qr.platform || 'UPI QR'}</Text>

                      <View style={styles.qrFooterRow}>
                        <Text style={styles.qrSettlementTime}>
                          {qr.settlement_time || 'T+0 Instant'}
                        </Text>
                        <ArrowRight size={13} color="#2D7A5D" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* TAB 3: SETTLED HISTORY */}
          {activeTab === 'history' && (
            <View style={styles.tabSection}>
              {filteredSettled.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <Clock size={32} color={CedarColors.ink500} />
                  </View>
                  <Text style={styles.emptyTitle}>No Settled Records</Text>
                  <Text style={styles.emptySub}>
                    Completed settlements will appear here chronologically.
                  </Text>
                </View>
              ) : (
                filteredSettled.map((tx) => (
                  <View key={tx.id} style={styles.historyCard}>
                    <View style={styles.historyTopRow}>
                      <View style={styles.historyIconBox}>
                        <CheckCircle2 size={16} color="#2D7A5D" />
                      </View>
                      <View style={styles.historyInfoCol}>
                        <Text style={styles.historyTitle}>
                          {tx.merchant_name || 'Settled Rotation'}
                        </Text>
                        <Text style={styles.historySubtitle}>
                          Settled to {tx.settled_to_name || 'User'} • {tx.card_name || 'Card'}
                        </Text>
                      </View>
                      <View style={styles.historyAmountCol}>
                        <Text style={styles.historyAmount}>+₹{Number(tx.amount).toLocaleString('en-IN')}</Text>
                        <Text style={styles.historyDate}>
                          {tx.settled_date || tx.transaction_date}
                        </Text>
                      </View>
                    </View>

                    {tx.remarks ? (
                      <Text style={styles.historyRemarks}>"{tx.remarks}"</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ================= SETTLE NOW MODAL ================= */}
      <Modal visible={isSettleModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Confirm Settlement</Text>
                <Text style={styles.modalSub}>
                  Crediting Cash on Hand from {settleTx?.merchant_name || 'Rotation'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsSettleModalOpen(false)}>
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {/* Type Switcher: Full vs Partial */}
              <View style={styles.settleTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.settleTypeBtn,
                    settlementType === 'full' && styles.settleTypeBtnActive,
                  ]}
                  onPress={() => {
                    setSettlementType('full');
                  }}
                >
                  <Text
                    style={[
                      styles.settleTypeBtnText,
                      settlementType === 'full' && styles.settleTypeBtnTextActive,
                    ]}
                  >
                    Full (₹
                    {(
                      settleTx?.settlement_details?.total_due !== undefined
                        ? Number(settleTx.settlement_details.total_due)
                        : Number(settleTx?.amount || 0)
                    ).toLocaleString('en-IN')}
                    )
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.settleTypeBtn,
                    settlementType === 'partial' && styles.settleTypeBtnActive,
                  ]}
                  onPress={() => {
                    setSettlementType('partial');
                  }}
                >
                  <Text
                    style={[
                      styles.settleTypeBtnText,
                      settlementType === 'partial' && styles.settleTypeBtnTextActive,
                    ]}
                  >
                    Partial Amount
                  </Text>
                </TouchableOpacity>
              </View>

              {settlementType === 'partial' && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Partial Amount (₹)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter received amount"
                    placeholderTextColor={CedarColors.ink500}
                    keyboardType="numeric"
                    value={partialAmount}
                    onChangeText={setPartialAmount}
                  />
                </View>
              )}

              {/* Recipient User Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cash Receiver</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                  {profiles.map((p) => {
                    const isSelected = cashReceiverId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.userPill, isSelected && styles.userPillActive]}
                        onPress={() => {
                          setCashReceiverId(p.id);
                        }}
                      >
                        <Text style={[styles.userPillText, isSelected && styles.userPillTextActive]}>
                          {p.name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Target Card Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Target Card (Ledger Destination)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                  {cards.map((c) => {
                    const isSelected = settleTargetCardId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.cardPill, isSelected && styles.cardPillActive]}
                        onPress={() => {
                          setSettleTargetCardId(c.id);
                        }}
                      >
                        <Text style={[styles.cardPillText, isSelected && styles.cardPillTextActive]}>
                          {c.card_name} (**{c.last_4_digits})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Remarks */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Settlement Note (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Received via NEFT / Cash"
                  placeholderTextColor={CedarColors.ink500}
                  value={settleRemarks}
                  onChangeText={setSettleRemarks}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <HapticButton
                style={[styles.confirmBtn, isSettling && styles.confirmBtnDisabled]}
                onPress={handleConfirmSettlement}
                disabled={isSettling}
                feedbackType="rigid"
              >
                {isSettling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.confirmBtnText}>Confirm Settlement</Text>
                  </>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MANUAL WITHDRAWAL MODAL ================= */}
      <Modal visible={isNewWithdrawalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Record Rotation Withdrawal</Text>
                <Text style={styles.modalSub}>Swiping Card at Merchant QR</Text>
              </View>
              <TouchableOpacity onPress={() => setIsNewWithdrawalOpen(false)}>
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter swipe amount"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="numeric"
                  value={manualAmount}
                  onChangeText={setManualAmount}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Select Card</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                  {cards.map((c) => {
                    const isSelected = manualCardId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.cardPill, isSelected && styles.cardPillActive]}
                        onPress={() => {
                          setManualCardId(c.id);
                        }}
                      >
                        <Text style={[styles.cardPillText, isSelected && styles.cardPillTextActive]}>
                          {c.card_name} (**{c.last_4_digits})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Select Merchant QR</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                  {qrs.map((q) => {
                    const isSelected = manualQrId === q.id;
                    return (
                      <TouchableOpacity
                        key={q.id}
                        style={[styles.userPill, isSelected && styles.userPillActive]}
                        onPress={() => {
                          setManualQrId(q.id);
                        }}
                      >
                        <Text style={[styles.userPillText, isSelected && styles.userPillTextActive]}>
                          {q.merchant_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Remarks</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Optional notes"
                  placeholderTextColor={CedarColors.ink500}
                  value={manualRemarks}
                  onChangeText={setManualRemarks}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <HapticButton
                style={[styles.confirmBtn, isSavingWithdrawal && styles.confirmBtnDisabled]}
                onPress={handleSaveManualWithdrawal}
                disabled={isSavingWithdrawal}
                feedbackType="rigid"
              >
                {isSavingWithdrawal ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.confirmBtnText}>Record Withdrawal</Text>
                  </>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= QR PAYMENT GENERATOR MODAL ================= */}
      {selectedQrForPayment && (
        <Modal visible={!!selectedQrForPayment} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selectedQrForPayment.merchant_name}</Text>
                  <Text style={styles.modalSub}>{selectedQrForPayment.platform || 'UPI QR'}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedQrForPayment(null)}>
                  <X size={18} color={CedarColors.ink700} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                {/* Single vs Split Mode */}
                <View style={styles.settleTypeRow}>
                  <TouchableOpacity
                    style={[styles.settleTypeBtn, paymentMode === 'once' && styles.settleTypeBtnActive]}
                    onPress={() => {
                      setPaymentMode('once');
                      setGeneratedAmounts([Number(qrPayAmount) || 0]);
                    }}
                  >
                    <Text
                      style={[
                        styles.settleTypeBtnText,
                        paymentMode === 'once' && styles.settleTypeBtnTextActive,
                      ]}
                    >
                      Single Swipe
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.settleTypeBtn,
                      paymentMode === 'multiple' && styles.settleTypeBtnActive,
                    ]}
                    onPress={() => {
                      setPaymentMode('multiple');
                      setGeneratedAmounts(generateSplits(Number(qrPayAmount) || 0, splitCount));
                    }}
                  >
                    <Text
                      style={[
                        styles.settleTypeBtnText,
                        paymentMode === 'multiple' && styles.settleTypeBtnTextActive,
                      ]}
                    >
                      Split Swipes
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Total Target Amount */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Total Amount (₹)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={qrPayAmount}
                    onChangeText={handleAmountChange}
                    keyboardType="numeric"
                  />
                </View>

                {/* Split Counts if multiple */}
                {paymentMode === 'multiple' && (
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Split Into Swipes</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[2, 3, 4, 5].map((cnt) => (
                        <TouchableOpacity
                          key={cnt}
                          style={[
                            styles.userPill,
                            splitCount === cnt && styles.userPillActive,
                            { flex: 1, alignItems: 'center' },
                          ]}
                          onPress={() => {
                            handleSplitCountChange(cnt);
                          }}
                        >
                          <Text
                            style={[
                              styles.userPillText,
                              splitCount === cnt && styles.userPillTextActive,
                            ]}
                          >
                            {cnt}x
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Generated Amounts Badges */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Generated Swipe Amounts</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {generatedAmounts.map((amt, idx) => (
                      <View key={idx} style={styles.splitAmountBadge}>
                        <Text style={styles.splitAmountBadgeText}>₹{amt.toLocaleString('en-IN')}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Card Selector */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Card Being Swiped</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                    {cards.map((c) => {
                      const isSelected = selectedPaymentCardId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.cardPill, isSelected && styles.cardPillActive]}
                          onPress={() => {
                            setSelectedPaymentCardId(c.id);
                          }}
                        >
                          <Text style={[styles.cardPillText, isSelected && styles.cardPillTextActive]}>
                            {c.card_name} (**{c.last_4_digits})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <HapticButton
                  style={[styles.confirmBtn, isMarkingRotation && styles.confirmBtnDisabled]}
                  onPress={handleMarkUsedAndSave}
                  disabled={isMarkingRotation}
                  feedbackType="rigid"
                >
                  {isMarkingRotation ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Zap size={18} color="#FFFFFF" strokeWidth={2.5} />
                      <Text style={styles.confirmBtnText}>Mark Used & Save Rotation</Text>
                    </>
                  )}
                </HapticButton>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ================= CARD FILTER MODAL ================= */}
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
                <X size={16} color={CedarColors.ink500} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.menuOption, selectedVaultCardId === 'all' && styles.menuOptionActive]}
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
              {selectedVaultCardId === 'all' && <Check size={14} color="#1B4D3E" />}
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
                    <Text style={[styles.menuOptionText, isSelected && styles.menuOptionTextActive]}>
                      {card.card_name}
                    </Text>
                    <Text style={styles.menuOptionSub}>**{card.last_4_digits}</Text>
                  </View>
                  {isSelected && <Check size={14} color="#1B4D3E" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EFF3EE',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4DA',
    backgroundColor: '#EFF3EE',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarButton: {
    position: 'relative',
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#2D7A5D',
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#071A12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#2D7A5D',
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  avatarStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#EFF3EE',
  },
  headerSub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2D7A5D',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#F6F9F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  vaultPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink900,
    maxWidth: 80,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1B4D3E',
    borderRadius: 12,
  },
  withdrawBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  summaryCardWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 16,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A948C',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  summaryAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F6F9F5',
    marginTop: 2,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F59E0B',
  },
  summaryBottomRow: {
    marginTop: 10,
  },
  summarySub: {
    fontSize: 10,
    color: '#A0ACA2',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EFF3EE',
  },
  tabChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    marginHorizontal: 3,
    borderRadius: 10,
    backgroundColor: '#F6F9F5',
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  activeTabChip: {
    backgroundColor: '#1B4D3E',
    borderColor: '#1B4D3E',
  },
  tabChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  activeTabChipText: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: CedarColors.ink700,
    marginTop: 10,
  },
  contentScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  tabSection: {
    paddingTop: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 11,
    color: CedarColors.ink500,
    textAlign: 'center',
    maxWidth: 240,
  },
  rotationCard: {
    backgroundColor: '#F6F9F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 14,
    marginBottom: 10,
  },
  rotationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rotationMerchantCol: {
    flex: 1,
    marginRight: 8,
  },
  rotationMerchant: {
    fontSize: 13,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  rotationSub: {
    fontSize: 10,
    fontWeight: '600',
    color: CedarColors.ink500,
    marginTop: 2,
  },
  rotationAmountCol: {
    alignItems: 'flex-end',
  },
  rotationAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#E05D52',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  pendingBadgeSmall: {
    backgroundColor: '#FCEBEA',
    borderWidth: 1,
    borderColor: '#F8B4AF',
  },
  pendingBadgeTextSmall: {
    fontSize: 8,
    fontWeight: '800',
    color: '#C53030',
  },
  partialBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  partialBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#B45309',
  },
  rotationRemarks: {
    fontSize: 10,
    fontStyle: 'italic',
    color: CedarColors.ink700,
    marginTop: 6,
  },
  rotationDivider: {
    height: 1,
    backgroundColor: '#DCE4DA',
    marginVertical: 10,
  },
  rotationBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rotationDate: {
    fontSize: 10,
    fontWeight: '700',
    color: CedarColors.ink500,
  },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1B4D3E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  settleBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  coolingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  coolingBannerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },
  qrSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  qrGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  qrCard: {
    width: '48.5%',
    backgroundColor: '#F6F9F5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 12,
  },
  qrCardCooling: {
    opacity: 0.65,
    backgroundColor: '#ECEFEA',
  },
  qrCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  qrIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  qrStatusText: {
    fontSize: 8,
    fontWeight: '800',
  },
  qrStatusActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A3D9A5',
  },
  qrStatusTextActive: {
    fontSize: 8,
    fontWeight: '800',
    color: '#2E944B',
  },
  qrStatusCooling: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  qrStatusTextCooling: {
    fontSize: 8,
    fontWeight: '800',
    color: '#B45309',
  },
  qrName: {
    fontSize: 12,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  qrPlatform: {
    fontSize: 10,
    fontWeight: '600',
    color: CedarColors.ink500,
    marginTop: 1,
  },
  qrFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#DCE4DA',
  },
  qrSettlementTime: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1B4D3E',
  },
  historyCard: {
    backgroundColor: '#F6F9F5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 12,
    marginBottom: 8,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  historyInfoCol: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  historySubtitle: {
    fontSize: 10,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  historyAmountCol: {
    alignItems: 'flex-end',
  },
  historyAmount: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2D7A5D',
  },
  historyDate: {
    fontSize: 9,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  historyRemarks: {
    fontSize: 10,
    fontStyle: 'italic',
    color: CedarColors.ink700,
    marginTop: 6,
    paddingLeft: 44,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#F6F9F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4DA',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  modalSub: {
    fontSize: 10,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  settleTypeRow: {
    flexDirection: 'row',
    backgroundColor: '#E4ECE3',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  settleTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  settleTypeBtnActive: {
    backgroundColor: '#1B4D3E',
  },
  settleTypeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  settleTypeBtnTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  textInput: {
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE4DA',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 12,
    color: CedarColors.ink900,
  },
  pillsScroll: {
    flexDirection: 'row',
  },
  userPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#E4ECE3',
    marginRight: 6,
  },
  userPillActive: {
    backgroundColor: '#1B4D3E',
  },
  userPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  userPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  cardPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#E4ECE3',
    marginRight: 6,
  },
  cardPillActive: {
    backgroundColor: '#1B4D3E',
  },
  cardPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  cardPillTextActive: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  splitAmountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#E4ECE3',
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  splitAmountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1B4D3E',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1B4D3E',
    borderRadius: 14,
    paddingVertical: 14,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  filterMenuBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#F6F9F5',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterMenuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  menuOptionActive: {
    backgroundColor: '#E4ECE3',
  },
  menuOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  menuOptionTextActive: {
    color: '#1B4D3E',
    fontWeight: '800',
  },
  menuOptionSub: {
    fontSize: 10,
    color: CedarColors.ink500,
  },
});
