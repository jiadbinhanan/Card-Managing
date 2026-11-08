import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { CedarTypography } from '@credics/core';
import { CreditCard, Layers } from 'lucide-react-native';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  onSelectCard?: (cardId: string) => void;
}

interface ColorTier {
  id: string;
  startColor: string;
  endColor: string;
  glowColor: string;
  accent: string;
}

/**
 * Calculates dynamic color tier & glowing aura based on Available Limit percentage:
 * - < 20%: Crimson Red (critical warning)
 * - 20% - 50%: Amber Gold (moderate warning)
 * - 50% - 75%: Electric Sky Blue (healthy contrast on green canvas)
 * - >= 75%: Radiant Emerald Mint (optimal / full balance)
 */
function getAvailableColorTier(availRatio: number): ColorTier {
  const percent = availRatio * 100;
  if (percent < 20) {
    return {
      id: 'critical-red',
      startColor: '#EF4444',
      endColor: '#DC2626',
      glowColor: 'rgba(239, 68, 68, 0.7)',
      accent: '#F87171',
    };
  }
  if (percent < 50) {
    return {
      id: 'warning-amber',
      startColor: '#F59E0B',
      endColor: '#D97706',
      glowColor: 'rgba(245, 158, 11, 0.7)',
      accent: '#FBBF24',
    };
  }
  if (percent < 75) {
    return {
      id: 'healthy-blue',
      startColor: '#0EA5E9',
      endColor: '#0284C7',
      glowColor: 'rgba(14, 165, 233, 0.7)',
      accent: '#38BDF8',
    };
  }
  return {
    id: 'optimal-emerald',
    startColor: '#10B981',
    endColor: '#059669',
    glowColor: 'rgba(16, 185, 129, 0.75)',
    accent: '#34D399',
  };
}

/**
 * HeroCardLimitChart
 * Renders directly on top of the deep green dashboard canvas without nested card borders:
 * - LEFT: Dynamic Glowing Radial SVG Gauge with tier colors + Center Total Limit in "k" + Highlighted Glowing Available Now
 * - MIDDLE: Subtle glowing vertical divider
 * - RIGHT:
 *   - Single Card: Spacious, prominent card view (Card Name, Total Limit, Debit Used, Available)
 *   - All Cards: Up to 3 compact stacked micro-cards with individual used/total and available balances
 */
