import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CedarColors, CedarTypography } from '@credics/core';
import { QuickActions } from '../../components/QuickActions';
import { UrgentBillBottomSheet } from '../../components/UrgentBillBottomSheet';
import { HapticButton } from '../../components/HapticButton';
import { HomeSkeleton } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Bell,
  Eye,
  EyeOff,
  TrendingUp,
  CreditCard,
  ChevronDown,
  Layers,
  Wallet,
  Users,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
  CalendarClock,
  Plus,
  Timer,
  Banknote,
  Receipt,
  Coins,
  QrCode,
  X,
  Send,
  CalendarDays,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react-native';

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  bill_gen_day: number;
  bill_due_day: number;
  parent_card_id?: string;
}

interface UserStat {
  id: string;
  name: string;
  cash: number;
  due: number;
  pocket: number;
  avatar_url?: string;
  cardBreakdown: Array<{ cardId: string; cardName: string; cardLast4: string; balance: number }>;
}

interface BillingCycle {
  id: string;
  card_id: string;
  billing_month: string;
  generated_amount: number;
  paid_amount: number;
  status: string;
  bill_gen_day?: number;
  bill_due_day?: number;
}

interface ActiveCooldown {
  qrId: string;
  merchantName: string;
  expiresAt: number;
}

interface QRItem {
  id: string;
  merchant_name: string;
  platform: string;
  qr_image_url: string;
  last_used_date: string | null;
  upi_id: string;
  base_payment_link?: string | null;
}

interface RecentTx {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  isCredit: boolean;
}

