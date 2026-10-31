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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticButton } from '../../components/HapticButton';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Users,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronRight,
  X,
  CreditCard,
  Wallet,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  Phone,
  Banknote,
  Coins,
  ShieldCheck,
  Check,
  User,
} from 'lucide-react-native';

interface Borrower {
  id: string;
  name: string;
  phone?: string | null;
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
  is_primary: boolean;
  parent_card_id?: string;
  total_limit?: number;
}

interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

interface LedgerEntry {
  id: string;
  borrower_id: string;
  entry_type: 'given' | 'collected';
  amount: number;
  transaction_date: string;
  source_type?: 'cash_on_hand' | 'credit_card' | 'pocket' | null;
  card_id?: string | null;
  remarks?: string | null;
  recorded_by?: string | null;
  created_at?: string;
  ledgerSource: 'card' | 'pocket';
}

export default function LentsScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'combined' | 'card' | 'pocket'>('combined');

  // Vault Selection
  const [selectedVaultCardId, setSelectedVaultCardId] = useState<string>('all');
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);

  // Data States
  const [borrowers, setBorrowers] = useState<BorrowerSummary[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});
  const [userCardCashMap, setUserCardCashMap] = useState<Record<string, Record<string, number>>>({});

  // Borrower Profile Panel Modal
  const [selectedBorrower, setSelectedBorrower] = useState<BorrowerSummary | null>(null);
  const [isBorrowerPanelOpen, setIsBorrowerPanelOpen] = useState(false);
  const [borrowerLedger, setBorrowerLedger] = useState<LedgerEntry[]>([]);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);

  // Give Loan Modal
  const [isGiveModalOpen, setIsGiveModalOpen] = useState(false);
  const [giveAmount, setGiveAmount] = useState('');
  const [giveDate, setGiveDate] = useState('');
  const [giveSource, setGiveSource] = useState<'credit_card' | 'cash_on_hand' | 'pocket'>('cash_on_hand');
  const [giveCardId, setGiveCardId] = useState('');
  const [giveRemarks, setGiveRemarks] = useState('');
  const [isSavingGive, setIsSavingGive] = useState(false);

  // Recovery / Return Modal
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectDate, setCollectDate] = useState('');
  const [collectTargetCardId, setCollectTargetCardId] = useState('');
  const [collectRemarks, setCollectRemarks] = useState('');
  const [isSavingCollect, setIsSavingCollect] = useState(false);

  // Add Borrower Modal
  const [isAddBorrowerOpen, setIsAddBorrowerOpen] = useState(false);
  const [newBorrowerName, setNewBorrowerName] = useState('');
  const [newBorrowerPhone, setNewBorrowerPhone] = useState('');
  const [isSavingBorrower, setIsSavingBorrower] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getSession();
      const currentAuthUser = authData?.session?.user;

      const [bRes, cRes, pRes, cohRes, cardLedgerRes, pocketLedgerRes] = await Promise.all([
        supabase.from('borrowers').select('*').order('name'),
        supabase.from('cards').select('*').order('is_primary', { ascending: false }),
        supabase.from('profiles').select('*').order('name'),
        supabase.from('cash_on_hand').select('*'),
        supabase.from('card_lent_ledger').select('*').order('transaction_date', { ascending: false }),
        supabase.from('pocket_lent_ledger').select('*').order('transaction_date', { ascending: false }),
      ]);

      const rawBorrowers: Borrower[] = bRes.data || [];
      const cardsData: CardData[] = cRes.data || [];
      const profilesData: Profile[] = pRes.data || [];
      const coh = cohRes.data || [];
      const cardEntries = cardLedgerRes.data || [];
      const pocketEntries = pocketLedgerRes.data || [];

      setCards(cardsData);
      setProfiles(profilesData);

      if (currentAuthUser) {
        const found = profilesData.find((p) => p.id === currentAuthUser.id);
        if (found) setCurrentUser(found);
      } else if (profilesData.length > 0) {
        setCurrentUser(profilesData[0]);
      }

      // Calculate Cash Map
      const cardCashMap: Record<string, Record<string, number>> = {};
      coh.forEach((c) => {
        if (c.user_id && c.card_id) {
          if (!cardCashMap[c.user_id]) cardCashMap[c.user_id] = {};
          cardCashMap[c.user_id][c.card_id] = Number(c.current_balance || 0);
        }
      });
      setUserCardCashMap(cardCashMap);

      // Build Summaries
      const summaries: BorrowerSummary[] = rawBorrowers.map((b) => {
        let cardGiven = 0;
        let cardCollected = 0;
        let pocketGiven = 0;
        let pocketCollected = 0;
        let latestDate = b.created_at;

        // Card Ledger entries
        cardEntries
          .filter((e) => e.borrower_id === b.id)
          .forEach((e) => {
            // Apply vault filter if active
            if (selectedVaultCardId !== 'all' && e.card_id !== selectedVaultCardId) return;

            const isGiven = e.entry_type === 'given' || e.entry_type === 'lent';
            const isCollect = e.entry_type === 'collected' || e.entry_type === 'return';
            if (isGiven) cardGiven += Number(e.amount || 0);
            if (isCollect) cardCollected += Number(e.amount || 0);

            if (e.transaction_date && e.transaction_date > latestDate) {
              latestDate = e.transaction_date;
            }
          });

        // Pocket Ledger entries
        pocketEntries
          .filter((e) => e.borrower_id === b.id)
          .forEach((e) => {
            const isGiven = e.entry_type === 'given' || e.entry_type === 'lent';
            const isCollect = e.entry_type === 'collected' || e.entry_type === 'return';
            if (isGiven) pocketGiven += Number(e.amount || 0);
            if (isCollect) pocketCollected += Number(e.amount || 0);

            if (e.transaction_date && e.transaction_date > latestDate) {
              latestDate = e.transaction_date;
            }
          });

        let given = 0;
        let collected = 0;

        if (activeTab === 'card') {
          given = cardGiven;
          collected = cardCollected;
        } else if (activeTab === 'pocket') {
          given = pocketGiven;
          collected = pocketCollected;
        } else {
          // Combined
          given = cardGiven + pocketGiven;
          collected = cardCollected + pocketCollected;
        }

        const netDue = Math.max(0, given - collected);

        return {
          ...b,
          netDue,
          totalGiven: given,
          lastActivity: latestDate
            ? new Date(latestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : 'Recent',
        };
      });

      // Sort by netDue desc, then totalGiven desc
      summaries.sort((a, b) => b.netDue - a.netDue || b.totalGiven - a.totalGiven);
      setBorrowers(summaries);

      if (cardsData.length > 0 && !giveCardId) setGiveCardId(cardsData[0].id);
      if (cardsData.length > 0 && !collectTargetCardId) setCollectTargetCardId(cardsData[0].id);
    } catch (err) {
      console.error('Error fetching lents data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, selectedVaultCardId, giveCardId, collectTargetCardId]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('mobile-lents-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_lent_ledger' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pocket_lent_ledger' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrowers' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Total Outstanding Due
  const totalOutstanding = useMemo(() => {
    return borrowers.reduce((sum, b) => sum + b.netDue, 0);
  }, [borrowers]);

  // Load Deep Borrower Ledger
  const openBorrowerPanel = async (borrower: BorrowerSummary) => {
    setSelectedBorrower(borrower);
    setIsBorrowerPanelOpen(true);
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

      const cEntries: LedgerEntry[] = (cardRes.data || []).map((e: any) => ({
        ...e,
        entry_type: e.entry_type === 'lent' ? 'given' : e.entry_type === 'return' ? 'collected' : e.entry_type,
        ledgerSource: 'card',
      }));

      const pEntries: LedgerEntry[] = (pocketRes.data || []).map((e: any) => ({
        ...e,
        entry_type: e.entry_type === 'lent' ? 'given' : e.entry_type === 'return' ? 'collected' : e.entry_type,
        source_type: 'pocket',
        ledgerSource: 'pocket',
      }));

      let allEntries = [...cEntries, ...pEntries];
      if (activeTab === 'card') allEntries = cEntries;
      if (activeTab === 'pocket') allEntries = pEntries;

      allEntries.sort(
        (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
      );

      setBorrowerLedger(allEntries);
    } catch (err) {
      console.error('Error fetching borrower ledger:', err);
    } finally {
      setIsLedgerLoading(false);
    }
  };

  // Handle Give Loan
  const handleConfirmGiveLoan = async () => {
    if (!selectedBorrower || !giveAmount || Number(giveAmount) <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }

    setIsSavingGive(true);

    try {
      const numAmt = Number(giveAmount);
      const finalDate = giveDate || new Date().toISOString().slice(0, 10);
      const actingUserId = currentUser?.id;

      if (giveSource === 'pocket' || activeTab === 'pocket') {
        // Pocket Loan
        await supabase.from('pocket_lent_ledger').insert({
          borrower_id: selectedBorrower.id,
          user_id: actingUserId,
          amount: numAmt,
          entry_type: 'given',
          transaction_date: finalDate,
          remarks: giveRemarks || 'Pocket Loan Given',
        });
      } else {
        // Card Limit or Cash on Hand
        const { data: lentRow } = await supabase
          .from('card_lent_ledger')
          .insert({
            borrower_id: selectedBorrower.id,
            card_id: giveCardId,
            amount: numAmt,
            entry_type: 'given',
            source_type: giveSource,
            transaction_date: finalDate,
            recorded_by: actingUserId,
            remarks: giveRemarks || `Loan given from ${giveSource === 'cash_on_hand' ? 'Cash' : 'Card'}`,
          })
          .select('id')
          .single();

        if (giveSource === 'cash_on_hand') {
          // Debit from cash on hand ledger
          await supabase.from('cash_on_hand_ledger').insert({
            user_id: actingUserId,
            card_id: giveCardId,
            amount: numAmt,
            transaction_type: 'debit',
            remarks: `Lent given to ${selectedBorrower.name} ${giveRemarks ? '- ' + giveRemarks : ''}`,
            transaction_date: new Date().toISOString(),
          });
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsGiveModalOpen(false);
      setGiveAmount('');
      setGiveRemarks('');
      if (selectedBorrower) openBorrowerPanel(selectedBorrower);
      fetchData();
    } catch (err: any) {
      console.error('Error giving loan:', err);
      Alert.alert('Error', err?.message || 'Failed to record loan.');
    } finally {
      setIsSavingGive(false);
    }
  };

  // Handle Collect Loan
  const handleConfirmCollect = async () => {
    if (!selectedBorrower || !collectAmount || Number(collectAmount) <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }

    setIsSavingCollect(true);

    try {
      const numAmt = Number(collectAmount);
      const finalDate = collectDate || new Date().toISOString().slice(0, 10);
      const actingUserId = currentUser?.id;

      if (activeTab === 'pocket') {
        await supabase.from('pocket_lent_ledger').insert({
          borrower_id: selectedBorrower.id,
          user_id: actingUserId,
          amount: numAmt,
          entry_type: 'collected',
          transaction_date: finalDate,
          remarks: collectRemarks || 'Loan Recovery Received',
        });
      } else {
        await supabase.from('card_lent_ledger').insert({
          borrower_id: selectedBorrower.id,
          card_id: collectTargetCardId,
          amount: numAmt,
          entry_type: 'collected',
          source_type: 'cash_on_hand',
          transaction_date: finalDate,
          recorded_by: actingUserId,
          remarks: collectRemarks || `Loan collected from ${selectedBorrower.name}`,
        });

        // Credit to cash on hand ledger
        await supabase.from('cash_on_hand_ledger').insert({
          user_id: actingUserId,
          card_id: collectTargetCardId,
          amount: numAmt,
          transaction_type: 'credit',
          remarks: `Loan recovery from ${selectedBorrower.name} ${collectRemarks ? '- ' + collectRemarks : ''}`,
          transaction_date: new Date().toISOString(),
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsCollectModalOpen(false);
      setCollectAmount('');
      setCollectRemarks('');
      if (selectedBorrower) openBorrowerPanel(selectedBorrower);
      fetchData();
    } catch (err: any) {
      console.error('Error recording collection:', err);
      Alert.alert('Error', err?.message || 'Failed to record collection.');
    } finally {
      setIsSavingCollect(false);
    }
  };

  // Handle Add New Borrower
  const handleAddNewBorrower = async () => {
    if (!newBorrowerName.trim()) {
      Alert.alert('Required', 'Please enter a borrower name.');
      return;
    }

    setIsSavingBorrower(true);

    try {
      await supabase.from('borrowers').insert({
        name: newBorrowerName.trim(),
        phone: newBorrowerPhone.trim() || null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsAddBorrowerOpen(false);
      setNewBorrowerName('');
      setNewBorrowerPhone('');
      fetchData();
    } catch (err: any) {
      console.error('Error adding borrower:', err);
      Alert.alert('Error', err?.message || 'Failed to create borrower.');
    } finally {
      setIsSavingBorrower(false);
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
            <Text style={styles.headerSub}>Receivables & Loans</Text>
            <Text style={styles.headerTitle}>Lents & Loans</Text>
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

          {/* Add Borrower Button */}
          <HapticButton
            style={styles.addBorrowerBtn}
            onPress={() => {
              setIsAddBorrowerOpen(true);
            }}
            feedbackType="rigid"
          >
            <Plus size={16} color="#F6F9F5" strokeWidth={2.5} />
            <Text style={styles.addBorrowerBtnText}>Borrower</Text>
          </HapticButton>
        </View>
      </View>

      {/* ================= 2. HERO OUTSTANDING DUE CARD ================= */}
      <View style={styles.summaryCardWrapper}>
        <LinearGradient
          colors={['#071A12', '#0C2B20', '#071A12']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.summaryCard}
        >
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryLabel}>Total Outstanding Due</Text>
              <Text style={styles.summaryAmount}>₹{totalOutstanding.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.activeBorrowersBadge}>
              <Users size={12} color="#10B981" />
              <Text style={styles.activeBorrowersText}>
                {borrowers.filter((b) => b.netDue > 0).length} Due
              </Text>
            </View>
          </View>

          <View style={styles.summaryBottomRow}>
            <Text style={styles.summarySub}>
              {activeTab === 'combined'
                ? 'Combined Card & Pocket Receivables'
                : activeTab === 'card'
                ? 'Shared Card Limit & Cash Loans'
                : 'Personal Pocket Advances'}
            </Text>
          </View>
        </LinearGradient>
      </View>

      {/* ================= 3. 3 SEGMENTED TABS ================= */}
      <View style={styles.tabsRow}>
        {(['combined', 'card', 'pocket'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label =
            tab === 'combined'
              ? 'Combined'
              : tab === 'card'
              ? 'Card & Cash'
              : 'Personal Pocket';
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

      {/* ================= 4. BORROWERS LIST ================= */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#1B4D3E" />
          <Text style={styles.loaderText}>Loading Borrower Statements...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B4D3E']} />}
        >
          {borrowers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Users size={32} color={CedarColors.ink500} />
              </View>
              <Text style={styles.emptyTitle}>No Borrowers Added</Text>
              <Text style={styles.emptySub}>
                Add a borrower to start tracking loans, collections, and statements.
              </Text>
            </View>
          ) : (
            borrowers.map((b) => {
              const hasDue = b.netDue > 0;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={styles.borrowerCard}
                  onPress={() => openBorrowerPanel(b)}
                  activeOpacity={0.85}
                >
                  <View style={styles.borrowerMainRow}>
                    {/* Avatar Icon */}
                    <View
                      style={[
                        styles.borrowerAvatarBox,
                        hasDue ? styles.borrowerAvatarDue : styles.borrowerAvatarSettled,
                      ]}
                    >
                      <User size={18} color={hasDue ? '#E05D52' : '#2D7A5D'} />
                    </View>

                    {/* Middle Info */}
                    <View style={styles.borrowerInfoCol}>
                      <Text style={styles.borrowerName}>{b.name}</Text>
                      <View style={styles.borrowerMetaRow}>
                        {b.phone ? (
                          <Text style={styles.borrowerPhone}>{b.phone}</Text>
                        ) : (
                          <Text style={styles.borrowerPhone}>No phone</Text>
                        )}
                        <Text style={styles.dotSeparator}>•</Text>
                        <Text style={styles.lastActivityText}>Active {b.lastActivity}</Text>
                      </View>
                    </View>

                    {/* Right Due & Total Given */}
                    <View style={styles.borrowerAmountCol}>
                      <Text
                        style={[
                          styles.borrowerDueAmount,
                          hasDue ? styles.dueText : styles.settledText,
                        ]}
                      >
                        {hasDue ? `₹${b.netDue.toLocaleString('en-IN')}` : 'Settled'}
                      </Text>
                      <Text style={styles.borrowerGivenSub}>
                        Total Given: ₹{b.totalGiven.toLocaleString('en-IN')}
                      </Text>
                    </View>

                    <ChevronRight size={14} color={CedarColors.ink500} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ================= BORROWER PROFILE PANEL MODAL ================= */}
      {selectedBorrower && (
        <Modal visible={isBorrowerPanelOpen} animationType="slide" transparent>
          <View style={styles.panelOverlay}>
            <View style={styles.panelCard}>
              {/* Panel Header */}
              <View style={styles.panelHeader}>
                <View>
                  <Text style={styles.panelTitle}>{selectedBorrower.name}</Text>
                  <Text style={styles.panelSub}>{selectedBorrower.phone || 'Statement Ledger'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.panelCloseBtn}
                  onPress={() => setIsBorrowerPanelOpen(false)}
                >
                  <X size={18} color={CedarColors.ink700} />
                </TouchableOpacity>
              </View>

              {/* Panel Summary Banner */}
              <View style={styles.panelBanner}>
                <View>
                  <Text style={styles.panelBannerLabel}>Outstanding Receivable</Text>
                  <Text style={styles.panelBannerDue}>
                    ₹{selectedBorrower.netDue.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.panelActionButtonsRow}>
                  <HapticButton
                    style={styles.panelGiveBtn}
                    onPress={() => {
                      setGiveDate(new Date().toISOString().slice(0, 10));
                      setGiveAmount('');
                      setGiveRemarks('');
                      setIsGiveModalOpen(true);
                    }}
                    feedbackType="rigid"
                  >
                    <ArrowDownLeft size={13} color="#FFFFFF" />
                    <Text style={styles.panelActionBtnText}>Give Loan</Text>
                  </HapticButton>

                  <HapticButton
                    style={styles.panelCollectBtn}
                    onPress={() => {
                      setCollectDate(new Date().toISOString().slice(0, 10));
                      setCollectAmount('');
                      setCollectRemarks('');
                      setIsCollectModalOpen(true);
                    }}
                    feedbackType="rigid"
                  >
                    <ArrowUpRight size={13} color="#FFFFFF" />
                    <Text style={styles.panelActionBtnText}>Collect</Text>
                  </HapticButton>
                </View>
              </View>

              {/* Statement History Entries */}
              <Text style={styles.panelLedgerTitle}>Transaction Statement</Text>

              {isLedgerLoading ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#1B4D3E" />
                </View>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.panelLedgerScroll}
                >
                  {borrowerLedger.length === 0 ? (
                    <Text style={styles.emptyLedgerText}>No entries recorded yet.</Text>
                  ) : (
                    borrowerLedger.map((entry) => {
                      const isGiven = entry.entry_type === 'given';
                      return (
                        <View key={entry.id} style={styles.statementRow}>
                          <View
                            style={[
                              styles.statementIconBox,
                              isGiven ? styles.statementIconGiven : styles.statementIconCollect,
                            ]}
                          >
                            {isGiven ? (
                              <ArrowDownLeft size={14} color="#E05D52" />
                            ) : (
                              <ArrowUpRight size={14} color="#2D7A5D" />
                            )}
                          </View>

                          <View style={styles.statementInfoCol}>
                            <Text style={styles.statementTitle}>
                              {isGiven ? 'Loan Given' : 'Payment Received'}
                            </Text>
                            <Text style={styles.statementSub}>
                              {entry.ledgerSource === 'pocket' ? 'Pocket Advance' : 'Card / Cash'} •{' '}
                              {entry.transaction_date}
                            </Text>
                            {entry.remarks ? (
                              <Text style={styles.statementRemarks}>"{entry.remarks}"</Text>
                            ) : null}
                          </View>

                          <Text
                            style={[
                              styles.statementAmount,
                              isGiven ? styles.statementGivenText : styles.statementCollectText,
                            ]}
                          >
                            {isGiven ? '-' : '+'}₹{entry.amount.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* ================= GIVE LOAN MODAL ================= */}
      <Modal visible={isGiveModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Give Loan to {selectedBorrower?.name}</Text>
                <Text style={styles.modalSub}>Disburse funds and update receivables</Text>
              </View>
              <TouchableOpacity onPress={() => setIsGiveModalOpen(false)}>
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {/* Amount */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Loan Amount (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter amount"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="numeric"
                  value={giveAmount}
                  onChangeText={setGiveAmount}
                />
              </View>

              {/* Source Switcher */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Disbursement Source</Text>
                <View style={styles.sourceToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.sourceToggleBtn,
                      giveSource === 'cash_on_hand' && styles.sourceToggleBtnActive,
                    ]}
                    onPress={() => {
                      setGiveSource('cash_on_hand');
                    }}
                  >
                    <Banknote size={13} color={giveSource === 'cash_on_hand' ? '#1B4D3E' : CedarColors.ink500} />
                    <Text
                      style={[
                        styles.sourceToggleBtnText,
                        giveSource === 'cash_on_hand' && styles.sourceToggleBtnTextActive,
                      ]}
                    >
                      Cash on Hand
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.sourceToggleBtn,
                      giveSource === 'credit_card' && styles.sourceToggleBtnActive,
                    ]}
                    onPress={() => {
                      setGiveSource('credit_card');
                    }}
                  >
                    <CreditCard size={13} color={giveSource === 'credit_card' ? '#1B4D3E' : CedarColors.ink500} />
                    <Text
                      style={[
                        styles.sourceToggleBtnText,
                        giveSource === 'credit_card' && styles.sourceToggleBtnTextActive,
                      ]}
                    >
                      Credit Card
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.sourceToggleBtn,
                      giveSource === 'pocket' && styles.sourceToggleBtnActive,
                    ]}
                    onPress={() => {
                      setGiveSource('pocket');
                    }}
                  >
                    <Wallet size={13} color={giveSource === 'pocket' ? '#1B4D3E' : CedarColors.ink500} />
                    <Text
                      style={[
                        styles.sourceToggleBtnText,
                        giveSource === 'pocket' && styles.sourceToggleBtnTextActive,
                      ]}
                    >
                      Pocket
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Card Selection if card mode */}
              {giveSource !== 'pocket' && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Select Card</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                    {cards.map((c) => {
                      const isSelected = giveCardId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.cardPill, isSelected && styles.cardPillActive]}
                          onPress={() => {
                            setGiveCardId(c.id);
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
              )}

              {/* Date */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={giveDate}
                  onChangeText={setGiveDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={CedarColors.ink500}
                />
              </View>

              {/* Remarks */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Purpose / Note</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Optional remarks"
                  placeholderTextColor={CedarColors.ink500}
                  value={giveRemarks}
                  onChangeText={setGiveRemarks}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <HapticButton
                style={[styles.confirmBtn, isSavingGive && styles.confirmBtnDisabled]}
                onPress={handleConfirmGiveLoan}
                disabled={isSavingGive}
                feedbackType="rigid"
              >
                {isSavingGive ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ShieldCheck size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.confirmBtnText}>Confirm Disburse</Text>
                  </>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= COLLECT LOAN MODAL ================= */}
      <Modal visible={isCollectModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Record Recovery / Return</Text>
                <Text style={styles.modalSub}>From {selectedBorrower?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCollectModalOpen(false)}>
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Received Amount (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter collected amount"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="numeric"
                  value={collectAmount}
                  onChangeText={setCollectAmount}
                />
              </View>

              {activeTab !== 'pocket' && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Deposit into Card Cash on Hand</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                    {cards.map((c) => {
                      const isSelected = collectTargetCardId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.cardPill, isSelected && styles.cardPillActive]}
                          onPress={() => {
                            setCollectTargetCardId(c.id);
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
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Date</Text>
                <TextInput
                  style={styles.textInput}
                  value={collectDate}
                  onChangeText={setCollectDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={CedarColors.ink500}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Receipt Remarks</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Optional receipt notes"
                  placeholderTextColor={CedarColors.ink500}
                  value={collectRemarks}
                  onChangeText={setCollectRemarks}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <HapticButton
                style={[styles.confirmBtn, isSavingCollect && styles.confirmBtnDisabled]}
                onPress={handleConfirmCollect}
                disabled={isSavingCollect}
                feedbackType="rigid"
              >
                {isSavingCollect ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.confirmBtnText}>Save Recovery</Text>
                  </>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= ADD BORROWER MODAL ================= */}
      <Modal visible={isAddBorrowerOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add New Borrower</Text>
                <Text style={styles.modalSub}>Create a new contact profile</Text>
              </View>
              <TouchableOpacity onPress={() => setIsAddBorrowerOpen(false)}>
                <X size={18} color={CedarColors.ink700} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Borrower Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. John Doe"
                  placeholderTextColor={CedarColors.ink500}
                  value={newBorrowerName}
                  onChangeText={setNewBorrowerName}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Phone Number (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. +91 98765 43210"
                  placeholderTextColor={CedarColors.ink500}
                  keyboardType="phone-pad"
                  value={newBorrowerPhone}
                  onChangeText={setNewBorrowerPhone}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <HapticButton
                style={[styles.confirmBtn, isSavingBorrower && styles.confirmBtnDisabled]}
                onPress={handleAddNewBorrower}
                disabled={isSavingBorrower}
                feedbackType="rigid"
              >
                {isSavingBorrower ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.confirmBtnText}>Create Borrower</Text>
                  </>
                )}
              </HapticButton>
            </View>
          </View>
        </View>
      </Modal>

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
  addBorrowerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1B4D3E',
    borderRadius: 12,
  },
  addBorrowerBtnText: {
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
  activeBorrowersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  activeBorrowersText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
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
  borrowerCard: {
    backgroundColor: '#F6F9F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 12,
    marginBottom: 8,
  },
  borrowerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  borrowerAvatarBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  borrowerAvatarDue: {
    backgroundColor: '#FCEBEA',
  },
  borrowerAvatarSettled: {
    backgroundColor: '#E8F5E9',
  },
  borrowerInfoCol: {
    flex: 1,
  },
  borrowerName: {
    fontSize: 13,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  borrowerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  borrowerPhone: {
    fontSize: 10,
    color: CedarColors.ink500,
  },
  dotSeparator: {
    fontSize: 10,
    color: CedarColors.ink500,
  },
  lastActivityText: {
    fontSize: 9,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  borrowerAmountCol: {
    alignItems: 'flex-end',
  },
  borrowerDueAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  dueText: {
    color: '#E05D52',
  },
  settledText: {
    color: '#2D7A5D',
  },
  borrowerGivenSub: {
    fontSize: 9,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  panelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  panelCard: {
    backgroundColor: '#F6F9F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: 24,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE4DA',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  panelSub: {
    fontSize: 10,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  panelCloseBtn: {
    padding: 4,
  },
  panelBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E4ECE3',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
  },
  panelBannerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
  },
  panelBannerDue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#E05D52',
    marginTop: 2,
  },
  panelActionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  panelGiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E05D52',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  panelCollectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1B4D3E',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  panelActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  panelLedgerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  panelLedgerScroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyLedgerText: {
    fontSize: 11,
    color: CedarColors.ink500,
    textAlign: 'center',
    paddingVertical: 20,
  },
  statementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    padding: 10,
    marginBottom: 6,
  },
  statementIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  statementIconGiven: {
    backgroundColor: '#FCEBEA',
  },
  statementIconCollect: {
    backgroundColor: '#E8F5E9',
  },
  statementInfoCol: {
    flex: 1,
  },
  statementTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  statementSub: {
    fontSize: 9,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  statementRemarks: {
    fontSize: 9,
    fontStyle: 'italic',
    color: CedarColors.ink700,
    marginTop: 2,
  },
  statementAmount: {
    fontSize: 12,
    fontWeight: '800',
  },
  statementGivenText: {
    color: '#E05D52',
  },
  statementCollectText: {
    color: '#2D7A5D',
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
  sourceToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sourceToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#E4ECE3',
    borderWidth: 1,
    borderColor: '#DCE4DA',
  },
  sourceToggleBtnActive: {
    backgroundColor: '#F6F9F5',
    borderColor: '#1B4D3E',
  },
  sourceToggleBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: CedarColors.ink700,
  },
  sourceToggleBtnTextActive: {
    color: '#1B4D3E',
    fontWeight: '800',
  },
  pillsScroll: {
    flexDirection: 'row',
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
