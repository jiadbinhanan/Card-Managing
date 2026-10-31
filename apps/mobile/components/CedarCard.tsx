import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CedarColors } from '@credics/core';
import { HapticButton } from './HapticButton';
import { Snowflake, Sliders, Lock, Info, Wifi } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 36;

interface CedarCardProps {
  cardName: string;
  last4Digits: string;
  totalLimit: number;
  availableLimit: number;
  holderName?: string;
  validThru?: string;
  isPrimary?: boolean;
  onFreeze?: () => void;
  onLimits?: () => void;
  onPin?: () => void;
  onDetails?: () => void;
}

export function CedarCard({
  cardName,
  last4Digits,
  totalLimit,
  availableLimit,
  holderName = 'CREDICS USER',
  validThru = '08/29',
  isPrimary = true,
  onFreeze,
  onLimits,
  onPin,
  onDetails,
}: CedarCardProps) {
  const usedAmount = Math.max(0, totalLimit - availableLimit);
  const usagePercentage =
    totalLimit > 0 ? Math.min(100, Math.round((usedAmount / totalLimit) * 100)) : 0;

  return (
    <View style={styles.container}>
      {/* 3D Realistic Credit Card */}
      <LinearGradient
        colors={[CedarColors.forest900, CedarColors.forest800]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Subtle decorative glow */}
        <View style={styles.glow} />

        {/* Top Card Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.brandText}>{cardName.toUpperCase()}</Text>
          <View style={styles.headerRight}>
            <Wifi color="#A8C2B3" size={18} style={styles.wifiIcon} />
            <View style={styles.mastercardPill}>
              <View style={[styles.circle, { backgroundColor: '#EB001B' }]} />
              <View
                style={[styles.circle, { backgroundColor: '#F79E1B', marginLeft: -8 }]}
              />
            </View>
          </View>
        </View>

        {/* Realistic EMV Chip */}
        <View style={styles.chipContainer}>
          <View style={styles.chip}>
            <View style={styles.chipLineHorizontal} />
            <View style={styles.chipLineVertical} />
          </View>
        </View>

        {/* Masked Card Number */}
        <Text style={styles.cardNumber}>••••  ••••  ••••  {last4Digits}</Text>

        {/* Card Holder & Expiry */}
        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.footerLabel}>CARD HOLDER</Text>
            <Text style={styles.footerValue}>{holderName.toUpperCase()}</Text>
          </View>
          <View style={styles.expiryContainer}>
            <Text style={styles.footerLabel}>VALID THRU</Text>
            <Text style={styles.footerValue}>{validThru}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Card Quick Actions: Freeze, Limits, PIN, Details */}
      <View style={styles.actionsRow}>
        <HapticButton style={styles.actionBtn} onPress={onFreeze} feedbackType="rigid">
          <Snowflake size={18} color={CedarColors.forest800} />
          <Text style={styles.actionLabel}>Freeze</Text>
        </HapticButton>

        <HapticButton style={styles.actionBtn} onPress={onLimits} feedbackType="rigid">
          <Sliders size={18} color={CedarColors.forest800} />
          <Text style={styles.actionLabel}>Limits</Text>
        </HapticButton>

        <HapticButton style={styles.actionBtn} onPress={onPin} feedbackType="rigid">
          <Lock size={18} color={CedarColors.forest800} />
          <Text style={styles.actionLabel}>PIN</Text>
        </HapticButton>

        <HapticButton style={styles.actionBtn} onPress={onDetails} feedbackType="rigid">
          <Info size={18} color={CedarColors.forest800} />
          <Text style={styles.actionLabel}>Details</Text>
        </HapticButton>
      </View>

      {/* Limit Usage Progress Card */}
      <View style={styles.limitCard}>
        <View style={styles.limitHeader}>
          <Text style={styles.limitTitle}>THIS MONTH ON THIS CARD</Text>
          <Text style={styles.limitLast4}>•••• {last4Digits}</Text>
        </View>

        <View style={styles.limitAmountRow}>
          <Text style={styles.usedAmountText}>
            ₹{usedAmount.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.totalLimitText}>
            {' '}of ₹{totalLimit.toLocaleString('en-IN')} limit
          </Text>
        </View>

        {/* Progress Track */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${usagePercentage}%` }]} />
        </View>

        <View style={styles.progressFooter}>
          <View style={styles.bulletRow}>
            <View style={styles.mintBullet} />
            <Text style={styles.progressFooterText}>
              {usagePercentage}% utilized
            </Text>
          </View>
          <Text style={styles.resetText}>resets on bill cycle</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    alignSelf: 'center',
    marginVertical: 10,
  },
  card: {
    height: 215,
    borderRadius: 24,
    padding: 22,
    justifyContent: 'space-between',
    elevation: 8,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#34A853',
    opacity: 0.15,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wifiIcon: {
    transform: [{ rotate: '90deg' }],
  },
  mastercardPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    opacity: 0.9,
  },
  chipContainer: {
    marginVertical: 6,
  },
  chip: {
    width: 44,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#C5A059',
    borderWidth: 1,
    borderColor: '#9E7D3B',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  chipLineHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  chipLineVertical: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  cardNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2.5,
    marginVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerLabel: {
    color: '#A8C2B3',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  footerValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  expiryContainer: {
    alignItems: 'flex-end',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 14,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: CedarColors.card, // Pure White
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  actionLabel: {
    color: CedarColors.ink900,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  limitCard: {
    backgroundColor: CedarColors.card, // Pure White
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  limitTitle: {
    color: CedarColors.ink700,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  limitLast4: {
    color: CedarColors.ink700,
    fontSize: 11,
    fontWeight: '600',
  },
  limitAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  usedAmountText: {
    color: CedarColors.ink900,
    fontSize: 22,
    fontWeight: '800',
  },
  totalLimitText: {
    color: CedarColors.ink700,
    fontSize: 14,
    fontWeight: '500',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5ECE5',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: CedarColors.mint500, // #34A853
    borderRadius: 4,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mintBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CedarColors.mint500,
    marginRight: 6,
  },
  progressFooterText: {
    color: CedarColors.ink900,
    fontSize: 11,
    fontWeight: '600',
  },
  resetText: {
    color: CedarColors.ink700,
    fontSize: 11,
    fontWeight: '500',
  },
});
