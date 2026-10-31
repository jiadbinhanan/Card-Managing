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
  Users,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  X,
  CreditCard,
  Wallet,
  Clock,
  CheckCircle2,
  Calendar,
} from 'lucide-react-native';

interface Borrower {
  id: string;
  name: string;
  phone?: string;
  created_at: string;
}

interface BorrowerSummary extends Borrower {
  netDue: number;
  totalGiven: number;
  lastActivity: string;
}

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
}

export default function LentsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'combined' | 'card' | 'pocket'>('combined');

  const [borrowers, setBorrowers] = useState<BorrowerSummary[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);

  // Borrower Profile Modal
  const [selectedBorrower, setSelectedBorrower] = useState<BorrowerSummary | null>(null);
  const [isBorrowerModalOpen, setIsBorrowerModalOpen] = useState(false);
  const [borrowerLedger, setBorrowerLedger] = useState<any[]>([]);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);

  // New Loan / Lent Modal
  const [isNewLentOpen, setIsNewLentOpen] = useState(false);
  const [newBorrowerName, setNewBorrowerName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newSource, setNewSource] = useState<'card_limit' | 'cash_on_hand' | 'pocket'>('card_limit');
  const [newCardId, setNewCardId] = useState('');
  const [newRemarks, setNewRemarks] = useState('');
  const [isSavingLent, setIsSavingLent] = useState(false);

  // Recovery Modal
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [recoveryAmount, setRecoveryAmount] = useState('');
  const [recoveryRemarks, setRecoveryRemarks] = useState('');
  const [isSavingRecovery, setIsSavingRecovery] = useState(false);

  const fetchLentsData = useCallback(async () => {
    try {
      // 1. Fetch borrowers and cards
      const [bRes, cRes] = await Promise.all([
        supabase.from('borrowers').select('*').order('created_at', { ascending: false }),
        supabase.from('cards').select('id, card_name, last_4_digits'),
      ]);

      const rawBorrowers: Borrower[] = bRes.data || [];
      const cardsData: CardData[] = cRes.data || [];
      setCards(cardsData);
      if (cardsData.length > 0 && !newCardId) setNewCardId(cardsData[0].id);

      // 2. Fetch card_lent_ledger & pocket_lent_ledger
      const [cardLedgerRes, pocketLedgerRes] = await Promise.all([
        supabase.from('card_lent_ledger').select('*'),
        supabase.from('pocket_lent_ledger').select('*'),
      ]);

      const cardEntries = cardLedgerRes.data || [];
      const pocketEntries = pocketLedgerRes.data || [];

      // Calculate per-borrower summary
      const summaries: BorrowerSummary[] = rawBorrowers.map((b) => {
        let given = 0;
        let returned = 0;
        let latestDate = b.created_at;

        // Card entries
        cardEntries
          .filter((e) => e.borrower_id === b.id)
          .forEach((e) => {
            if (e.entry_type === 'lent' || e.entry_type === 'given') {
              given += Number(e.amount || 0);
            } else if (e.entry_type === 'return' || e.entry_type === 'recovered') {
              returned += Number(e.amount || 0);
            }
            if (e.transaction_date && e.transaction_date > latestDate) {
              latestDate = e.transaction_date;
            }
          });

        // Pocket entries
        pocketEntries
          .filter((e) => e.borrower_id === b.id)
          .forEach((e) => {
            if (e.entry_type === 'lent' || e.entry_type === 'given') {
              given += Number(e.amount || 0);
            } else if (e.entry_type === 'return' || e.entry_type === 'recovered') {
              returned += Number(e.amount || 0);
            }
            if (e.transaction_date && e.transaction_date > latestDate) {
              latestDate = e.transaction_date;
            }
          });

        const netDue = Math.max(0, given - returned);

        return {
          ...b,
          netDue,
          totalGiven: given,
          lastActivity: new Date(latestDate).toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
          }),
        };
      });

      // Filter by active tab if applicable
      setBorrowers(summaries);
    } catch (err) {
      console.error('Error fetching lents:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [newCardId]);

  useEffect(() => {
    fetchLentsData();

    const channel = supabase
      .channel('mobile-lents-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrowers' }, () => fetchLentsData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_lent_ledger' }, () => fetchLentsData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pocket_lent_ledger' }, () => fetchLentsData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLentsData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLentsData();
  };

  const openBorrowerDetail = async (borrower: BorrowerSummary) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    setSelectedBorrower(borrower);
    setIsBorrowerModalOpen(true);
    setIsLedgerLoading(true);

    try {
      const [cardRes, pocketRes] = await Promise.all([
        supabase
          .from('card_lent_ledger')
          .select('*')
          .eq('borrower_id', borrower.id)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('pocket_lent_ledger')
          .select('*')
          .eq('borrower_id', borrower.id)
          .order('transaction_date', { ascending: false }),
      ]);

      const merged = [
        ...(cardRes.data || []).map((e) => ({ ...e, sourceKind: 'card' })),
        ...(pocketRes.data || []).map((e) => ({ ...e, sourceKind: 'pocket' })),
      ];

      merged.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
      setBorrowerLedger(merged);
    } catch (err) {
      console.error('Error fetching borrower ledger:', err);
    } finally {
      setIsLedgerLoading(false);
    }
  };

  const handleCreateLent = async () => {
    if (!newBorrowerName.trim() || !newAmount || parseFloat(newAmount) <= 0) {
      Alert.alert('Required', 'Please enter borrower name and a valid amount.');
      return;
    }

    setIsSavingLent(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const numAmt = parseFloat(newAmount);

      // Check if borrower already exists or create new
      let borrowerId = '';
      const existing = borrowers.find((b) => b.name.toLowerCase() === newBorrowerName.trim().toLowerCase());

      if (existing) {
        borrowerId = existing.id;
      } else {
        const { data: newB, error: bErr } = await supabase
          .from('borrowers')
          .insert({ name: newBorrowerName.trim() })
          .select()
          .single();
        if (bErr || !newB) throw new Error(bErr?.message || 'Failed to create borrower');
        borrowerId = newB.id;
      }

      // Record in card_lent_ledger or pocket_lent_ledger
      if (newSource === 'pocket') {
        await supabase.from('pocket_lent_ledger').insert({
          borrower_id: borrowerId,
          amount: numAmt,
          entry_type: 'lent',
          remarks: newRemarks || 'Pocket loan advance',
          transaction_date: todayIso,
        });
      } else {
        await supabase.from('card_lent_ledger').insert({
          borrower_id: borrowerId,
          card_id: newCardId,
          amount: numAmt,
          entry_type: 'lent',
          funding_source: newSource,
          remarks: newRemarks || 'Card loan advance',
          transaction_date: todayIso,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsNewLentOpen(false);
      setNewBorrowerName('');
      setNewAmount('');
      setNewRemarks('');
      fetchLentsData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save loan.');
    } finally {
      setIsSavingLent(false);
    }
  };

  const handleRecordRecovery = async () => {
    if (!selectedBorrower || !recoveryAmount || parseFloat(recoveryAmount) <= 0) {
      Alert.alert('Required', 'Please enter a valid recovery amount.');
      return;
    }

    setIsSavingRecovery(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const numAmt = parseFloat(recoveryAmount);

      await supabase.from('card_lent_ledger').insert({
        borrower_id: selectedBorrower.id,
        card_id: cards[0]?.id || null,
        amount: numAmt,
        entry_type: 'return',
        funding_source: 'cash_on_hand',
        remarks: recoveryRemarks || 'Loan recovery return',
        transaction_date: todayIso,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsRecoveryOpen(false);
      setRecoveryAmount('');
      setRecoveryRemarks('');
      setIsBorrowerModalOpen(false);
      fetchLentsData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record loan recovery.');
    } finally {
      setIsSavingRecovery(false);
    }
  };

  const totalOutstanding = borrowers.reduce((sum, b) => sum + b.netDue, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Borrowers & Lents</Text>
          <Text style={styles.headerSubtitle}>Loans Ledger & Recovery</Text>
        </View>

        <HapticButton
          style={styles.addBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
            setIsNewLentOpen(true);
          }}
          feedbackType="rigid"
        >
          <Plus size={16} color="#F6F9F5" strokeWidth={2.5} />
          <Text style={styles.addBtnText}>Give Loan</Text>
        </HapticButton>
      </View>

      {/* Floating Total Outstanding Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryBadge}>
            <Clock size={13} color="#2E944B" />
            <Text style={styles.summaryBadgeText}>Total Outstanding Due</Text>
          </View>
          <Text style={styles.borrowerCount}>{borrowers.length} Borrowers</Text>
        </View>

        <Text style={styles.summaryAmount}>₹{totalOutstanding.toLocaleString('en-IN')}</Text>
        <Text style={styles.summarySub}>Total recoverable loans across card and pocket</Text>
      </View>

      {/* 3 Tabs (Combined, Card, Pocket) */}
      <View style={styles.tabRow}>
        {(['combined', 'card', 'pocket'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === 'combined' ? 'Combined View' : tab === 'card' ? 'Card Lents' : 'Pocket Lents';
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

      {/* Borrowers List */}
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
            <Text style={styles.loadingText}>Syncing Borrower Ledger...</Text>
          </View>
        ) : borrowers.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconCircle}>
              <Users size={32} color={CedarColors.ink500} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>No Loan Entries</Text>
            <Text style={styles.emptySubtitle}>Tap 'Give Loan' to add your first borrower.</Text>
          </View>
        ) : (
          borrowers.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={styles.borrowerCard}
              onPress={() => openBorrowerDetail(b)}
              activeOpacity={0.88}
            >
              <View style={styles.borrowerLeft}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>{b.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.borrowerName}>{b.name}</Text>
                  <Text style={styles.borrowerActivity}>Last Active • {b.lastActivity}</Text>
                </View>
              </View>

              <View style={styles.borrowerRight}>
                <Text style={styles.netDueAmount}>₹{b.netDue.toLocaleString('en-IN')}</Text>
                <Text style={[styles.dueStatus, b.netDue > 0 ? styles.statusDue : styles.statusCleared]}>
                  {b.netDue > 0 ? 'Due to Collect' : 'Fully Settled'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Borrower Profile Detail Modal */}
      <Modal
        visible={isBorrowerModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBorrowerModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {selectedBorrower && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>{selectedBorrower.name}</Text>
                    <Text style={styles.modalSubtitle}>Borrower Statement</Text>
                  </View>
                  <TouchableOpacity onPress={() => setIsBorrowerModalOpen(false)}>
                    <X size={20} color={CedarColors.ink900} />
                  </TouchableOpacity>
                </View>

                {/* Outstanding Balance Banner */}
                <View style={styles.balanceBanner}>
                  <Text style={styles.balanceBannerSub}>Current Outstanding Due</Text>
                  <Text style={styles.balanceBannerAmount}>
                    ₹{selectedBorrower.netDue.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.balanceBannerTotal}>
                    Total Given: ₹{selectedBorrower.totalGiven.toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* Quick Recovery Button */}
                <HapticButton
                  style={styles.recoveryActionBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                    setIsRecoveryOpen(true);
                  }}
                  feedbackType="rigid"
                >
                  <CheckCircle2 size={16} color="#F6F9F5" strokeWidth={2.4} />
                  <Text style={styles.recoveryActionText}>Record Loan Return / Recovery</Text>
                </HapticButton>

                <Text style={styles.historyTitle}>Transaction History</Text>

                {isLedgerLoading ? (
                  <ActivityIndicator size="small" color={CedarColors.forest800} style={{ marginVertical: 20 }} />
                ) : borrowerLedger.length === 0 ? (
                  <Text style={styles.noHistoryText}>No transactions recorded yet.</Text>
                ) : (
                  <ScrollView style={styles.historyScroll} showsVerticalScrollIndicator={false}>
                    {borrowerLedger.map((item) => {
                      const isReturn = item.entry_type === 'return' || item.entry_type === 'recovered';
                      return (
                        <View key={item.id} style={styles.ledgerRow}>
                          <View style={styles.ledgerIconCircle}>
                            {isReturn ? (
                              <ArrowDownLeft size={16} color="#2E944B" />
                            ) : (
                              <ArrowUpRight size={16} color={CedarColors.forest800} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.ledgerTitle}>
                              {isReturn ? 'Loan Returned' : 'Loan Given'}
                            </Text>
                            <Text style={styles.ledgerDate}>
                              {item.transaction_date} • {item.remarks || 'No remarks'}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.ledgerAmount,
                              isReturn ? styles.amountReturn : styles.amountLent,
                            ]}
                          >
                            {isReturn ? '-' : '+'}₹{Number(item.amount).toLocaleString('en-IN')}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Give New Loan Modal */}
      <Modal
        visible={isNewLentOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsNewLentOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Give New Loan</Text>
              <TouchableOpacity onPress={() => setIsNewLentOpen(false)}>
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Borrower Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Rahim Khan"
                placeholderTextColor={CedarColors.ink500}
                value={newBorrowerName}
                onChangeText={setNewBorrowerName}
              />

              <Text style={styles.inputLabel}>Loan Amount (₹)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 15000"
                placeholderTextColor={CedarColors.ink500}
                keyboardType="numeric"
                value={newAmount}
                onChangeText={setNewAmount}
              />

              <Text style={styles.inputLabel}>Funding Source</Text>
              <View style={styles.sourceRow}>
                {(['card_limit', 'cash_on_hand', 'pocket'] as const).map((s) => {
                  const isSel = newSource === s;
                  const label = s === 'card_limit' ? 'Card Limit' : s === 'cash_on_hand' ? 'Cash Vault' : 'Own Pocket';
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.sourceBtn, isSel && styles.activeSourceBtn]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setNewSource(s);
                      }}
                    >
                      <Text style={[styles.sourceText, isSel && styles.activeSourceText]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {newSource === 'card_limit' && (
                <>
                  <Text style={styles.inputLabel}>Select Vault Card</Text>
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
                </>
              )}

              <Text style={styles.inputLabel}>Remarks</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Advance for medical bill"
                placeholderTextColor={CedarColors.ink500}
                value={newRemarks}
                onChangeText={setNewRemarks}
              />

              <HapticButton
                style={styles.confirmBtn}
                onPress={handleCreateLent}
                feedbackType="rigid"
                disabled={isSavingLent}
              >
                {isSavingLent ? (
                  <ActivityIndicator size="small" color="#F6F9F5" />
                ) : (
                  <Text style={styles.confirmBtnText}>Save Loan Entry</Text>
                )}
              </HapticButton>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Record Loan Recovery Modal */}
      <Modal
        visible={isRecoveryOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsRecoveryOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Recovery Return</Text>
              <TouchableOpacity onPress={() => setIsRecoveryOpen(false)}>
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Returned Amount (₹)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter amount returned"
                placeholderTextColor={CedarColors.ink500}
                keyboardType="numeric"
                value={recoveryAmount}
                onChangeText={setRecoveryAmount}
              />

              <Text style={styles.inputLabel}>Remarks / Notes</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Cash returned in person"
                placeholderTextColor={CedarColors.ink500}
                value={recoveryRemarks}
                onChangeText={setRecoveryRemarks}
              />

              <HapticButton
                style={styles.confirmBtn}
                onPress={handleRecordRecovery}
                feedbackType="rigid"
                disabled={isSavingRecovery}
              >
                {isSavingRecovery ? (
                  <ActivityIndicator size="small" color="#F6F9F5" />
                ) : (
                  <Text style={styles.confirmBtnText}>Deposit Recovery to Cash</Text>
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
    backgroundColor: 'rgba(46, 148, 75, 0.18)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#A3D9B5',
    fontWeight: '700',
  },
  borrowerCount: {
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
  listContent: {
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
  borrowerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    borderRadius: 18,
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
  borrowerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 16,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.forest800,
  },
  borrowerName: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
  },
  borrowerActivity: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  borrowerRight: {
    alignItems: 'flex-end',
  },
  netDueAmount: {
    fontSize: 15,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  dueStatus: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    marginTop: 2,
  },
  statusDue: {
    color: '#D97706',
    fontWeight: '700',
  },
  statusCleared: {
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
  modalSubtitle: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  balanceBanner: {
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  balanceBannerSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  balanceBannerAmount: {
    fontSize: 24,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginTop: 2,
  },
  balanceBannerTotal: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
    marginTop: 3,
  },
  recoveryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CedarColors.forest800,
    borderRadius: 14,
    paddingVertical: 11,
    marginBottom: 16,
  },
  recoveryActionText: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  historyTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
    marginBottom: 8,
  },
  historyScroll: {
    maxHeight: 200,
  },
  noHistoryText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    textAlign: 'center',
    paddingVertical: 20,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: CedarColors.border,
  },
  ledgerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CedarColors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ledgerTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
  },
  ledgerDate: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  ledgerAmount: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  amountLent: {
    color: CedarColors.ink900,
  },
  amountReturn: {
    color: '#2E944B',
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
    marginBottom: 6,
    marginTop: 8,
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
  sourceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  sourceBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
    alignItems: 'center',
  },
  activeSourceBtn: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  sourceText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeSourceText: {
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  cardPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  activeCardPill: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  cardPillText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  activeCardPillText: {
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  confirmBtn: {
    backgroundColor: CedarColors.forest800,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  confirmBtnText: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
  },
});
