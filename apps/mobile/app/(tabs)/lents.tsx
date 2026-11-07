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
  interpolate,
  FadeInDown,
  LinearTransition,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  recordLentCollectedCreditCardPaydown,
  computeBorrowerSummaries,
  calculateCardAvailableMap,
} from '@credics/core';
import {
  broadcastLentIssueAlert,
  broadcastLentRecoveryAlert,
} from '../../lib/alertDispatcher';
import { useOfflineQueueStore } from '../../lib/offlineQueue';
import NetInfo from '@react-native-community/netinfo';
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
  CornerDownRight,
} from 'lucide-react-native';

import { BorrowerCard, BorrowerSummary } from '../../components/lents/BorrowerCard';
import {
  BorrowerLedgerDrawer,
  LedgerEntry,
} from '../../components/lents/BorrowerLedgerDrawer';
import { useCardStore, buildHierarchicalCardList } from '../../lib/cardStore';
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
import {
  BorrowerPickerDrawer,
  BorrowerItem,
} from '../../components/lents/BorrowerPickerDrawer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_ITEM_WIDTH = (SCREEN_WIDTH - 32 - 8) / 3;

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

  // Vault Selection (Global Persistent)
  const { selectedCardId: selectedVaultCardId, setSelectedCardId: setSelectedVaultCardId } =
    useCardStore();
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const headerExpandedProgress = useSharedValue(0);

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
  const [isBorrowerPickerOpen, setIsBorrowerPickerOpen] = useState(false);

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
  const tabIndicatorX = useSharedValue(0);
  const horizontalScrollRef = React.useRef<ScrollView>(null);

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
    transform: [{ scale: fabScale.value }],
  }));

  const heroAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heroCardScale.value }],
    opacity: heroCardOpacity.value,
  }));

  const tabIndicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorX.value }],
  }));

  const handleTabSwitch = (tab: TabType, index: number) => {
    setActiveTab(tab);
    tabIndicatorX.value = withSpring(index * TAB_ITEM_WIDTH, { damping: 22, stiffness: 240 });
    horizontalScrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const handlePageScrollEnd = (e: any) => {
    const pageIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    const tabs: TabType[] = ['combined', 'card', 'pocket'];
    const newTab = tabs[pageIndex] || 'combined';
    if (newTab !== activeTab) {
      setActiveTab(newTab);
      tabIndicatorX.value = withSpring(pageIndex * TAB_ITEM_WIDTH, { damping: 22, stiffness: 240 });
    }
  };

  // Tab switch animation for Hero Card
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
    const next = !isHeaderExpanded;
    setIsHeaderExpanded(next);
    headerExpandedProgress.value = withSpring(next ? 1 : 0, {
      damping: 20,
      stiffness: 220,
    });
  };

  // Hierarchical cards for header accordion
  const hierarchicalCards = useMemo(() => {
    return buildHierarchicalCardList(cards);
  }, [cards]);

  const totalUnifiedAvailable = useMemo(() => {
    return cards
      .filter((c) => c.is_primary || !c.parent_card_id)
      .reduce((sum, c) => sum + (cardAvailableMap[c.id] || 0), 0);
  }, [cards, cardAvailableMap]);

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
          supabase.from('card_transactions').select('amount, type, card_id, status, qr_id, remarks, settled_to_user'),
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

      // Card Available Map via @credics/core Canonical Engine
      const availableMap = calculateCardAvailableMap(cardsData as any, txsData, spendsData);
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
          let targetCardIds: string[] = [];
          if (selectedVaultCardId !== 'all') {
            const selected = cards.find((c) => c.id === selectedVaultCardId);
            if (selected) {
              const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
              targetCardIds = cards
                .filter((c) => c.id === primaryId || c.parent_card_id === primaryId)
                .map((c) => c.id);
            } else {
              targetCardIds = [selectedVaultCardId];
            }
          }

          let cQuery = supabase
            .from('card_lent_ledger')
            .select('*')
            .eq('borrower_id', borrowerId);

          if (targetCardIds.length > 0) {
            cQuery = cQuery.in('card_id', targetCardIds);
          }

          const { data: cRows } = await cQuery.order('transaction_date', { ascending: false });

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
    [activeTab, currentUser, selectedVaultCardId, cards]
  );

  // Compute borrower summaries per tab for seamless horizontal swipe paging
  const getBorrowerSummariesForTab = useCallback(
    (tab: TabType): BorrowerSummary[] => {
      let targetCardIds: string[] = [];
      if (selectedVaultCardId !== 'all') {
        const selected = cards.find((c) => c.id === selectedVaultCardId);
        if (selected) {
          const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
          targetCardIds = cards
            .filter((c) => c.id === primaryId || c.parent_card_id === primaryId)
            .map((c) => c.id);
        } else {
          targetCardIds = [selectedVaultCardId];
        }
      }

      return rawBorrowers
        .map((b) => {
          let given = 0;
          let collected = 0;
          let latestTimestamp = b.created_at || '';

          // Card Ledger
          if (tab === 'combined' || tab === 'card') {
            cardEntries
              .filter((e) => e.borrower_id === b.id)
              .forEach((e) => {
                if (tab === 'card' && selectedVaultCardId !== 'all' && !targetCardIds.includes(e.card_id)) return;

                const isGiven = e.entry_type === 'given' || e.entry_type === 'lent';
                const isCollect = e.entry_type === 'collected' || e.entry_type === 'return';
                if (isGiven) given += Number(e.amount || 0);
                if (isCollect) collected += Number(e.amount || 0);

                const actTime = e.updated_at || e.transaction_date || e.created_at || '';
                if (actTime > latestTimestamp) {
                  latestTimestamp = actTime;
                }
              });
          }

          // Pocket Ledger (only recorded by currentUser)
          if (tab === 'combined' || tab === 'pocket') {
            pocketEntries
              .filter((e) => e.borrower_id === b.id)
              .forEach((e) => {
                if (!currentUser || e.recorded_by !== currentUser.id) return;

                const isGiven = e.entry_type === 'given' || e.entry_type === 'lent';
                const isCollect = e.entry_type === 'collected' || e.entry_type === 'return';
                if (isGiven) given += Number(e.amount || 0);
                if (isCollect) collected += Number(e.amount || 0);

                const actTime = e.updated_at || e.transaction_date || e.created_at || '';
                if (actTime > latestTimestamp) {
                  latestTimestamp = actTime;
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
            rawActivity: latestTimestamp,
            lastActivity: latestTimestamp
              ? new Date(latestTimestamp).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                })
              : 'Recent',
          };
        })
        .filter((b) => b.totalGiven > 0 || b.netDue !== 0) // only active ledger profiles on main screen
        .sort((a, b) => {
          const timeDiff = (b.rawActivity || '').localeCompare(a.rawActivity || '');
          if (timeDiff !== 0) return timeDiff;
          return b.netDue - a.netDue;
        });
    },
    [rawBorrowers, cardEntries, pocketEntries, selectedVaultCardId, cards, currentUser]
  );

  const combinedSummaries = useMemo(
    () => getBorrowerSummariesForTab('combined'),
    [getBorrowerSummariesForTab]
  );
  const cardSummaries = useMemo(
    () => getBorrowerSummariesForTab('card'),
    [getBorrowerSummariesForTab]
  );
  const pocketSummaries = useMemo(
    () => getBorrowerSummariesForTab('pocket'),
    [getBorrowerSummariesForTab]
  );

  const borrowerSummaries = useMemo(() => {
    if (activeTab === 'card') return cardSummaries;
    if (activeTab === 'pocket') return pocketSummaries;
    return combinedSummaries;
  }, [activeTab, combinedSummaries, cardSummaries, pocketSummaries]);

  // Filtered by Search query for each tab page
  const filterBorrowers = useCallback((list: BorrowerSummary[], query: string) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase().trim();
    return list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.phone && b.phone.toLowerCase().includes(q))
    );
  }, []);

  const filteredCombined = useMemo(
    () => filterBorrowers(combinedSummaries, searchQuery),
    [filterBorrowers, combinedSummaries, searchQuery]
  );
  const filteredCard = useMemo(
    () => filterBorrowers(cardSummaries, searchQuery),
    [filterBorrowers, cardSummaries, searchQuery]
  );
  const filteredPocket = useMemo(
    () => filterBorrowers(pocketSummaries, searchQuery),
    [filterBorrowers, pocketSummaries, searchQuery]
  );

  const filteredBorrowers = useMemo(() => {
    if (activeTab === 'card') return filteredCard;
    if (activeTab === 'pocket') return filteredPocket;
    return filteredCombined;
  }, [activeTab, filteredCombined, filteredCard, filteredPocket]);

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

    const originalCreatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const netState = await NetInfo.fetch();
    const isOnline = !!netState.isConnected;

    if (!isOnline) {
      // Offline queue enqueue
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'lent_give',
        payload: {
          borrowerId: selectedBorrower.id,
          amount,
          sourceType,
          cardId,
          remarks,
          userId: currentUser.id,
        },
        original_created_at: originalCreatedAt,
        transaction_date: date,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Loan Given Recorded (Offline)');
      setSuccessSubtitle(`Saved locally. Will auto-sync to ledger when connected.`);
      setSuccessAmount(amount);
      setSuccessModalVisible(true);
      return;
    }

    try {
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
              transaction_date: date,
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
              status: 'settled',
              transaction_date: date,
              created_at: originalCreatedAt,
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
        created_at: originalCreatedAt,
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

      // Rule 4: Success haptics on submit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // WhatsApp & Push Alert Dispatch
      const card = cards.find((c) => c.id === cardId);
      const sourceName =
        sourceType === 'pocket'
          ? 'Personal Pocket'
          : sourceType === 'cash_on_hand'
          ? `Cash on Hand${card ? ` (${card.card_name})` : ''}`
          : `Credit Card${card ? ` (${card.card_name})` : ''}`;

      broadcastLentIssueAlert({
        borrowerName: selectedBorrower.name,
        sourceName,
        entryUserName: currentUser.name || 'Member',
        amount,
        remarks: remarks || undefined,
        profiles,
      }).catch((alertErr) => {
        console.warn('Failed to dispatch lent issue alert:', alertErr);
      });

      // Celebration modal
      setSuccessTitle('Loan Given Recorded');
      setSuccessSubtitle(`Advanced ₹${amount.toLocaleString('en-IN')} to ${selectedBorrower.name}`);
      setSuccessAmount(amount);
      setSuccessModalVisible(true);

      await fetchData();
      await fetchBorrowerLedger(selectedBorrower.id);
    } catch (onlineError) {
      console.warn('Online loan give failed, saving to offline queue:', onlineError);
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'lent_give',
        payload: {
          borrowerId: selectedBorrower.id,
          amount,
          sourceType,
          cardId,
          remarks,
          userId: currentUser.id,
        },
        original_created_at: originalCreatedAt,
        transaction_date: date,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Loan Given Recorded (Offline)');
      setSuccessSubtitle(`Saved locally. Will auto-sync when network returns.`);
      setSuccessAmount(amount);
      setSuccessModalVisible(true);
    }
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

    const originalCreatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const netState = await NetInfo.fetch();
    const isOnline = !!netState.isConnected;

    if (!isOnline) {
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'lent_collect',
        payload: {
          borrowerId: selectedBorrower.id,
          borrowerName: selectedBorrower.name,
          cardId,
          amount,
          userId: currentUser.id,
          sourceType,
        },
        original_created_at: originalCreatedAt,
        transaction_date: date,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Payment Recovery Recorded (Offline)');
      setSuccessSubtitle(`Saved locally. Will auto-sync to ledger when connected.`);
      setSuccessAmount(amount);
      setSuccessModalVisible(true);
      return;
    }

    try {
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
              transaction_date: date,
            })
            .select('id')
            .single();
          if (cohErr) throw cohErr;
          linkedCashLedgerId = cohRow?.id || null;
        } else if (sourceType === 'credit_card') {
          // Bill paydown check via @credics/core service
          const paydownRes = await recordLentCollectedCreditCardPaydown(supabase, {
            borrowerId: selectedBorrower.id,
            borrowerName: selectedBorrower.name,
            cardId,
            amount,
            txDate: date,
            userId: currentUser.id,
            createdAt: originalCreatedAt,
            remarks: remarks || undefined,
          });

          linkedBillingCycleId = paydownRes.cycleId;
          linkedCardTransactionId = paydownRes.cardTxId;
        }
      }

      if (sourceType !== 'credit_card' || isPocket) {
        const { error: insertErr } = await supabase.from(tableName).insert({
          borrower_id: selectedBorrower.id,
          entry_type: 'collected',
          amount,
          transaction_date: date,
          created_at: originalCreatedAt,
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
      }

      // Rule 4: Success haptics on submit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // WhatsApp & Push Alert Dispatch
      const isFull = (selectedBorrower.netDue - amount) <= 0;
      const remaining = Math.max(0, selectedBorrower.netDue - amount);
      const targetCard = cards.find((c) => c.id === cardId);
      const receivedOn =
        sourceType === 'credit_card'
          ? `Card Bill Pay${targetCard ? ` (${targetCard.card_name})` : ''}`
          : sourceType === 'cash_on_hand'
          ? `Cash on Hand${targetCard ? ` (${targetCard.card_name})` : ''}`
          : 'Personal Pocket';

      broadcastLentRecoveryAlert({
        borrowerName: selectedBorrower.name,
        entryUserName: currentUser.name || 'Member',
        amount,
        fullAmount: selectedBorrower.netDue,
        remainingDue: remaining,
        receivedOn,
        isFull,
        remarks: remarks || undefined,
        profiles,
      }).catch((alertErr) => {
        console.warn('Failed to dispatch lent recovery alert:', alertErr);
      });

      // Celebration modal
      setSuccessTitle('Payment Recovery Recorded');
      setSuccessSubtitle(`Received ₹${amount.toLocaleString('en-IN')} from ${selectedBorrower.name}`);
      setSuccessAmount(amount);
      setSuccessModalVisible(true);

      await fetchData();
      await fetchBorrowerLedger(selectedBorrower.id);
    } catch (onlineError) {
      console.warn('Online loan collect failed, saving to offline queue:', onlineError);
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'lent_collect',
        payload: {
          borrowerId: selectedBorrower.id,
          borrowerName: selectedBorrower.name,
          cardId,
          amount,
          userId: currentUser.id,
          sourceType,
        },
        original_created_at: originalCreatedAt,
        transaction_date: date,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccessTitle('Payment Recovery Recorded (Offline)');
      setSuccessSubtitle(`Saved locally. Will auto-sync when network returns.`);
      setSuccessAmount(amount);
      setSuccessModalVisible(true);
    }
  };

  // Add Borrower
  const handleAddBorrower = async ({ name, phone }: { name: string; phone?: string }) => {
    const { error } = await supabase.from('borrowers').insert({
      name,
      phone: phone || null,
    });
    if (error) throw error;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsLedgerDrawerOpen(false);
    setSelectedBorrower(null);
    await fetchData();
  };

  const renderBorrowerList = (list: BorrowerSummary[]) => {
    if (list.length === 0) {
      return (
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
              : 'Tap the + button below or directory button to register a borrower.'}
          </Text>
          {!searchQuery && (
            <View style={styles.emptyActionsRow}>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => setIsAddBorrowerOpen(true)}
                activeOpacity={0.85}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.emptyAddBtnText}>Register Borrower</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptyDirectoryBtn}
                onPress={() => setIsBorrowerPickerOpen(true)}
                activeOpacity={0.85}
              >
                <Users size={16} color="#0B3F28" strokeWidth={2.4} />
                <Text style={styles.emptyDirectoryBtnText}>All Borrowers</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    }

    return list.map((borrower, index) => (
      <Animated.View
        key={borrower.id}
        entering={FadeInDown.delay(Math.min(index * 35, 350)).springify()}
        layout={LinearTransition.springify()}
      >
        <BorrowerCard
          borrower={borrower}
          onPress={() => handleBorrowerPress(borrower)}
        />
      </Animated.View>
    ));
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

      {/* ================= 3. 3-TAB SEGMENTED CONTROLS (120HZ SLIDING PILL) ================= */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabsTrack}>
          {/* Animated 120Hz Sliding Background Pill */}
          <Animated.View style={[styles.slidingTabIndicator, tabIndicatorAnimStyle]} />

          {(['combined', 'card', 'pocket'] as const).map((tab, idx) => {
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

      {/* ================= 4. SEARCH BAR ================= */}
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
        <TouchableOpacity
          style={styles.directoryBtn}
          onPress={() => setIsBorrowerPickerOpen(true)}
          activeOpacity={0.8}
        >
          <Users size={16} color="#0B3F28" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {/* ================= 5. HORIZONTAL SWIPEABLE PAGER ================= */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#0B3F28" />
          <Text style={styles.loaderText}>Loading Receivables Ledger...</Text>
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
          {/* PAGE 0: COMBINED */}
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
              {renderBorrowerList(filteredCombined)}
            </ScrollView>
          </View>

          {/* PAGE 1: CARD & CASH */}
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
              {renderBorrowerList(filteredCard)}
            </ScrollView>
          </View>

          {/* PAGE 2: PERSONAL POCKET */}
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
              {renderBorrowerList(filteredPocket)}
            </ScrollView>
          </View>
        </ScrollView>
      )}

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

      {/* ================= MODALS & DRAWERS ================= */}

      {/* Borrower Statement Drawer with Skeleton + Khatabook timeline */}
      <BorrowerLedgerDrawer
        visible={isLedgerDrawerOpen}
        onClose={() => setIsLedgerDrawerOpen(false)}
        borrower={selectedBorrower}
        entries={borrowerLedger}
        isLoading={isLedgerLoading}
        currentUserId={currentUser?.id}
        onGivePress={() => setIsGiveModalOpen(true)}
        onCollectPress={() => setIsCollectModalOpen(true)}
        onEditBorrowerPress={() => setIsEditBorrowerOpen(true)}
        onEntriesChanged={() => {
          if (selectedBorrower) fetchBorrowerLedger(selectedBorrower.id);
          fetchData();
        }}
        getCardName={getCardName}
        getRecorderName={getRecorderName}
      />

      {/* Borrower Directory Picker Drawer */}
      <BorrowerPickerDrawer
        isOpen={isBorrowerPickerOpen}
        onClose={() => setIsBorrowerPickerOpen(false)}
        onSelectBorrower={(item) => {
          setIsBorrowerPickerOpen(false);
          const existing = borrowerSummaries.find((b) => b.id === item.id);
          if (existing) {
            handleBorrowerPress(existing);
          } else {
            const newSummary: BorrowerSummary = {
              id: item.id,
              name: item.name,
              phone: item.phone,
              netDue: 0,
              totalGiven: 0,
              lastActivity: 'New',
            };
            handleBorrowerPress(newSummary);
          }
        }}
        onBorrowerListChanged={fetchData}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
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
  tabsContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tabsTrack: {
    flexDirection: 'row',
    backgroundColor: '#E2ECE4',
    borderRadius: 16,
    padding: 4,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#D4E2D7',
  },
  slidingTabIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    width: TAB_ITEM_WIDTH,
    backgroundColor: '#0B3F28',
    borderRadius: 12,
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
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
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 8,
  },
  searchBox: {
    flex: 1,
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
  directoryBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
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
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  emptyDirectoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  emptyDirectoryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0B3F28',
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
});
