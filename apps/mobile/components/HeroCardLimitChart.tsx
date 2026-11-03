import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { CedarTypography } from '@credics/core';
import { CreditCard, Layers } from 'lucide-react-native';

export interface CardLimitStat {
  id: string;
  name: string;
  last4: string;
  hasSubCards?: boolean;
  subCardsCount?: number;
  subCardsLast4?: string[];
  totalLimit: number;
  usedLimit: number;
  availableLimit: number;
  utilizationRatio: number;
}

interface HeroCardLimitChartProps {
  isAllCards: boolean;
  cards: CardLimitStat[];
  singleCard?: CardLimitStat | null;
}

/**
 * HeroCardLimitChart
 * Renders the Card Family Credit Limits & Utilization:
 * - If All Cards selected: Full-width Column/Bar Chart (স্তম্ভ চার্ট) showing each Card Family's debit limit vs total limit.
 * - If Single Card selected: Circular Ring Chart (সার্কেল চার্ট) showing the selected Card Family's debit limit vs total limit.
 */
export function HeroCardLimitChart({
  isAllCards,
  cards,
  singleCard,
}: HeroCardLimitChartProps) {
  if (isAllCards) {
    // Multi-Card Family Column / Bar Chart (স্তম্ভ চার্ট)
    const displayCards = cards.slice(0, 5); // Up to 5 card families in wide viewport
    const totalLimitSum = cards.reduce((sum, c) => sum + c.totalLimit, 0);
    const totalUsedSum = cards.reduce((sum, c) => sum + c.usedLimit, 0);
    const overallRatio = totalLimitSum > 0 ? totalUsedSum / totalLimitSum : 0;
    const maxLimitVal = Math.max(...cards.map((c) => c.totalLimit), 1);

    return (
      <Animated.View
        entering={FadeInDown.duration(320)}
        style={styles.cardContainer}
      >
        {/* Header Row */}
        <View style={styles.chartHeaderRow}>
          <View style={styles.chartHeaderLeft}>
            <Layers size={13} color="#34D399" />
            <Text style={styles.chartHeaderTitle}>
              Card Families Credit Utilization
            </Text>
          </View>
          <View style={styles.chartHeaderRight}>
            <Text style={styles.totalUsageRatio}>
              ₹{Math.round(totalUsedSum / 1000)}k{' '}
              <Text style={styles.totalLimitMuted}>
                / ₹{Math.round(totalLimitSum / 1000)}k ({Math.round(overallRatio * 100)}%)
              </Text>
            </Text>
          </View>
        </View>

        {/* Columns Grid */}
        <View style={styles.columnsContainer}>
          {displayCards.map((card, idx) => {
            const heightRatio = Math.max(0.35, card.totalLimit / maxLimitVal);
            const barMaxHeight = 44 * heightRatio;
            const usedHeight = Math.max(3, barMaxHeight * card.utilizationRatio);

            // Color coding based on utilization
            let barColor = '#34D399'; // Mint green (< 50%)
            if (card.utilizationRatio > 0.8) {
              barColor = '#F87171'; // Red (> 80%)
            } else if (card.utilizationRatio > 0.5) {
              barColor = '#FBBF24'; // Amber (50% - 80%)
            }

            return (
              <View key={card.id || idx} style={styles.columnItem}>
                <Text style={styles.colUsageText}>
                  {card.usedLimit > 0 ? `₹${Math.round(card.usedLimit / 1000)}k` : '₹0'}
                </Text>

                {/* Vertical Bar Track (Shared Family Limit) */}
                <View style={[styles.columnTrack, { height: barMaxHeight }]}>
                  {/* Filled Inner Bar (Debit / Utilized) */}
                  <View
                    style={[
                      styles.columnFill,
                      {
                        height: usedHeight,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>

                {/* Card Family Identifiers */}
                <Text style={styles.colCardName} numberOfLines={1}>
                  {card.name.split(' ')[0]}
                </Text>
                <View style={styles.colSubCardRow}>
                  <Text style={styles.colCardLast4}>••{card.last4 ? card.last4.slice(-2) : '00'}</Text>
                  {card.hasSubCards && (
                    <View style={styles.subCardPill}>
                      <Text style={styles.subCardPillText}>+{card.subCardsCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Animated.View>
    );
  }

  // Single Card Family Circular Ring Chart (সার্কেল চার্ট)
  const card = singleCard || cards[0] || {
    id: 'default',
    name: 'Card Family',
    last4: '0000',
    totalLimit: 100000,
    usedLimit: 0,
    availableLimit: 100000,
    utilizationRatio: 0,
  };

  const size = 56;
  const strokeWidth = 4.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedRatio = Math.min(1, Math.max(0, card.utilizationRatio));
  const strokeDashoffset = circumference - circumference * clampedRatio;

  let ringColor = '#34D399';
  if (clampedRatio > 0.8) ringColor = '#F87171';
  else if (clampedRatio > 0.5) ringColor = '#FBBF24';

  const percentText = Math.round(clampedRatio * 100);

  return (
    <Animated.View
      entering={FadeIn.duration(320)}
      style={styles.cardContainer}
    >
      <View style={styles.singleCardRow}>
        {/* Circular Ring SVG */}
        <View style={styles.ringWrapper}>
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="rgba(255, 255, 255, 0.16)"
                strokeWidth={strokeWidth}
                fill="none"
              />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={ringColor}
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </G>
          </Svg>
          <View style={styles.ringCenterTextContainer}>
            <Text style={styles.ringCenterPercent}>{percentText}%</Text>
          </View>
        </View>

        {/* Detailed Family Metrics */}
        <View style={styles.singleCardMetaCol}>
          <View style={styles.singleCardTitleRow}>
            <CreditCard size={14} color="#34D399" />
            <Text style={styles.singleCardTitle} numberOfLines={1}>
              {card.name} (••{card.last4})
            </Text>
            {card.hasSubCards && (
              <View style={styles.subCardPill}>
                <Text style={styles.subCardPillText}>+{card.subCardsCount} Add-on</Text>
              </View>
            )}
          </View>

          <View style={styles.singleCardStatsGrid}>
            <View>
              <Text style={styles.singleStatLabel}>DEBIT USED</Text>
              <Text style={[styles.singleStatValue, { color: ringColor }]}>
                ₹{Math.round(card.usedLimit).toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.singleStatDivider} />
            <View>
              <Text style={styles.singleStatLabel}>AVAILABLE</Text>
              <Text style={styles.singleStatValue}>
                ₹{Math.round(card.availableLimit).toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.singleStatDivider} />
            <View>
              <Text style={styles.singleStatLabel}>SHARED LIMIT</Text>
              <Text style={styles.singleStatValue}>
                ₹{Math.round(card.totalLimit).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  chartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chartHeaderTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#F6F9F5',
    letterSpacing: 0.2,
  },
  chartHeaderRight: {
    alignItems: 'flex-end',
  },
  totalUsageRatio: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#34D399',
  },
  totalLimitMuted: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  columnsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 78,
    paddingTop: 4,
  },
  columnItem: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    maxWidth: 58,
  },
  colUsageText: {
    fontSize: 8,
    fontFamily: CedarTypography.body,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '600',
    marginBottom: 3,
  },
  columnTrack: {
    width: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  columnFill: {
    width: '100%',
    borderRadius: 6,
  },
  colCardName: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: 4,
  },
  colSubCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  colCardLast4: {
    fontSize: 8,
    fontFamily: CedarTypography.body,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '600',
  },
  subCardPill: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
  },
  subCardPillText: {
    fontSize: 7,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#34D399',
  },
  singleCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ringWrapper: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCenterTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCenterPercent: {
    fontSize: 12,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  singleCardMetaCol: {
    flex: 1,
  },
  singleCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  singleCardTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: 160,
  },
  singleCardStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  singleStatLabel: {
    fontSize: 7,
    fontFamily: CedarTypography.body,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  singleStatValue: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '800',
    marginTop: 1,
  },
  singleStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