export function HeroCardLimitChart({
  isAllCards,
  cards,
  singleCard,
  onSelectCard,
}: HeroCardLimitChartProps) {
  // 1. Calculate limits based on selection mode
  const totalLimitSum = cards.reduce((sum, c) => sum + c.totalLimit, 0);
  const availableLimitSum = cards.reduce((sum, c) => sum + c.availableLimit, 0);

  const activeCard = singleCard || cards[0] || {
    id: 'default',
    name: 'Card Family',
    last4: '0000',
    totalLimit: 100000,
    usedLimit: 0,
    availableLimit: 100000,
    utilizationRatio: 0,
  };

  const totalLimit = isAllCards ? totalLimitSum : activeCard.totalLimit;
  const availableLimit = isAllCards ? availableLimitSum : activeCard.availableLimit;

  // Available ratio for the left circular gauge fill
  const availRatio = totalLimit > 0 ? Math.min(1, Math.max(0, availableLimit / totalLimit)) : 0;
  const tier = getAvailableColorTier(availRatio);

  // 2. SVG Circular Gauge parameters
  const size = 96;
  const strokeWidth = 7.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Reanimated 120Hz UI-thread animation
  const progress = useSharedValue(availRatio);

  useEffect(() => {
    progress.value = withTiming(availRatio, {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [availRatio]);

  const animatedCircleProps = useAnimatedProps(() => {
    'worklet';
    const clamped = Math.min(1, Math.max(0, progress.value));
    const offset = circumference - circumference * clamped;
    return {
      strokeDashoffset: offset,
    };
  });

  // Center display: Total Limit in "k" shorthand (e.g. 180k, 380k)
  const totalLimitK = `${Math.round(totalLimit / 1000)}k`;
  const ringGradientId = `heroRadialGaugeGradient_${tier.id}`;

  return (
    <View style={styles.cardContainer}>
      <View style={styles.heroSplitRow}>
        {/* ================= LEFT COLUMN: SVG Radial Gauge (~48%) ================= */}
        <View style={styles.leftColumn}>
          <View style={[styles.gaugeWrapper, { shadowColor: tier.glowColor }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Defs>
                <LinearGradient id={ringGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={tier.startColor} />
                  <Stop offset="100%" stopColor={tier.endColor} />
                </LinearGradient>
              </Defs>
              <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
                {/* Background Ring */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="rgba(255, 255, 255, 0.12)"
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                {/* Ambient Outer Glow Ring */}
                <AnimatedCircle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={tier.accent}
                  strokeWidth={strokeWidth + 3}
                  strokeDasharray={`${circumference} ${circumference}`}
                  animatedProps={animatedCircleProps}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.35}
                />
                {/* Main Crisp Foreground Ring */}
                <AnimatedCircle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={`url(#${ringGradientId})`}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${circumference} ${circumference}`}
                  animatedProps={animatedCircleProps}
                  strokeLinecap="round"
                  fill="none"
                />
              </G>
            </Svg>

            {/* In the Center of the Ring: Total Limit in "k" */}
            <View style={styles.gaugeCenterTextContainer}>
              <Text style={styles.gaugeTotalLimitLabel}>TOTAL LIMIT</Text>
              <Text style={styles.gaugeTotalLimitValue}>₹{totalLimitK}</Text>
            </View>
          </View>

          {/* Directly Below the Circle: Available Now (Highlighted & Glowing) */}
          <View style={styles.availableBelowContainer}>
            <Text style={styles.availableBelowLabel}>AVAILABLE NOW</Text>
            <Text
              style={[
                styles.availableBelowValue,
                {
                  color: tier.accent,
                  textShadowColor: tier.glowColor,
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 10,
                },
              ]}
              numberOfLines={1}
            >
              ₹{Math.round(availableLimit).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* ================= GLOWING VERTICAL DIVIDER ================= */}
        <View style={styles.verticalDivider} />

        {/* ================= RIGHT COLUMN: Card Details (~48%) ================= */}
        <View style={styles.rightColumn}>
          {isAllCards ? (
            /* Multi-Card View: Up to 3 compact stacked micro-cards */
            <Animated.View
              key="multi-cards"
              entering={FadeInDown.duration(300)}
              style={styles.multiCardRightContainer}
            >
              <View style={styles.multiHeaderRow}>
                <Layers size={11} color={tier.accent} />
                <Text style={[styles.multiHeaderTitle, { color: tier.accent }]}>
                  All Cards ({cards.length})
                </Text>
              </View>

              <View style={styles.multiCardsStack}>
                {cards.slice(0, 3).map((card, idx) => {
                  const clampedRatio = Math.min(1, Math.max(0, card.utilizationRatio));
                  let barColor = '#34D399';
                  if (clampedRatio > 0.8) barColor = '#F87171';
                  else if (clampedRatio > 0.5) barColor = '#FBBF24';

                  return (
                    <TouchableOpacity
                      key={card.id || idx}
                      activeOpacity={0.7}
                      onPress={() => onSelectCard?.(card.id)}
                      style={styles.microCardRow}
                    >
                      <View style={styles.microCardTop}>
                        <Text style={styles.microCardName} numberOfLines={1}>
                          {card.name} ••{card.last4}
                        </Text>
                        <Text style={[styles.microCardAvail, { color: barColor }]}>
                          ₹{Math.round(card.availableLimit).toLocaleString('en-IN')}
                        </Text>
                      </View>

                      <View style={styles.microCardBottom}>
                        <Text style={styles.microCardUsedText}>
                          Used ₹{Math.round(card.usedLimit / 1000)}k / ₹{Math.round(card.totalLimit / 1000)}k
                        </Text>
                        <View style={styles.microProgressTrack}>
                          <View
                            style={[
                              styles.microProgressFill,
                              {
                                width: `${Math.round(clampedRatio * 100)}%`,
                                backgroundColor: barColor,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          ) : (
            /* Single Card View: Spacious, prominent details */
            <Animated.View
              key={activeCard.id}
              entering={FadeInDown.duration(300)}
              style={styles.singleCardRightContainer}
            >
              {/* Card Title & Last4 */}
              <View style={styles.singleCardHeader}>
                <CreditCard size={12} color={tier.accent} />
                <Text style={styles.singleCardName} numberOfLines={1}>
                  {activeCard.name} ••{activeCard.last4}
                </Text>
                {activeCard.hasSubCards && (
                  <View style={styles.subCardPill}>
                    <Text style={styles.subCardPillText}>+{activeCard.subCardsCount} Add-on</Text>
                  </View>
                )}
              </View>

              {/* Metric 1: Total Limit */}
              <View style={styles.singleMetricRow}>
                <Text style={styles.singleMetricLabel}>TOTAL LIMIT</Text>
                <Text style={styles.singleMetricValue}>
                  ₹{Math.round(activeCard.totalLimit).toLocaleString('en-IN')}
                </Text>
              </View>

              {/* Metric 2: Debit Used */}
              <View style={styles.singleMetricRow}>
                <Text style={styles.singleMetricLabel}>DEBIT USED</Text>
                <Text style={[styles.singleMetricValue, styles.usedValueColor]}>
                  ₹{Math.round(activeCard.usedLimit).toLocaleString('en-IN')}
                </Text>
              </View>

              {/* Metric 3: Available Balance (Highlighted with Dynamic Glow Border) */}
              <View
                style={[
                  styles.singleMetricRow,
                  styles.availableMetricRow,
                  { borderColor: tier.glowColor },
                ]}
              >
                <Text style={styles.singleMetricLabel}>AVAILABLE</Text>
                <Text style={[styles.singleMetricValue, { color: tier.accent }]}>
                  ₹{Math.round(activeCard.availableLimit).toLocaleString('en-IN')}
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
    paddingVertical: 4,
    marginTop: 2,
    marginBottom: 4,
  },
  heroSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeWrapper: {
    width: 96,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  gaugeCenterTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeTotalLimitLabel: {
    fontSize: 8,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#A7F3D0',
    letterSpacing: 0.8,
    fontWeight: '700',
    marginBottom: 1,
  },
  gaugeTotalLimitValue: {
    fontSize: 16,
    fontFamily: CedarTypography.display,
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  availableBelowContainer: {
    alignItems: 'center',
    marginTop: 6,
  },
  availableBelowLabel: {
    fontSize: 8.5,
    fontFamily: CedarTypography.bodySemiBold,
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 1,
    fontWeight: '800',
    marginBottom: 2,
  },
  availableBelowValue: {
    fontSize: 20,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  verticalDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginHorizontal: 10,
  },
  rightColumn: {
    flex: 1.15,
    justifyContent: 'center',
  },
  // Single Card Right Side Styles
  singleCardRightContainer: {
    gap: 6,
  },
  singleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  singleCardName: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  subCardPill: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  subCardPillText: {
    fontSize: 8,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#34D399',
  },
  singleMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  availableMetricRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  singleMetricLabel: {
    fontSize: 8,
    fontFamily: CedarTypography.body,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.4,
  },
  singleMetricValue: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  usedValueColor: {
    color: '#FBBF24',
  },
  // Multi Card Right Side Styles
  multiCardRightContainer: {
    gap: 4,
  },
  multiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  multiHeaderTitle: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  multiCardsStack: {
    gap: 5,
  },
  microCardRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  microCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  microCardName: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    paddingRight: 4,
  },
  microCardAvail: {
    fontSize: 10,
    fontFamily: CedarTypography.bodyBold,
    fontWeight: '800',
  },
  microCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  microCardUsedText: {
    fontSize: 8,
    fontFamily: CedarTypography.body,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  microProgressTrack: {
    width: 36,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  microProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
