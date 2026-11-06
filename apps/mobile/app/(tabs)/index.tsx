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
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { CedarColors, CedarTypography, generateAntiFraudAmounts } from '@credics/core';
import { QuickActions } from '../../components/QuickActions';
import { NotificationSidePanel } from '../../components/NotificationSidePanel';
import { SwipeDownDrawer, DrawerScrollView } from '../../components/SwipeDownDrawer';
import { HapticButton } from '../../components/HapticButton';
import { HomeSkeleton } from '../../components/Skeleton';
import { HeroCardLimitChart, CardLimitStat } from '../../components/HeroCardLimitChart';
import { UrgentBillBottomSheet } from '../../components/UrgentBillBottomSheet';
import { broadcastBillEntryAlert } from '../../lib/alertDispatcher';
import { supabase } from '../../lib/supabase';
import {
  useDashboardStore,
  CardData,
  UserStat,
  BillingCycle,
  QRItem,
  ActiveCooldown,
  RecentTx,
} from '../../lib/dashboardStore';
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
  AlertTriangle,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Connect to global dashboardStore for instant hydration from parallel background pre-fetch
  const {
    isInitialized,
    currentUser,
    userName,
    firstName,
    userAvatar,
    accessibleCards,
    selectedCardId,
    cardLimitStats,
    availableLimit,
    totalLimit,
    inTransit,
    usersCash,
    daysToBill,
    nextBillDate,
    activeBills,
    userStats,
    suggestedQrs,
    activeCooldowns,
    recentTransactions,
    setSelectedCardId,
    fetchDashboardData,
  } = useDashboardStore();

  const isLoading = !isInitialized;
  const [refreshing, setRefreshing] = useState(false);

  // Card & Vault Modal State
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [showBalance, setShowBalance] = useState<boolean>(true);

  // Billing Cycle State
  const [showNotificationPanel, setShowNotificationPanel] = useState<boolean>(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isUrgentBillOpen, setIsUrgentBillOpen] = useState(false);
  const [billFormCardId, setBillFormCardId] = useState('');
  const [billFormMonth, setBillFormMonth] = useState('');
  const [billFormGenAmount, setBillFormGenAmount] = useState('');
  const [billFormPaidAmount, setBillFormPaidAmount] = useState('');
  const [isSavingBill, setIsSavingBill] = useState(false);

  // Pending Bills & Urgency Calculation
  const pendingBills = useMemo(() => {
    return activeBills.filter((b) => {
      const due = Number(b.generated_amount) - Number(b.paid_amount || 0);
      return b.status !== 'paid' && due > 0;
    });
  }, [activeBills]);

  const totalPendingDue = useMemo(() => {
    return pendingBills.reduce((sum, b) => {
      const due = Number(b.generated_amount) - Number(b.paid_amount || 0);
      return sum + due;
    }, 0);
  }, [pendingBills]);

  const mostUrgentBill = useMemo(() => {
    if (pendingBills.length === 0) return null;
    return pendingBills[0];
  }, [pendingBills]);

  const mostUrgentCard = useMemo(() => {
    if (!mostUrgentBill) return null;
    return accessibleCards.find((c) => c.id === mostUrgentBill.card_id) || null;
  }, [mostUrgentBill, accessibleCards]);

  // Cash & Repayment Analytics State
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
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());
  const [selectedQr, setSelectedQr] = useState<QRItem | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrPayingCardId, setQrPayingCardId] = useState('');
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([]);
  const [qrPaymentMode, setQrPaymentMode] = useState<'once' | 'multiple'>('once');
  const [isMarkingUsed, setIsMarkingUsed] = useState(false);

  // 120Hz Spring micro-bounce and playful ring for Notification Bell
  const bellScale = useSharedValue(1);
  const bellRotate = useSharedValue(0);
  const bellDotPulse = useSharedValue(1);

  // Playful ambient jingle & heartbeat pulse on notification dot
  useEffect(() => {
    // Pulse notification dot continuously
    bellDotPulse.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 800 }),
        withTiming(1.0, { duration: 800 })
      ),
      -1,
      true
    );

    // Periodic playful bell ring every 6 seconds
    const jingleTimer = setInterval(() => {
      bellRotate.value = withSequence(
        withTiming(-16, { duration: 70 }),
        withTiming(16, { duration: 90 }),
        withTiming(-10, { duration: 80 }),
        withTiming(10, { duration: 80 }),
        withTiming(-4, { duration: 60 }),
        withTiming(0, { duration: 60 })
      );
    }, 6000);

    return () => clearInterval(jingleTimer);
  }, []);

  const bellAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bellScale.value }],
  }));

  const bellIconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bellRotate.value}deg` }],
  }));

  const bellDotAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bellDotPulse.value }],
  }));

  const handleNotificationBellPress = () => {
    // 120Hz Energetic spring bounce & ringing chime pop
    bellScale.value = withSequence(
      withTiming(0.72, { duration: 50 }),
      withSpring(1.35, { damping: 8, stiffness: 480 }),
      withSpring(1.0, { damping: 12, stiffness: 350 })
    );
    bellRotate.value = withSequence(
      withTiming(-26, { duration: 60 }),
      withTiming(26, { duration: 90 }),
      withTiming(-16, { duration: 70 }),
      withTiming(16, { duration: 70 }),
      withTiming(-8, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
    setShowNotificationPanel(true);
  };

  // 120Hz Tactile Pop Animation for Card Dropdown
  const cardDropdownScale = useSharedValue(1);
  const cardDropdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardDropdownScale.value }],
  }));

  const handleCardDropdownPress = () => {
    cardDropdownScale.value = withSequence(
      withTiming(0.85, { duration: 60 }),
      withSpring(1.18, { damping: 9, stiffness: 450 }),
      withSpring(1.0, { damping: 14, stiffness: 350 })
    );
    setCardModalVisible(true);
  };

  // Cooldown countdown
  useEffect(() => {
    const timer = setInterval(() => setNowTimestamp(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      fetchDashboardData();
    }

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
  }, [fetchDashboardData, isInitialized]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  const getActiveCardName = () => {
    if (selectedCardId === 'all') return 'All Vault Cards';
    const fam = cardLimitStats.find((c) => c.id === selectedCardId);
    if (fam) {
      return fam.hasSubCards ? `${fam.name} (+${fam.subCardsCount} sub)` : `${fam.name} (••${fam.last4})`;
    }
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

      // Broadcast WhatsApp and Push alerts to family members
      const selectedCard = accessibleCards.find((c) => c.id === billFormCardId);
      const { data: allProfiles } = await supabase.from('profiles').select('id, name, phone');
      if (selectedCard && allProfiles) {
        broadcastBillEntryAlert({
          cardName: selectedCard.card_name,
          last4Digits: selectedCard.last_4_digits,
          billMonth: billFormMonth,
          billAmount: generated,
          dueDay: selectedCard.bill_due_day || 26,
          profiles: allProfiles,
        }).catch((err) => console.error('Failed to broadcast bill entry alert:', err));
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save bill cycle.');
    } finally {
      setIsSavingBill(false);
    }
  };

  // QR Modal: Generate Dynamic Links via @credics/core
  const handleGeneratePaymentAmounts = () => {
    setGeneratedAmounts(generateAntiFraudAmounts(qrPaymentMode, 2));
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
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#F6F9F5"
              colors={['#10B981']}
              progressViewOffset={insets.top + 20}
            />
          }
        >
          {/* ================= 1 & 2. HERO LUXURY SECTION WITH SVG ORGANIC WAVE ================= */}
          <View style={styles.heroSectionWrapper}>
            <LinearGradient
              colors={['#03180F', '#072C1C', '#0B3F28', '#062618']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={[styles.heroBackgroundGradient, { paddingTop: insets.top + 8 }]}
            >
              {/* Header: User Profile Avatar, Live Status, Dropdown & Notification Bell */}
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
                      <Text style={styles.liveStatusText}>LIVE STATUS • ACTIVE</Text>
                    </View>
                    <Text style={styles.userNameText}>Hey, {firstName || userName}</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.headerActions}>
                  {/* Card Selector Dropdown with 120Hz Tactile Pop */}
                  <Animated.View style={cardDropdownAnimStyle}>
                    <TouchableOpacity
                      style={styles.cardDropdown}
                      onPress={handleCardDropdownPress}
                      activeOpacity={0.8}
                    >
                      <CreditCard size={13} color="#CAD6C9" />
                      <Text style={styles.cardDropdownText} numberOfLines={1}>
                        {getActiveCardName()}
                      </Text>
                      <ChevronDown size={13} color="#CAD6C9" />
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Notification Bell with 120Hz micro-bounce animation */}
                  <Animated.View style={bellAnimStyle}>
                    <TouchableOpacity
                      style={styles.iconCircle}
                      onPress={handleNotificationBellPress}
                      activeOpacity={0.8}
                    >
                      <Animated.View style={bellIconAnimStyle}>
                        <Bell size={18} color="#F6F9F5" />
                      </Animated.View>
                      {daysToBill <= 3 && (
                        <Animated.View style={[styles.notificationDot, bellDotAnimStyle]} />
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

              {/* Total Available Limit Hero Body */}
              <View style={styles.heroMainBody}>
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
                </View>

                {/* Large Balance Typography with Text Animation */}
                <View style={styles.heroAmountRow}>
                  <Animated.Text
                    entering={FadeInDown.duration(400).springify()}
                    style={styles.heroAmount}
                  >
                    {showBalance ? `₹${availableLimit.toLocaleString('en-IN')}` : '••••••••'}
                  </Animated.Text>
                </View>

                {/* Full-Width Spacious Card Family Limit Chart */}
                <View style={styles.heroChartContainer}>
                  <HeroCardLimitChart
                    isAllCards={selectedCardId === 'all'}
                    cards={cardLimitStats}
                    singleCard={cardLimitStats.find((c) => c.id === selectedCardId)}
                  />
                </View>

                <View style={styles.heroDivider} />

                {/* 3 Core Metrics Row */}
                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <View style={styles.metricLabelRow}>
                      <Wallet size={12} color="#34A853" />
                      <Text style={styles.metricLabel}>Total Limit</Text>
                    </View>
                    <Animated.Text
                      entering={FadeInUp.delay(100).duration(300)}
                      style={styles.metricValue}
                    >
                      {showBalance ? `₹${totalLimit.toLocaleString('en-IN')}` : '••••'}
                    </Animated.Text>
                  </View>

                  <View style={styles.metricItem}>
                    <View style={styles.metricLabelRow}>
                      <Layers size={12} color="#38BDF8" />
                      <Text style={styles.metricLabel}>In Transit</Text>
                    </View>
                    <Animated.Text
                      entering={FadeInUp.delay(160).duration(300)}
                      style={[styles.metricValue, { color: '#38BDF8' }]}
                    >
                      {showBalance ? `₹${inTransit.toLocaleString('en-IN')}` : '••••'}
                    </Animated.Text>
                  </View>

                  <View style={styles.metricItem}>
                    <View style={styles.metricLabelRow}>
                      <Users size={12} color="#4ADE80" />
                      <Text style={styles.metricLabel}>Users Cash</Text>
                    </View>
                    <Animated.Text
                      entering={FadeInUp.delay(220).duration(300)}
                      style={[styles.metricValue, { color: '#4ADE80' }]}
                    >
                      {showBalance ? `₹${usersCash.toLocaleString('en-IN')}` : '••••'}
                    </Animated.Text>
                  </View>
                </View>

                {/* 4 Quick Actions inside Hero section */}
                <QuickActions
                  onAddLend={() => router.push('/(tabs)/lents')}
                  onSendMoney={() => router.push('/(tabs)/transactions')}
                  onTopUp={() => router.push('/(tabs)/settlements')}
                  onScanQR={() => router.push('/(tabs)/settlements')}
                />
              </View>

              {/* Organic SVG Wave Curve transitioning to light green canvas */}
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
          </View>

          {/* ================= 3. ACTIVE BILLING CYCLES SECTION (Single Master Card - Web Parity) ================= */}
          <View style={styles.sectionContainer}>
            <View style={styles.billingCyclesMasterCard}>
              {/* Master Card Header */}
              <View style={styles.billingCyclesHeader}>
                <View style={styles.billingTitleLeft}>
                  <View style={styles.calendarIconSquare}>
                    <CalendarClock size={16} color="#15803D" strokeWidth={2.4} />
                  </View>
                  <View>
                    <Text style={styles.billingSectionTitle}>Active Billing Cycles</Text>
                    <Text style={styles.billingSectionSub}>
                      {activeBills.filter((b) => {
                        const due = Number(b.generated_amount) - Number(b.paid_amount);
                        return b.status !== 'paid' && due > 0;
                      }).length} Pending Statements
                    </Text>
                  </View>
                </View>

                <View style={styles.billingHeaderRight}>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>
                      {activeBills.filter((b) => {
                        const due = Number(b.generated_amount) - Number(b.paid_amount);
                        return b.status !== 'paid' && due > 0;
                      }).length} Pending
                    </Text>
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
              </View>

              <View style={styles.billingDivider} />

              {/* 100% Paid Celebration Banner */}
              {activeBills.length > 0 && pendingBills.length === 0 && (
                <View style={styles.celebrationBanner}>
                  <View style={styles.celebrationIconCircle}>
                    <CheckCircle2 size={16} color="#15803D" strokeWidth={2.5} />
                  </View>
                  <View style={styles.celebrationTextCol}>
                    <Text style={styles.celebrationTitle}>All Card Bills Cleared</Text>
                    <Text style={styles.celebrationSub}>
                      100% debt-free across all credit vaults for this cycle.
                    </Text>
                  </View>
                </View>
              )}

              {/* Urgent Bill Alert Pill (when daysToBill <= 3 and due > 0) */}
              {daysToBill <= 3 && totalPendingDue > 0 && (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setIsUrgentBillOpen(true)}
                  style={styles.urgentAlertBanner}
                >
                  <View style={styles.urgentAlertLeft}>
                    <View style={styles.urgentAlertPulse}>
                      <AlertTriangle size={15} color="#DC2626" />
                    </View>
                    <View>
                      <Text style={styles.urgentAlertTitle}>
                        {daysToBill <= 1 ? 'Bill Due in 24 Hours' : `Bill Due in ${daysToBill} Days`}
                      </Text>
                      <Text style={styles.urgentAlertSub}>
                        ₹{totalPendingDue.toLocaleString('en-IN')} pending • Tap to review & pay
                      </Text>
                    </View>
                  </View>
                  <ArrowRight size={16} color="#DC2626" />
                </TouchableOpacity>
              )}

              {/* Billing Items Inside Master Card */}
              {activeBills.length === 0 ? (
                <View style={styles.emptyCardBox}>
                  <Text style={styles.emptyBoxText}>No active billing statements found.</Text>
                </View>
              ) : (
                <View style={styles.billingItemsContainer}>
                  {activeBills.map((bill, index) => {
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
                        entering={FadeInDown.delay(60 + index * 50).springify().damping(22)}
                      >
                        <TouchableOpacity
                          activeOpacity={0.92}
                          onPress={() => {
                            setBillFormCardId(bill.card_id);
                            setBillFormMonth(bill.billing_month.slice(0, 7));
                            setBillFormGenAmount(String(bill.generated_amount));
                            setBillFormPaidAmount(String(bill.paid_amount));
                            setIsBillModalOpen(true);
                          }}
                          style={[
                            styles.billInnerCard,
                            isPaid ? styles.billInnerCardPaid : styles.billInnerCardPending,
                          ]}
                        >
                          <View style={styles.billTopRow}>
                            <View style={styles.cardIdentRow}>
                              <CreditCard size={14} color={isPaid ? '#15803D' : CedarColors.forest800} />
                              <Text style={styles.billCardName}>
                                {card?.card_name || 'Vault Card'} (••{card?.last_4_digits || '0000'})
                              </Text>
                            </View>
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
                              <Animated.Text
                                entering={FadeInDown.delay(120).duration(260)}
                                style={styles.billColValue}
                              >
                                ₹{Number(bill.generated_amount).toLocaleString('en-IN')}
                              </Animated.Text>
                            </View>
                            <View style={[styles.billCol, styles.billColBorder]}>
                              <Text style={styles.billColLabel}>PAID</Text>
                              <Animated.Text
                                entering={FadeInDown.delay(160).duration(260)}
                                style={[styles.billColValue, { color: '#15803D' }]}
                              >
                                ₹{Number(bill.paid_amount).toLocaleString('en-IN')}
                              </Animated.Text>
                            </View>
                            <View style={[styles.billCol, styles.billColBorder]}>
                              <Text style={styles.billColLabel}>DUE</Text>
                              <Animated.Text
                                entering={FadeInDown.delay(200).duration(260)}
                                style={[
                                  styles.billColValue,
                                  { color: due > 0 ? '#DC2626' : '#15803D' },
                                ]}
                              >
                                ₹{due > 0 ? due.toLocaleString('en-IN') : 0}
                              </Animated.Text>
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
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              )}
            </View>
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
          <DrawerScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, gap: 10 }}>
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
                <CreditCard size={18} color="#34D399" />
                <View>
                  <Text style={styles.cardOptionName}>All Vault Cards (Unified)</Text>
                  <Text style={styles.cardOptionDigits}>
                    {cardLimitStats.length} Card {cardLimitStats.length === 1 ? 'Family' : 'Families'} • Total Limit: ₹{totalLimit.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
              {selectedCardId === 'all' && <CheckCircle2 size={18} color="#34D399" />}
            </TouchableOpacity>

            {cardLimitStats.map((fam) => {
              const isSelected = selectedCardId === fam.id;
              return (
                <TouchableOpacity
                  key={fam.id}
                  style={[styles.cardOptionRow, isSelected && styles.cardOptionSelected]}
                  onPress={() => {
                    setSelectedCardId(fam.id);
                    setCardModalVisible(false);
                  }}
                >
                  <View style={styles.cardOptionLeft}>
                    <CreditCard size={18} color={isSelected ? '#34D399' : '#8EAA97'} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.cardOptionName} numberOfLines={1}>{fam.name}</Text>
                        {fam.hasSubCards && (
                          <View style={styles.subCardBadge}>
                            <Text style={styles.subCardBadgeText}>+{fam.subCardsCount} Sub</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardOptionDigits}>
                        •••• {fam.last4} {fam.subCardsLast4 && fam.subCardsLast4.length > 0 ? `(Sub: ••${fam.subCardsLast4.join(', ••')})` : ''} | Limit: ₹{Number(fam.totalLimit).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  {isSelected && <CheckCircle2 size={18} color="#34D399" />}
                </TouchableOpacity>
              );
            })}
          </DrawerScrollView>
        </SwipeDownDrawer>

        {/* ================= BILL ENTRY DRAWER (Slide Down to Dismiss) ================= */}
        <SwipeDownDrawer
          visible={isBillModalOpen}
          onClose={() => setIsBillModalOpen(false)}
          title="Manage Billing Cycle"
          subtitle="Record and update card monthly statement amounts"
          heightPercent={0.72}
        >
          <DrawerScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 12 }}>
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
          </DrawerScrollView>
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
          <DrawerScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerScrollBody}>
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
          </DrawerScrollView>
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
          <DrawerScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 14 }}>
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
          </DrawerScrollView>
        </SwipeDownDrawer>

        {/* ================= QR PAYMENT MODAL (Slide Down to Dismiss) ================= */}
        <SwipeDownDrawer
          visible={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          title={selectedQr?.merchant_name || 'UPI QR Payment'}
          subtitle={selectedQr?.upi_id || 'Pay from vault card'}
          heightPercent={0.76}
        >
          <DrawerScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 12 }}>
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
          </DrawerScrollView>
        </SwipeDownDrawer>

        {/* ================= 3. NOTIFICATION SIDE PANEL (Sliding in from Right Side) ================= */}
        <NotificationSidePanel
          visible={showNotificationPanel}
          onClose={() => setShowNotificationPanel(false)}
          urgentBill={
            daysToBill <= 3 && totalPendingDue > 0
              ? {
                  cardName: mostUrgentCard?.card_name || getActiveCardName(),
                  last4Digits: mostUrgentCard?.last_4_digits || accessibleCards[0]?.last_4_digits || '0000',
                  dueAmount: totalPendingDue,
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

        {/* ================= 4. URGENT BILL BOTTOM SHEET ================= */}
        <UrgentBillBottomSheet
          visible={isUrgentBillOpen}
          cardName={mostUrgentCard?.card_name || getActiveCardName()}
          last4Digits={mostUrgentCard?.last_4_digits || accessibleCards[0]?.last_4_digits || '0000'}
          dueAmount={totalPendingDue}
          dueDate={nextBillDate || 'Soon'}
          daysLeft={daysToBill}
          onClose={() => setIsUrgentBillOpen(false)}
          onPayNow={() => {
            setIsUrgentBillOpen(false);
            router.push('/(tabs)/transactions');
          }}
          onRotateLimit={() => {
            setIsUrgentBillOpen(false);
            router.push('/(tabs)/settlements');
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#EFF3EE',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#EFF3EE',
  },
  scrollContent: {
    paddingBottom: 110,
  },
  heroSectionWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  heroBackgroundGradient: {
    width: '100%',
  },
  heroMainBody: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  svgWaveWrapper: {
    width: '100%',
    marginTop: 14,
    marginBottom: -1,
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
  heroChartContainer: {
    width: '100%',
    marginTop: 14,
    marginBottom: 4,
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
  // 5. Active Billing Cycles Master Card Container (Web Parity)
  billingCyclesMasterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#DFE7DE',
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  billingCyclesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billingTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarIconSquare: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(46, 148, 75, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  billingSectionTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  billingSectionSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  billingHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  billingDivider: {
    height: 1,
    backgroundColor: '#EAEFEA',
    marginBottom: 14,
  },
  billingItemsContainer: {
    gap: 12,
  },
  billInnerCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.2,
  },
  billInnerCardPending: {
    borderColor: '#DFE8E0',
    backgroundColor: '#FAFCFA',
  },
  billInnerCardPaid: {
    borderColor: '#BEE5C8',
    backgroundColor: '#F7FCF8',
  },
  cardIdentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  billCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
  billCardPending: {
    borderColor: '#C6D8CB',
  },
  billCardPaid: {
    borderColor: '#A0D4AF',
    backgroundColor: '#F8FCF9',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardOptionSelected: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.14)',
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
    color: '#F6F9F5',
  },
  cardOptionDigits: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#8EAA97',
    marginTop: 2,
  },
  subCardBadge: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  subCardBadgeText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#34D399',
    fontWeight: '700',
  },
  // Inputs in Drawers
  inputLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#34D399',
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activeSelectorChip: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
  },
  selectorChipText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  activeSelectorChipText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sheetInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    fontSize: 14,
    fontFamily: CedarTypography.body,
    color: '#F6F9F5',
  },
  sheetSaveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  sheetSaveText: {
    color: '#FFFFFF',
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
  celebrationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(21, 128, 61, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(21, 128, 61, 0.25)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  celebrationIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(21, 128, 61, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationTextCol: {
    flex: 1,
  },
  celebrationTitle: {
    fontSize: 13,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '800',
    color: '#15803D',
  },
  celebrationSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#4A6B56',
    marginTop: 2,
  },
  urgentAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  urgentAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  urgentAlertPulse: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentAlertTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '800',
    color: '#DC2626',
  },
  urgentAlertSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#991B1B',
    marginTop: 1,
  },
});
