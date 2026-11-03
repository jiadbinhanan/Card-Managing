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
  Image,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  Users,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  X,
  CreditCard,
  Wallet,
  Clock,
  Layers,
  Banknote,
  Check,
  User,
  Search,
} from 'lucide-react-native';

import { BorrowerCard, BorrowerSummary } from '../../components/lents/BorrowerCard';
import {
  BorrowerLedgerDrawer,
  LedgerEntry,
} from '../../components/lents/BorrowerLedgerDrawer';
import {
  LentGiveModal,
  LentGiveSubmitParams,
  CardData,
} from '../../components/lents/LentGiveModal';
import {
  LentCollectModal,
  LentCollectSubmitParams,
} from '../../components/lents/LentCollectModal';
import { AddBorrowerModal } from '../../components/lents/AddBorrowerModal';
import { EditBorrowerModal } from '../../components/lents/EditBorrowerModal';
import { TherapeuticSuccessModal } from '../../components/settlements/TherapeuticSuccessModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

interface RawBorrower {
  id: string;
  name: string;
  phone?: string | null;
  created_at: string;
}

type TabType = 'combined' | 'card' | 'pocket';

export default function LentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('combined');
  const [searchQuery, setSearchQuery] = useState('');

  // Vault Selection
  const [selectedVaultCardId, setSelectedVaultCardId] = useState<string>('all');
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);

  // Core Data States
  const [rawBorrowers, setRawBorrowers] = useState<RawBorrower[]>([]);
  const [cardEntries, setCardEntries] = useState<any[]>([]);
  const [pocketEntries, setPocketEntries] = useState<any[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [cardAvailableMap, setCardAvailableMap] = useState<Record<string, number>>({});
  const [userCardCashMap, setUserCardCashMap] = useState<Record<string, Record<string, number>>>({});

  // Borrower Profile Statement Drawer
  const [selectedBorrower, setSelectedBorrower] = useState<BorrowerSummary | null>(null);
  const [isLedgerDrawerOpen, setIsLedgerDrawerOpen] = useState(false);
  const [borrowerLedger, setBorrowerLedger] = useState<LedgerEntry[]>([]);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);

  // Action Drawers
  const [isGiveModalOpen, setIsGiveModalOpen] = useState(false);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [isAddBorrowerOpen, setIsAddBorrowerOpen] = useState(false);
  const [isEditBorrowerOpen, setIsEditBorrowerOpen] = useState(false);

  // Therapeutic Celebration
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successTitle, setSuccessTitle] = useState('Loan Recorded');
  const [successSubtitle, setSuccessSubtitle] = useState('');
  const [successAmount, setSuccessAmount] = useState<number | undefined>(undefined);

  // 120Hz Animation Values
  const cardDropdownScale = useSharedValue(1);
  const fabScale = useSharedValue(1);
  const heroCardScale = useSharedValue(1);
  const heroCardOpacity = useSharedValue(1);

  const cardDropdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardDropdownScale.value }],
  }));

  const fabAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const heroAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroCardScale.value }],
    opacity: heroCardOpacity.value,
  }));

  // Tab switch animation
  useEffect(() => {
    heroCardScale.value = withSequence(
      withTiming(0.96, { duration: 90 }),
      withSpring(1, { damping: 14, stiffness: 220 })
    );
    heroCardOpacity.value = withSequence(
      withTiming(0.65, { duration: 80 }),
      withTiming(1, { duration: 120 })
    );
  }, [activeTab]);

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
    setIsAddBorrowerOpen(true);
  };

  // Helper for available cash on hand
  const getUserCashForCard = useCallback(
    (userId: string, cardId: string): number => {
      const userMap = userCardCashMap[userId] || {};
      if (!cardId) return Object.values(userMap).reduce((s, v) => s + v, 0);
      const card = cards.find((c) => c.id === cardId);
      const primaryId = card?.is_primary ? card.id : card?.parent_card_id;
      const familyIds = cards
        .filter((c) => c.id === primaryId || c.parent_card_id === primaryId)
        .map((c) => c.id);
      return familyIds.reduce((s, cid) => s + (userMap[cid] || 0), 0);
    },
    [userCardCashMap, cards]
  );

  const getCardName = useCallback(
    (cardId?: string | null) => {
      const c = cards.find((card) => card.id === cardId);
      return c ? `${c.card_name} (**${c.last_4_digits})` : 'Card';
    },
    [cards]
  );

  const getRecorderName = useCallback(
    (userId?: string | null) => {
      return profiles.find((p) => p.id === userId)?.name || 'Unknown';
    },
    [profiles]
  );

  // Fetch Core Data
  const fetchData = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getSession();
      const currentAuthUser = authData?.session?.user;

      const [bRes, cRes, pRes, cohRes, cardLedgerRes, pocketLedgerRes, txsRes, spendsRes] =
        await Promise.all([
          supabase.from('borrowers').select('*').order('name'),
          supabase.from('cards').select('*').order('is_primary', { ascending: false }),
          supabase.from('profiles').select('*').order('name'),
          supabase.from('cash_on_hand').select('*'),
          supabase.from('card_lent_ledger').select('*').order('transaction_date', { ascending: false }),
          supabase.from('pocket_lent_ledger').select('*').order('transaction_date', { ascending: false }),
          supabase.from('card_transactions').select('amount, type, card_id, status, qr_id, remarks'),
          supabase.from('spends').select('amount, payment_method, card_id'),
        ]);

      const rawB: RawBorrower[] = bRes.data || [];
      const cardsData: CardData[] = cRes.data || [];
      const profilesData: Profile[] = pRes.data || [];
      const coh = cohRes.data || [];
      const cardEntriesData = cardLedgerRes.data || [];
      const pocketEntriesData = pocketLedgerRes.data || [];
      const txsData = txsRes.data || [];
      const spendsData = spendsRes.data || [];

      setRawBorrowers(rawB);
      setCards(cardsData);
      setProfiles(profilesData);
      setCardEntries(cardEntriesData);
      setPocketEntries(pocketEntriesData);

      let foundUser: Profile | null = null;
      if (currentAuthUser) {
        foundUser = profilesData.find((p) => p.id === currentAuthUser.id) || null;
      }
      if (!foundUser && profilesData.length > 0) {
        foundUser = profilesData[0];
      }
      setCurrentUser(foundUser);

      // Cash On Hand Map
      const cardCashMap: Record<string, Record<string, number>> = {};
      coh.forEach((c: any) => {
        if (c.user_id && c.card_id) {
          if (!cardCashMap[c.user_id]) cardCashMap[c.user_id] = {};
          cardCashMap[c.user_id][c.card_id] = Number(c.current_balance || 0);
        }
      });
      setUserCardCashMap(cardCashMap);

      // Card Available Map
      const availableMap: Record<string, number> = {};
      cardsData
        .filter((c) => c.is_primary)
        .forEach((primaryCard) => {
          const familyCardIds = cardsData
            .filter((c) => c.id === primaryCard.id || c.parent_card_id === primaryCard.id)
            .map((c) => c.id);

          const withdrawals =
            txsData
              .filter((t: any) => {
                if (t.type !== 'withdrawal') return false;
                if (!t.card_id || !familyCardIds.includes(t.card_id)) return false;
                const isRotation =
                  t.qr_id || (t.remarks || '').toLowerCase().includes('rotation');
                return (
                  isRotation ||
                  t.status === 'pending_settlement' ||
                  t.status === 'partially_settled'
                );
              })
              .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) || 0;

          const billPayments =
            txsData
              .filter(
                (t: any) =>
                  t.type === 'bill_payment' && t.card_id && familyCardIds.includes(t.card_id)
              )
              .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0) || 0;

          const ccSpends =
            spendsData
              .filter(
                (s: any) =>
                  s.payment_method === 'credit_card' &&
                  s.card_id &&
                  familyCardIds.includes(s.card_id)
              )
              .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0) || 0;

          const available =
            Number(primaryCard.total_limit || 0) - withdrawals - ccSpends + billPayments;
          familyCardIds.forEach((id) => {
            availableMap[id] = available;
          });
        });
      setCardAvailableMap(availableMap);
    } catch (err) {
      console.error('Error fetching lents data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Realtime listeners
    const channel = supabase
      .channel('lents_mobile_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_lent_ledger' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pocket_lent_ledger' },
        () => fetchData()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borrowers' }, () =>
        fetchData()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () =>
        fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Fetch individual borrower's ledger statement
  const fetchBorrowerLedger = useCallback(
    async (borrowerId: string) => {
      setIsLedgerLoading(true);
      try {
        let entriesList: LedgerEntry[] = [];

        if (activeTab === 'combined') {
          const [{ data: cRows }, { data: pRows }] = await Promise.all([
            supabase
              .from('card_lent_ledger')
              .select('*')
              .eq('borrower_id', borrowerId)
              .order('transaction_date', { ascending: false }),
            currentUser
              ? supabase
                  .from('pocket_lent_ledger')
                  .select('*')
                  .eq('borrower_id', borrowerId)
                  .eq('recorded_by', currentUser.id)
                  .order('transaction_date', { ascending: false })
              : Promise.resolve({ data: [] }),
          ]);

          const cardWithSource = (cRows || []).map((r) => ({
            ...r,
            ledgerSource: 'card' as const,
          }));
          const pocketWithSource = (pRows || []).map((r) => ({
            ...r,
            ledgerSource: 'pocket' as const,
          }));

          entriesList = [...cardWithSource, ...pocketWithSource].sort((a, b) => {
            const d = (b.transaction_date || '').localeCompare(a.transaction_date || '');
            if (d !== 0) return d;
            return (b.created_at || '').localeCompare(a.created_at || '');
          });
        } else if (activeTab === 'card') {
          const { data: cRows } = await supabase
            .from('card_lent_ledger')
            .select('*')
            .eq('borrower_id', borrowerId)
            .order('transaction_date', { ascending: false });

          entriesList = (cRows || []).map((r) => ({
            ...r,
            ledgerSource: 'card' as const,
          }));
        } else {
          // pocket
          let q = supabase
            .from('pocket_lent_ledger')
            .select('*')
            .eq('borrower_id', borrowerId);
          if (currentUser) {
            q = q.eq('recorded_by', currentUser.id);
          }
          const { data: pRows } = await q.order('transaction_date', { ascending: false });

          entriesList = (pRows || []).map((r) => ({
            ...r,
            ledgerSource: 'pocket' as const,
          }));
        }

        setBorrowerLedger(entriesList);
      } catch (err) {
        console.error('Error fetching borrower ledger:', err);
      } finally {
        setIsLedgerLoading(false);
      }
    },
    [activeTab, currentUser]
  );

  // Compute borrower summaries according to active tab and selected vault card
  const borrowerSummaries: BorrowerSummary[] = useMemo(() => {
    return rawBorrowers
      .map((b) => {
        let given = 0;
        let collected = 0;
        let latestDate = b.created_at || '';

        // Card Ledger
        if (activeTab === 'combined' || activeTab === 'card') {
          cardEntries
            .filter((e) => e.borrower_id === b.id)
            .forEach((e) => {
              if (selectedVaultCardId !== 'all' && e.card_id !== selectedVaultCardId) return;

              const isGiven = e.entry_type === 'given' || e.entry_type === 'lent';
              const isCollect = e.entry_type === 'collected' || e.entry_type === 'return';
              if (isGiven) given += Number(e.amount || 0);
              if (isCollect) collected += Number(e.amount || 0);

              if (e.transaction_date && e.transaction_date > latestDate) {
                latestDate = e.transaction_date;
              }
            });
        }

        // Pocket Ledger (only recorded by currentUser)
        if (activeTab === 'combined' || activeTab === 'pocket') {
          pocketEntries
            .filter((e) => e.borrower_id === b.id)
            .forEach((e) => {
              if (currentUser && e.recorded_by && e.recorded_by !== currentUser.id) return;

              const isGiven = e.entry_type === 'given' || e.entry_type === 'lent';
              const isCollect = e.entry_type === 'collected' || e.entry_type === 'return';
              if (isGiven) given += Number(e.amount || 0);
              if (isCollect) collected += Number(e.amount || 0);

              if (e.transaction_date && e.transaction_date > latestDate) {
                latestDate = e.transaction_date;
              }
            });
        }

        const netDue = given - collected;
        return {
          id: b.id,
          name: b.name,
          phone: b.phone,
          netDue,
          totalGiven: given,
          lastActivity: latestDate
            ? new Date(latestDate).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
              })
            : 'Recent',
        };
      })
      .filter((b) => b.totalGiven > 0 || b.netDue !== 0) // only active ledger profiles
      .sort((a, b) => b.netDue - a.netDue);
  }, [
    rawBorrowers,
    cardEntries,
    pocketEntries,
    activeTab,
    selectedVaultCardId,
    currentUser,
  ]);

  // Filtered by Search query
  const filteredBorrowers = useMemo(() => {
    if (!searchQuery.trim()) return borrowerSummaries;
    const q = searchQuery.toLowerCase().trim();
    return borrowerSummaries.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.phone && b.phone.toLowerCase().includes(q))
    );
  }, [borrowerSummaries, searchQuery]);

  // Aggregate Metrics for Hero Card
  const totalNetDue = useMemo(() => {
    return borrowerSummaries.reduce((sum, b) => sum + Math.max(0, b.netDue), 0);
  }, [borrowerSummaries]);

  const totalGivenAll = useMemo(() => {
    return borrowerSummaries.reduce((sum, b) => sum + b.totalGiven, 0);
  }, [borrowerSummaries]);

  const handleBorrowerPress = (b: BorrowerSummary) => {
    setSelectedBorrower(b);
    setIsLedgerDrawerOpen(true);
    fetchBorrowerLedger(b.id);
  };

  // ================= SAVE: YOU GAVE LOAN =================
  const handleSaveGiveLoan = async ({
    amount,
    date,
    sourceType,
    cardId,
    remarks,
  }: LentGiveSubmitParams) => {
    if (!currentUser || !selectedBorrower) return;

    let linkedCashLedgerId: string | null = null;
    let linkedCardTransactionId: string | null = null;

    const isPocket = sourceType === 'pocket';
    const tableName = isPocket ? 'pocket_lent_ledger' : 'card_lent_ledger';

    if (!isPocket && cardId) {
      if (sourceType === 'cash_on_hand') {
        const { data: cohRow, error: cohErr } = await supabase
          .from('cash_on_hand_ledger')
          .insert({
            user_id: currentUser.id,
            card_id: cardId,
            amount,
            transaction_type: 'debit',
            remarks: `Lent given to ${selectedBorrower.name}`,
            transaction_date: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (cohErr) throw cohErr;
        linkedCashLedgerId = cohRow?.id || null;
      } else if (sourceType === 'credit_card') {
        const { data: txRow, error: txErr } = await supabase
          .from('card_transactions')
          .insert({
            card_id: cardId,
            amount,
            type: 'withdrawal',
            status: 'pending_settlement',
            transaction_date: date,
            recorded_by: currentUser.id,
            remarks: `Lent given to ${selectedBorrower.name}`,
          })
          .select('id')
          .single();
        if (txErr) throw txErr;
        linkedCardTransactionId = txRow?.id || null;
      }
    }

    const { error: insertErr } = await supabase.from(tableName).insert({
      borrower_id: selectedBorrower.id,
      entry_type: 'given',
      amount,
      transaction_date: date,
      ...(!isPocket
        ? {
            source_type: sourceType,
            card_id: cardId,
            linked_cash_ledger_id: linkedCashLedgerId,
            linked_card_transaction_id: linkedCardTransactionId,
          }
        : {}),
      remarks: remarks || null,
      recorded_by: currentUser.id,
    });
    if (insertErr) throw insertErr;

    // Celebration modal
    setSuccessTitle('Loan Given Recorded');
    setSuccessSubtitle(`Advanced ₹${amount.toLocaleString('en-IN')} to ${selectedBorrower.name}`);
    setSuccessAmount(amount);
    setSuccessModalVisible(true);

    await fetchData();
    await fetchBorrowerLedger(selectedBorrower.id);
  };

  // ================= SAVE: YOU GOT PAYMENT =================
  const handleSaveCollectLoan = async ({
    amount,
    date,
    sourceType,
    cardId,
    remarks,
  }: LentCollectSubmitParams) => {
    if (!currentUser || !selectedBorrower) return;

    let linkedCashLedgerId: string | null = null;
    let linkedCardTransactionId: string | null = null;
    let linkedBillingCycleId: string | null = null;

    const isPocket = sourceType === 'pocket';
    const tableName = isPocket ? 'pocket_lent_ledger' : 'card_lent_ledger';

    if (!isPocket && cardId) {
      if (sourceType === 'cash_on_hand') {
        const { data: cohRow, error: cohErr } = await supabase
          .from('cash_on_hand_ledger')
          .insert({
            user_id: currentUser.id,
            card_id: cardId,
            amount,
            transaction_type: 'credit',
            remarks: `Collected lent from ${selectedBorrower.name}`,
            transaction_date: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (cohErr) throw cohErr;
        linkedCashLedgerId = cohRow?.id || null;
      } else if (sourceType === 'credit_card') {
        // Bill paydown check
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString(
          'en-CA',
          { timeZone: 'Asia/Kolkata' }
        );
        const endOfMonth = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0
        ).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        const { data: cycles } = await supabase
          .from('billing_cycles')
          .select('*')
          .eq('card_id', cardId)
          .gte('billing_month', startOfMonth)
          .lte('billing_month', endOfMonth);

        if (cycles && cycles.length > 0) {
          const cycle = cycles[0];
          const generatedAmt = Number(cycle.generated_amount || 0);
          const paidAmt = Number(cycle.paid_amount || 0);
          if (paidAmt < generatedAmt) {
            const newPaidAmt = paidAmt + amount;
            let cycleStatus = cycle.status;
            if (newPaidAmt >= generatedAmt) cycleStatus = 'paid';
            else if (newPaidAmt > 0) cycleStatus = 'partially_paid';
            await supabase
              .from('billing_cycles')
              .update({ paid_amount: newPaidAmt, status: cycleStatus })
              .eq('id', cycle.id);
            linkedBillingCycleId = cycle.id;
          }
        }

        const { data: txRow, error: txErr } = await supabase
          .from('card_transactions')
          .insert({
            card_id: cardId,
            amount,
            transaction_date: date,
            type: 'bill_payment',
            status: 'settled',
            recorded_by: currentUser.id,
            payment_method: 'lent_recovery',
            remarks: `Collected lent from ${selectedBorrower.name}`,
            billing_cycle_id: linkedBillingCycleId,
          })
          .select('id')
          .single();
        if (txErr) throw txErr;
        linkedCardTransactionId = txRow?.id || null;
      }
    }

    const { error: insertErr } = await supabase.from(tableName).insert({
      borrower_id: selectedBorrower.id,
      entry_type: 'collected',
      amount,
      transaction_date: date,
      ...(!isPocket
        ? {
            source_type: sourceType,
            card_id: cardId,
            linked_cash_ledger_id: linkedCashLedgerId,
            linked_card_transaction_id: linkedCardTransactionId,
            linked_billing_cycle_id: linkedBillingCycleId,
            billing_cycle_delta_amount: linkedBillingCycleId ? amount : null,
          }
        : {}),
      remarks: remarks || null,
      recorded_by: currentUser.id,
    });
    if (insertErr) throw insertErr;

    // Celebration modal
    setSuccessTitle('Payment Recovery Recorded');
    setSuccessSubtitle(`Received ₹${amount.toLocaleString('en-IN')} from ${selectedBorrower.name}`);
    setSuccessAmount(amount);
    setSuccessModalVisible(true);

    await fetchData();
    await fetchBorrowerLedger(selectedBorrower.id);
  };

  // Add Borrower
  const handleAddBorrower = async ({ name, phone }: { name: string; phone?: string }) => {
    const { error } = await supabase.from('borrowers').insert({
      name,
      phone: phone || null,
    });
    if (error) throw error;
    await fetchData();
  };

  // Update Borrower
  const handleUpdateBorrower = async ({
    id,
    name,
    phone,
  }: {
    id: string;
    name: string;
    phone?: string;
  }) => {
    const { error } = await supabase
      .from('borrowers')
      .update({ name, phone: phone || null })
      .eq('id', id);
    if (error) throw error;

    if (selectedBorrower?.id === id) {
      setSelectedBorrower((prev) =>
        prev ? { ...prev, name, phone: phone || null } : null
      );
    }
    await fetchData();
  };

  // Delete Borrower
  const handleDeleteBorrower = async (borrowerId: string) => {
    const { error } = await supabase.from('borrowers').delete().eq('id', borrowerId);
    if (error) throw error;
    setIsLedgerDrawerOpen(false);
    setSelectedBorrower(null);
    await fetchData();
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
                <Text style={styles.liveStatusText}>RECEIVABLES LEDGER • REALTIME</Text>
              </View>
              <Text style={styles.headerTitle}>Lents & Loans</Text>
            </View>
          </TouchableOpacity>

          {/* Vault Card Dropdown Selector */}
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

      {/* ================= 2. ANIMATED HERO OUTSTANDING DUE CARD ================= */}
      <View style={styles.heroCardWrapper}>
        <Animated.View style={heroAnimStyle}>
          <LinearGradient
            colors={['#071A12', '#0C2B20', '#071A12']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.heroLabel}>
                  {activeTab === 'combined'
                    ? 'Total Outstanding Due (Combined)'
                    : activeTab === 'card'
                    ? 'Total Card & Cash Dues'
                    : 'Personal Pocket Outstanding'}
                </Text>
                <Text style={styles.heroAmount}>
                  ₹{totalNetDue.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.heroBadge}>
                <Clock size={12} color="#E05D52" />
                <Text style={styles.heroBadgeText}>
                  {borrowerSummaries.length} Borrowers
                </Text>
              </View>
            </View>

            <View style={styles.heroSubMetrics}>
              <View style={styles.heroSubMetricItem}>
                <Text style={styles.heroSubLabel}>Total Given</Text>
                <Text style={styles.heroSubVal}>
                  ₹{totalGivenAll.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.heroSubDivider} />
              <View style={styles.heroSubMetricItem}>
                <Text style={styles.heroSubLabel}>Active Ledger</Text>
                <Text style={styles.heroSubVal}>
                  {activeTab === 'combined'
                    ? 'Card + Pocket'
                    : activeTab === 'card'
                    ? 'Shared Limits'
                    : 'Private Pocket'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>

      {/* ================= 3. 3-TAB SEGMENTED CONTROLS ================= */}
      <View style={styles.tabBarContainer}>
        {(['combined', 'card', 'pocket'] as TabType[]).map((tab) => {
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

      {/* ================= 4. SEARCH & BORROWER LIST ================= */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBox}>
          <Search size={15} color="#658270" strokeWidth={2.2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search borrower by name or phone..."
            placeholderTextColor="#8CA394"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={14} color="#658270" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#0B3F28" />
          <Text style={styles.loaderText}>Loading Receivables Ledger...</Text>
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
          {filteredBorrowers.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIconCircle}>
                <Users size={32} color="#8CA394" />
              </View>
              <Text style={styles.emptyStateTitle}>
                {searchQuery ? 'No matching borrowers' : 'No Active Receivables'}
              </Text>
              <Text style={styles.emptyStateSub}>
                {searchQuery
                  ? 'Try searching with another name or phone number.'
                  : 'Tap the + button below to register a borrower and record loan entries.'}
              </Text>
              {!searchQuery && (
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => setIsAddBorrowerOpen(true)}
                  activeOpacity={0.85}
                >
                  <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.emptyAddBtnText}>Register Borrower</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredBorrowers.map((borrower) => (
              <BorrowerCard
                key={borrower.id}
                borrower={borrower}
                onPress={() => handleBorrowerPress(borrower)}
              />
            ))
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

      {/* Borrower Statement Drawer with Skeleton + Khatabook timeline */}
      <BorrowerLedgerDrawer
        visible={isLedgerDrawerOpen}
        onClose={() => setIsLedgerDrawerOpen(false)}
        borrower={selectedBorrower}
        entries={borrowerLedger}
        isLoading={isLedgerLoading}
        onGivePress={() => setIsGiveModalOpen(true)}
        onCollectPress={() => setIsCollectModalOpen(true)}
        onEditBorrowerPress={() => setIsEditBorrowerOpen(true)}
        getCardName={getCardName}
        getRecorderName={getRecorderName}
      />

      {/* Give Loan Modal */}
      <LentGiveModal
        visible={isGiveModalOpen}
        onClose={() => setIsGiveModalOpen(false)}
        borrowerName={selectedBorrower?.name || 'Borrower'}
        cards={cards}
        currentUserId={currentUser?.id}
        getUserCashForCard={getUserCashForCard}
        cardAvailableMap={cardAvailableMap}
        onSave={handleSaveGiveLoan}
      />

      {/* Collect Loan Modal */}
      <LentCollectModal
        visible={isCollectModalOpen}
        onClose={() => setIsCollectModalOpen(false)}
        borrowerName={selectedBorrower?.name || 'Borrower'}
        cards={cards}
        onSave={handleSaveCollectLoan}
      />

      {/* Add Borrower Modal */}
      <AddBorrowerModal
        visible={isAddBorrowerOpen}
        onClose={() => setIsAddBorrowerOpen(false)}
        onSave={handleAddBorrower}
      />

      {/* Edit Borrower Modal */}
      <EditBorrowerModal
        visible={isEditBorrowerOpen}
        onClose={() => setIsEditBorrowerOpen(false)}
        borrower={selectedBorrower}
        onUpdate={handleUpdateBorrower}
        onDelete={handleDeleteBorrower}
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
    marginBottom: 2,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8CA394',
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  vaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    gap: 6,
    maxWidth: 130,
  },
  vaultPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CAD6C9',
  },
  svgWaveWrapper: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
  },
  heroCardWrapper: {
    marginHorizontal: 18,
    marginTop: -8,
    marginBottom: 12,
  },
  heroCard: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1.2,
    borderColor: '#0F3B29',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#CAD6C9',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  heroAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(224, 93, 82, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(224, 93, 82, 0.3)',
    gap: 4,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E05D52',
  },
  heroSubMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroSubMetricItem: {
    flex: 1,
  },
  heroSubDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 12,
  },
  heroSubLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8CA394',
  },
  heroSubVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#CAD6C9',
    marginTop: 2,
  },
  tabBarContainer: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 10,
  },
  tabChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#E4ECE5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  activeTabChip: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
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
  searchBarContainer: {
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#072C1C',
    padding: 0,
  },
  contentScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A6B56',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4ECE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#072C1C',
    marginBottom: 6,
  },
  emptyStateSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#718C79',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B3F28',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  emptyAddBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
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
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
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
    paddingHorizontal: 24,
  },
  filterMenuBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    maxHeight: 380,
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DFE8E0',
    marginBottom: 8,
  },
  filterMenuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  menuOptionActive: {
    backgroundColor: '#EBF3EC',
  },
  menuOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2F5C3F',
  },
  menuOptionTextActive: {
    color: '#0B3F28',
    fontWeight: '900',
  },
  menuOptionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8CA394',
    marginTop: 2,
  },
});
