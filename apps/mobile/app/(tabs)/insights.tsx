import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { DonutChart, CategorySlice } from '../../components/DonutChart';
import { HapticButton } from '../../components/HapticButton';
import { InsightsSkeleton } from '../../components/Skeleton';
import { Calendar, ChevronRight, TrendingDown, TrendingUp, Layers, CheckCircle2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import * as Haptics from 'expo-haptics';

interface MonthlyBarData {
  month: string;
  height: number;
  amount: number;
  formattedAmount: string;
  isCurrent: boolean;
}

export default function InsightsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSegment, setActiveSegment] = useState<'spending' | 'income' | 'savings' | 'goals'>('spending');
  const [selectedMonth, setSelectedMonth] = useState('Current Period');

  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [categorySlices, setCategorySlices] = useState<CategorySlice[]>([]);
  const [monthlyBars, setMonthlyBars] = useState<MonthlyBarData[]>([]);
  const [budgetUnderPct, setBudgetUnderPct] = useState<number>(14);

  const fetchInsightsData = useCallback(async () => {
    try {
      // 1. Fetch real spends & transactions
      const [spendsRes, txsRes] = await Promise.all([
        supabase.from('spends').select('amount, spend_type, spend_date'),
        supabase.from('card_transactions').select('amount, type, transaction_date'),
      ]);

      const spends = spendsRes.data || [];
      const txs = txsRes.data || [];

      // 2. Real Category Breakdown from spends
      const catMap: Record<string, number> = {};
      let total = 0;

      spends.forEach((s) => {
        const amt = Number(s.amount || 0);
        total += amt;
        const cat = s.spend_type || 'Personal';
        catMap[cat] = (catMap[cat] || 0) + amt;
      });

      // Also account for card rotations
      const rotationWithdrawals = txs.filter((t) => t.type === 'withdrawal');
      const totalRotations = rotationWithdrawals.reduce((sum, t) => sum + Number(t.amount || 0), 0);
      if (totalRotations > 0) {
        catMap['Rotations'] = totalRotations;
        total += totalRotations;
      }

      setTotalSpent(total);

      const luxuryPalette = [
        CedarColors.forest800,
        '#2E944B',
        '#71A387',
        '#D97706',
        '#9BB8A7',
        '#DCEEE2',
      ];

      const slices: CategorySlice[] = Object.keys(catMap).map((k, idx) => ({
        label: k,
        amount: catMap[k],
        percentage: total > 0 ? Math.round((catMap[k] / total) * 100) : 0,
        color: luxuryPalette[idx % luxuryPalette.length],
      }));

      setCategorySlices(slices.length > 0 ? slices : [{ label: 'Personal', amount: 0, percentage: 100, color: CedarColors.forest800 }]);

      // 3. Dynamic Last 6 Months Spending Bars
      const now = new Date();
      const monthsList: MonthlyBarData[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mName = d.toLocaleString('en-US', { month: 'short' });
        const mYear = d.getFullYear();
        const mMonth = d.getMonth();

        // Calculate sum for this specific month
        let monthTotal = 0;

        spends.forEach((s) => {
          if (s.spend_date) {
            const sd = new Date(s.spend_date);
            if (sd.getFullYear() === mYear && sd.getMonth() === mMonth) {
              monthTotal += Number(s.amount || 0);
            }
          }
        });

        txs.forEach((t) => {
          if (t.transaction_date && t.type === 'withdrawal') {
            const td = new Date(t.transaction_date);
            if (td.getFullYear() === mYear && td.getMonth() === mMonth) {
              monthTotal += Number(t.amount || 0);
            }
          }
        });

        monthsList.push({
          month: mName,
          amount: monthTotal,
          height: 10, // normalized later
          formattedAmount: monthTotal >= 1000 ? `₹${(monthTotal / 1000).toFixed(1)}k` : `₹${monthTotal}`,
          isCurrent: i === 0,
        });
      }

      // Normalize bar heights (max height = 100)
      const maxAmt = Math.max(...monthsList.map((m) => m.amount), 1);
      monthsList.forEach((m) => {
        m.height = Math.max(12, Math.round((m.amount / maxAmt) * 96));
      });

      setMonthlyBars(monthsList);

      const curMonthName = now.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      setSelectedMonth(curMonthName);
    } catch (err) {
      console.error('Error fetching insights data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInsightsData();
  }, [fetchInsightsData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchInsightsData();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <InsightsSkeleton />
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
          <View>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>Real-Time Spending & Vault Intelligence</Text>
          </View>
          <HapticButton
            style={styles.calendarBtn}
            feedbackType="rigid"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
            }}
          >
            <Calendar size={18} color={CedarColors.ink900} />
          </HapticButton>
        </View>

        {/* 4 Segmented Control Pills */}
        <View style={styles.segmentedRow}>
          {(['spending', 'income', 'savings', 'goals'] as const).map((seg) => {
            const isActive = activeSegment === seg;
            return (
              <TouchableOpacity
                key={seg}
                style={[styles.segmentBtn, isActive && styles.activeSegmentBtn]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveSegment(seg);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, isActive && styles.activeSegmentText]}>
                  {seg.charAt(0).toUpperCase() + seg.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Spending Card with Vector Donut Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Vault & Card Spending</Text>
            <TouchableOpacity
              style={styles.chartMonthBtn}
              onPress={() => Haptics.selectionAsync()}
            >
              <Text style={styles.chartMonthText}>{selectedMonth}</Text>
            </TouchableOpacity>
          </View>

          <DonutChart totalAmount={totalSpent} slices={categorySlices} />
        </View>

        {/* Eye-Friendly Budget Health Banner (No emojis - Clean micro-icon) */}
        <TouchableOpacity
          style={styles.healthBanner}
          activeOpacity={0.85}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)}
        >
          <View style={styles.healthIconCircle}>
            <CheckCircle2 size={18} color="#2E944B" strokeWidth={2.4} />
          </View>
          <View style={styles.healthContent}>
            <Text style={styles.healthTitle}>Healthy Vault Utilization</Text>
            <Text style={styles.healthSub}>
              Card rotation and spends are well within optimal credit cycle.
            </Text>
          </View>
          <ChevronRight size={18} color="#2E944B" />
        </TouchableOpacity>

        {/* Dynamic 6-Month Spending Trend Bar Chart */}
        <View style={styles.trendCard}>
          <View style={styles.trendHeader}>
            <View>
              <Text style={styles.trendTitle}>Spending Trend (Last 6 Months)</Text>
              <Text style={styles.trendSub}>Live monthly aggregation from Supabase</Text>
            </View>
          </View>

          <View style={styles.barChartWrapper}>
            {/* Bars Column Area */}
            <View style={styles.barsArea}>
              {monthlyBars.map((item, index) => (
                <View key={index} style={styles.barCol}>
                  {/* Tooltip for Current Active Month */}
                  {item.isCurrent && (
                    <View style={styles.tooltipPill}>
                      <Text style={styles.tooltipText}>{item.formattedAmount}</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.barTrack,
                      { height: item.height },
                      item.isCurrent ? styles.currentBar : styles.regularBar,
                    ]}
                  />
                  <Text
                    style={[
                      styles.monthLabel,
                      item.isCurrent && styles.currentMonthLabel,
                    ]}
                  >
                    {item.month}
                  </Text>
                </View>
              ))}
            </View>

            {/* Right Y-Axis Scale */}
            <View style={styles.yAxisCol}>
              <Text style={styles.yAxisLabel}>Max</Text>
              <Text style={styles.yAxisLabel}>75%</Text>
              <Text style={styles.yAxisLabel}>50%</Text>
              <Text style={styles.yAxisLabel}>0</Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    color: CedarColors.ink900,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: CedarTypography.display,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  calendarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CedarColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  segmentedRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: CedarColors.cardAlt,
    borderWidth: 1,
    borderColor: CedarColors.border,
    alignItems: 'center',
  },
  activeSegmentBtn: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  segmentText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
  },
  activeSegmentText: {
    color: '#F6F9F5',
    fontWeight: '700',
  },
  chartCard: {
    marginHorizontal: 20,
    backgroundColor: CedarColors.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginBottom: 12,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  chartMonthBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: CedarColors.cardAlt,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  chartMonthText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
  },
  healthBanner: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(46, 148, 75, 0.08)',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(46, 148, 75, 0.2)',
    marginBottom: 14,
  },
  healthIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(46, 148, 75, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  healthContent: {
    flex: 1,
  },
  healthTitle: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#2E944B',
  },
  healthSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
    marginTop: 2,
  },
  trendCard: {
    marginHorizontal: 20,
    backgroundColor: CedarColors.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  trendHeader: {
    marginBottom: 14,
  },
  trendTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  trendSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  barChartWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 20,
  },
  barsArea: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: '100%',
    paddingRight: 12,
  },
  barCol: {
    alignItems: 'center',
    width: 34,
  },
  tooltipPill: {
    backgroundColor: CedarColors.forest800,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginBottom: 4,
  },
  tooltipText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F6F9F5',
    fontWeight: '700',
  },
  barTrack: {
    width: 22,
    borderRadius: 11,
    backgroundColor: CedarColors.cardAlt,
  },
  currentBar: {
    backgroundColor: CedarColors.forest800,
  },
  regularBar: {
    backgroundColor: CedarColors.borderDark,
  },
  monthLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 6,
  },
  currentMonthLabel: {
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  yAxisCol: {
    height: '100%',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderLeftWidth: 1,
    borderLeftColor: CedarColors.border,
    paddingLeft: 8,
  },
  yAxisLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
});
