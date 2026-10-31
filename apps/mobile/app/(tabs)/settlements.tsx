import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { supabase } from '../../lib/supabase';
import * as Haptics from 'expo-haptics';
import {
  QrCode,
  ShieldCheck,
  Clock,
  CheckCircle2,
  ChevronRight,
  Plus,
  X,
  CreditCard,
  User,
  ArrowRight,
} from 'lucide-react-native';

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
  settlement_details?: any;
  card_name?: string;
  last_4_digits?: string;
  merchant_name?: string;
  recorder_name?: string;
}

interface Profile {
  id: string;
  name: string;
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
}

interface QRData {
  id: string;
  merchant_name: string;
  status?: string;
}

export default function SettlementsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'vault' | 'history'>('pending');

  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  const [settledTxs, setSettledTxs] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [qrs, setQrs] = useState<QRData[]>([]);

  // Settle Modal State
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [settleType, setSettleType] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState('');
  const [cashReceiverId, setCashReceiverId] = useState('');
  const [targetCardId, setTargetCardId] = useState('');
  const [settleRemarks, setSettleRemarks] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  // New Rotation Withdrawal Modal
  const [isNewWithdrawalOpen, setIsNewWithdrawalOpen] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newCardId, setNewCardId] = useState('');
  const [newQrId, setNewQrId] = useState('');
  const [newRemarks, setNewRemarks] = useState('');
  const [isSavingWithdrawal, setIsSavingWithdrawal] = useState(false);

  const fetchSettlementsData = useCallback(async () => {
    try {
      // 1. Fetch auxiliary data
      const [cardsRes, profilesRes, qrsRes] = await Promise.all([
        supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        supabase.from('profiles').select('id, name'),
        supabase.from('qrs').select('*'),
      ]);

      const cardsData: CardData[] = cardsRes.data || [];
      const profilesData: Profile[] = profilesRes.data || [];
      const qrsData: QRData[] = qrsRes.data || [];

      setCards(cardsData);
      setProfiles(profilesData);
      setQrs(qrsData);

      if (cardsData.length > 0 && !newCardId) setNewCardId(cardsData[0].id);
      if (qrsData.length > 0 && !newQrId) setNewQrId(qrsData[0].id);
      if (profilesData.length > 0 && !cashReceiverId) setCashReceiverId(profilesData[0].id);

      // 2. Fetch withdrawal transactions
      const { data: txsData } = await supabase
        .from('card_transactions')
        .select('*')
        .eq('type', 'withdrawal')
        .order('transaction_date', { ascending: false });

      if (txsData) {
        const enriched: Transaction[] = txsData.map((t) => {
          const card = cardsData.find((c) => c.id === t.card_id);
          const qr = qrsData.find((q) => q.id === t.qr_id);
          const recorder = profilesData.find((p) => p.id === t.recorded_by);

          return {
            ...t,
            card_name: card?.card_name,
            last_4_digits: card?.last_4_digits,
            merchant_name: qr?.merchant_name,
            recorder_name: recorder?.name,
          };
        });

        const pending = enriched.filter((t) => t.status === 'pending_settlement' || t.status === 'partially_settled');
        const history = enriched.filter((t) => t.status === 'settled');

        setPendingTxs(pending);
        setSettledTxs(history);
      }
    } catch (err) {
      console.error('Error fetching settlements data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [cashReceiverId, newCardId, newQrId]);

  useEffect(() => {
    fetchSettlementsData();

    const channel = supabase
      .channel('mobile-settlements-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchSettlementsData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchSettlementsData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettlementsData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSettlementsData();
  };

  const openSettleModal = (tx: Transaction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    setSelectedTx(tx);
    setSettleType('full');
    setPartialAmount('');
    setTargetCardId(tx.card_id || (cards[0]?.id || ''));
    setSettleRemarks('');
    setIsSettleModalOpen(true);
  };

  const handleConfirmSettle = async () => {
    if (!selectedTx) return;

    const remainingDue =
      selectedTx.status === 'partially_settled' && selectedTx.settlement_details?.total_due !== undefined
        ? Number(selectedTx.settlement_details.total_due)
        : Number(selectedTx.amount);

    let amountToSettle = remainingDue;
    if (settleType === 'partial') {
      const pAmt = parseFloat(partialAmount);
      if (!pAmt || pAmt <= 0 || pAmt > remainingDue) {
        Alert.alert('Invalid Amount', `Please enter a valid partial amount up to ₹${remainingDue.toLocaleString('en-IN')}`);
        return;
      }
      amountToSettle = pAmt;
    }

    setIsSettling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const isNowFullySettled = amountToSettle >= remainingDue;
      const newStatus = isNowFullySettled ? 'settled' : 'partially_settled';

      const existingHistory = selectedTx.settlement_details?.history || [];
      const newHistoryEntry = {
        settle_id: Math.random().toString(36).slice(2, 9),
        amount: amountToSettle,
        settled_date: todayIso,
        settled_to_user: cashReceiverId,
        card_id: targetCardId,
        remarks: settleRemarks || undefined,
      };

      const updatedDetails = {
        total_settled: (selectedTx.settlement_details?.total_settled || 0) + amountToSettle,
        total_due: Math.max(0, remainingDue - amountToSettle),
        history: [...existingHistory, newHistoryEntry],
      };

      // 1. Update card transaction status and settlement details
      await supabase
        .from('card_transactions')
        .update({
          status: newStatus,
          settled_to_user: cashReceiverId,
          settled_date: isNowFullySettled ? todayIso : undefined,
          settlement_details: updatedDetails,
        })
        .eq('id', selectedTx.id);

      // 2. Increment cash_on_hand for receiver & card
      const { data: existingCoh } = await supabase
        .from('cash_on_hand')
        .select('*')
        .eq('user_id', cashReceiverId)
        .eq('card_id', targetCardId)
        .maybeSingle();

      if (existingCoh) {
        await supabase
          .from('cash_on_hand')
          .update({
            current_balance: Number(existingCoh.current_balance || 0) + amountToSettle,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingCoh.id);
      } else {
        await supabase.from('cash_on_hand').insert({
          user_id: cashReceiverId,
          card_id: targetCardId,
          current_balance: amountToSettle,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSettleModalOpen(false);
      setSelectedTx(null);
      fetchSettlementsData();
    } catch (err: any) {
      Alert.alert('Settlement Error', err?.message || 'Failed to complete settlement.');
    } finally {
      setIsSettling(false);
    }
  };

  const handleCreateWithdrawal = async () => {
    if (!newAmount || parseFloat(newAmount) <= 0) {
      Alert.alert('Required', 'Please enter a valid rotation withdrawal amount.');
      return;
    }

    setIsSavingWithdrawal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      await supabase.from('card_transactions').insert({
        card_id: newCardId,
        qr_id: newQrId || null,
        amount: parseFloat(newAmount),
        type: 'withdrawal',
        status: 'pending_settlement',
        remarks: newRemarks || 'Instant Rotation Withdrawal',
        transaction_date: todayIso,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsNewWithdrawalOpen(false);
      setNewAmount('');
      setNewRemarks('');
      fetchSettlementsData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create rotation withdrawal.');
    } finally {
      setIsSavingWithdrawal(false);
    }
  };

  const totalPendingAmount = pendingTxs.reduce((sum, t) => {
    const due =
      t.status === 'partially_settled' && t.settlement_details?.total_due !== undefined
        ? Number(t.settlement_details.total_due)
        : Number(t.amount);
    return sum + due;
  }, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Settlements & QR</Text>
          <Text style={styles.headerSubtitle}>Rotation Clearance & Cash Vault</Text>
        </View>

        <HapticButton
          style={styles.newBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
            setIsNewWithdrawalOpen(true);
          }}
          feedbackType="rigid"
        >
          <Plus size={16} color="#F6F9F5" strokeWidth={2.5} />
          <Text style={styles.newBtnText}>Withdraw</Text>
        </HapticButton>
      </View>

      {/* Floating Pending Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryBadge}>
            <Clock size={14} color="#D97706" />
            <Text style={styles.summaryBadgeText}>Active Rotation Queue</Text>
          </View>
          <Text style={styles.queueCount}>{pendingTxs.length} Pending</Text>
        </View>

        <Text style={styles.summaryAmount}>₹{totalPendingAmount.toLocaleString('en-IN')}</Text>
        <Text style={styles.summarySub}>Total un-settled rotation cash in transit</Text>
      </View>

      {/* 3 Tab Navigation Pills */}
      <View style={styles.tabRow}>
        {(['pending', 'vault', 'history'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === 'pending' ? 'Pending Settle' : tab === 'vault' ? 'QR Merchants' : 'Settled History';
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, isActive && styles.activeTabChip]}
              onPress={() => {
                Haptics.selectionAsync();
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

      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CedarColors.forest800}
            colors={[CedarColors.forest800]}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={CedarColors.forest800} />
            <Text style={styles.loadingText}>Syncing Settlements...</Text>
          </View>
        ) : activeTab === 'pending' ? (
          pendingTxs.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <CheckCircle2 size={32} color="#2E944B" strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>All Rotations Cleared</Text>
              <Text style={styles.emptySubtitle}>No pending rotation withdrawals need settlement.</Text>
            </View>
          ) : (
            pendingTxs.map((t) => {
              const due =
                t.status === 'partially_settled' && t.settlement_details?.total_due !== undefined
                  ? Number(t.settlement_details.total_due)
                  : Number(t.amount);

              return (
                <View key={t.id} style={styles.pendingCard}>
                  <View style={styles.pendingCardMain}>
                    <View style={styles.pendingLeft}>
                      <View style={styles.qrBadgeCircle}>
                        <QrCode size={18} color={CedarColors.forest800} strokeWidth={2.4} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pendingMerchant}>
                          {t.merchant_name || 'Rotation Withdrawal'}
                        </Text>
                        <Text style={styles.pendingMeta}>
                          {t.card_name || 'Card'} • {t.transaction_date}
                        </Text>
                        {t.remarks && <Text style={styles.pendingRemarks}>{t.remarks}</Text>}
                      </View>
                    </View>

                    <View style={styles.pendingRight}>
                      <Text style={styles.pendingDueAmount}>₹{due.toLocaleString('en-IN')}</Text>
                      {t.status === 'partially_settled' && (
                        <View style={styles.partialBadge}>
                          <Text style={styles.partialBadgeText}>Partially Settled</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Settle Action Button */}
                  <HapticButton
                    style={styles.settleActionBtn}
                    onPress={() => openSettleModal(t)}
                    feedbackType="rigid"
                  >
                    <ShieldCheck size={16} color="#F6F9F5" strokeWidth={2.4} />
                    <Text style={styles.settleActionText}>Settle to Cash Vault</Text>
                  </HapticButton>
                </View>
              );
            })
          )
        ) : activeTab === 'vault' ? (
          <View style={styles.qrGrid}>
            {qrs.map((q) => (
              <View key={q.id} style={styles.qrCard}>
                <View style={styles.qrIconBadge}>
                  <QrCode size={22} color={CedarColors.forest800} strokeWidth={2.4} />
                </View>
                <Text style={styles.qrCardTitle}>{q.merchant_name}</Text>
                <Text style={styles.qrCardStatus}>Ready for Instant Scan</Text>
              </View>
            ))}
          </View>
        ) : (
          settledTxs.map((t) => (
            <View key={t.id} style={styles.historyCard}>
              <View style={styles.historyIcon}>
                <CheckCircle2 size={18} color="#2E944B" strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>{t.merchant_name || 'Settled Rotation'}</Text>
                <Text style={styles.historyMeta}>
                  {t.card_name} • Settled on {t.settled_date || t.transaction_date}
                </Text>
              </View>
              <Text style={styles.historyAmount}>₹{Number(t.amount).toLocaleString('en-IN')}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Settle Modal */}
      <Modal
        visible={isSettleModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsSettleModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Settle Rotation Cash</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsSettleModalOpen(false);
                }}
              >
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            {selectedTx && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalBanner}>
                  <Text style={styles.modalBannerSub}>Pending Clearance</Text>
                  <Text style={styles.modalBannerAmount}>
                    ₹
                    {(
                      selectedTx.status === 'partially_settled' &&
                      selectedTx.settlement_details?.total_due !== undefined
                        ? Number(selectedTx.settlement_details.total_due)
                        : Number(selectedTx.amount)
                    ).toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* Settle Type (Full vs Partial) */}
                <Text style={styles.inputLabel}>Settlement Type</Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity
                    style={[styles.typeBtn, settleType === 'full' && styles.activeTypeBtn]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSettleType('full');
                    }}
                  >
                    <Text style={[styles.typeText, settleType === 'full' && styles.activeTypeText]}>
                      Full Settlement
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeBtn, settleType === 'partial' && styles.activeTypeBtn]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSettleType('partial');
                    }}
                  >
                    <Text style={[styles.typeText, settleType === 'partial' && styles.activeTypeText]}>
                      Partial Settlement
                    </Text>
                  </TouchableOpacity>
                </View>

                {settleType === 'partial' && (
                  <>
                    <Text style={styles.inputLabel}>Partial Amount (₹)</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Enter amount to settle"
                      placeholderTextColor={CedarColors.ink500}
                      keyboardType="numeric"
                      value={partialAmount}
                      onChangeText={setPartialAmount}
                    />
                  </>
                )}

                {/* Cash Receiver Profile */}
                <Text style={styles.inputLabel}>Cash Received By</Text>
                <View style={styles.pillRow}>
                  {profiles.map((p) => {
                    const isSel = cashReceiverId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.profilePill, isSel && styles.activeProfilePill]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setCashReceiverId(p.id);
                        }}
                      >
                        <User size={14} color={isSel ? CedarColors.forest800 : CedarColors.ink500} />
                        <Text style={[styles.profilePillText, isSel && styles.activeProfilePillText]}>
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Target Card Selection */}
                <Text style={styles.inputLabel}>Deposit Against Card</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
                  {cards.map((c) => {
                    const isSel = targetCardId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.cardPill, isSel && styles.activeCardPill]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setTargetCardId(c.id);
                        }}
                      >
                        <CreditCard size={13} color={isSel ? CedarColors.forest800 : CedarColors.ink500} />
                        <Text style={[styles.cardPillText, isSel && styles.activeCardPillText]}>
                          {c.card_name} (••{c.last_4_digits})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Settle Remarks */}
                <Text style={styles.inputLabel}>Remarks / Reference</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Optional settlement notes"
                  placeholderTextColor={CedarColors.ink500}
                  value={settleRemarks}
                  onChangeText={setSettleRemarks}
                />

                <HapticButton
                  style={styles.confirmSettleBtn}
                  onPress={handleConfirmSettle}
                  feedbackType="rigid"
                  disabled={isSettling}
                >
                  {isSettling ? (
                    <ActivityIndicator size="small" color="#F6F9F5" />
                  ) : (
                    <Text style={styles.confirmSettleText}>Confirm & Deposit to Cash Vault</Text>
                  )}
                </HapticButton>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* New Rotation Withdrawal Modal */}
      <Modal
        visible={isNewWithdrawalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsNewWithdrawalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Rotation Withdrawal</Text>
              <TouchableOpacity onPress={() => setIsNewWithdrawalOpen(false)}>
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Withdrawal Amount (₹)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 50000"
                placeholderTextColor={CedarColors.ink500}
                keyboardType="numeric"
                value={newAmount}
                onChangeText={setNewAmount}
              />

              <Text style={styles.inputLabel}>Select Source Card</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
                {cards.map((c) => {
                  const isSel = newCardId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.cardPill, isSel && styles.activeCardPill]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setNewCardId(c.id);
                      }}
                    >
                      <Text style={[styles.cardPillText, isSel && styles.activeCardPillText]}>
                        {c.card_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Select QR Merchant</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
                {qrs.map((q) => {
                  const isSel = newQrId === q.id;
                  return (
                    <TouchableOpacity
                      key={q.id}
                      style={[styles.cardPill, isSel && styles.activeCardPill]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setNewQrId(q.id);
                      }}
                    >
                      <Text style={[styles.cardPillText, isSel && styles.activeCardPillText]}>
                        {q.merchant_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Remarks</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Rotation for BPCL card"
                placeholderTextColor={CedarColors.ink500}
                value={newRemarks}
                onChangeText={setNewRemarks}
              />

              <HapticButton
                style={styles.confirmSettleBtn}
                onPress={handleCreateWithdrawal}
                feedbackType="rigid"
                disabled={isSavingWithdrawal}
              >
                {isSavingWithdrawal ? (
                  <ActivityIndicator size="small" color="#F6F9F5" />
                ) : (
                  <Text style={styles.confirmSettleText}>Initiate Withdrawal Queue</Text>
                )}
              </HapticButton>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.canvas,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CedarColors.forest800,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  newBtnText: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 24,
    padding: 16,
    backgroundColor: CedarColors.forest900,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(217, 119, 6, 0.18)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FCD34D',
    fontWeight: '700',
  },
  queueCount: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F6F9F5',
    opacity: 0.8,
  },
  summaryAmount: {
    fontSize: 24,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  summarySub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 10,
  },
  tabChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: CedarColors.cardAlt,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  activeTabChip: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  tabChipText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '600',
    color: CedarColors.ink700,
  },
  activeTabChipText: {
    color: '#F6F9F5',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 8,
  },
  emptyBox: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(46, 148, 75, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 4,
  },
  pendingCard: {
    backgroundColor: CedarColors.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pendingCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  pendingLeft: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
  },
  qrBadgeCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingMerchant: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
  },
  pendingMeta: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  pendingRemarks: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
    marginTop: 3,
  },
  pendingRight: {
    alignItems: 'flex-end',
  },
  pendingDueAmount: {
    fontSize: 16,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  partialBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginTop: 3,
  },
  partialBadgeText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#D97706',
    fontWeight: '700',
  },
  settleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CedarColors.forest800,
    borderRadius: 14,
    paddingVertical: 10,
  },
  settleActionText: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  qrGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  qrCard: {
    width: '48%',
    backgroundColor: CedarColors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  qrIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  qrCardTitle: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  qrCardStatus: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  historyIcon: {
    marginRight: 10,
  },
  historyTitle: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
  },
  historyMeta: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#2E944B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 26, 18, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: CedarColors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 22,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  modalBanner: {
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  modalBannerSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  modalBannerAmount: {
    fontSize: 22,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
    marginBottom: 6,
    marginTop: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
    alignItems: 'center',
  },
  activeTypeBtn: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  typeText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeTypeText: {
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  modalInput: {
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  activeProfilePill: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  profilePillText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  activeProfilePillText: {
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  cardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  activeCardPill: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  cardPillText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  activeCardPillText: {
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  confirmSettleBtn: {
    backgroundColor: CedarColors.forest800,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  confirmSettleText: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
});