export default function HomeScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [showUrgentAlert, setShowUrgentAlert] = useState(false);
  const [cardModalVisible, setCardModalVisible] = useState(false);

  // User & Cards State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('Credics Vault');
  const [firstName, setFirstName] = useState<string>('');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('all');

  // Calculated Core Metrics
  const [totalLimit, setTotalLimit] = useState(0);
  const [availableLimit, setAvailableLimit] = useState(0);
  const [inTransit, setInTransit] = useState(0);
  const [usersCash, setUsersCash] = useState(0);
  const [daysToBill, setDaysToBill] = useState(0);
  const [nextBillDate, setNextBillDate] = useState<string>('');

  // Active Bills Section State
  const [activeBills, setActiveBills] = useState<BillingCycle[]>([]);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billFormCardId, setBillFormCardId] = useState('');
  const [billFormMonth, setBillFormMonth] = useState('');
  const [billFormGenAmount, setBillFormGenAmount] = useState('');
  const [billFormPaidAmount, setBillFormPaidAmount] = useState('');
  const [isSavingBill, setIsSavingBill] = useState(false);

  // Cash & Repayment Analytics State
  const [userStats, setUserStats] = useState<UserStat[]>([]);
  const [selectedUserStat, setSelectedUserStat] = useState<UserStat | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalTab, setUserModalTab] = useState<'summary' | 'cash_ledger' | 'due_ledger' | 'pocket_advance'>('summary');
  const [cashLedger, setCashLedger] = useState<any[]>([]);
  const [dueLedger, setDueLedger] = useState<any[]>([]);
  const [pocketLedger, setPocketLedger] = useState<any[]>([]);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);

  // Transfer State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferTargetUser, setTransferTargetUser] = useState<any>(null);
  const [transferReceiverCardId, setTransferReceiverCardId] = useState('');
  const [transferSenderCardId, setTransferSenderCardId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Smart Suggestions QR Module State
  const [suggestedQrs, setSuggestedQrs] = useState<QRItem[]>([]);
  const [activeCooldowns, setActiveCooldowns] = useState<ActiveCooldown[]>([]);
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());
  const [selectedQr, setSelectedQr] = useState<QRItem | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrPayingCardId, setQrPayingCardId] = useState('');
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [qrPaymentMode, setQrPaymentMode] = useState<'once' | 'multiple'>('once');
  const [isMarkingUsed, setIsMarkingUsed] = useState(false);

  // Recent Transactions
  const [recentTransactions, setRecentTransactions] = useState<RecentTx[]>([]);

  // Ticking cooldown timer
  useEffect(() => {
    const timer = setInterval(() => setNowTimestamp(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate Remaining Days to Bill Due Date
  const calculateBillDays = (cards: CardData[], selectedId: string) => {
    let targetDay = 26;
    if (selectedId !== 'all') {
      const card = cards.find((c) => c.id === selectedId);
      if (card?.bill_due_day) targetDay = card.bill_due_day;
    } else if (cards.length > 0) {
      targetDay = cards[0].bill_due_day || 26;
    }

    const now = new Date();
    let target = new Date(now.getFullYear(), now.getMonth(), targetDay);
    if (now > target) target = new Date(now.getFullYear(), now.getMonth() + 1, targetDay);
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    setDaysToBill(diff);

    const nth = (d: number) => {
      if (d > 3 && d < 21) return 'th';
      switch (d % 10) {
        case 1:
          return 'st';
        case 2:
          return 'nd';
        case 3:
          return 'rd';
        default:
          return 'th';
      }
    };
    const month = target.toLocaleString('default', { month: 'short' });
    setNextBillDate(`${targetDay}${nth(targetDay)} ${month}`);

    if (diff <= 1 && diff >= 0) {
      setShowUrgentAlert(true);
    }
  };

  // Fetch Complete Real Data from Supabase
  const fetchDashboardData = useCallback(async () => {
    try {
      // 1. Authenticated User & Profiles
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authUser = session?.user;

      if (!authUser) {
        router.replace('/login');
        return;
      }

      setCurrentUser(authUser);
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile) {
        setUserName(profile.name);
        const fName = profile.name.split(' ')[0];
        setFirstName(fName);
        if (profile.avatar_url) setUserAvatar(profile.avatar_url);
      }

      // 2. Fetch Accessible Cards
      const { data: accessData } = await supabase
        .from('card_access')
        .select('card_id')
        .eq('user_id', authUser.id);

      let myCards: CardData[] = [];
      if (accessData && accessData.length > 0) {
        const cardIds = accessData.map((a) => a.card_id);
        const { data: cardsData } = await supabase
          .from('cards')
          .select('*')
          .in('id', cardIds)
          .order('is_primary', { ascending: false });
        if (cardsData) myCards = cardsData;
      } else {
        const { data: fallbackCards } = await supabase
          .from('cards')
          .select('*')
          .order('is_primary', { ascending: false });
        if (fallbackCards) myCards = fallbackCards;
      }

      setAccessibleCards(myCards);
      calculateBillDays(myCards, selectedCardId);

      // Determine active card IDs for calculations
      let currentLimit = 0;
      let activeCardIds: string[] = [];

      if (selectedCardId === 'all') {
        currentLimit = myCards.filter((c) => c.is_primary).reduce((sum, c) => sum + Number(c.total_limit || 0), 0);
        activeCardIds = myCards.map((c) => c.id);
      } else {
        const selected = myCards.find((c) => c.id === selectedCardId);
        if (selected) {
          const primaryId = selected.is_primary ? selected.id : selected.parent_card_id;
          const primaryCard = myCards.find((c) => c.id === primaryId);
          currentLimit = primaryCard ? Number(primaryCard.total_limit) : Number(selected.total_limit);
          const familyCards = myCards.filter((c) => c.id === primaryId || c.parent_card_id === primaryId);
          activeCardIds = familyCards.map((c) => c.id);
        }
      }
      if (currentLimit === 0 && myCards.length > 0) {
        currentLimit = myCards.reduce((sum, c) => sum + Number(c.total_limit || 0), 0);
      }
      setTotalLimit(currentLimit);

      // 3. Transactions & Spends Calculation
      let txQuery = supabase.from('card_transactions').select('*');
      let spendsQuery = supabase.from('spends').select('*');
      let billsQuery = supabase
        .from('billing_cycles')
        .select('*, cards(card_name, last_4_digits, bill_gen_day, bill_due_day)')
        .order('billing_month', { ascending: false });

      if (activeCardIds.length > 0) {
        txQuery = txQuery.in('card_id', activeCardIds);
        spendsQuery = spendsQuery.in('card_id', activeCardIds);
        billsQuery = billsQuery.in('card_id', activeCardIds);
      }

      const [{ data: txs }, { data: spends }, { data: bills }] = await Promise.all([
        txQuery,
        spendsQuery,
        billsQuery,
      ]);

      // Calculate Available Limit
      const withdrawals =
        txs
          ?.filter((t) => {
            if (t.type !== 'withdrawal') return false;
            const isRotation = t.qr_id || t.settled_to_user || (t.remarks || '').toLowerCase().includes('rotation');
            if (isRotation) return true;
            return t.status === 'pending_settlement' || t.status === 'partially_settled';
          })
          .reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;

      const billPayments =
        txs?.filter((t) => t.type === 'bill_payment').reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;
      const ccSpends =
        spends?.filter((s) => s.payment_method === 'credit_card').reduce((sum, s) => sum + Number(s.amount || 0), 0) || 0;

      setAvailableLimit(Math.max(0, currentLimit - withdrawals - ccSpends + billPayments));

      // In Transit Rotations
      const inTransitAmt =
        txs
          ?.filter(
            (t) =>
              t.type === 'withdrawal' &&
              (t.qr_id || (t.remarks || '').toLowerCase().includes('rotation')) &&
              t.status !== 'settled'
          )
          .reduce((sum, t) => {
            const due =
              t.status === 'partially_settled' && t.settlement_details?.total_due !== undefined
                ? Number(t.settlement_details.total_due)
                : Number(t.amount);
            return sum + due;
          }, 0) || 0;
      setInTransit(inTransitAmt);

      // Active Bills Section (Deduplicate to latest bill per card)
      if (bills) {
        const latestPerCard = new Map<string, any>();
        bills.forEach((b: any) => {
          if (!latestPerCard.has(b.card_id)) latestPerCard.set(b.card_id, b);
        });
        setActiveBills(
          Array.from(latestPerCard.values()).map((b: any) => ({
            ...b,
            bill_gen_day: b.cards?.bill_gen_day,
            bill_due_day: b.cards?.bill_due_day,
          }))
        );
      }

      // 4. Cash on Hand & User Stats
      const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url');
      let cohQuery = supabase.from('cash_on_hand').select('*');
      if (activeCardIds.length > 0) cohQuery = cohQuery.in('card_id', activeCardIds);
      const { data: coh } = await cohQuery;

      const totalCoh = coh?.reduce((sum, c) => sum + Number(c.current_balance || 0), 0) || 0;
      setUsersCash(totalCoh);

      if (profiles) {
        const stats: UserStat[] = profiles.map((p) => {
          const userCohRows = coh?.filter((c) => c.user_id === p.id) || [];
          const cashTotal = userCohRows.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
          const totalPersonalSpends =
            spends
              ?.filter((s) => s.user_id === p.id && ['credit_card', 'from_card_limit', 'lent_recovery'].includes(s.payment_method))
              .reduce((sum, s) => sum + Number(s.amount), 0) || 0;
          const totalRepayments =
            txs
              ?.filter((t) => t.recorded_by === p.id && t.type === 'bill_payment' && t.payment_method === 'own_pocket')
              .reduce((sum, t) => sum + Number(t.amount), 0) || 0;
          const due = Math.max(0, totalPersonalSpends - totalRepayments);

          const cardBreakdown = myCards.map((c) => ({
            cardId: c.id,
            cardName: c.card_name,
            cardLast4: c.last_4_digits,
            balance: Number(userCohRows.find((r) => r.card_id === c.id)?.current_balance || 0),
          }));

          return {
            id: p.id,
            name: p.name.split(' ')[0],
            cash: cashTotal,
            due,
            pocket: 0,
            avatar_url: p.avatar_url,
            cardBreakdown,
          };
        });
        setUserStats(stats);
      }

      // 5. Smart Suggestions QR Module
      const { data: qrData } = await supabase.from('qrs').select('*').eq('status', 'active');
      if (qrData) {
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentQrTxs } = await supabase
          .from('card_transactions')
          .select('qr_id, created_at')
          .eq('recorded_by', authUser.id)
          .not('qr_id', 'is', null)
          .gte('created_at', fiveDaysAgo)
          .order('created_at', { ascending: false });

        const cooldownList: ActiveCooldown[] = [];
        const processedQrIds = new Set<string>();

        if (recentQrTxs) {
          recentQrTxs.forEach((t) => {
            if (!t.qr_id || processedQrIds.has(t.qr_id)) return;
            const qrInfo = qrData.find((q) => q.id === t.qr_id);
            if (!qrInfo) return;
            const expiresAt = new Date(t.created_at).getTime() + 24 * 60 * 60 * 1000;
            if (expiresAt > Date.now()) {
              cooldownList.push({
                qrId: t.qr_id,
                merchantName: qrInfo.merchant_name,
                expiresAt,
              });
            }
            processedQrIds.add(t.qr_id);
          });
        }
        setActiveCooldowns(cooldownList);

        // Filter operational QRs (exclude current user's name, BharatPe 5-day rule, active cooling)
        const operational = qrData.filter((q) => {
          const nameLower = q.merchant_name.toLowerCase();
          const firstWord = nameLower.split(/\s+/)[0];
          if (firstName && firstWord === firstName.toLowerCase()) return false;

          const isBharatPe = nameLower.includes('bharatpe') || (q.platform || '').toLowerCase().includes('bharatpe');
          if (isBharatPe && q.last_used_date) {
            const daysSinceUsed = (Date.now() - new Date(q.last_used_date).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUsed < 5) return false;
          }

          if (cooldownList.some((c) => c.qrId === q.id)) return false;
          return true;
        });

        operational.sort((a, b) => {
          const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
          const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;
          return timeA - timeB;
        });

        setSuggestedQrs(operational.slice(0, 3));
      }

      // 6. Form Real Recent Transactions Feed
      const txFeed: RecentTx[] = [];
      if (txs && txs.length > 0) {
        txs.slice(0, 4).forEach((t) => {
          const isPayment = t.type === 'bill_payment';
          txFeed.push({
            id: t.id,
            title: isPayment ? 'Bill Payment Repaid' : t.remarks || 'Rotation Withdrawal',
            category: isPayment ? 'Repayment' : 'Card Rotation',
            amount: Number(t.amount),
            date: t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent',
            isCredit: isPayment,
          });
        });
      }

      if (spends && spends.length > 0) {
        spends.slice(0, 3).forEach((s) => {
          txFeed.push({
            id: s.id,
            title: s.remarks || 'Card Expense',
            category: s.spend_type || 'Personal Spend',
            amount: Number(s.amount),
            date: s.spend_date ? new Date(s.spend_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent',
            isCredit: false,
          });
        });
      }
      setRecentTransactions(txFeed);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedCardId, firstName]);

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase
      .channel('mobile-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_cycles' }, () => fetchDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getActiveCardName = () => {
    if (selectedCardId === 'all') return 'All Vault Cards';
    const card = accessibleCards.find((c) => c.id === selectedCardId);
    return card ? `${card.card_name} (••${card.last_4_digits})` : 'All Vault Cards';
  };

  // Open User Detail Ledger Modal
  const openUserStatModal = async (stat: UserStat) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    setSelectedUserStat(stat);
    setUserModalTab('summary');
    setIsUserModalOpen(true);
    setIsLedgerLoading(true);

    try {
      const [{ data: cData }, { data: dData }, { data: pData }] = await Promise.all([
        supabase
          .from('cash_on_hand_ledger')
          .select('*')
          .eq('user_id', stat.id)
          .order('transaction_date', { ascending: false })
          .limit(20),
        supabase
          .from('spends')
          .select('*')
          .eq('user_id', stat.id)
          .order('spend_date', { ascending: false })
          .limit(20),
        supabase
          .from('pocket_advances_ledger')
          .select('*')
          .eq('user_id', stat.id)
          .order('transaction_date', { ascending: false })
          .limit(20),
      ]);

      setCashLedger(cData || []);
      setDueLedger(dData || []);
      setPocketLedger(pData || []);
    } catch (err) {
      console.error('Error fetching user ledger:', err);
    } finally {
      setIsLedgerLoading(false);
    }
  };

  // Save Bill Cycle Modal
  const handleSaveBill = async () => {
    if (!billFormCardId || !billFormMonth || !billFormGenAmount) {
      Alert.alert('Required', 'Please fill all mandatory fields.');
      return;
    }

    setIsSavingBill(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const generated = Number(billFormGenAmount);
      const paid = Number(billFormPaidAmount) || 0;
      const status = paid >= generated ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid';

      await supabase.from('billing_cycles').insert({
        card_id: billFormCardId,
        billing_month: `${billFormMonth}-01`,
        generated_amount: generated,
        paid_amount: paid,
        status,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsBillModalOpen(false);
      setBillFormGenAmount('');
      setBillFormPaidAmount('');
      fetchDashboardData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save bill cycle.');
    } finally {
      setIsSavingBill(false);
    }
  };

  // QR Modal: Generate Dynamic Links
  const handleGeneratePaymentAmounts = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    if (qrPaymentMode === 'once') {
      const high = Math.random() < 0.9;
      setGeneratedAmounts([high ? Math.floor(Math.random() * 100 + 1900) : Math.floor(Math.random() * 50 + 1850)]);
    } else {
      const target = Math.floor(Math.random() * 100 + 1900);
      const first = Math.floor(Math.random() * (target - 1000) + 500);
      const second = target - first;
      setGeneratedAmounts([first, second]);
    }
  };

  // QR Modal: Mark as Used and Record Transaction
  const handleMarkQrAsUsed = async () => {
    if (!selectedQr || !qrPayingCardId) {
      Alert.alert('Required', 'Please select a paying card first.');
      return;
    }

    setIsMarkingUsed(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

    try {
      const totalAmt = generatedAmounts.length > 0 ? generatedAmounts.reduce((a, b) => a + b, 0) : 1900;
      const todayIso = new Date().toISOString().slice(0, 10);

      await supabase.from('qrs').update({ last_used_date: new Date().toISOString() }).eq('id', selectedQr.id);
      await supabase.from('card_transactions').insert({
        card_id: qrPayingCardId,
        qr_id: selectedQr.id,
        amount: totalAmt,
        transaction_date: todayIso,
        type: 'withdrawal',
        status: 'pending_settlement',
        recorded_by: currentUser?.id,
        remarks: `QR Rotation • ${selectedQr.merchant_name}`,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsQrModalOpen(false);
      setSelectedQr(null);
      setGeneratedAmounts([]);
      fetchDashboardData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to mark QR as used.');
    } finally {
      setIsMarkingUsed(false);
    }
  };

  const currentCooldowns = activeCooldowns.filter((c) => c.expiresAt > nowTimestamp);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <HomeSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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
        {/* ================= 1. HEADER ================= */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => router.push('/settings')}
            activeOpacity={0.8}
          >
            <View style={styles.avatarBorder}>
              {userAvatar ? (
                <Image source={{ uri: userAvatar }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {userName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.userTextCol}>
              <View style={styles.liveStatusRow}>
                <View style={styles.livePulseDot} />
                <Text style={styles.liveStatusText}>Live Status • Active</Text>
              </View>
              <Text style={styles.userNameText}>Hey, {firstName || userName}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {/* Vault Card Dropdown Pill */}
            <TouchableOpacity
              style={styles.cardDropdown}
              onPress={() => {
                Haptics.selectionAsync();
                setCardModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <CreditCard size={13} color={CedarColors.forest800} />
              <Text style={styles.cardDropdownText} numberOfLines={1}>
                {getActiveCardName()}
              </Text>
              <ChevronDown size={13} color={CedarColors.forest800} />
            </TouchableOpacity>

            {/* Notification Bell */}
            <HapticButton
              style={styles.iconCircle}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                setShowUrgentAlert(true);
              }}
              feedbackType="rigid"
            >
              <Bell size={18} color={CedarColors.ink900} />
              {daysToBill <= 3 && <View style={styles.notificationDot} />}
            </HapticButton>
          </View>
        </View>

        {/* ================= 2. HERO AVAILABLE LIMIT CARD (Luxury Cedar Gradient) ================= */}
        <LinearGradient
          colors={['#071A12', '#0C2B20', '#071A12']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          {/* Card Top: Balance Label & Eye Toggle */}
          <View style={styles.heroTopRow}>
            <View style={styles.heroLabelRow}>
              <View style={styles.heroDot} />
              <Text style={styles.heroLabel}>Total Available Limit</Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowBalance(!showBalance);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showBalance ? (
                  <Eye size={16} color="#CAD6C9" style={{ marginLeft: 8 }} />
                ) : (
                  <EyeOff size={16} color="#CAD6C9" style={{ marginLeft: 8 }} />
                )}
              </TouchableOpacity>
            </View>

            {/* Bill Countdown Badge */}
            <View style={styles.billDueBadge}>
              <CalendarClock size={12} color="#FCD34D" />
              <Text style={styles.billDueText}>
                {daysToBill <= 1 ? 'Due Tomorrow' : `Next Bill ${nextBillDate}`}
              </Text>
            </View>
          </View>

          {/* Large Balance Typography */}
          <View style={styles.heroAmountRow}>
            <Text style={styles.heroAmount}>
              {showBalance ? `₹${availableLimit.toLocaleString('en-IN')}` : '••••••••'}
            </Text>
            <View style={styles.trendPill}>
              <TrendingUp size={12} color="#4ADE80" />
              <Text style={styles.trendText}>Active Vault</Text>
            </View>
          </View>

          {/* Horizontal Translucent Divider */}
          <View style={styles.heroDivider} />

          {/* 3 Web Core Metrics Row */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <View style={styles.metricLabelRow}>
                <Wallet size={12} color="#34A853" />
                <Text style={styles.metricLabel}>Total Limit</Text>
              </View>
              <Text style={styles.metricValue}>
                {showBalance ? `₹${totalLimit.toLocaleString('en-IN')}` : '••••'}
              </Text>
            </View>

            <View style={styles.metricItem}>
              <View style={styles.metricLabelRow}>
                <Layers size={12} color="#38BDF8" />
                <Text style={styles.metricLabel}>In Transit</Text>
              </View>
              <Text style={[styles.metricValue, { color: '#38BDF8' }]}>
                {showBalance ? `₹${inTransit.toLocaleString('en-IN')}` : '••••'}
              </Text>
            </View>

            <View style={styles.metricItem}>
              <View style={styles.metricLabelRow}>
                <Users size={12} color="#4ADE80" />
                <Text style={styles.metricLabel}>Users Cash</Text>
              </View>
              <Text style={[styles.metricValue, { color: '#4ADE80' }]}>
                {showBalance ? `₹${usersCash.toLocaleString('en-IN')}` : '••••'}
              </Text>
            </View>
          </View>

          {/* 4 Circular Quick Action Buttons */}
          <QuickActions
            onAddLend={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
              router.push('/(tabs)/lents');
            }}
            onSendMoney={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
              router.push('/(tabs)/transactions');
            }}
            onTopUp={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
              router.push('/(tabs)/settlements');
            }}
            onScanQR={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
              router.push('/(tabs)/settlements');
            }}
          />
        </LinearGradient>

        {/* ================= 3. ACTIVE BILLING CYCLES SECTION ================= */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <CalendarClock size={16} color={CedarColors.forest800} />
              <Text style={styles.sectionTitle}>Active Billing Cycles</Text>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>
                  {activeBills.filter((b) => b.status !== 'paid').length} Pending
                </Text>
              </View>
            </View>

            <HapticButton
              style={styles.addMiniBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                setBillFormCardId(accessibleCards[0]?.id || '');
                setBillFormMonth(new Date().toISOString().slice(0, 7));
                setIsBillModalOpen(true);
              }}
              feedbackType="rigid"
            >
              <Plus size={14} color="#F6F9F5" />
            </HapticButton>
          </View>

          {activeBills.length === 0 ? (
            <View style={styles.emptyCardBox}>
              <Text style={styles.emptyBoxText}>No active billing statements found.</Text>
            </View>
          ) : (
            activeBills.map((bill) => {
              const card = accessibleCards.find((c) => c.id === bill.card_id);
              const due = Number(bill.generated_amount) - Number(bill.paid_amount);
              const isPaid = bill.status === 'paid' || due <= 0;

              const billMonth = new Date(bill.billing_month);
              const genDay = bill.bill_gen_day || card?.bill_gen_day || 7;
              const genDate = new Date(billMonth.getFullYear(), billMonth.getMonth(), genDay);

              const dueDate = new Date(genDate);
              dueDate.setDate(dueDate.getDate() + 19);

              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
              const daysLeft = Math.round((dueDayStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

              return (
                <View
                  key={bill.id}
                  style={[
                    styles.billCard,
                    isPaid ? styles.billCardPaid : styles.billCardPending,
                  ]}
                >
                  <View style={styles.billTopRow}>
                    <Text style={styles.billCardName}>
                      {card?.card_name || 'Vault Card'} (••{card?.last_4_digits || '0000'})
                    </Text>
                    {isPaid ? (
                      <View style={styles.paidBadge}>
                        <Text style={styles.paidBadgeText}>✓ PAID</Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.daysLeftBadge,
                          daysLeft <= 3 && { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.daysLeftText,
                            daysLeft <= 3 && { color: '#EF4444' },
                          ]}
                        >
                          {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Due today!' : `Overdue ${Math.abs(daysLeft)}d`}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 3 Metric Grid */}
                  <View style={styles.billGrid}>
                    <View style={styles.billCol}>
                      <Text style={styles.billColLabel}>Generated</Text>
                      <Text style={styles.billColValue}>₹{Number(bill.generated_amount).toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={[styles.billCol, styles.billColBorder]}>
                      <Text style={styles.billColLabel}>Paid</Text>
                      <Text style={[styles.billColValue, { color: '#2E944B' }]}>₹{Number(bill.paid_amount).toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={[styles.billCol, styles.billColBorder]}>
                      <Text style={styles.billColLabel}>Due</Text>
                      <Text style={[styles.billColValue, { color: due > 0 ? '#EF4444' : '#2E944B' }]}>
                        ₹{due > 0 ? due.toLocaleString('en-IN') : 0}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.billFooterRow}>
                    <Text style={styles.billDateText}>Gen: {fmtDate(genDate)}</Text>
                    <Text style={[styles.billDateText, daysLeft <= 3 && !isPaid && { color: '#EF4444', fontWeight: '700' }]}>
                      Due: {fmtDate(dueDate)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ================= 4. CASH & REPAYMENT ANALYTICS MODULE ================= */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Banknote size={16} color="#2E944B" />
              <Text style={styles.sectionTitle}>Cash & Repayment Analytics</Text>
            </View>
          </View>

          <View style={styles.userStatsGrid}>
            {userStats.map((stat) => (
              <TouchableOpacity
                key={stat.id}
                style={styles.userStatCard}
                onPress={() => openUserStatModal(stat)}
                activeOpacity={0.88}
              >
                <View style={styles.userStatTop}>
                  <View style={styles.statAvatar}>
                    <Text style={styles.statAvatarText}>{stat.name.charAt(0)}</Text>
                  </View>
                  <Text style={styles.statUserName} numberOfLines={1}>
                    {stat.name}
                  </Text>
                </View>

                <View style={styles.statMetrics}>
                  <Text style={styles.statLabel}>Holding Cash</Text>
                  <Text style={[styles.statValue, stat.cash > 0 && { color: '#2E944B' }]}>
                    ₹{stat.cash.toLocaleString('en-IN')}
                  </Text>

                  <View style={styles.statDivider} />

                  <Text style={styles.statLabel}>Personal Due</Text>
                  <Text style={[styles.statValue, stat.due > 0 && { color: '#EF4444' }]}>
                    ₹{stat.due.toLocaleString('en-IN')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ================= 5. SMART SUGGESTIONS & ACTIVE COOLDOWNS ================= */}
        <View style={styles.sectionContainer}>
          {/* Active Cooldown Queue if any */}
          {currentCooldowns.length > 0 && (
            <View style={styles.cooldownBanner}>
              <View style={styles.cooldownTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Timer size={14} color="#38BDF8" />
                  <Text style={styles.cooldownTitle}>Active Cooling Rotation</Text>
                </View>
                <Text style={styles.cooldownCount}>{currentCooldowns.length} QR Cooling</Text>
              </View>

              {currentCooldowns.map((c) => {
                const timeLeft = Math.max(0, c.expiresAt - nowTimestamp);
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
                return (
                  <View key={c.qrId} style={styles.cooldownRow}>
                    <Text style={styles.cooldownMerchant} numberOfLines={1}>
                      {c.merchantName}
                    </Text>
                    <Text style={styles.cooldownTimer}>
                      {hours}h {minutes}m left
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <QrCode size={16} color={CedarColors.forest800} />
              <Text style={styles.sectionTitle}>Smart Suggestions</Text>
            </View>
          </View>

          <View style={styles.qrSuggestionsList}>
            {suggestedQrs.map((qr, idx) => {
              const isBest = idx === 0;
              return (
                <TouchableOpacity
                  key={qr.id}
                  style={[styles.qrSuggestionItem, isBest && styles.qrSuggestionBest]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                    setSelectedQr(qr);
                    setQrPayingCardId(accessibleCards[0]?.id || '');
                    setGeneratedAmounts([]);
                    setIsQrModalOpen(true);
                  }}
                  activeOpacity={0.88}
                >
                  <View style={styles.qrItemLeft}>
                    <View style={styles.qrThumbnail}>
                      <QrCode size={18} color={CedarColors.forest800} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.qrMerchantName} numberOfLines={1}>
                          {qr.merchant_name}
                        </Text>
                        {isBest && (
                          <View style={styles.bestBadge}>
                            <Text style={styles.bestBadgeText}>Best</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.qrSubText}>{qr.platform || 'UPI QR'}</Text>
                    </View>
                  </View>

                  <ArrowRight size={16} color={CedarColors.ink500} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ================= 6. RECENT TRANSACTIONS FEED ================= */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Recent Transactions</Text>
              <Text style={styles.sectionSubtitle}>Live credit rotations & personal spends</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                router.push('/(tabs)/transactions');
              }}
            >
              <Text style={styles.seeAllText}>See all →</Text>
            </TouchableOpacity>
          </View>

          {recentTransactions.length === 0 ? (
            <View style={styles.emptyCardBox}>
              <Text style={styles.emptyBoxText}>No transactions recorded yet.</Text>
            </View>
          ) : (
            recentTransactions.map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <View style={styles.txLeft}>
                  <View
                    style={[
                      styles.txIconBox,
                      tx.isCredit ? styles.creditIconBox : styles.debitIconBox,
                    ]}
                  >
                    {tx.isCredit ? (
                      <ArrowDownLeft size={16} color="#2E944B" />
                    ) : (
                      <ArrowUpRight size={16} color={CedarColors.ink700} />
                    )}
                  </View>
                  <View style={styles.txTexts}>
                    <Text style={styles.txName} numberOfLines={1}>
                      {tx.title}
                    </Text>
                    <Text style={styles.txCategory}>{tx.category}</Text>
                  </View>
                </View>

                <View style={styles.txRight}>
                  <Text
                    style={[
                      styles.txAmount,
                      tx.isCredit ? styles.creditAmount : styles.debitAmount,
                    ]}
                  >
                    {tx.isCredit ? `+₹${tx.amount.toLocaleString('en-IN')}` : `-₹${tx.amount.toLocaleString('en-IN')}`}
                  </Text>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* ================= CARD SELECTOR MODAL ================= */}
      <Modal
        visible={cardModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCardModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCardModalVisible(false)}
        >
          <View style={styles.cardSelectDialog}>
            <Text style={styles.dialogTitle}>Select Credit Vault</Text>
            <Text style={styles.dialogSub}>
              Filter dashboard metrics by individual card or unified family vault
            </Text>

            <TouchableOpacity
              style={[
                styles.cardOptionRow,
                selectedCardId === 'all' && styles.cardOptionSelected,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedCardId('all');
                setCardModalVisible(false);
              }}
            >
              <View style={styles.cardOptionLeft}>
                <CreditCard size={18} color={CedarColors.forest800} />
                <Text style={styles.cardOptionName}>All Vault Cards (Unified)</Text>
              </View>
              {selectedCardId === 'all' && (
                <CheckCircle2 size={18} color={CedarColors.forest800} />
              )}
            </TouchableOpacity>

            {accessibleCards.map((c) => {
              const isSelected = selectedCardId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.cardOptionRow,
                    isSelected && styles.cardOptionSelected,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedCardId(c.id);
                    setCardModalVisible(false);
                  }}
                >
                  <View style={styles.cardOptionLeft}>
                    <CreditCard size={18} color={CedarColors.forest800} />
                    <View>
                      <Text style={styles.cardOptionName}>{c.card_name}</Text>
                      <Text style={styles.cardOptionDigits}>
                        •••• {c.last_4_digits} | Limit: ₹
                        {Number(c.total_limit).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  {isSelected && (
                    <CheckCircle2 size={18} color={CedarColors.forest800} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ================= BILL ENTRY MODAL ================= */}
      <Modal
        visible={isBillModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsBillModalOpen(false)}
      >
        <View style={styles.bottomSheetBackdrop}>
          <View style={styles.sheetDialog}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Manage Billing Cycle</Text>
              <TouchableOpacity onPress={() => setIsBillModalOpen(false)}>
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Select Vault Card</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
              {accessibleCards.filter((c) => c.is_primary).map((c) => {
                const isSel = billFormCardId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selectorChip, isSel && styles.activeSelectorChip]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setBillFormCardId(c.id);
                    }}
                  >
                    <Text style={[styles.selectorChipText, isSel && styles.activeSelectorChipText]}>
                      {c.card_name} (••{c.last_4_digits})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.inputLabel}>Billing Month (YYYY-MM)</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g. 2026-10"
              placeholderTextColor={CedarColors.ink500}
              value={billFormMonth}
              onChangeText={setBillFormMonth}
            />

            <Text style={styles.inputLabel}>Generated Bill Amount (₹)</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="0"
              placeholderTextColor={CedarColors.ink500}
              keyboardType="numeric"
              value={billFormGenAmount}
              onChangeText={setBillFormGenAmount}
            />

            <Text style={styles.inputLabel}>Amount Paid So Far (₹)</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="0"
              placeholderTextColor={CedarColors.ink500}
              keyboardType="numeric"
              value={billFormPaidAmount}
              onChangeText={setBillFormPaidAmount}
            />

            <HapticButton
              style={styles.sheetSaveBtn}
              onPress={handleSaveBill}
              feedbackType="rigid"
              disabled={isSavingBill}
            >
              {isSavingBill ? (
                <ActivityIndicator size="small" color="#F6F9F5" />
              ) : (
                <Text style={styles.sheetSaveText}>Save Bill Details</Text>
              )}
            </HapticButton>
          </View>
        </View>
      </Modal>

      {/* ================= USER DETAIL LEDGER MODAL ================= */}
      <Modal
        visible={isUserModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsUserModalOpen(false)}
      >
        <View style={styles.bottomSheetBackdrop}>
          <View style={[styles.sheetDialog, { height: '80%' }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{selectedUserStat?.name}'s Ledger</Text>
                <Text style={styles.sheetSub}>Advanced Cash & Spends Breakdown</Text>
              </View>
              <TouchableOpacity onPress={() => setIsUserModalOpen(false)}>
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            {/* Modal Tabs */}
            <View style={styles.modalTabRow}>
              {(['summary', 'cash_ledger', 'due_ledger'] as const).map((tab) => {
                const isTab = userModalTab === tab;
                const label = tab === 'summary' ? 'Summary' : tab === 'cash_ledger' ? 'Cash In/Out' : 'Personal Due';
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.modalTabBtn, isTab && styles.activeModalTabBtn]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setUserModalTab(tab);
                    }}
                  >
                    <Text style={[styles.modalTabText, isTab && styles.activeModalTabText]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tab Contents */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: 10 }}>
              {userModalTab === 'summary' && selectedUserStat && (
                <View style={{ gap: 12 }}>
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryBoxLabel}>Total Cash in Hand</Text>
                    <Text style={styles.summaryBoxAmount}>₹{selectedUserStat.cash.toLocaleString('en-IN')}</Text>
                    <Text style={styles.summaryBoxSub}>Unified card family aggregated balance</Text>
                  </View>

                  <Text style={styles.inputLabel}>Per-Card Cash Breakdown</Text>
                  {selectedUserStat.cardBreakdown.map((b) => (
                    <View key={b.cardId} style={styles.cardBreakdownRow}>
                      <Text style={styles.breakdownCardName}>{b.cardName} (••{b.cardLast4})</Text>
                      <Text style={styles.breakdownCardAmount}>₹{b.balance.toLocaleString('en-IN')}</Text>
                    </View>
                  ))}
                </View>
              )}

              {userModalTab === 'cash_ledger' && (
                isLedgerLoading ? (
                  <ActivityIndicator size="small" color={CedarColors.forest800} style={{ marginVertical: 20 }} />
                ) : cashLedger.length === 0 ? (
                  <Text style={styles.emptyBoxText}>No cash ledger entries found.</Text>
                ) : (
                  cashLedger.map((item) => (
                    <View key={item.id} style={styles.ledgerItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ledgerRemarks}>{item.remarks || 'Cash Transaction'}</Text>
                        <Text style={styles.ledgerDateText}>{item.transaction_date}</Text>
                      </View>
                      <Text style={[styles.ledgerAmtText, item.transaction_type === 'credit' ? { color: '#2E944B' } : { color: '#EF4444' }]}>
                        {item.transaction_type === 'credit' ? '+' : '-'}₹{Number(item.amount).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))
                )
              )}

              {userModalTab === 'due_ledger' && (
                isLedgerLoading ? (
                  <ActivityIndicator size="small" color={CedarColors.forest800} style={{ marginVertical: 20 }} />
                ) : dueLedger.length === 0 ? (
                  <Text style={styles.emptyBoxText}>No personal due records.</Text>
                ) : (
                  dueLedger.map((item) => (
                    <View key={item.id} style={styles.ledgerItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ledgerRemarks}>{item.remarks || 'Personal Expense'}</Text>
                        <Text style={styles.ledgerDateText}>{item.spend_date}</Text>
                      </View>
                      <Text style={[styles.ledgerAmtText, { color: '#EF4444' }]}>
                        -₹{Number(item.amount).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))
                )
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= QR PAYMENT STRATEGY MODAL ================= */}
      <Modal
        visible={isQrModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsQrModalOpen(false)}
      >
        <View style={styles.bottomSheetBackdrop}>
          <View style={styles.sheetDialog}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{selectedQr?.merchant_name}</Text>
                <Text style={styles.sheetSub}>{selectedQr?.upi_id || 'UPI Merchant QR'}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsQrModalOpen(false)}>
                <X size={20} color={CedarColors.ink900} />
              </TouchableOpacity>
            </View>

            {/* Paying Card Selector */}
            <Text style={styles.inputLabel}>Paying From Vault Card</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
              {accessibleCards.map((c) => {
                const isSel = qrPayingCardId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selectorChip, isSel && styles.activeSelectorChip]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setQrPayingCardId(c.id);
                    }}
                  >
                    <Text style={[styles.selectorChipText, isSel && styles.activeSelectorChipText]}>
                      {c.card_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Single vs Multiple Swipe Strategy */}
            <View style={styles.strategyRow}>
              <TouchableOpacity
                style={[styles.strategyBtn, qrPaymentMode === 'once' && styles.activeStrategyBtn]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setQrPaymentMode('once');
                  setGeneratedAmounts([]);
                }}
              >
                <Text style={[styles.strategyText, qrPaymentMode === 'once' && styles.activeStrategyText]}>
                  Single Swipe
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.strategyBtn, qrPaymentMode === 'multiple' && styles.activeStrategyBtn]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setQrPaymentMode('multiple');
                  setGeneratedAmounts([]);
                }}
              >
                <Text style={[styles.strategyText, qrPaymentMode === 'multiple' && styles.activeStrategyText]}>
                  Split Swipes
                </Text>
              </TouchableOpacity>
            </View>

            <HapticButton
              style={styles.generateLinkBtn}
              onPress={handleGeneratePaymentAmounts}
              feedbackType="rigid"
            >
              <Text style={styles.generateLinkText}>Generate Dynamic Payment Links</Text>
            </HapticButton>

            {generatedAmounts.map((amt, idx) => {
              const link = `upi://pay?pa=${selectedQr?.upi_id || ''}&pn=${encodeURIComponent(selectedQr?.merchant_name || '')}&am=${amt}&cu=INR`;
              return (
                <TouchableOpacity
                  key={idx}
                  style={styles.payLinkRow}
                  onPress={() => Linking.openURL(link)}
                >
                  <Text style={styles.payLinkText}>Pay ₹{amt}</Text>
                  <ArrowRight size={16} color="#2E944B" />
                </TouchableOpacity>
              );
            })}

            <HapticButton
              style={styles.sheetSaveBtn}
              onPress={handleMarkQrAsUsed}
              feedbackType="rigid"
              disabled={isMarkingUsed}
            >
              {isMarkingUsed ? (
                <ActivityIndicator size="small" color="#F6F9F5" />
              ) : (
                <Text style={styles.sheetSaveText}>Mark Used & Save Rotation</Text>
              )}
            </HapticButton>
          </View>
        </View>
      </Modal>

      {/* Urgent Bill Due Bottom Sheet Alert */}
      <UrgentBillBottomSheet
        visible={showUrgentAlert}
        onClose={() => setShowUrgentAlert(false)}
        dueDate={nextBillDate || 'Tomorrow'}
        amountDue={availableLimit > 0 ? 45000 : 0}
        daysLeft={daysToBill}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.canvas,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBorder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: CedarColors.forest800,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    flex: 1,
    backgroundColor: CedarColors.forest800,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#F6F9F5',
    fontSize: 16,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  userTextCol: {
    justifyContent: 'center',
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34A853',
  },
  liveStatusText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#2E944B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  userNameText: {
    fontSize: 16,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CedarColors.card,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CedarColors.border,
    maxWidth: 155,
  },
  cardDropdownText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
    maxWidth: 90,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 28,
    padding: 20,
    marginTop: 4,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34A853',
    marginRight: 6,
  },
  heroLabel: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  billDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(7, 26, 18, 0.45)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(252, 211, 77, 0.25)',
  },
  billDueText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FCD34D',
    fontWeight: '700',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 10,
  },
  heroAmount: {
    fontSize: 32,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#F6F9F5',
    letterSpacing: -0.5,
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 168, 83, 0.16)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  trendText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#4ADE80',
    fontWeight: '700',
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 14,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricItem: {
    flex: 1,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  metricValue: {
    fontSize: 15,
    fontFamily: CedarTypography.display,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  sectionContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#D97706',
    fontWeight: '700',
  },
  addMiniBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CedarColors.forest800,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCardBox: {
    backgroundColor: CedarColors.card,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  emptyBoxText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  billCard: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  billCardPending: {
    backgroundColor: CedarColors.card,
    borderColor: CedarColors.border,
  },
  billCardPaid: {
    backgroundColor: 'rgba(46, 148, 75, 0.05)',
    borderColor: 'rgba(46, 148, 75, 0.2)',
  },
  billTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  billCardName: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  paidBadge: {
    backgroundColor: 'rgba(46, 148, 75, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  paidBadgeText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#2E944B',
  },
  daysLeftBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  daysLeftText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#D97706',
  },
  billGrid: {
    flexDirection: 'row',
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  billCol: {
    flex: 1,
    alignItems: 'center',
  },
  billColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: CedarColors.border,
  },
  billColLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    textTransform: 'uppercase',
  },
  billColValue: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginTop: 2,
  },
  billFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  billDateText: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  userStatsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  userStatCard: {
    flex: 1,
    backgroundColor: CedarColors.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.2,
    borderColor: CedarColors.border,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  userStatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  statAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: CedarColors.forest800,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statAvatarText: {
    fontSize: 12,
    color: '#F6F9F5',
    fontWeight: '700',
  },
  statUserName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
    flex: 1,
  },
  statMetrics: {
    gap: 2,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 15,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
    marginBottom: 4,
  },
  statDivider: {
    height: 1,
    backgroundColor: CedarColors.border,
    marginVertical: 4,
  },
  cooldownBanner: {
    backgroundColor: CedarColors.forest900,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  cooldownTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cooldownTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#38BDF8',
  },
  cooldownCount: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  cooldownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  cooldownMerchant: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F6F9F5',
    flex: 1,
  },
  cooldownTimer: {
    fontSize: 10,
    fontFamily: CedarTypography.display,
    color: '#FCD34D',
    fontWeight: '700',
  },
  qrSuggestionsList: {
    gap: 8,
  },
  qrSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CedarColors.card,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  qrSuggestionBest: {
    borderColor: CedarColors.forest800,
    backgroundColor: 'rgba(10, 38, 28, 0.04)',
  },
  qrItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  qrThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: CedarColors.cardAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrMerchantName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  bestBadge: {
    backgroundColor: CedarColors.forest800,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bestBadgeText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F6F9F5',
    fontWeight: '800',
  },
  qrSubText: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  seeAllText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CedarColors.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginBottom: 8,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  txIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creditIconBox: {
    backgroundColor: 'rgba(46, 148, 75, 0.12)',
  },
  debitIconBox: {
    backgroundColor: 'rgba(10, 38, 28, 0.06)',
  },
  txTexts: {
    flex: 1,
  },
  txName: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  txCategory: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  creditAmount: {
    color: '#2E944B',
  },
  debitAmount: {
    color: CedarColors.ink900,
  },
  txDate: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 26, 18, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  cardSelectDialog: {
    backgroundColor: CedarColors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.2,
    borderColor: CedarColors.border,
  },
  dialogTitle: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  dialogSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
    marginBottom: 16,
  },
  cardOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: CedarColors.cardAlt,
  },
  cardOptionSelected: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderWidth: 1,
    borderColor: CedarColors.forest800,
  },
  cardOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardOptionName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  cardOptionDigits: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 26, 18, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetDialog: {
    backgroundColor: CedarColors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    borderTopWidth: 1.5,
    borderTopColor: CedarColors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  sheetSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 10,
  },
  selectorScroll: {
    marginBottom: 8,
  },
  selectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: CedarColors.cardAlt,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginRight: 8,
  },
  activeSelectorChip: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  selectorChipText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeSelectorChipText: {
    color: '#F6F9F5',
    fontWeight: '700',
  },
  sheetInput: {
    height: 46,
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
    marginBottom: 6,
  },
  sheetSaveBtn: {
    backgroundColor: CedarColors.forest800,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  sheetSaveText: {
    color: '#F6F9F5',
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  modalTabRow: {
    flexDirection: 'row',
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeModalTabBtn: {
    backgroundColor: CedarColors.forest800,
  },
  modalTabText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeModalTabText: {
    color: '#F6F9F5',
    fontWeight: '700',
  },
  summaryBox: {
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  summaryBoxLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink500,
    textTransform: 'uppercase',
  },
  summaryBoxAmount: {
    fontSize: 24,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#2E944B',
    marginTop: 4,
  },
  summaryBoxSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 4,
  },
  cardBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: CedarColors.border,
  },
  breakdownCardName: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
  },
  breakdownCardAmount: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '700',
    color: '#2E944B',
  },
  ledgerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CedarColors.border,
  },
  ledgerRemarks: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
  },
  ledgerDateText: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  ledgerAmtText: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  strategyRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  strategyBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CedarColors.cardAlt,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  activeStrategyBtn: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  strategyText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeStrategyText: {
    color: '#F6F9F5',
    fontWeight: '700',
  },
  generateLinkBtn: {
    backgroundColor: 'rgba(46, 148, 75, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46, 148, 75, 0.3)',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  generateLinkText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#2E944B',
  },
  payLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.cardAlt,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginBottom: 8,
  },
  payLinkText: {
    fontSize: 13,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#2E944B',
  },
});
