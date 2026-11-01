import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Rect, G } from 'react-native-svg';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { CedarColors, CedarTypography } from '@credics/core';

export interface CardLimitStat {
  id: string;
  name: string;
  last4: string;
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
 * Renders in the top-right of the Total Available Limit hero section:
 * - If All Cards selected: Multi-card Column/Bar Chart (স্তম্ভ চার্ট) showing each card's debit/used limit vs total limit.
 * - If Single Card selected: Circular Ring/Donut Chart (সার্কেল চার্ট) showing that specific card's debit/used limit vs total limit.
 */
export function HeroCardLimitChart({
  isAllCards,
  cards,
  singleCard,
}: HeroCardLimitChartProps) {
  if (isAllCards) {
    // Multi-Card Column / Bar Chart (স্তম্ভ চার্ট)
    const displayCards = cards.slice(0, 5); // Show up to 5 cards in micro column layout
    const totalLimitSum = cards.reduce((sum, c) => sum + c.totalLimit, 0);
    const totalUsedSum = cards.reduce((sum, c) => sum + c.usedLimit, 0);
    const maxLimitVal = Math.max(...cards.map((c) => c.totalLimit), 1);

    return (
      <Animated.View
        entering={FadeInRight.duration(280)}
        style={styles.pillContainer}
      >
        <View style={styles.chartColGroup}>
          <View style={styles.barGroup}>
            {displayCards.map((card, idx) => {
              const heightRatio = Math.max(0.2, card.totalLimit / maxLimitVal);
              const barMaxHeight = 28 * heightRatio;
              const usedHeight = Math.max(2, barMaxHeight * card.utilizationRatio);
              
              // Color coding based on utilization
              let barColor = '#34D399'; // Mint green
              if (card.utilizationRatio > 0.8) {
                barColor = '#F87171'; // Red / High warning
              } else if (card.utilizationRatio > 0.5) {
                barColor = '#FBBF24'; // Amber / Medium
              }

              return (
                <View key={card.id || idx} style={styles.barColumn}>
                  {/* Background Track (Total Limit) */}
                  <View style={[styles.barTrack, { height: barMaxHeight }]}>
                    {/* Inner Fill (Used / Debit Limit) */}
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: usedHeight,
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barMiniLabel} numberOfLines={1}>
                    ••{card.last4 ? card.last4.slice(-2) : '00'}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.metaCol}>
            <View style={styles.badgeRow}>
              <View style={styles.pulseDot} />
              <Text style={styles.badgeTitle}>{cards.length} Cards</Text>
            </View>
            <Text style={styles.badgeSub}>
              ₹{Math.round(totalUsedSum / 1000)}k / ₹{Math.round(totalLimitSum / 1000)}k
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  // Single Card Circular Ring Chart (সার্কেল চার্ট)
  const card = singleCard || cards[0] || {
    name: 'Card',
    last4: '0000',
    totalLimit: 100000,
    usedLimit: 0,
    availableLimit: 100000,
    utilizationRatio: 0,
  };

  const size = 38;
  const strokeWidth = 3.5;
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
      entering={FadeIn.duration(280)}
      style={styles.pillContainer}
    >
      <View style={styles.ringRow}>
        <View style={styles.ringWrapper}>
          <Svg width={size} height={size}>
            <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
              {/* Background Track */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="rgba(255, 255, 255, 0.16)"
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Active Debit Progress */}
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
          <View style={styles.ringCenterText}>
            <Text style={styles.percentText}>{percentText}%</Text>
          </View>
        </View>

        <View style={styles.metaCol}>
          <Text style={styles.singleCardName} numberOfLines={1}>
            {card.name} (••{card.last4})
          </Text>
          <Text style={styles.singleCardUsage}>
            ₹{Math.round(card.usedLimit).toLocaleString('en-IN')} used
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pillContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartColGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 32,
    gap: 4,
    paddingBottom: 2,
  },
  barColumn: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 3,
  },
  barMiniLabel: {
    fontSize: 7,
    fontFamily: CedarTypography.body,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
    fontWeight: '600',
  },
  metaCol: {
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#34D399',
  },
  badgeTitle: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  badgeSub: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 1,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ringWrapper: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCenterText: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  singleCardName: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: 95,
  },
  singleCardUsage: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 1,
  },
});
