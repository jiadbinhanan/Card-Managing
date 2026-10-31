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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { supabase } from '../../lib/supabase';
import * as Haptics from 'expo-haptics';
import {
  Plus,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Wallet,
  Receipt,
  CheckCircle2,
  Clock,
  ChevronDown,
  X,
  Calendar,
  Layers,
} from 'lucide-react-native';

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
}

interface ProfileData {
  id: string;
  name: string;
}

interface QRData {
  id: string;
  merchant_name: string;
}

interface UnifiedTx {
  id: string;
  kind: 'rotation' | 'spend' | 'bill_pay';
  title: string;
  category: string;
  amount: number;
  date: string;
  rawDate: string;
  status: string;
  cardId?: string;
  cardName?: string;
  userId?: string;
  userName?: string;
  remarks?: string;
}

export default function TransactionsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'rotations' | 'spends' | 'bill_paid'>('all');

  // Filters
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<'all' | 'today' | 'month'>('all');
  const [selectedCardId, setSelectedCardId] = useState<string>('all');

  // Data
  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [allProfiles, setAllProfiles] = useState<ProfileData[]>([]);
  const [allQrs, setAllQrs] = useState<QRData[]>([]);
  const [transactionsList, setTransactionsList] = useState<UnifiedTx[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Record Entry Modal
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryType, setEntryType] = useState<'rotate' | 'spend' | 'bill'>('rotate');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formCardId, setFormCardId] = useState('');
  const [formQrId, setFormQrId] = useState('');
  const [formSpendMethod, setFormSpendMethod] = useState<'credit_card' | 'cash_on_hand'>('credit_card');
  const [formBillMethod, setFormBillMethod] = useState<'cash_on_hand' | 'own_pocket'>('cash_on_hand');
  const [formUserId, setFormUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTransactionsData = useCallback(async () => {
    try {
      // 1. Fetch Cards, Profiles, QRs in parallel
      const [cardsRes, profilesRes, qrsRes] = await Promise.all([
        supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        supabase.from('profiles').select('id, name'),
        supabase.from('qrs').select('id, merchant_name'),
      ]);

      const cards: CardData[] = cardsRes.data || [];
      const profiles: ProfileData[] = profilesRes.data || [];
      const qrs: QRData[] = qrsRes.data || [];

      setAllCards(cards);
      setAllProfiles(profiles);
      setAllQrs(qrs);

      if (cards.length > 0 && !formCardId) {
        setFormCardId(cards[0].id);
      }
      if (profiles.length > 0 && !formUserId) {
        setFormUserId(profiles[0].id);
      }
      if (qrs.length > 0 && !formQrId) {
        setFormQrId(qrs[0].id);
      }

      // 2. Fetch Card Transactions & Spends
      const [txsRes, spendsRes] = await Promise.all([
        supabase.from('card_transactions').select('*').order('transaction_date', { ascending: false }),
        supabase.from('spends').select('*').order('spend_date', { ascending: false }),
      ]);

      const rawTxs = txsRes.data || [];
      const rawSpends = spendsRes.data || [];

      const unified: UnifiedTx[] = [];

      rawTxs.forEach((t) => {
        const isPayment = t.type === 'bill_payment';
        const card = cards.find((c) => c.id === t.card_id);
        const profile = profiles.find((p) => p.id === t.recorded_by);
        const qr = qrs.find((q) => q.id === t.qr_id);

        unified.push({
          id: t.id,
          kind: isPayment ? 'bill_pay' : 'rotation',
          title: isPayment
            ? `Bill Pay • ${card?.card_name || 'Card'}`
            : `Rotation • ${qr?.merchant_name || 'QR Withdrawal'}`,
          category: isPayment ? 'Bill Payment' : 'Card Rotation',
          amount: Number(t.amount || 0),
          date: t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent',
          rawDate: t.transaction_date || '',
          status: t.status || 'settled',
          cardId: t.card_id,
          cardName: card?.card_name,
          userId: t.recorded_by,
          userName: profile?.name,
          remarks: t.remarks || undefined,
        });
      });

      rawSpends.forEach((s) => {
        const card = cards.find((c) => c.id === s.card_id);
        const profile = profiles.find((p) => p.id === s.user_id);

        unified.push({
          id: s.id,
          kind: 'spend',
          title: s.remarks || `${s.spend_type || 'Personal'} Expense`,
          category: s.payment_method === 'cash_on_hand' ? 'Cash Spend' : 'Card Spend',
          amount: Number(s.amount || 0),
          date: s.spend_date ? new Date(s.spend_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent',
          rawDate: s.spend_date || '',
          status: 'recorded',
          cardId: s.card_id,
          cardName: card?.card_name,
          userId: s.user_id,
          userName: profile?.name,
          remarks: s.remarks || undefined,
        });
      });

      // Sort unified by date desc
      unified.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());

      setTransactionsList(unified);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [formCardId, formQrId, formUserId]);

  useEffect(() => {
    fetchTransactionsData();

    const channel = supabase
      .channel('mobile-transactions-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchTransactionsData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchTransactionsData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTransactionsData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransactionsData();
  };

  // Filtered List
  const filteredList = useMemo(() => {
    return transactionsList.filter((item) => {
      // Tab filter
      if (activeTab === 'rotations' && item.kind !== 'rotation') return false;
      if (activeTab === 'spends' && item.kind !== 'spend') return false;
      if (activeTab === 'bill_paid' && item.kind !== 'bill_pay') return false;

      // Card filter
      if (selectedCardId !== 'all' && item.cardId !== selectedCardId) return false;

      // User filter
      if (filterUser !== 'all' && item.userId !== filterUser) return false;

      // Date filter
      if (filterDate !== 'all' && item.rawDate) {
        const itemDate = new Date(item.rawDate);
        const now = new Date();
        if (filterDate === 'today') {
          const isToday = itemDate.toDateString() === now.toDateString();
          if (!isToday) return false;
        } else if (filterDate === 'month') {
          const isThisMonth = itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
          if (!isThisMonth) return false;
        }
      }

      return true;
    });
  }, [transactionsList, activeTab, selectedCardId, filterUser, filterDate]);

  // Submit Record Entry
  const handleRecordEntry = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const numAmt = parseFloat(amount);
      const todayIso = new Date().toISOString().slice(0, 10);

      if (entryType === 'rotate') {
        await supabase.from('card_transactions').insert({
          card_id: formCardId,
          type: 'withdrawal',
          amount: numAmt,
          qr_id: formQrId || null,
          remarks: remarks || 'Rotation Withdrawal',
          status: 'pending_settlement',
          transaction_date: todayIso,
          recorded_by: formUserId || null,
        });
      } else if (entryType === 'spend') {
        await supabase.from('spends').insert({
          user_id: formUserId,
          card_id: formSpendMethod === 'credit_card' ? formCardId : null,
          amount: numAmt,
          spend_type: 'Personal',
          payment_method: formSpendMethod,
          remarks: remarks || 'Personal Expense',
          spend_date: todayIso,
        });
      } else if (entryType === 'bill') {
        await supabase.from('card_transactions').insert({
          card_id: formCardId,
          type: 'bill_payment',
          amount: numAmt,
          payment_method: formBillMethod,
          remarks: remarks || 'Card Bill Repayment',
          status: 'settled',
          transaction_date: todayIso,
          recorded_by: formUserId || null,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEntryModalOpen(false);
      setAmount('');
      setRemarks('');
      fetchTransactionsData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Transactions</Text>
          <Text style={styles.headerSubtitle}>Vault & Ledger Master Feed</Text>
        </View>

        <HapticButton
          style={styles.addBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
            setIsEntryModalOpen(true);
          }}
          feedbackType="rigid"
        >
          <Plus size={18} color="#F6F9F5" strokeWidth={2.5} />
          <Text style={styles.addBtnText}>Record</Text>
        </HapticButton>
      </View>

      {/* 4 Segmented Filter Tabs */}
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

      {/* Filter Chips Bar (Card, User, Date) */}
      <View style={styles.filterBar}>
        {/* Date Filter Pill */}
        <TouchableOpacity
          style={[styles.miniFilterPill, filterDate !== 'all' && styles.activeMiniFilter]}
          onPress={() => {
            Haptics.selectionAsync();
            setFilterDate((prev) => (prev === 'all' ? 'month' : prev === 'month' ? 'today' : 'all'));
          }}
        >
          <Calendar size={13} color={filterDate !== 'all' ? CedarColors.forest800 : CedarColors.ink500} />
          <Text style={[styles.miniFilterText, filterDate !== 'all' && styles.activeMiniFilterText]}>
            {filterDate === 'all' ? 'All Dates' : filterDate === 'month' ? 'This Month' : 'Today'}
          </Text>
        </TouchableOpacity>

        {/* Card Filter Pill */}
        <TouchableOpacity
          style={[styles.miniFilterPill, selectedCardId !== 'all' && styles.activeMiniFilter]}
          onPress={() => {
            Haptics.selectionAsync();
            if (allCards.length > 0) {
              const currentIdx = allCards.findIndex((c) => c.id === selectedCardId);
              if (selectedCardId === 'all') {
                setSelectedCardId(allCards[0].id);
              } else if (currentIdx < allCards.length - 1) {
                setSelectedCardId(allCards[currentIdx + 1].id);
              } else {
                setSelectedCardId('all');
              }
            }
          }}
        >
          <CreditCard size={13} color={selectedCardId !== 'all' ? CedarColors.forest800 : CedarColors.ink500} />
          <Text style={[styles.miniFilterText, selectedCardId !== 'all' && styles.activeMiniFilterText]} numberOfLines={1}>
            {selectedCardId === 'all'
              ? 'All Cards'
              : allCards.find((c) => c.id === selectedCardId)?.card_name || 'Card'}
          </Text>
        </TouchableOpacity>

        {/* User Filter Pill */}
        <TouchableOpacity
          style={[styles.miniFilterPill, filterUser !== 'all' && styles.activeMiniFilter]}
          onPress={() => {
            Haptics.selectionAsync();
            if (allProfiles.length > 0) {
              const currentIdx = allProfiles.findIndex((p) => p.id === filterUser);
              if (filterUser === 'all') {
                setFilterUser(allProfiles[0].id);
              } else if (currentIdx < allProfiles.length - 1) {
                setFilterUser(allProfiles[currentIdx + 1].id);
              } else {
                setFilterUser('all');
              }
            }
          }}
        >
          <Text style={[styles.miniFilterText, filterUser !== 'all' && styles.activeMiniFilterText]}>
            {filterUser === 'all'
              ? 'All Users'
              : allProfiles.find((p) => p.id === filterUser)?.name || 'User'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Transactions List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
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
            <Text style={styles.loadingText}>Syncing Vault Records...</Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconCircle}>
              <Layers size={28} color={CedarColors.ink500} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>No Transactions Found</Text>
            <Text style={styles.emptySubtitle}>No matching records under selected filter.</Text>
          </View>
        ) : (
          filteredList.map((item) => {
            const isExpanded = expandedId === item.id;
            const isCredit = item.kind === 'bill_pay';

            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.txCard, isExpanded && styles.txCardExpanded]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setExpandedId(isExpanded ? null : item.id);
                }}
                activeOpacity={0.88}
              >
                <View style={styles.txMainRow}>
                  {/* Category Icon Badge */}
                  <View
                    style={[
                      styles.iconCircle,
                      item.kind === 'bill_pay'
                        ? { backgroundColor: 'rgba(46, 148, 75, 0.12)' }
                        : item.kind === 'rotation'
                        ? { backgroundColor: 'rgba(10, 38, 28, 0.08)' }
                        : { backgroundColor: 'rgba(217, 119, 6, 0.12)' },
                    ]}
                  >
                    {item.kind === 'bill_pay' ? (
                      <ArrowDownLeft size={18} color="#2E944B" strokeWidth={2.4} />
                    ) : item.kind === 'rotation' ? (
                      <ArrowUpRight size={18} color={CedarColors.forest800} strokeWidth={2.4} />
                    ) : (
                      <Receipt size={18} color="#D97706" strokeWidth={2.4} />
                    )}
                  </View>

                  {/* Title & Category */}
                  <View style={styles.txTextCol}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.txCategory}>{item.category}</Text>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.txDate}>{item.date}</Text>
                      {item.userName && (
                        <>
                          <Text style={styles.metaDot}>•</Text>
                          <Text style={styles.txUser}>{item.userName}</Text>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Amount & Status Badge */}
                  <View style={styles.txAmountCol}>
                    <Text
                      style={[
                        styles.txAmount,
                        isCredit ? styles.amountPositive : styles.amountNegative,
                      ]}
                    >
                      {isCredit ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        item.status === 'settled' || item.status === 'recorded'
                          ? styles.statusSettled
                          : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          item.status === 'settled' || item.status === 'recorded'
                            ? styles.statusTextSettled
                            : styles.statusTextPending,
                        ]}
                      >
                        {item.status === 'settled'
                          ? 'Settled'
                          : item.status === 'recorded'
                          ? 'Logged'
                          : 'Pending'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Expanded Details Row */}
                {isExpanded && (
                  <View style={styles.expandedDetails}>
                    <View style={styles.expandedDivider} />
                    {item.cardName && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Vault Card:</Text>
                        <Text style={styles.detailValue}>{item.cardName}</Text>
                      </View>
                    )}
                    {item.remarks && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Remarks:</Text>
                        <Text style={styles.detailValue}>{item.remarks}</Text>
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Record ID:</Text>
                      <Text style={styles.detailValueCode}>{item.id.slice(0, 12)}...</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Record Entry Modal */}
      <Modal
        visible={isEntryModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEntryModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record New Entry</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsEntryModalOpen(false);
                }}
                hitSlop={10}
              >
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            {/* Entry Type Selector (Rotate / Spend / Bill) */}
            <View style={styles.entryTypeRow}>
              {(['rotate', 'spend', 'bill'] as const).map((t) => {
                const isActive = entryType === t;
                const label = t === 'rotate' ? 'Rotation' : t === 'spend' ? 'Spend' : 'Bill Pay';
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.entryTypeBtn, isActive && styles.activeEntryTypeBtn]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setEntryType(t);
                    }}
                  >
                    <Text style={[styles.entryTypeText, isActive && styles.activeEntryTypeText]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Form Fields */}
            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* Amount Input */}
              <Text style={styles.inputLabel}>Amount (₹)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 25000"
                placeholderTextColor={CedarColors.ink500}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              {/* Card Selection */}
              <Text style={styles.inputLabel}>Select Vault Card</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
                {allCards.map((c) => {
                  const isSel = formCardId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.cardSelectChip, isSel && styles.activeCardSelectChip]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setFormCardId(c.id);
                      }}
                    >
                      <Text style={[styles.cardSelectText, isSel && styles.activeCardSelectText]}>
                        {c.card_name} (••{c.last_4_digits})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* QR Merchant (Only for Rotate) */}
              {entryType === 'rotate' && allQrs.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>Select QR Merchant</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
                    {allQrs.map((q) => {
                      const isSel = formQrId === q.id;
                      return (
                        <TouchableOpacity
                          key={q.id}
                          style={[styles.cardSelectChip, isSel && styles.activeCardSelectChip]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setFormQrId(q.id);
                          }}
                        >
                          <Text style={[styles.cardSelectText, isSel && styles.activeCardSelectText]}>
                            {q.merchant_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Payment Method (Spend or Bill) */}
              {entryType === 'spend' && (
                <>
                  <Text style={styles.inputLabel}>Payment Method</Text>
                  <View style={styles.methodRow}>
                    <TouchableOpacity
                      style={[styles.methodBtn, formSpendMethod === 'credit_card' && styles.activeMethodBtn]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setFormSpendMethod('credit_card');
                      }}
                    >
                      <Text style={[styles.methodBtnText, formSpendMethod === 'credit_card' && styles.activeMethodBtnText]}>
                        Credit Card
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.methodBtn, formSpendMethod === 'cash_on_hand' && styles.activeMethodBtn]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setFormSpendMethod('cash_on_hand');
                      }}
                    >
                      <Text style={[styles.methodBtnText, formSpendMethod === 'cash_on_hand' && styles.activeMethodBtnText]}>
                        Cash on Hand
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {entryType === 'bill' && (
                <>
                  <Text style={styles.inputLabel}>Paid From</Text>
                  <View style={styles.methodRow}>
                    <TouchableOpacity
                      style={[styles.methodBtn, formBillMethod === 'cash_on_hand' && styles.activeMethodBtn]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setFormBillMethod('cash_on_hand');
                      }}
                    >
                      <Text style={[styles.methodBtnText, formBillMethod === 'cash_on_hand' && styles.activeMethodBtnText]}>
                        Cash on Hand
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.methodBtn, formBillMethod === 'own_pocket' && styles.activeMethodBtn]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setFormBillMethod('own_pocket');
                      }}
                    >
                      <Text style={[styles.methodBtnText, formBillMethod === 'own_pocket' && styles.activeMethodBtnText]}>
                        Own Pocket
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Remarks */}
              <Text style={styles.inputLabel}>Remarks / Purpose</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Rotation for bill clearing"
                placeholderTextColor={CedarColors.ink500}
                value={remarks}
                onChangeText={setRemarks}
              />

              {/* Submit Button */}
              <HapticButton
                style={styles.submitBtn}
                onPress={handleRecordEntry}
                feedbackType="rigid"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#F6F9F5" />
                ) : (
                  <Text style={styles.submitBtnText}>Confirm & Save Record</Text>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CedarColors.forest800,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  addBtnText: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
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
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 10,
  },
  miniFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  activeMiniFilter: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest700,
  },
  miniFilterText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  activeMiniFilterText: {
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  emptyBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: CedarColors.cardAlt,
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
  txCard: {
    backgroundColor: CedarColors.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  txCardExpanded: {
    borderColor: CedarColors.forest700,
  },
  txMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txTextCol: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  txCategory: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  metaDot: {
    fontSize: 10,
    color: CedarColors.ink500,
  },
  txDate: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  txUser: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
  },
  txAmountCol: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  amountPositive: {
    color: '#2E944B',
  },
  amountNegative: {
    color: CedarColors.ink900,
  },
  statusPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginTop: 3,
  },
  statusSettled: {
    backgroundColor: 'rgba(46, 148, 75, 0.1)',
  },
  statusPending: {
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
  },
  statusText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  statusTextSettled: {
    color: '#2E944B',
  },
  statusTextPending: {
    color: '#D97706',
  },
  expandedDetails: {
    marginTop: 10,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: CedarColors.border,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  detailValue: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
  },
  detailValueCode: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
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
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  entryTypeRow: {
    flexDirection: 'row',
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
  },
  entryTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 12,
  },
  activeEntryTypeBtn: {
    backgroundColor: CedarColors.forest800,
  },
  entryTypeText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeEntryTypeText: {
    color: '#F6F9F5',
    fontWeight: '700',
  },
  modalForm: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
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
  cardScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  cardSelectChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginRight: 8,
  },
  activeCardSelectChip: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  cardSelectText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  activeCardSelectText: {
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
    alignItems: 'center',
  },
  activeMethodBtn: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  methodBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeMethodBtnText: {
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: CedarColors.forest800,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  submitBtnText: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
});
