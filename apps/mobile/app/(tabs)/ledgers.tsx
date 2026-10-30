import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { Plus, CheckCircle, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';

export default function LedgersScreen() {
  const [activeTab, setActiveTab] = useState<'lents' | 'borrowed'>('lents');

  const lentsList = [
    { id: '1', borrower: 'Rahim Khan', amount: 12000, due: 'In 3 days', status: 'ACTIVE' },
    { id: '2', borrower: 'Tanvir Hossain', amount: 5500, due: 'Overdue by 2 days', status: 'OVERDUE' },
    { id: '3', borrower: 'Sabbir Ahmed', amount: 8000, due: 'Paid', status: 'SETTLED' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Ledgers & Lents</Text>
          <HapticButton style={styles.addBtn} feedbackType="medium">
            <Plus size={16} color={CedarColors.pine900} />
            <Text style={styles.addBtnText}>New Lent</Text>
          </HapticButton>
        </View>

        {/* Balance Summary Box */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryCol}>
            <View style={styles.summaryLabelRow}>
              <ArrowUpRight size={16} color={CedarColors.positive} />
              <Text style={styles.summaryLabel}>Total Lent Out</Text>
            </View>
            <Text style={styles.summaryAmount}>₹25,500</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <View style={styles.summaryLabelRow}>
              <ArrowDownLeft size={16} color={CedarColors.clay} />
              <Text style={styles.summaryLabel}>Due to Collect</Text>
            </View>
            <Text style={[styles.summaryAmount, { color: CedarColors.gold500 }]}>₹17,500</Text>
          </View>
        </View>

        {/* Tab Filter */}
        <View style={styles.tabSwitcher}>
          <HapticButton
            style={[styles.tabItem, activeTab === 'lents' && styles.activeTabItem]}
            onPress={() => setActiveTab('lents')}
          >
            <Text style={[styles.tabText, activeTab === 'lents' && styles.activeTabText]}>
              Money Lent (Others Owe You)
            </Text>
          </HapticButton>
        </View>

        {/* List of Lents */}
        <View style={styles.listContainer}>
          {lentsList.map((item) => {
            const isOverdue = item.status === 'OVERDUE';
            const isSettled = item.status === 'SETTLED';

            return (
              <View key={item.id} style={styles.lentCard}>
                <View style={styles.lentLeft}>
                  <View
                    style={[
                      styles.avatarBox,
                      isOverdue
                        ? { backgroundColor: 'rgba(198, 84, 58, 0.2)' }
                        : isSettled
                        ? { backgroundColor: 'rgba(47, 158, 110, 0.2)' }
                        : { backgroundColor: CedarColors.pine700 },
                    ]}
                  >
                    {isSettled ? (
                      <CheckCircle size={20} color={CedarColors.positive} />
                    ) : (
                      <Clock size={20} color={isOverdue ? CedarColors.negative : CedarColors.gold500} />
                    )}
                  </View>
                  <View>
                    <Text style={styles.borrowerName}>{item.borrower}</Text>
                    <Text
                      style={[
                        styles.dueText,
                        isOverdue ? styles.overdueText : isSettled ? styles.settledText : null,
                      ]}
                    >
                      {item.due}
                    </Text>
                  </View>
                </View>

                <View style={styles.lentRight}>
                  <Text style={styles.lentAmount}>₹{item.amount.toLocaleString()}</Text>
                  {!isSettled && (
                    <HapticButton style={styles.settleBtn} feedbackType="success">
                      <Text style={styles.settleBtnText}>Settle</Text>
                    </HapticButton>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.pine900,
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
  title: {
    color: CedarColors.bone,
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.gold500,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addBtnText: {
    color: CedarColors.pine900,
    fontSize: 13,
    fontWeight: '800',
  },
  summaryBox: {
    flexDirection: 'row',
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  summaryCol: {
    flex: 1,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  summaryLabel: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryAmount: {
    color: CedarColors.bone,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
  },
  tabSwitcher: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  tabItem: {
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  activeTabItem: {},
  tabText: {
    color: CedarColors.bone,
    fontSize: 14,
    fontWeight: '700',
  },
  activeTabText: {
    color: CedarColors.gold500,
  },
  listContainer: {
    paddingHorizontal: 20,
  },
  lentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  lentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  borrowerName: {
    color: CedarColors.bone,
    fontSize: 15,
    fontWeight: '700',
  },
  dueText: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  overdueText: {
    color: CedarColors.negative,
    fontWeight: '700',
  },
  settledText: {
    color: CedarColors.positive,
  },
  lentRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  lentAmount: {
    color: CedarColors.bone,
    fontSize: 16,
    fontWeight: '800',
  },
  settleBtn: {
    backgroundColor: CedarColors.pine700,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  settleBtnText: {
    color: CedarColors.gold500,
    fontSize: 11,
    fontWeight: '700',
  },
});
