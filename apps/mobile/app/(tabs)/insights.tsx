import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors, CedarTypography } from '@credics/core';
import { DonutChart, CategorySlice } from '../../components/DonutChart';
import { InsightsSkeleton } from '../../components/Skeleton';
import {
  Layers,
  ChevronDown,
  X,
  Check,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  parent_card_id?: string;
}

interface TrendBarData {
  label: string;
  height: number;
  amount: number;
  formattedAmount: string;
  isCurrent: boolean;
}

const LUXURY_PALETTE = [
  CedarColors.forest800,
  '#2E944B',
  '#71A387',
  '#D97706',
  '#9BB8A7',
  '#10B981',
  '#DCEEE2',
];

export default function InsightsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSegment, setActiveSegment] = useState<'spending' | 'income' | 'savings' | 'goals'>('spending');

  // Card Family Filtering
  const [cards, setCards] = useState<CardData[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('all');
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

  // Trend Mode Toggle: Weekly vs Monthly
  const [trendMode, setTrendMode] = useState<'monthly' | 'weekly'>('monthly');

  // Aggregated Data State
  const [rawSpends, setRawSpends] = useState<any[]>([]);
  const [rawTxs, setRawTxs] = useState<any[]>([]);
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [categorySlices, setCategorySlices] = useState<CategorySlice[]>([]);
  const [trendBars, setTrendBars] = useState<TrendBarData[]>([]);
  const [selectedPeriodLabel, setSelectedPeriodLabel] = useState('Current Period');

  // Fetch Base Spends, Transactions, and Cards
  const fetchInsightsData = useCallback(async () => {
    try {
      const [cardsRes, spendsRes, txsRes] = await Promise.all([
        supabase.from('cards').select('id, card_name, last_4_digits, total_limit, is_primary, parent_card_id').order('is_primary', { ascending: false }),
        supabase.from('spends').select('id, amount, spend_type, spend_date, card_id'),
        supabase.from('card_transactions').select('id, amount, type, transaction_date, card_id'),
      ]);

      const fetchedCards = (cardsRes.data || []) as CardData[];
      const fetchedSpends = spendsRes.data || [];
      const fetchedTxs = txsRes.data || [];

      setCards(fetchedCards);
      setRawSpends(fetchedSpends);
      setRawTxs(fetchedTxs);
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

  // Re-compute Analytics whenever selectedCardId, trendMode, rawSpends, or rawTxs change
  useEffect(() => {
    // 1. Resolve Card Family IDs
    let filteredSpends = rawSpends;
    let filteredTxs = rawTxs;

    if (selectedCardId !== 'all') {
      const selected = cards.find((c) => c.id === selectedCardId);
      const primaryId = selected?.is_primary ? selected.id : (selected?.parent_card_id || selectedCardId);
      const familyIds = cards
        .filter((c) => c.id === primaryId || c.parent_card_id === primaryId)
        .map((c) => c.id);

      filteredSpends = rawSpends.filter(
        (s) => s.card_id && (s.card_id === selectedCardId || familyIds.includes(s.card_id))
      );
      filteredTxs = rawTxs.filter(
        (t) => t.card_id && (t.card_id === selectedCardId || familyIds.includes(t.card_id))
      );
    }

    // 2. Category Breakdown
    const catMap: Record<string, number> = {};
    let total = 0;

    filteredSpends.forEach((s) => {
      const amt = Number(s.amount || 0);
      total += amt;
      const cat = s.spend_type || 'Personal';
      catMap[cat] = (catMap[cat] || 0) + amt;
    });

    const rotationWithdrawals = filteredTxs.filter((t) => t.type === 'withdrawal');
    const totalRotations = rotationWithdrawals.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    if (totalRotations > 0) {
      catMap['Rotations'] = (catMap['Rotations'] || 0) + totalRotations;
      total += totalRotations;
    }

    setTotalSpent(total);

    const slices: CategorySlice[] = Object.keys(catMap).map((k, idx) => ({
      label: k,
      amount: catMap[k],
      percentage: total > 0 ? Math.round((catMap[k] / total) * 100) : 0,
      color: LUXURY_PALETTE[idx % LUXURY_PALETTE.length],
    }));

    slices.sort((a, b) => b.amount - a.amount);

    setCategorySlices(
      slices.length > 0
        ? slices
        : [{ label: 'Personal', amount: 0, percentage: 100, color: CedarColors.forest800 }]
    );

    // 3. Spending Trend Bars (Weekly vs Monthly)
    const now = new Date();
    const bars: TrendBarData[] = [];

    if (trendMode === 'monthly') {
      // Last 6 Months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mName = d.toLocaleString('en-US', { month: 'short' });
        const mYear = d.getFullYear();
        const mMonth = d.getMonth();

        let monthTotal = 0;

        filteredSpends.forEach((s) => {
          if (s.spend_date) {
            const sd = new Date(s.spend_date);
            if (sd.getFullYear() === mYear && sd.getMonth() === mMonth) {
              monthTotal += Number(s.amount || 0);
            }
          }
        });

        filteredTxs.forEach((t) => {
          if (t.transaction_date && t.type === 'withdrawal') {
            const td = new Date(t.transaction_date);
            if (td.getFullYear() === mYear && td.getMonth() === mMonth) {
              monthTotal += Number(t.amount || 0);
            }
          }
        });

        bars.push({
          label: mName,
          amount: monthTotal,
          height: 12,
          formattedAmount:
            monthTotal >= 1000 ? `₹${(monthTotal / 1000).toFixed(1)}k` : `₹${monthTotal}`,
          isCurrent: i === 0,
        });
      }

      setSelectedPeriodLabel(now.toLocaleString('en-US', { month: 'short', year: 'numeric' }));
    } else {
      // Last 6 Weeks
      for (let i = 5; i >= 0; i--) {
        const endDay = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const startDay = new Date(endDay.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekLabel = i === 0 ? 'This Wk' : `W-${i}`;

        let weekTotal = 0;

        filteredSpends.forEach((s) => {
          if (s.spend_date) {
            const sd = new Date(s.spend_date).getTime();
            if (sd >= startDay.getTime() && sd <= endDay.getTime()) {
              weekTotal += Number(s.amount || 0);
            }
          }
        });

        filteredTxs.forEach((t) => {
          if (t.transaction_date && t.type === 'withdrawal') {
            const td = new Date(t.transaction_date).getTime();
            if (td >= startDay.getTime() && td <= endDay.getTime()) {
              weekTotal += Number(t.amount || 0);
            }
          }
        });

        bars.push({
          label: weekLabel,
          amount: weekTotal,
          height: 12,
          formattedAmount:
            weekTotal >= 1000 ? `₹${(weekTotal / 1000).toFixed(1)}k` : `₹${weekTotal}`,
          isCurrent: i === 0,
        });
      }

      setSelectedPeriodLabel('Last 6 Weeks');
    }

    // Normalize bar heights (max height = 96)
    const maxAmt = Math.max(...bars.map((b) => b.amount), 1);
    bars.forEach((b) => {
      b.height = Math.max(12, Math.round((b.amount / maxAmt) * 96));
    });

    setTrendBars(bars);
  }, [selectedCardId, trendMode, rawSpends, rawTxs, cards]);

  const activeCardObj = useMemo(() => {
    if (selectedCardId === 'all') return null;
    return cards.find((c) => c.id === selectedCardId) || null;
  }, [selectedCardId, cards]);

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
        {/* ================= 1. TOP HEADER WITH CARD FAMILY FILTER ================= */}
        <View style={styles.header}>
          <View style={styles.headerLeftCol}>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>Real-Time Spending & Vault Intelligence</Text>
          </View>

          {/* Card Family Selector Pill */}
          <TouchableOpacity
            style={styles.cardFilterPill}
            onPress={() => setIsCardModalOpen(true)}
            activeOpacity={0.8}
          >
            <Layers size={13} color={CedarColors.forest800} />
            <Text style={styles.cardFilterPillText} numberOfLines={1}>
              {selectedCardId === 'all'
                ? 'All Cards'
                : activeCardObj
                ? `${activeCardObj.card_name} (**${activeCardObj.last_4_digits})`
                : 'Card'}
            </Text>
            <ChevronDown size={12} color={CedarColors.forest800} />
          </TouchableOpacity>
        </View>

        {/* ================= 2. 4-SEGMENTED DOMAIN CONTROL PILLS ================= */}
        <View style={styles.segmentedRow}>
          {(['spending', 'income', 'savings', 'goals'] as const).map((seg) => {
            const isActive = activeSegment === seg;
            return (
              <TouchableOpacity
                key={seg}
                style={[styles.segmentBtn, isActive && styles.activeSegmentBtn]}
                onPress={() => setActiveSegment(seg)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, isActive && styles.activeSegmentText]}>
                  {seg.charAt(0).toUpperCase() + seg.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ================= 3. DONUT CHART WITH CATEGORY DRILL-DOWN ================= */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Vault & Card Spending</Text>
              <Text style={styles.chartSub}>
                {selectedCardId === 'all'
                  ? 'All vault cards combined'
                  : `${activeCardObj?.card_name || 'Card'} Family`}
              </Text>
            </View>
            <View style={styles.chartPeriodBadge}>
              <Text style={styles.chartPeriodText}>{selectedPeriodLabel}</Text>
            </View>
          </View>

          {/* Vector Donut Chart */}
          <DonutChart totalAmount={totalSpent} slices={categorySlices} />

          {/* Category Drill-Down Detailed List */}
          <View style={styles.categoryList}>
            <View style={styles.categoryListHeader}>
              <Text style={styles.categoryListTitle}>Category Breakdown</Text>
              <Text style={styles.categoryListSub}>Total {categorySlices.length} categories</Text>
            </View>

            {categorySlices.map((slice, idx) => (
              <View key={idx} style={styles.categoryRow}>
                <View style={styles.categoryLeft}>
                  <View style={[styles.categoryColorDot, { backgroundColor: slice.color }]} />
                  <Text style={styles.categoryName}>{slice.label}</Text>
                </View>
                <View style={styles.categoryRight}>
                  <Text style={styles.categoryAmount}>
                    ₹{slice.amount.toLocaleString('en-IN')}
                  </Text>
                  <View style={styles.categoryPctBadge}>
                    <Text style={styles.categoryPctText}>{slice.percentage}%</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ================= 4. EYE-FRIENDLY BUDGET HEALTH BANNER ================= */}
        <View style={styles.healthBanner}>
          <View style={styles.healthIconCircle}>
            <CheckCircle2 size={18} color="#2E944B" strokeWidth={2.4} />
          </View>
          <View style={styles.healthContent}>
            <Text style={styles.healthTitle}>Healthy Vault Utilization</Text>
            <Text style={styles.healthSub}>
              Card rotation and spends are well within optimal credit cycle limit.
            </Text>
          </View>
        </View>

        {/* ================= 5. SPENDING TREND (WEEKLY VS MONTHLY TOGGLE) ================= */}
        <View style={styles.trendCard}>
          <View style={styles.trendHeader}>
            <View style={styles.trendTitleCol}>
              <Text style={styles.trendTitle}>
                Spending Trend ({trendMode === 'monthly' ? 'Last 6 Months' : 'Last 6 Weeks'})
              </Text>
              <Text style={styles.trendSub}>
                Live {trendMode} aggregation from Supabase
              </Text>
            </View>

            {/* Weekly vs Monthly Toggle Switch */}
            <View style={styles.trendToggleContainer}>
              <TouchableOpacity
                style={[styles.trendToggleBtn, trendMode === 'weekly' && styles.trendToggleActive]}
                onPress={() => setTrendMode('weekly')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.trendToggleText,
                    trendMode === 'weekly' && styles.trendToggleTextActive,
                  ]}
                >
                  Weekly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.trendToggleBtn, trendMode === 'monthly' && styles.trendToggleActive]}
                onPress={() => setTrendMode('monthly')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.trendToggleText,
                    trendMode === 'monthly' && styles.trendToggleTextActive,
                  ]}
                >
                  Monthly
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bar Chart Area */}
          <View style={styles.barChartWrapper}>
            <View style={styles.barsArea}>
              {trendBars.map((item, index) => (
                <View key={index} style={styles.barCol}>
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
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.yAxisCol}>
              <Text style={styles.yAxisLabel}>Max</Text>
              <Text style={styles.yAxisLabel}>75%</Text>
              <Text style={styles.yAxisLabel}>50%</Text>
              <Text style={styles.yAxisLabel}>0</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ================= 6. CARD FAMILY FILTER MODAL ================= */}
      <Modal visible={isCardModalOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsCardModalOpen(false)}
        >
          <View style={styles.filterMenuBox}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Select Vault Card</Text>
              <TouchableOpacity onPress={() => setIsCardModalOpen(false)}>
                <X size={16} color="#4A6B56" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.menuOption,
                  selectedCardId === 'all' && styles.menuOptionActive,
                ]}
                onPress={() => {
                  setSelectedCardId('all');
                  setIsCardModalOpen(false);
                }}
              >
                <View style={styles.menuOptionLeft}>
                  <CreditCard
                    size={14}
                    color={selectedCardId === 'all' ? CedarColors.forest800 : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.menuOptionText,
                      selectedCardId === 'all' && styles.menuOptionTextActive,
                    ]}
                  >
                    All Vault Cards
                  </Text>
                </View>
                {selectedCardId === 'all' && <Check size={14} color={CedarColors.forest800} />}
              </TouchableOpacity>

              {cards.map((c) => {
                const isSelected = selectedCardId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.menuOption, isSelected && styles.menuOptionActive]}
                    onPress={() => {
                      setSelectedCardId(c.id);
                      setIsCardModalOpen(false);
                    }}
                  >
                    <View style={styles.menuOptionLeft}>
                      <CreditCard
                        size={14}
                        color={isSelected ? CedarColors.forest800 : '#6B7280'}
                      />
                      <View>
                        <Text
                          style={[
                            styles.menuOptionText,
                            isSelected && styles.menuOptionTextActive,
                          ]}
                        >
                          {c.card_name}
                        </Text>
                        <Text style={styles.menuOptionSub}>
                          **{c.last_4_digits} {c.is_primary ? '• Primary' : '• Add-on'}
                        </Text>
                      </View>
                    </View>
                    {isSelected && <Check size={14} color={CedarColors.forest800} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
    gap: 12,
  },
  headerLeftCol: {
    flex: 1,
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
  cardFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    maxWidth: 160,
  },
  cardFilterPillText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.ink900,
  },
  chartSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  chartPeriodBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: CedarColors.cardAlt,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  chartPeriodText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '700',
  },
  categoryList: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: CedarColors.border,
  },
  categoryListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryListTitle: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  categoryListSub: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryName: {
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink900,
    fontWeight: '600',
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryAmount: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
  },
  categoryPctBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: CedarColors.cardAlt,
  },
  categoryPctText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.forest800,
    fontWeight: '800',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  trendTitleCol: {
    flex: 1,
  },
  trendTitle: {
    fontSize: 14,
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
  trendToggleContainer: {
    flexDirection: 'row',
    backgroundColor: CedarColors.cardAlt,
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  trendToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  trendToggleActive: {
    backgroundColor: CedarColors.forest800,
  },
  trendToggleText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink700,
    fontWeight: '700',
  },
  trendToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
    width: 38,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  filterMenuBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DFE8E0',
  },
  filterMenuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
  },
  menuOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  menuOptionActive: {
    backgroundColor: '#E4ECE3',
  },
  menuOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  menuOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  menuOptionTextActive: {
    color: '#0B3F28',
    fontWeight: '800',
  },
  menuOptionSub: {
    fontSize: 10,
    color: '#4A6B56',
    marginTop: 1,
  },
});
