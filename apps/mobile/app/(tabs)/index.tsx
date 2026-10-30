import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CedarColors } from '@credics/core';
import { QuickActions } from '../../components/QuickActions';
import { UrgentBillBottomSheet } from '../../components/UrgentBillBottomSheet';
import { HapticButton } from '../../components/HapticButton';
import { HomeSkeleton } from '../../components/Skeleton';
import { requestOverlayPermission } from '../../utils/overlayPermission';
import {
  Bell,
  Search,
  Eye,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  ShoppingBag,
  Briefcase,
  Coffee,
  Car,
} from 'lucide-react-native';

export default function HomeScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUrgentAlert, setShowUrgentAlert] = useState(false);

  useEffect(() => {
    // Initial smooth skeleton transition
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  // Mock data connected to Cedar & Credics schema
  const totalBalance = 12480.50;
  const growthRate = '+12.6%';

  const recentTransactions = [
    { id: '1', name: 'Netflix Subscription', category: 'Entertainment', amount: -15.99, date: 'Today', icon: ShoppingBag },
    { id: '2', name: 'Monthly Salary', category: 'Income', amount: 2500.00, date: 'Aug 18, 2026', icon: Briefcase },
    { id: '3', name: 'Starbucks Coffee', category: 'Food & Drinks', amount: -6.45, date: 'Aug 17, 2026', icon: Coffee },
    { id: '4', name: 'Uber Ride', category: 'Transport', amount: -12.30, date: 'Aug 16, 2026', icon: Car },
  ];

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CedarColors.gold500} />
        }
      >
        {/* Header Greeting */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingTitle}>Good morning</Text>
            <Text style={styles.greetingSub}>Let's build your brighter future</Text>
          </View>
          <View style={styles.headerIcons}>
            <HapticButton style={styles.iconCircle} feedbackType="light">
              <Search size={20} color={CedarColors.bone} />
            </HapticButton>
            <HapticButton
              style={styles.iconCircle}
              onPress={() => setShowUrgentAlert(true)}
              feedbackType="medium"
            >
              <Bell size={20} color={CedarColors.bone} />
              <View style={styles.notificationDot} />
            </HapticButton>
          </View>
        </View>

        {/* Total Balance Card */}
        <LinearGradient
          colors={[CedarColors.pine700, CedarColors.pine900]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceHeader}>
            <View style={styles.balanceLabelRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <Eye size={16} color={CedarColors.pine300} style={{ marginLeft: 6 }} />
            </View>
            <TrendingUp size={20} color={CedarColors.positive} />
          </View>

          <View style={styles.balanceAmountRow}>
            <Text style={styles.balanceAmount}>
              ₹{totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
            <View style={styles.growthBadge}>
              <Text style={styles.growthText}>▲ {growthRate}</Text>
              <Text style={styles.growthSub}>vs last month</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Quick Action Grid */}
        <QuickActions
          onAddCard={() => {}}
          onSendLent={() => {}}
          onRotateSettle={() => setShowUrgentAlert(true)}
          onMore={() => {}}
        />

        {/* Recent Transactions Section */}
        <View style={styles.txSection}>
          <View style={styles.txSectionHeader}>
            <Text style={styles.txSectionTitle}>Recent Transactions</Text>
            <HapticButton>
              <Text style={styles.seeAllText}>See all →</Text>
            </HapticButton>
          </View>

          {recentTransactions.map((tx) => {
            const Icon = tx.icon;
            const isIncome = tx.amount > 0;

            return (
              <View key={tx.id} style={styles.txItem}>
                <View style={styles.txLeft}>
                  <View style={styles.txIconBox}>
                    <Icon size={20} color={CedarColors.bone} />
                  </View>
                  <View>
                    <Text style={styles.txName}>{tx.name}</Text>
                    <Text style={styles.txCategory}>{tx.category}</Text>
                  </View>
                </View>

                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, isIncome ? styles.incomeText : styles.expenseText]}>
                    {isIncome ? `+₹${tx.amount.toFixed(2)}` : `-₹${Math.abs(tx.amount).toFixed(2)}`}
                  </Text>
                  <Text style={styles.txDate}>{tx.date}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* 30-40% Urgent Bill Bottom Sheet Alert */}
      <UrgentBillBottomSheet
        visible={showUrgentAlert}
        cardName="HDFC Regalia Gold"
        last4Digits="4921"
        dueAmount={2140.60}
        dueDate="Tomorrow"
        onPayNow={() => setShowUrgentAlert(false)}
        onRotateLimit={() => setShowUrgentAlert(false)}
        onClose={() => setShowUrgentAlert(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.pine900,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  greetingTitle: {
    color: CedarColors.bone,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  greetingSub: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CedarColors.pine800,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CedarColors.negative,
  },
  balanceCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 22,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CedarColors.gold500,
    marginRight: 8,
  },
  balanceLabel: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '600',
  },
  balanceAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  balanceAmount: {
    color: CedarColors.bone,
    fontSize: 30,
    fontWeight: '900',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  growthBadge: {
    alignItems: 'flex-end',
  },
  growthText: {
    color: CedarColors.positive,
    fontSize: 13,
    fontWeight: '800',
  },
  growthSub: {
    color: CedarColors.pine300,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  txSection: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  txSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  txSectionTitle: {
    color: CedarColors.bone,
    fontSize: 17,
    fontWeight: '800',
  },
  seeAllText: {
    color: CedarColors.gold500,
    fontSize: 13,
    fontWeight: '700',
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  txIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CedarColors.pine700,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txName: {
    color: CedarColors.bone,
    fontSize: 14,
    fontWeight: '700',
  },
  txCategory: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  incomeText: {
    color: CedarColors.positive,
  },
  expenseText: {
    color: CedarColors.bone,
  },
  txDate: {
    color: CedarColors.pine300,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
  },
});
