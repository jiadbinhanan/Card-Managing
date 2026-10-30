import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { DonutChart } from '../../components/DonutChart';
import { HapticButton } from '../../components/HapticButton';
import { InsightsSkeleton } from '../../components/Skeleton';
import { Calendar, ChevronRight, Sparkles } from 'lucide-react-native';

export default function InsightsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeSegment, setActiveSegment] = useState<'spending' | 'income' | 'savings'>('spending');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const monthlyBars = [
    { month: 'Mar', height: 40 },
    { month: 'Apr', height: 60 },
    { month: 'May', height: 45 },
    { month: 'Jun', height: 75 },
    { month: 'Jul', height: 50 },
    { month: 'Aug', height: 95, isCurrent: true },
  ];

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <InsightsSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          <HapticButton style={styles.calendarBtn}>
            <Calendar size={20} color={CedarColors.bone} />
          </HapticButton>
        </View>

        {/* Segmented Controls */}
        <View style={styles.segmentedRow}>
          {(['spending', 'income', 'savings'] as const).map((seg) => (
            <HapticButton
              key={seg}
              style={[styles.segmentBtn, activeSegment === seg && styles.activeSegmentBtn]}
              onPress={() => setActiveSegment(seg)}
            >
              <Text style={[styles.segmentText, activeSegment === seg && styles.activeSegmentText]}>
                {seg.charAt(0).toUpperCase() + seg.slice(1)}
              </Text>
            </HapticButton>
          ))}
        </View>

        {/* Donut Chart with Category Legend */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Your Spending</Text>
            <Text style={styles.chartMonth}>Aug 2026 ▾</Text>
          </View>

          <DonutChart totalAmount={2140.60} />
        </View>

        {/* Smart Tip Card */}
        <View style={styles.smartTipCard}>
          <View style={styles.tipIconBox}>
            <Sparkles size={20} color={CedarColors.gold500} />
          </View>
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>You're 16% under budget!</Text>
            <Text style={styles.tipSub}>
              Great job managing your credit cycle this month. Bill due in 5 days.
            </Text>
          </View>
          <ChevronRight size={18} color={CedarColors.pine300} />
        </View>

        {/* Spending Trend Bar Chart */}
        <View style={styles.trendCard}>
          <Text style={styles.trendTitle}>Spending Trend</Text>

          <View style={styles.barChartContainer}>
            {monthlyBars.map((item, index) => (
              <View key={index} style={styles.barCol}>
                <View
                  style={[
                    styles.barTrack,
                    { height: item.height },
                    item.isCurrent ? styles.currentBar : styles.regularBar,
                  ]}
                />
                <Text style={[styles.monthLabel, item.isCurrent && styles.currentMonthLabel]}>
                  {item.month}
                </Text>
              </View>
            ))}
          </View>
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
  calendarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CedarColors.pine800,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentedRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  segmentBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: CedarColors.pine800,
  },
  activeSegmentBtn: {
    backgroundColor: CedarColors.bone,
  },
  segmentText: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '700',
  },
  activeSegmentText: {
    color: CedarColors.pine900,
  },
  chartCard: {
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartTitle: {
    color: CedarColors.bone,
    fontSize: 16,
    fontWeight: '800',
  },
  chartMonth: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '600',
  },
  smartTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: CedarColors.gold500,
  },
  tipIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CedarColors.pine700,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    color: CedarColors.bone,
    fontSize: 14,
    fontWeight: '800',
  },
  tipSub: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  trendCard: {
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
  },
  trendTitle: {
    color: CedarColors.bone,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 20,
  },
  barChartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: 8,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    width: 14,
    borderRadius: 7,
  },
  regularBar: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  currentBar: {
    backgroundColor: CedarColors.gold500,
  },
  monthLabel: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  currentMonthLabel: {
    color: CedarColors.gold500,
    fontWeight: '800',
  },
});
