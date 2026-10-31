import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Image,
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
  AlertCircle,
  ShieldCheck,
} from 'lucide-react-native';

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  bill_gen_day: number;
  bill_due_day: number;
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
  const [userName, setUserName] = useState<string>('Credics Vault');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [accessibleCards, setAccessibleCards] = useState<CardData[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('all');

  // Real Calculated Limits
  const [totalLimit, setTotalLimit] = useState(0);
  const [availableLimit, setAvailableLimit] = useState(0);
  const [inTransit, setInTransit] = useState(0);
  const [usersCash, setUsersCash] = useState(0);
  const [daysToBill, setDaysToBill] = useState(0);
  const [nextBillDate, setNextBillDate] = useState<string>('');
  const [recentTransactions, setRecentTransactions] = useState<RecentTx[]>([]);

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

  // Fetch Real Data from Supabase
  const fetchDashboardData = useCallback(async () => {
    try {
      // 1. Fetch Profile
      const {
        data: { session },
      } = await supabase.auth.getSession();
      let userId = session?.user?.id;

      if (!userId) {
        const { data: firstProfile } = await supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .limit(1)
          .maybeSingle();
        if (firstProfile) {
          userId = firstProfile.id;
          setUserName(firstProfile.name);
          if (firstProfile.avatar_url) setUserAvatar(firstProfile.avatar_url);
        }
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, avatar_url')
          .eq('id', userId)
          .maybeSingle();
        if (profile) {
          setUserName(profile.name);
          if (profile.avatar_url) setUserAvatar(profile.avatar_url);
        }
      }

      // 2. Fetch Cards
      const { data: cardsData } = await supabase
        .from('cards')
        .select('*')
        .order('is_primary', { ascending: false });

      const cards: CardData[] = cardsData || [];
      setAccessibleCards(cards);
      calculateBillDays(cards, selectedCardId);

      // 3. Calculate Limits (Web App Parity Math)
      let currentLimit = 0;
      let activeCardIds: string[] = [];

      if (selectedCardId === 'all') {
        currentLimit = cards.filter((c) => c.is_primary).reduce((sum, c) => sum + Number(c.total_limit || 0), 0);
        activeCardIds = cards.map((c) => c.id);
      } else {
        const target = cards.find((c) => c.id === selectedCardId);
        currentLimit = Number(target?.total_limit || 0);
        if (target) activeCardIds = [target.id];
      }
      if (currentLimit === 0 && cards.length > 0) {
        currentLimit = cards.reduce((sum, c) => sum + Number(c.total_limit || 0), 0);
      }
      setTotalLimit(currentLimit);

      // Card Transactions: withdrawals & bill payments
      let txQuery = supabase.from('card_transactions').select('*');
      if (activeCardIds.length > 0) txQuery = txQuery.in('card_id', activeCardIds);
      const { data: txData } = await txQuery;

      const totalWithdrawals =
        txData
          ?.filter((t) => t.type === 'withdrawal')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;

      const totalBillPayments =
        txData
          ?.filter((t) => t.type === 'bill_payment')
          .reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0;

      // Spends (personal credit card spends)
      let spendsQuery = supabase.from('spends').select('*').eq('payment_method', 'credit_card');
      if (activeCardIds.length > 0) spendsQuery = spendsQuery.in('card_id', activeCardIds);
      const { data: spendsData } = await spendsQuery;

      const totalSpends =
        spendsData?.reduce((sum, s) => sum + Number(s.amount || 0), 0) || 0;

      // Available Limit Math
      const calculatedAvailable = currentLimit - totalWithdrawals - totalSpends + totalBillPayments;
      setAvailableLimit(Math.max(0, calculatedAvailable));

      // In Transit Rotations
      const inTransitTotal =
        txData
          ?.filter(
            (t) =>
              t.type === 'withdrawal' &&
              ['pending_settlement', 'partially_settled'].includes(t.status)
          )
          .reduce((sum, t) => {
            const due =
              t.status === 'partially_settled' && t.settlement_details?.total_due !== undefined
                ? Number(t.settlement_details.total_due)
                : Number(t.amount);
            return sum + due;
          }, 0) || 0;
      setInTransit(inTransitTotal);

      // Users Cash from cash_on_hand
      const { data: cohData } = await supabase.from('cash_on_hand').select('current_balance');
      const totalCash =
        cohData?.reduce((sum, c) => sum + Number(c.current_balance || 0), 0) || 0;
      setUsersCash(totalCash);

      // 4. Form Real Recent Transactions Feed
      const txFeed: RecentTx[] = [];

      if (txData && txData.length > 0) {
        txData.slice(0, 4).forEach((t) => {
          const isPayment = t.type === 'bill_payment';
          txFeed.push({
            id: t.id,
            title: isPayment ? 'Bill Payment Repaid' : (t.remarks || 'Rotation Withdrawal'),
            category: isPayment ? 'Repayment' : 'Card Rotation',
            amount: Number(t.amount),
            date: t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent',
            isCredit: isPayment,
          });
        });
      }

      if (spendsData && spendsData.length > 0) {
        spendsData.slice(0, 3).forEach((s) => {
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
  }, [selectedCardId]);

  useEffect(() => {
    fetchDashboardData();

    const channel = supabase
      .channel('mobile-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_transactions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spends' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_on_hand' }, () => fetchDashboardData())
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
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
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
              <Text style={styles.greetingText}>Welcome back,</Text>
              <Text style={styles.userNameText}>{userName}</Text>
            </View>
          </View>

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
              <CreditCard size={14} color={CedarColors.forest800} />
              <Text style={styles.cardDropdownText} numberOfLines={1}>
                {getActiveCardName()}
              </Text>
              <ChevronDown size={14} color={CedarColors.forest800} />
            </TouchableOpacity>

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

        {/* LUXURY DEEP FOREST HERO CARD */}
        <LinearGradient
          colors={[CedarColors.forest900, CedarColors.forest800]}
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
                  <Eye size={17} color="#CAD6C9" style={{ marginLeft: 8 }} />
                ) : (
                  <EyeOff size={17} color="#CAD6C9" style={{ marginLeft: 8 }} />
                )}
              </TouchableOpacity>
            </View>

            {/* Bill Days Badge (Clean micro-icon, no emojis) */}
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
              <TrendingUp size={13} color="#4ADE80" />
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

          {/* 4 Circular Quick Action Buttons (Inside Hero Card) */}
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

        {/* Real Recent Transactions Feed */}
        <View style={styles.txCard}>
          <View style={styles.txHeader}>
            <View>
              <Text style={styles.txTitle}>Recent Transactions</Text>
              <Text style={styles.txSubtitle}>Live credit rotations & personal spends</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
                router.push('/(tabs)/transactions');
              }}
            >
              <Text style={styles.txSeeAll}>See all →</Text>
            </TouchableOpacity>
          </View>

          {recentTransactions.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Text style={styles.emptyFeedText}>No transactions recorded yet.</Text>
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
                      <ArrowDownLeft size={18} color="#2E944B" />
                    ) : (
                      <ArrowUpRight size={18} color={CedarColors.ink700} />
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

      {/* Card Selector Modal */}
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
            <Text style={styles.cardSelectTitle}>Select Credit Vault</Text>
            <Text style={styles.cardSelectSub}>
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
  greetingText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  userNameText: {
    fontSize: 15,
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
    maxWidth: 160,
  },
  cardDropdownText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
    maxWidth: 95,
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
    shadowOpacity: 0.22,
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
    gap: 4,
    marginBottom: 3,
  },
  metricLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  metricValue: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '700',
    color: '#F6F9F5',
  },
  txCard: {
    marginHorizontal: 20,
    backgroundColor: CedarColors.card,
    borderRadius: 24,
    padding: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  txTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  txSubtitle: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  txSeeAll: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  emptyFeed: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyFeedText: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CedarColors.border,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditIconBox: {
    backgroundColor: 'rgba(46, 148, 75, 0.1)',
  },
  debitIconBox: {
    backgroundColor: 'rgba(10, 38, 28, 0.06)',
  },
  txTexts: {
    flex: 1,
  },
  txName: {
    fontSize: 13,
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
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 26, 18, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardSelectDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: CedarColors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  cardSelectTitle: {
    fontSize: 16,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  cardSelectSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 4,
    marginBottom: 14,
  },
  cardOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginBottom: 8,
  },
  cardOptionSelected: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
    borderColor: CedarColors.forest800,
  },
  cardOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cardOptionName: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
  },
  cardOptionDigits: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
});
