import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { CedarColors, CedarTypography } from '@credics/core';
import { QuickActions } from '../../components/QuickActions';
import { NotificationSidePanel } from '../../components/NotificationSidePanel';
import { SwipeDownDrawer } from '../../components/SwipeDownDrawer';
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
  ChevronRight,
  Clock,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  // Loading & Refresh State
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Authenticated User Info
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userName, setUserName] = useState('User');
  const [firstName, setFirstName] = useState('');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  // Card & Vault State
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('all');
  const [cardModalVisible, setCardModalVisible] = useState(false);

  // Metrics State
  const [availableLimit, setAvailableLimit] = useState<number>(0);
  const [totalLimit, setTotalLimit] = useState<number>(0);
  const [inTransit, setInTransit] = useState<number>(0);
  const [usersCash, setUsersCash] = useState<number>(0);
  const [showBalance, setShowBalance] = useState<boolean>(true);

  // Billing Cycle State
  const [daysToBill, setDaysToBill] = useState<number>(26);
  const [nextBillDate, setNextBillDate] = useState<string>('');
  const [showNotificationPanel, setShowNotificationPanel] = useState<boolean>(false);
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
  const [modalDateFilter, setModalDateFilter] = useState<'all' | '30d' | 'this_month'>('all');

  // Cash Transfer State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferSenderCards, setTransferSenderCards] = useState<any[]>([]);
  const [transferTargetUsers, setTransferTargetUsers] = useState<any[]>([]);
  const [selectedSenderCardId, setSelectedSenderCardId] = useState('');
  const [senderCardBalance, setSenderCardBalance] = useState(0);
  const [selectedTargetUser, setSelectedTargetUser] = useState<any>(null);
  const [selectedReceiverCardId, setSelectedReceiverCardId] = useState('');
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

  // 120Hz Spring micro-bounce for Notification Bell
  const bellScale = useSharedValue(1);
  const bellAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bellScale.value }],
  }));

  const handleNotificationBellPress = () => {
    bellScale.value = withSpring(0.82, { damping: 14, stiffness: 450 }, () => {
      bellScale.value = withSpring(1, { damping: 18, stiffness: 350 });
    });
    setShowNotificationPanel(true);
  };

  // Cooldown countdown
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

      // Active Bills
      if (bills) {
        setActiveBills(bills.slice(0, 4));
      }

      // 4. User Stats & Cash Breakdown
      const { data: allProfiles } = await supabase.from('profiles').select('*').order('name');
      const { data: allCoh } = await supabase.from('cash_on_hand').select('*');

      let usersCashTotal = 0;
      if (allCoh) {
        usersCashTotal = allCoh
          .filter((c) => activeCardIds.includes(c.card_id))
          .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
      }
      setUsersCash(usersCashTotal);

      if (allProfiles) {
        const stats: UserStat[] = [];
        for (const p of allProfiles) {
          const userCohRows = allCoh?.filter((c) => c.user_id === p.id && activeCardIds.includes(c.card_id)) || [];
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

          // Fetch active pocket advance balance
          const { data: paData } = await supabase
            .from('pocket_advances')
            .select('current_balance')
            .eq('user_id', p.id);
          const pocketBal = (paData || []).reduce((sum, r) => sum + Number(r.current_balance || 0), 0);

          stats.push({
            id: p.id,
            name: p.name.split(' ')[0],
            cash: cashTotal,
            due,
            pocket: pocketBal,
            avatar_url: p.avatar_url,
            cardBreakdown,
          });
        }
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

      // 6. Form Real Recent Transactions Feed from card_transactions table (Item 5 Parity)
      const { data: latestCardTxs } = await supabase
        .from('card_transactions')
        .select('*, cards(card_name, last_4_digits)')
        .order('transaction_date', { ascending: false })
        .limit(6);

      const txFeed: RecentTx[] = [];
      if (latestCardTxs && latestCardTxs.length > 0) {
        latestCardTxs.forEach((t: any) => {
          const isPayment = t.type === 'bill_payment';
          txFeed.push({
            id: t.id,
            title: isPayment
              ? `Bill Payment Repaid (${t.cards?.card_name || 'Card'})`
              : t.remarks || 'Rotation Withdrawal',
            category: isPayment
              ? 'Repayment'
              : t.cards?.card_name
              ? `${t.cards.card_name} Rotation`
              : 'Card Rotation',
            amount: Number(t.amount),
            date: t.transaction_date
              ? new Date(t.transaction_date).toLocaleDateString('en-IN', {
                  month: 'short',
                  day: 'numeric',
                })
              : 'Recent',
            isCredit: isPayment,
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

  // Open User Detail Ledger Modal (Parity with Web App Analytics)
  const openUserStatModal = async (stat: UserStat) => {
    setSelectedUserStat(stat);
    setUserModalTab('summary');
    setModalDateFilter('all');
    setIsUserModalOpen(true);
    setIsLedgerLoading(true);

    try {
      const [{ data: cData }, { data: dData }, { data: pData }] = await Promise.all([
        supabase
          .from('cash_on_hand_ledger')
          .select('*, cards(card_name, last_4_digits)')
          .eq('user_id', stat.id)
          .order('transaction_date', { ascending: false })
          .limit(40),
        supabase
          .from('spends')
          .select('*, cards(card_name, last_4_digits)')
          .eq('user_id', stat.id)
          .order('spend_date', { ascending: false })
          .limit(40),
        supabase
          .from('pocket_advances_ledger')
          .select('*, cards(card_name, last_4_digits)')
          .eq('user_id', stat.id)
          .order('transaction_date', { ascending: false })
          .limit(40),
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

  // Open Cash Transfer Modal
  const openTransferModal = async () => {
    if (!currentUser) return;
    setIsTransferOpen(true);
    setTransferAmount('');
    setTransferRemarks('');

    try {
      // Sender's positive cash cards
      const { data: cohList } = await supabase
        .from('cash_on_hand')
        .select('card_id, current_balance, cards(card_name, last_4_digits)')
        .eq('user_id', currentUser.id)
        .gt('current_balance', 0)
        .order('current_balance', { ascending: false });

      const sCards = (cohList || []).map((row: any) => ({
        cardId: row.card_id,
        cardName: row.cards?.card_name || 'Card',
        cardLast4: row.cards?.last_4_digits || '0000',
        balance: Number(row.current_balance || 0),
      }));

      setTransferSenderCards(sCards);
      if (sCards.length > 0) {
        setSelectedSenderCardId(sCards[0].cardId);
        setSenderCardBalance(sCards[0].balance);
      } else {
        setSelectedSenderCardId('');
        setSenderCardBalance(0);
      }

      // Receiver Profiles
      const { data: profiles } = await supabase.from('profiles').select('id, name').neq('id', currentUser.id);
      const targets: any[] = [];
      for (const p of profiles || []) {
        const { data: receiverCoh } = await supabase
          .from('cash_on_hand')
          .select('card_id, cards(card_name, last_4_digits)')
          .eq('user_id', p.id);

        if (receiverCoh && receiverCoh.length > 0) {
          targets.push({
            userId: p.id,
            userName: p.name,
            cards: receiverCoh.map((r: any) => ({
              cardId: r.card_id,
              cardName: r.cards?.card_name || 'Card',
              cardLast4: r.cards?.last_4_digits || '0000',
            })),
          });
        }
      }

      setTransferTargetUsers(targets);
      if (targets.length > 0) {
        setSelectedTargetUser(targets[0]);
        setSelectedReceiverCardId(targets[0].cards[0]?.cardId || '');
      }
    } catch (e) {
      console.error('Failed to init transfer targets:', e);
    }
  };

  // Execute Cash Transfer (Parity with Web App executeTransfer)
  const executeTransfer = async () => {
    if (!currentUser || !selectedSenderCardId || !selectedReceiverCardId || !selectedTargetUser) {
      Alert.alert('Required', 'Please choose sender card, recipient, and receiver card.');
      return;
    }

    const amt = Number(transferAmount);
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please provide a valid transfer amount.');
      return;
    }

    if (amt > senderCardBalance) {
      Alert.alert('Insufficient Balance', 'Transfer amount exceeds available cash on selected card.');
      return;
    }

    setIsTransferring(true);
    try {
      const now = new Date().toISOString();
      const note = transferRemarks.trim() || `Transfer to ${selectedTargetUser.userName}`;
      const senderName = userName || 'You';

      // Insert debit for sender
      await supabase.from('cash_on_hand_ledger').insert({
        user_id: currentUser.id,
        card_id: selectedSenderCardId,
        amount: amt,
        transaction_type: 'debit',
        transaction_date: now,
        remarks: `Transfer to ${selectedTargetUser.userName} — ${note}`,
      });

      // Insert credit for receiver
      await supabase.from('cash_on_hand_ledger').insert({
        user_id: selectedTargetUser.userId,
        card_id: selectedReceiverCardId,
        amount: amt,
        transaction_type: 'credit',
        transaction_date: now,
        remarks: `Received from ${senderName} — ${note}`,
      });

      // ENTRY RECORDED: haptic feedback strictly allowed here
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setIsTransferOpen(false);
      Alert.alert('Success', `₹${amt.toLocaleString('en-IN')} transferred to ${selectedTargetUser.userName}`);
      fetchDashboardData();
      if (selectedUserStat) {
        openUserStatModal(selectedUserStat);
      }
    } catch (err: any) {
      Alert.alert('Transfer Error', err?.message || 'Failed to complete cash transfer.');
    } finally {
      setIsTransferring(false);
    }
  };

  // Save Bill Cycle Modal
  const handleSaveBill = async () => {
    if (!billFormCardId || !billFormMonth || !billFormGenAmount) {
      Alert.alert('Required', 'Please fill all mandatory fields.');
      return;
    }

    setIsSavingBill(true);

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

      // ENTRY RECORDED: haptic feedback strictly allowed
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

      // ENTRY RECORDED: haptic feedback allowed
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

  // Filtered Ledger Data based on preset
  const filteredCashLedger = useMemo(() => {
    if (modalDateFilter === 'all') return cashLedger;
    const now = new Date();
    if (modalDateFilter === 'this_month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return cashLedger.filter((t) => new Date(t.transaction_date) >= startOfMonth);
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return cashLedger.filter((t) => new Date(t.transaction_date) >= thirtyDaysAgo);
  }, [cashLedger, modalDateFilter]);

  const filteredDueLedger = useMemo(() => {
    if (modalDateFilter === 'all') return dueLedger;
    const now = new Date();
    if (modalDateFilter === 'this_month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return dueLedger.filter((t) => new Date(t.spend_date) >= startOfMonth);
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return dueLedger.filter((t) => new Date(t.spend_date) >= thirtyDaysAgo);
  }, [dueLedger, modalDateFilter]);

  // Cash Ledger Stats (Credit, Debit, Net)
  const cashStats = useMemo(() => {
    const cred = filteredCashLedger
      .filter((t) => t.transaction_type === 'credit')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const deb = filteredCashLedger
      .filter((t) => t.transaction_type === 'debit')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    return { credit: cred, debit: deb, net: cred - deb };
  }, [filteredCashLedger]);

  // Due Ledger Stats (Added, Repaid, Net)
  const dueStats = useMemo(() => {
    const spendsAmt = filteredDueLedger
      .filter((t) => t.payment_method !== 'repayment')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const repaidAmt = filteredDueLedger
      .filter((t) => t.payment_method === 'repayment')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    return { added: spendsAmt, repaid: repaidAmt, net: Math.max(0, spendsAmt - repaidAmt) };
  }, [filteredDueLedger]);

  const currentCooldowns = activeCooldowns.filter((c) => c.expiresAt > nowTimestamp);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#092116' }}>
        <SafeAreaView style={styles.safeArea}>
          <HomeSkeleton />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      {/* 6. Deep Luxury Green Gradient Background */}
      <LinearGradient
        colors={['#071C12', '#0E2E20', '#154230', '#DCE8DF', '#CEDCCE']}
        locations={[0, 0.14, 0.28, 0.64, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#F6F9F5"
              colors={['#10B981']}
            />
          }
        >
          {/* ================= 1. HEADER ================= */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.userInfo}
              onPress={() => router.push('/settings')}
              activeOpacity={0.85}
            >
              <View style={styles.avatarBorder}>
                {userAvatar ? (
                  <Image source={{ uri: userAvatar }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
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
              {/* Card Selector Dropdown */}
              <TouchableOpacity
                style={styles.cardDropdown}
                onPress={() => setCardModalVisible(true)}
                activeOpacity={0.8}
              >
                <CreditCard size={13} color="#CAD6C9" />
                <Text style={styles.cardDropdownText} numberOfLines={1}>
                  {getActiveCardName()}
                </Text>
                <ChevronDown size={13} color="#CAD6C9" />
              </TouchableOpacity>

              {/* Notification Bell with 120Hz micro-bounce animation */}
              <Animated.View style={bellAnimStyle}>
                <TouchableOpacity
                  style={styles.iconCircle}
                  onPress={handleNotificationBellPress}
                  activeOpacity={0.8}
                >
                  <Bell size={18} color="#F6F9F5" />
                  {daysToBill <= 3 && <View style={styles.notificationDot} />}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>

          {/* ================= 2. HERO AVAILABLE LIMIT CARD ================= */}
          <Animated.View entering={FadeInDown.delay(60).springify().damping(22)}>
            <LinearGradient
              colors={['#04120B', '#082116', '#0E2E20']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.heroLabelRow}>
                  <View style={styles.heroDot} />
                  <Text style={styles.heroLabel}>Total Available Limit</Text>
                  <TouchableOpacity
                    onPress={() => setShowBalance(!showBalance)}
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

              <View style={styles.heroDivider} />

              {/* 3 Core Metrics Row */}
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

              {/* Quick Actions without vibration */}
              <QuickActions
                onAddLend={() => router.push('/(tabs)/lents')}
                onSendMoney={() => router.push('/(tabs)/transactions')}
                onTopUp={() => router.push('/(tabs)/settlements')}
                onScanQR={() => router.push('/(tabs)/settlements')}
              />
            </LinearGradient>
          </Animated.View>

          {/* ================= 3. ACTIVE BILLING CYCLES SECTION (Dashboard 1.jpg Parity) ================= */}
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
                  setBillFormCardId(accessibleCards[0]?.id || '');
                  setBillFormMonth(new Date().toISOString().slice(0, 7));
                  setIsBillModalOpen(true);
                }}
              >
                <Plus size={14} color="#F6F9F5" />
              </HapticButton>
            </View>

            {activeBills.length === 0 ? (
              <View style={styles.emptyCardBox}>
                <Text style={styles.emptyBoxText}>No active billing statements found.</Text>
              </View>
            ) : (
              activeBills.map((bill, index) => {
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
                  <Animated.View
                    key={bill.id}
                    entering={FadeInDown.delay(100 + index * 60).springify().damping(22)}
                  >
                    <View
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
                            <CheckCircle2 size={11} color="#15803D" strokeWidth={2.5} style={{ marginRight: 3 }} />
                            <Text style={styles.paidBadgeText}>PAID</Text>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.daysLeftBadge,
                              daysLeft <= 3 && {
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                borderColor: 'rgba(239, 68, 68, 0.3)',
                              },
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

                      {/* 3 Metric Columns with Soft Subtle Background */}
                      <View style={styles.billGrid}>
                        <View style={styles.billCol}>
                          <Text style={styles.billColLabel}>GENERATED</Text>
                          <Text style={styles.billColValue}>
                            ₹{Number(bill.generated_amount).toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={[styles.billCol, styles.billColBorder]}>
                          <Text style={styles.billColLabel}>PAID</Text>
                          <Text style={[styles.billColValue, { color: '#15803D' }]}>
                            ₹{Number(bill.paid_amount).toLocaleString('en-IN')}
                          </Text>
                        </View>
                        <View style={[styles.billCol, styles.billColBorder]}>
                          <Text style={styles.billColLabel}>DUE</Text>
                          <Text
                            style={[
                              styles.billColValue,
                              { color: due > 0 ? '#DC2626' : '#15803D' },
                            ]}
                          >
                            ₹{due > 0 ? due.toLocaleString('en-IN') : 0}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.billFooterRow}>
                        <Text style={styles.billDateText}>Gen: {fmtDate(genDate)}</Text>
                        <Text
                          style={[
                            styles.billDateText,
                            daysLeft <= 3 && !isPaid && { color: '#DC2626', fontWeight: '800' },
                          ]}
                        >
                          Due: {fmtDate(dueDate)}
                        </Text>
                      </View>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </View>

          {/* ================= 4. CASH & REPAYMENT ANALYTICS (Dashboard 2.jpg Parity) ================= */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Banknote size={16} color="#15803D" />
                <Text style={styles.sectionTitle}>Cash & Repayment Analytics</Text>
              </View>
            </View>

            <View style={styles.userStatsGrid}>
              {userStats.map((stat, i) => {
                const isFirst = i === 0;
                return (
                  <Animated.View
                    key={stat.id}
                    entering={FadeInDown.delay(140 + i * 80).springify().damping(20)}
                    style={{ flex: 1 }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.userStatCard,
                        isFirst ? styles.userStatCardMint : styles.userStatCardWarm,
                      ]}
                      onPress={() => openUserStatModal(stat)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.userStatTop}>
                        {/* DP Show (Avatar Image with Letter Fallback) */}
                        <View style={[styles.statAvatar, isFirst ? styles.statAvatarMintBorder : styles.statAvatarWarmBorder]}>
                          {stat.avatar_url ? (
                            <Image source={{ uri: stat.avatar_url }} style={styles.statAvatarImg} />
                          ) : (
                            <Text style={styles.statAvatarText}>{stat.name.charAt(0)}</Text>
                          )}
                        </View>
                        <Text style={styles.statUserName} numberOfLines={1}>
                          {stat.name}
                        </Text>
                      </View>

                      <View style={styles.statMetrics}>
                        <Text style={styles.statLabel}>HOLDING CASH</Text>
                        <Text style={[styles.statValue, { color: isFirst ? '#15803D' : '#B45309' }]}>
                          ₹{stat.cash.toLocaleString('en-IN')}
                        </Text>

                        <View style={styles.statDivider} />

                        <Text style={styles.statLabel}>PERSONAL DUE</Text>
                        <Text style={[styles.statValue, stat.due > 0 ? { color: '#DC2626' } : { color: CedarColors.ink700 }]}>
                          ₹{stat.due.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>
          </View>

          {/* ================= 5. SMART SUGGESTIONS (Dashboard 2.jpg Parity) ================= */}
          <View style={styles.sectionContainer}>
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
                  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                  return (
                    <View key={c.qrId} style={styles.cooldownRow}>
                      <Text style={styles.cooldownMerchant}>{c.merchantName}</Text>
                      <Text style={styles.cooldownTimer}>
                        {hours}h {minutes}m {seconds}s
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
                      setSelectedQr(qr);
                      setQrPayingCardId(accessibleCards[0]?.id || '');
                      setGeneratedAmounts([]);
                      setIsQrModalOpen(true);
                    }}
                    activeOpacity={0.88}
                  >
                    <View style={styles.qrItemLeft}>
                      {/* Show QR image from backend (Web App logic parity) */}
                      <View style={styles.qrThumbnail}>
                        {qr.qr_image_url ? (
                          <Image
                            source={{ uri: qr.qr_image_url }}
                            style={styles.qrThumbnailImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <QrCode size={18} color={CedarColors.forest800} />
                        )}
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

          {/* ================= 6. RECENT TRANSACTIONS (Latest Card Transactions) ================= */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                <Text style={styles.sectionSubtitle}>Live credit rotations & settlements</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
                <Text style={styles.seeAllText}>See all →</Text>
              </TouchableOpacity>
            </View>

            {recentTransactions.length === 0 ? (
              <View style={styles.emptyCardBox}>
                <Text style={styles.emptyBoxText}>No transactions recorded yet.</Text>
              </View>
            ) : (
              recentTransactions.map((tx, idx) => (
                <Animated.View
                  key={tx.id}
                  entering={FadeInDown.delay(160 + idx * 40).springify().damping(22)}
                >
                  <View style={styles.txRow}>
                    <View style={styles.txLeft}>
                      <View
                        style={[
                          styles.txIconBox,
                          tx.isCredit ? styles.creditIconBox : styles.debitIconBox,
                        ]}
                      >
                        {tx.isCredit ? (
                          <ArrowDownLeft size={16} color="#15803D" />
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
                </Animated.View>
              ))
            )}
          </View>
        </ScrollView>

        {/* ================= CARD SELECTOR DRAWER (Slide Down to Dismiss) ================= */}
        <SwipeDownDrawer
          visible={cardModalVisible}
          onClose={() => setCardModalVisible(false)}
          title="Select Credit Vault"
          subtitle="Filter dashboard metrics by individual card or unified vault"
          heightPercent={0.65}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 10 }}>
            <TouchableOpacity
              style={[
                styles.cardOptionRow,
                selectedCardId === 'all' && styles.cardOptionSelected,
              ]}
              onPress={() => {
                setSelectedCardId('all');
                setCardModalVisible(false);
              }}
            >
              <View style={styles.cardOptionLeft}>
                <CreditCard size={18} color={CedarColors.forest800} />
                <Text style={styles.cardOptionName}>All Vault Cards (Unified)</Text>
              </View>
              {selectedCardId === 'all' && <CheckCircle2 size={18} color={CedarColors.forest800} />}
            </TouchableOpacity>

            {accessibleCards.map((c) => {
              const isSelected = selectedCardId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.cardOptionRow, isSelected && styles.cardOptionSelected]}
                  onPress={() => {
                    setSelectedCardId(c.id);
                    setCardModalVisible(false);
                  }}
                >
                  <View style={styles.cardOptionLeft}>
                    <CreditCard size={18} color={CedarColors.forest800} />
                    <View>
                      <Text style={styles.cardOptionName}>{c.card_name}</Text>
                      <Text style={styles.cardOptionDigits}>
                        •••• {c.last_4_digits} | Limit: ₹{Number(c.total_limit).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  {isSelected && <CheckCircle2 size={18} color={CedarColors.forest800} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SwipeDownDrawer>

        {/* ================= BILL ENTRY DRAWER (Slide Down to Dismiss) ================= */}
        <SwipeDownDrawer
          visible={isBillModalOpen}
          onClose={() => setIsBillModalOpen(false)}
          title="Manage Billing Cycle"
          subtitle="Record and update card monthly statement amounts"
          heightPercent={0.72}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 12 }}>
            <Text style={styles.inputLabel}>Select Vault Card</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
              {accessibleCards.filter((c) => c.is_primary).map((c) => {
                const isSel = billFormCardId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selectorChip, isSel && styles.activeSelectorChip]}
                    onPress={() => setBillFormCardId(c.id)}
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
              disabled={isSavingBill}
            >
              {isSavingBill ? (
                <ActivityIndicator size="small" color="#F6F9F5" />
              ) : (
                <Text style={styles.sheetSaveText}>Save Bill Details</Text>
              )}
            </HapticButton>
          </ScrollView>
        </SwipeDownDrawer>

        {/* ================= 7. USER DETAIL LEDGER MODAL (Deep Green Gradient & Royal Gold) ================= */}
        <SwipeDownDrawer
          visible={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          gradientColors={['#041009', '#081D14', '#0E2E20']}
          headerAccentColor="#F59E0B"
          heightPercent={0.88}
          title={`${selectedUserStat?.name}'s Ledger`}
          subtitle="Advanced Cash & Spends Breakdown"
        >
          {/* 4 Tabs: Summary | Cash In/Out | Personal Due | Pocket Advance */}
          <View style={styles.goldModalTabRow}>
            {(['summary', 'cash_ledger', 'due_ledger', 'pocket_advance'] as const).map((tab) => {
              const isTab = userModalTab === tab;
              const label =
                tab === 'summary'
                  ? 'Summary'
                  : tab === 'cash_ledger'
                  ? 'Cash In/Out'
                  : tab === 'due_ledger'
                  ? 'Personal Due'
                  : 'Pocket Advance';

              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.goldTabBtn, isTab && styles.activeGoldTabBtn]}
                  onPress={() => setUserModalTab(tab)}
                >
                  <Text style={[styles.goldTabText, isTab && styles.activeGoldTabText]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Date Range Preset Filter for Ledgers */}
          {userModalTab !== 'summary' && (
            <View style={styles.presetFilterRow}>
              {(['all', 'this_month', '30d'] as const).map((p) => {
                const isSelected = modalDateFilter === p;
                const pLabel = p === 'all' ? 'All History' : p === 'this_month' ? 'This Month' : 'Last 30 Days';
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.presetChip, isSelected && styles.activePresetChip]}
                    onPress={() => setModalDateFilter(p)}
                  >
                    <Text style={[styles.presetChipText, isSelected && styles.activePresetChipText]}>
                      {pLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Tab Contents */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerScrollBody}>
            {/* ── TAB 1: SUMMARY (with Cash Transfer System) ── */}
            {userModalTab === 'summary' && selectedUserStat && (
              <View style={{ gap: 14 }}>
                {/* Cash on Hand Card */}
                <View style={styles.summaryGoldCard}>
                  <View style={styles.summaryCardTop}>
                    <Text style={styles.goldLabel}>TOTAL CASH IN HAND</Text>
                    <Banknote size={18} color="#34D399" />
                  </View>
                  <Text style={styles.goldAmountEmerald}>
                    ₹{selectedUserStat.cash.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.goldSubText}>Unified family card vault balance</Text>

                  {/* Transfer Cash Button */}
                  <TouchableOpacity
                    style={styles.transferLaunchBtn}
                    onPress={openTransferModal}
                    activeOpacity={0.88}
                  >
                    <Send size={15} color="#071A12" strokeWidth={2.4} />
                    <Text style={styles.transferLaunchBtnText}>Transfer Cash</Text>
                  </TouchableOpacity>

                  {/* Per-card breakdown pills */}
                  {selectedUserStat.cardBreakdown.length > 0 && (
                    <View style={styles.breakdownContainer}>
                      <Text style={styles.breakdownTitle}>Per-Card Breakdown:</Text>
                      <View style={styles.breakdownChipsWrap}>
                        {selectedUserStat.cardBreakdown.map((b) => (
                          <View key={b.cardId} style={styles.breakdownChip}>
                            <CreditCard size={11} color="#34D399" />
                            <Text style={styles.breakdownChipCard}>
                              {b.cardName} (••{b.cardLast4}):
                            </Text>
                            <Text style={styles.breakdownChipAmt}>
                              ₹{b.balance.toLocaleString('en-IN')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Personal Due Card */}
                <View style={styles.summaryDueCard}>
                  <View style={styles.summaryCardTop}>
                    <Text style={styles.dueCardLabel}>TOTAL PERSONAL DUE</Text>
                    <Receipt size={18} color="#FB7185" />
                  </View>
                  <Text style={styles.goldAmountRose}>
                    ₹{selectedUserStat.due.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.dueCardSubText}>Total remaining debt to clear</Text>
                </View>

                {/* Pocket Advance Card */}
                <View style={styles.summaryPocketCard}>
                  <View style={styles.summaryCardTop}>
                    <Text style={styles.pocketCardLabel}>ACTIVE POCKET ADVANCE</Text>
                    <Coins size={18} color="#FBBF24" />
                  </View>
                  <Text style={styles.goldAmountAmber}>
                    ₹{selectedUserStat.pocket.toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.pocketCardSubText}>Spent from personal funds on card bills</Text>
                </View>
              </View>
            )}

            {/* ── TAB 2: CASH IN / OUT ── */}
            {userModalTab === 'cash_ledger' && (
              <View style={{ gap: 12 }}>
                {/* 3 Metric Summary Row (In, Out, Net) */}
                <View style={styles.metricStatsRow}>
                  <View style={styles.metricStatBoxIn}>
                    <Text style={styles.metricStatTitleIn}>IN (+)</Text>
                    <Text style={styles.metricStatValIn}>₹{cashStats.credit.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.metricStatBoxOut}>
                    <Text style={styles.metricStatTitleOut}>OUT (-)</Text>
                    <Text style={styles.metricStatValOut}>₹{cashStats.debit.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.metricStatBoxNet}>
                    <Text style={styles.metricStatTitleNet}>NET</Text>
                    <Text style={styles.metricStatValNet}>
                      {cashStats.net >= 0 ? '+' : '-'}₹{Math.abs(cashStats.net).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {isLedgerLoading ? (
                  <ActivityIndicator size="small" color="#F59E0B" style={{ marginVertical: 30 }} />
                ) : filteredCashLedger.length === 0 ? (
                  <View style={styles.emptyGoldBox}>
                    <Banknote size={28} color="#7E9185" />
                    <Text style={styles.emptyGoldText}>No cash ledger records found in this range.</Text>
                  </View>
                ) : (
                  filteredCashLedger.map((item) => (
                    <View key={item.id} style={styles.goldLedgerRow}>
                      <View style={styles.goldRowLeft}>
                        <View
                          style={[
                            styles.goldIconPill,
                            item.transaction_type === 'credit'
                              ? styles.goldIconPillCredit
                              : styles.goldIconPillDebit,
                          ]}
                        >
                          {item.transaction_type === 'credit' ? (
                            <ArrowDownLeft size={16} color="#34D399" />
                          ) : (
                            <Banknote size={16} color="#FB7185" />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.goldRowTitle}>{item.remarks || 'Cash Transaction'}</Text>
                          <Text style={styles.goldRowSub}>
                            {new Date(item.transaction_date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {item.cards?.card_name && ` • ${item.cards.card_name}`}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.goldRowAmt,
                          item.transaction_type === 'credit' ? { color: '#34D399' } : { color: '#FB7185' },
                        ]}
                      >
                        {item.transaction_type === 'credit' ? '+' : '-'}₹{Number(item.amount).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ── TAB 3: PERSONAL DUE ── */}
            {userModalTab === 'due_ledger' && (
              <View style={{ gap: 12 }}>
                {/* 3 Metric Summary Row (Added, Repaid, Net) */}
                <View style={styles.metricStatsRow}>
                  <View style={styles.metricStatBoxOut}>
                    <Text style={styles.metricStatTitleOut}>ADDED (+)</Text>
                    <Text style={styles.metricStatValOut}>₹{dueStats.added.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.metricStatBoxIn}>
                    <Text style={styles.metricStatTitleIn}>REPAID (-)</Text>
                    <Text style={styles.metricStatValIn}>₹{dueStats.repaid.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.metricStatBoxNet}>
                    <Text style={styles.metricStatTitleNet}>NET DUE</Text>
                    <Text style={styles.metricStatValNet}>₹{dueStats.net.toLocaleString('en-IN')}</Text>
                  </View>
                </View>

                {isLedgerLoading ? (
                  <ActivityIndicator size="small" color="#F59E0B" style={{ marginVertical: 30 }} />
                ) : filteredDueLedger.length === 0 ? (
                  <View style={styles.emptyGoldBox}>
                    <Receipt size={28} color="#7E9185" />
                    <Text style={styles.emptyGoldText}>No personal due records found in this range.</Text>
                  </View>
                ) : (
                  filteredDueLedger.map((item) => {
                    const isRepayment = item.payment_method === 'repayment' || Number(item.amount) < 0;
                    return (
                      <View key={item.id} style={styles.goldLedgerRow}>
                        <View style={styles.goldRowLeft}>
                          <View
                            style={[
                              styles.goldIconPill,
                              isRepayment ? styles.goldIconPillCredit : styles.goldIconPillDebit,
                            ]}
                          >
                            {isRepayment ? (
                              <ArrowDownLeft size={16} color="#34D399" />
                            ) : (
                              <Receipt size={16} color="#FB7185" />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.goldRowTitle}>{item.remarks || (isRepayment ? 'Repayment' : 'Personal Spend')}</Text>
                            <Text style={styles.goldRowSub}>
                              {new Date(item.spend_date).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                              {item.cards?.card_name && ` • ${item.cards.card_name}`}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.goldRowAmt,
                            isRepayment ? { color: '#34D399' } : { color: '#FB7185' },
                          ]}
                        >
                          {isRepayment ? '-' : '+'}₹{Math.abs(Number(item.amount)).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ── TAB 4: POCKET ADVANCE ── */}
            {userModalTab === 'pocket_advance' && (
              <View style={{ gap: 12 }}>
                {/* Pocket Summary Card */}
                <View style={styles.pocketLedgerSummaryBanner}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={styles.pocketBannerIcon}>
                      <Coins size={20} color="#F59E0B" />
                    </View>
                    <View>
                      <Text style={styles.pocketBannerTitle}>Active Pocket Advance</Text>
                      <Text style={styles.pocketBannerSub}>Advanced for card bill payments</Text>
                    </View>
                  </View>
                  <Text style={styles.pocketBannerAmt}>
                    ₹{(selectedUserStat?.pocket || 0).toLocaleString('en-IN')}
                  </Text>
                </View>

                {isLedgerLoading ? (
                  <ActivityIndicator size="small" color="#F59E0B" style={{ marginVertical: 30 }} />
                ) : pocketLedger.length === 0 ? (
                  <View style={styles.emptyGoldBox}>
                    <Coins size={28} color="#7E9185" />
                    <Text style={styles.emptyGoldText}>No pocket advance history found.</Text>
                  </View>
                ) : (
                  pocketLedger.map((pa) => {
                    const isAdv = pa.entry_type === 'advance';
                    return (
                      <View key={pa.id} style={styles.goldLedgerRow}>
                        <View style={styles.goldRowLeft}>
                          <View
                            style={[
                              styles.goldIconPill,
                              isAdv ? styles.goldIconPillAmber : styles.goldIconPillCredit,
                            ]}
                          >
                            <Coins size={16} color={isAdv ? '#F59E0B' : '#34D399'} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.goldRowTitle}>
                              {isAdv ? 'পকেট থেকে বিল পে (+)' : 'পকেটে ফেরত (-)'}
                            </Text>
                            <Text style={styles.goldRowSub}>
                              {pa.cards?.card_name || 'Card'} (••{pa.cards?.last_4_digits || '0000'}) •{' '}
                              {new Date(pa.transaction_date).toLocaleDateString('en-GB')}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.goldRowAmt,
                            isAdv ? { color: '#F59E0B' } : { color: '#34D399' },
                          ]}
                        >
                          {isAdv ? '+' : '-'}₹{Number(pa.amount).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>
        </SwipeDownDrawer>

        {/* ================= CASH TRANSFER DRAWER (Slide Down to Dismiss) ================= */}
        <SwipeDownDrawer
          visible={isTransferOpen}
          onClose={() => setIsTransferOpen(false)}
          gradientColors={['#041009', '#081D14', '#0E2E20']}
          headerAccentColor="#F59E0B"
          title="Transfer Cash"
          subtitle="Send cash balance between users & vault cards"
          heightPercent={0.78}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 14 }}>
            {/* 1. Sender Card */}
            <Text style={styles.goldInputLabel}>আপনার কোন কার্ড থেকে পাঠাবেন?</Text>
            {transferSenderCards.length === 0 ? (
              <View style={styles.noCardWarnBox}>
                <Text style={styles.noCardWarnText}>আপনার কোনো কার্ডে ক্যাশ ব্যালেন্স নেই।</Text>
              </View>
            ) : (
              <View style={styles.chipSelectorWrap}>
                {transferSenderCards.map((c) => {
                  const isSel = selectedSenderCardId === c.cardId;
                  return (
                    <TouchableOpacity
                      key={c.cardId}
                      style={[styles.senderCardChip, isSel && styles.activeSenderCardChip]}
                      onPress={() => {
                        setSelectedSenderCardId(c.cardId);
                        setSenderCardBalance(c.balance);
                      }}
                    >
                      <Text style={[styles.senderCardChipText, isSel && styles.activeSenderCardChipText]}>
                        {c.cardName} (••{c.cardLast4})
                      </Text>
                      <Text style={[styles.senderCardBalText, isSel && styles.activeSenderCardBalText]}>
                        ₹{c.balance.toLocaleString('en-IN')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 2. Recipient User */}
            <Text style={styles.goldInputLabel}>কাকে পাঠাবেন?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {transferTargetUsers.map((t) => {
                const isSel = selectedTargetUser?.userId === t.userId;
                return (
                  <TouchableOpacity
                    key={t.userId}
                    style={[styles.targetUserBtn, isSel && styles.activeTargetUserBtn]}
                    onPress={() => {
                      setSelectedTargetUser(t);
                      setSelectedReceiverCardId(t.cards[0]?.cardId || '');
                    }}
                  >
                    <Text style={[styles.targetUserBtnText, isSel && styles.activeTargetUserBtnText]}>
                      {t.userName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 3. Recipient Card Dropdown */}
            {selectedTargetUser && (
              <>
                <Text style={styles.goldInputLabel}>গ্রহীতার কোন কার্ডে জমা হবে?</Text>
                <View style={styles.chipSelectorWrap}>
                  {selectedTargetUser.cards.map((rc: any) => {
                    const isSel = selectedReceiverCardId === rc.cardId;
                    return (
                      <TouchableOpacity
                        key={rc.cardId}
                        style={[styles.receiverCardChip, isSel && styles.activeReceiverCardChip]}
                        onPress={() => setSelectedReceiverCardId(rc.cardId)}
                      >
                        <Text style={[styles.receiverCardChipText, isSel && styles.activeReceiverCardChipText]}>
                          {rc.cardName} (••{rc.cardLast4})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* 4. Amount */}
            <Text style={styles.goldInputLabel}>পরিমাণ (₹)</Text>
            <TextInput
              style={styles.goldAmountInput}
              placeholder="0"
              placeholderTextColor="#7E9185"
              keyboardType="numeric"
              value={transferAmount}
              onChangeText={setTransferAmount}
            />

            {/* 5. Remarks */}
            <Text style={styles.goldInputLabel}>মন্তব্য (Optional)</Text>
            <TextInput
              style={styles.goldTextInput}
              placeholder="e.g. For bill payment settlement"
              placeholderTextColor="#7E9185"
              value={transferRemarks}
              onChangeText={setTransferRemarks}
            />

            {/* Submit Transfer Button */}
            <TouchableOpacity
              style={styles.confirmTransferBtn}
              onPress={executeTransfer}
              disabled={isTransferring}
              activeOpacity={0.88}
            >
              {isTransferring ? (
                <ActivityIndicator size="small" color="#071A12" />
              ) : (
                <Text style={styles.confirmTransferBtnText}>Confirm Cash Transfer</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SwipeDownDrawer>

        {/* ================= QR PAYMENT MODAL (Slide Down to Dismiss) ================= */}
        <SwipeDownDrawer
          visible={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          title={selectedQr?.merchant_name || 'UPI QR Payment'}
          subtitle={selectedQr?.upi_id || 'Pay from vault card'}
          heightPercent={0.76}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 12 }}>
            <Text style={styles.inputLabel}>Paying From Vault Card</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll}>
              {accessibleCards.map((c) => {
                const isSel = qrPayingCardId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.selectorChip, isSel && styles.activeSelectorChip]}
                    onPress={() => setQrPayingCardId(c.id)}
                  >
                    <Text style={[styles.selectorChipText, isSel && styles.activeSelectorChipText]}>
                      {c.card_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.strategyRow}>
              <TouchableOpacity
                style={[styles.strategyBtn, qrPaymentMode === 'once' && styles.activeStrategyBtn]}
                onPress={() => {
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
                  setQrPaymentMode('multiple');
                  setGeneratedAmounts([]);
                }}
              >
                <Text style={[styles.strategyText, qrPaymentMode === 'multiple' && styles.activeStrategyText]}>
                  Split Swipes
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.generateLinkBtn}
              onPress={handleGeneratePaymentAmounts}
              activeOpacity={0.88}
            >
              <Text style={styles.generateLinkText}>Generate Dynamic Payment Links</Text>
            </TouchableOpacity>

            {generatedAmounts.map((amt, idx) => {
              const link = `upi://pay?pa=${selectedQr?.upi_id || ''}&pn=${encodeURIComponent(
                selectedQr?.merchant_name || ''
              )}&am=${amt}&cu=INR`;
              return (
                <TouchableOpacity
                  key={idx}
                  style={styles.payLinkRow}
                  onPress={() => Linking.openURL(link)}
                >
                  <Text style={styles.payLinkText}>Pay ₹{amt}</Text>
                  <ArrowRight size={16} color="#15803D" />
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={styles.sheetSaveBtn}
              onPress={handleMarkQrAsUsed}
              disabled={isMarkingUsed}
              activeOpacity={0.88}
            >
              {isMarkingUsed ? (
                <ActivityIndicator size="small" color="#F6F9F5" />
              ) : (
                <Text style={styles.sheetSaveText}>Mark Used & Save Rotation</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SwipeDownDrawer>

        {/* ================= 3. NOTIFICATION SIDE PANEL (Sliding in from Right Side) ================= */}
        <NotificationSidePanel
          visible={showNotificationPanel}
          onClose={() => setShowNotificationPanel(false)}
          urgentBill={
            daysToBill <= 3
              ? {
                  cardName: getActiveCardName(),
                  last4Digits: accessibleCards[0]?.last_4_digits || '0000',
                  dueAmount: availableLimit > 0 ? 45000 : 0,
                  dueDate: nextBillDate || 'Soon',
                  daysLeft: daysToBill,
                  onPayNow: () => {
                    setShowNotificationPanel(false);
                    router.push('/(tabs)/settlements');
                  },
                  onRotateLimit: () => {
                    setShowNotificationPanel(false);
                    router.push('/(tabs)/settlements');
                  },
                }
              : null
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBorder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#34D399',
    overflow: 'hidden',
    backgroundColor: '#071A12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#071A12',
  },
  avatarText: {
    color: '#F6F9F5',
    fontSize: 16,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  userTextCol: {
    gap: 2,
  },
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  liveStatusText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  userNameText: {
    fontSize: 17,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    maxWidth: 140,
  },
  cardDropdownText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
    flexShrink: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#071A12',
  },
  heroCard: {
    marginHorizontal: 16,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 12,
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
    backgroundColor: '#34D399',
    marginRight: 6,
  },
  heroLabel: {
    color: '#CAD6C9',
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  billDueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(252, 211, 77, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  billDueText: {
    color: '#FCD34D',
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  heroAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  heroAmount: {
    color: '#F6F9F5',
    fontSize: 32,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendText: {
    color: '#4ADE80',
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    marginTop: 22,
    paddingHorizontal: 16,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#D8E5DA',
  },
  emptyBoxText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  // 5. Active Billing Cycles Card with Luxury Shadow
  billCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.2,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  billCardPending: {
    borderColor: '#D4E2D6',
  },
  billCardPaid: {
    borderColor: '#A8D5B5',
    backgroundColor: '#F7FCF8',
  },
  billTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billCardName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
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
    color: '#15803D',
  },
  daysLeftBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  daysLeftText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#D97706',
  },
  billGrid: {
    flexDirection: 'row',
    backgroundColor: '#F3FAF4',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  billCol: {
    flex: 1,
    alignItems: 'center',
  },
  billColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: '#DFEAE1',
  },
  billColLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink500,
    fontWeight: '700',
    letterSpacing: 0.4,
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
    alignItems: 'center',
  },
  billDateText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  // 5. Cash & Repayment Analytics User Cards in 2 Gentle Light Colors
  userStatsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  userStatCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.2,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  userStatCardMint: {
    backgroundColor: '#EAF5EE', // Gentle mint pastel
    borderColor: '#BFE3CA',
  },
  userStatCardWarm: {
    backgroundColor: '#FAF4E8', // Gentle warm cream pastel
    borderColor: '#F0DCBE',
  },
  userStatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  statAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  statAvatarMintBorder: {
    borderColor: '#2E944B',
    backgroundColor: '#D6EFE0',
  },
  statAvatarWarmBorder: {
    borderColor: '#D97706',
    backgroundColor: '#FCE7C8',
  },
  statAvatarImg: {
    width: '100%',
    height: '100%',
  },
  statAvatarText: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  statUserName: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink900,
    flex: 1,
  },
  statMetrics: {
    gap: 4,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink500,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: CedarColors.ink900,
  },
  statDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    marginVertical: 4,
  },
  // Smart Suggestions
  cooldownBanner: {
    backgroundColor: 'rgba(7, 26, 18, 0.85)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  cooldownTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cooldownTitle: {
    color: '#38BDF8',
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  cooldownCount: {
    color: '#CAD6C9',
    fontSize: 10,
    fontFamily: CedarTypography.body,
  },
  cooldownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  cooldownMerchant: {
    color: '#F6F9F5',
    fontSize: 12,
    fontFamily: CedarTypography.body,
  },
  cooldownTimer: {
    color: '#38BDF8',
    fontSize: 11,
    fontFamily: CedarTypography.display,
    fontWeight: '700',
  },
  qrSuggestionsList: {
    gap: 10,
  },
  qrSuggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#D8E5DA',
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  qrSuggestionBest: {
    borderColor: '#A8D5B5',
    backgroundColor: '#F5FCF7',
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
    backgroundColor: '#EAF3EC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrThumbnailImg: {
    width: '100%',
    height: '100%',
  },
  qrMerchantName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  qrSubText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  bestBadge: {
    backgroundColor: '#071A12',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bestBadgeText: {
    color: '#F6F9F5',
    fontSize: 9,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '800',
  },
  // Recent Transactions
  seeAllText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DFEBE1',
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditIconBox: {
    backgroundColor: '#E6F7EB',
  },
  debitIconBox: {
    backgroundColor: '#F3F4F6',
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
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  creditAmount: {
    color: '#15803D',
  },
  debitAmount: {
    color: CedarColors.ink900,
  },
  txDate: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  // Card selector modal
  cardOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F4F7F4',
    borderWidth: 1.2,
    borderColor: '#DCE7DE',
  },
  cardOptionSelected: {
    borderColor: CedarColors.forest800,
    backgroundColor: '#EBF4ED',
  },
  cardOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardOptionName: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  cardOptionDigits: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  // Inputs in Drawers
  inputLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectorScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  selectorChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#EFF5F0',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#D8E5DA',
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
  },
  sheetInput: {
    backgroundColor: '#F3FAF4',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DCE8DE',
    fontSize: 14,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
  },
  sheetSaveBtn: {
    backgroundColor: CedarColors.forest800,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  sheetSaveText: {
    color: '#F6F9F5',
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
  },
  strategyRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
  },
  strategyBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#EFF5F0',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE8DE',
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
  },
  generateLinkBtn: {
    backgroundColor: '#EFF5F0',
    borderWidth: 1,
    borderColor: '#DCE8DE',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 4,
  },
  generateLinkText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  payLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EAF5EE',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C6E2D0',
  },
  payLinkText: {
    fontSize: 13,
    fontFamily: CedarTypography.bodyBold,
    color: '#15803D',
    fontWeight: '800',
  },
  // 7. Gold & Deep Green User Ledger Modal Styles
  goldModalTabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  goldTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  activeGoldTabBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  goldTabText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#CAD6C9',
  },
  activeGoldTabText: {
    color: '#FEF08A',
    fontWeight: '900',
  },
  presetFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  activePresetChip: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#F59E0B',
  },
  presetChipText: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  activePresetChipText: {
    color: '#FEF08A',
    fontWeight: '700',
  },
  drawerScrollBody: {
    padding: 16,
    paddingBottom: 36,
  },
  summaryGoldCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  summaryCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goldLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.8,
  },
  goldAmountEmerald: {
    fontSize: 30,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 6,
  },
  goldSubText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  transferLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF08A',
    paddingVertical: 10,
    borderRadius: 14,
    marginTop: 14,
  },
  transferLaunchBtnText: {
    color: '#071A12',
    fontSize: 12,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '900',
  },
  breakdownContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  breakdownTitle: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
    marginBottom: 8,
  },
  breakdownChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  breakdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  breakdownChipCard: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  breakdownChipAmt: {
    fontSize: 10,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#34D399',
  },
  summaryDueCard: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  dueCardLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FB7185',
    letterSpacing: 0.8,
  },
  goldAmountRose: {
    fontSize: 30,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#FB7185',
    marginTop: 6,
  },
  dueCardSubText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  summaryPocketCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  pocketCardLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.8,
  },
  goldAmountAmber: {
    fontSize: 30,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#FBBF24',
    marginTop: 6,
  },
  pocketCardSubText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  // Ledger tab stats & rows
  metricStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricStatBoxIn: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  metricStatTitleIn: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#34D399',
  },
  metricStatValIn: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#34D399',
    marginTop: 2,
  },
  metricStatBoxOut: {
    flex: 1,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.25)',
  },
  metricStatTitleOut: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FB7185',
  },
  metricStatValOut: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#FB7185',
    marginTop: 2,
  },
  metricStatBoxNet: {
    flex: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  metricStatTitleNet: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FBBF24',
  },
  metricStatValNet: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#FBBF24',
    marginTop: 2,
  },
  emptyGoldBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyGoldText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  goldLedgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  goldRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  goldIconPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldIconPillCredit: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
  },
  goldIconPillDebit: {
    backgroundColor: 'rgba(244, 63, 94, 0.18)',
  },
  goldIconPillAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  goldRowTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#F6F9F5',
  },
  goldRowSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  goldRowAmt: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
  },
  pocketLedgerSummaryBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  pocketBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pocketBannerTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FEF08A',
  },
  pocketBannerSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  pocketBannerAmt: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#FEF08A',
  },
  // Transfer Cash drawer styles
  goldInputLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#CAD6C9',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  noCardWarnBox: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  noCardWarnText: {
    color: '#FB7185',
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
  },
  chipSelectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  senderCardChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activeSenderCardChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#34D399',
  },
  senderCardChipText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  activeSenderCardChipText: {
    color: '#F6F9F5',
    fontWeight: '800',
  },
  senderCardBalText: {
    fontSize: 10,
    fontFamily: CedarTypography.display,
    color: '#34D399',
    marginTop: 2,
  },
  activeSenderCardBalText: {
    color: '#34D399',
    fontWeight: '800',
  },
  targetUserBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activeTargetUserBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#F59E0B',
  },
  targetUserBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  activeTargetUserBtnText: {
    color: '#FEF08A',
    fontWeight: '800',
  },
  receiverCardChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activeReceiverCardChip: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: '#F59E0B',
  },
  receiverCardChipText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  activeReceiverCardChipText: {
    color: '#FEF08A',
    fontWeight: '800',
  },
  goldAmountInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    fontSize: 22,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#FEF08A',
  },
  goldTextInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: '#F6F9F5',
  },
  confirmTransferBtn: {
    backgroundColor: '#FEF08A',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  confirmTransferBtnText: {
    color: '#071A12',
    fontSize: 14,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '900',
  },
});
