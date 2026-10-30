import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { HapticButton } from '../../components/HapticButton';
import { ArrowLeft, Share2, Check, Split, Receipt, Flag } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function TxDetailModal() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <HapticButton style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={CedarColors.bone} />
        </HapticButton>
        <Text style={styles.headerTitle}>Transaction</Text>
        <HapticButton style={styles.backBtn}>
          <Share2 size={18} color={CedarColors.bone} />
        </HapticButton>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Merchant Hero */}
        <View style={styles.heroSection}>
          <View style={styles.merchantLogo}>
            <Text style={styles.merchantInitial}>V</Text>
          </View>
          <Text style={styles.merchantName}>Verde Market</Text>
          <Text style={styles.categoryLabel}>• Groceries</Text>
          <Text style={styles.amountText}>-₹64.20</Text>

          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Completed • Jun 28, 2026 • 3:42 PM</Text>
          </View>
        </View>

        {/* 3-Step Progress Tracker */}
        <View style={styles.trackerContainer}>
          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.completedStep]}>
              <Check size={14} color={CedarColors.pine900} />
            </View>
            <Text style={styles.stepTitle}>Authorized</Text>
            <Text style={styles.stepTime}>3:42:01</Text>
          </View>

          <View style={styles.stepLine} />

          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.completedStep]}>
              <Check size={14} color={CedarColors.pine900} />
            </View>
            <Text style={styles.stepTitle}>Processing</Text>
            <Text style={styles.stepTime}>3:42:03</Text>
          </View>

          <View style={styles.stepLine} />

          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.completedStep]}>
              <Check size={14} color={CedarColors.pine900} />
            </View>
            <Text style={styles.stepTitle}>Completed</Text>
            <Text style={styles.stepTime}>3:42:05</Text>
          </View>
        </View>

        {/* Action Row: Split, Receipt, Report */}
        <View style={styles.actionsRow}>
          <HapticButton style={styles.actionBtn} feedbackType="light">
            <Split size={18} color={CedarColors.bone} />
            <Text style={styles.actionBtnText}>Split</Text>
          </HapticButton>

          <HapticButton style={styles.actionBtn} feedbackType="light">
            <Receipt size={18} color={CedarColors.bone} />
            <Text style={styles.actionBtnText}>Receipt</Text>
          </HapticButton>

          <HapticButton style={styles.actionBtn} feedbackType="light">
            <Flag size={18} color={CedarColors.bone} />
            <Text style={styles.actionBtnText}>Report</Text>
          </HapticButton>
        </View>

        {/* Receipt Details Box */}
        <View style={styles.receiptBox}>
          <Text style={styles.receiptTitle}>RECEIPT</Text>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Amount</Text>
            <Text style={styles.receiptValue}>₹64.20</Text>
          </View>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Network fee</Text>
            <View style={styles.freeBadge}>
              <Text style={styles.freeText}>FREE</Text>
              <Text style={styles.receiptValue}> ₹0.00</Text>
            </View>
          </View>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Paid with</Text>
            <Text style={styles.receiptValue}>•••• 4921</Text>
          </View>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Reference</Text>
            <Text style={styles.receiptValue}>CDR-8842190</Text>
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
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CedarColors.pine800,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: CedarColors.bone,
    fontSize: 18,
    fontWeight: '800',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  merchantLogo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: CedarColors.pine700,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  merchantInitial: {
    color: CedarColors.gold500,
    fontSize: 28,
    fontWeight: '900',
  },
  merchantName: {
    color: CedarColors.bone,
    fontSize: 22,
    fontWeight: '800',
  },
  categoryLabel: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  amountText: {
    color: CedarColors.bone,
    fontSize: 38,
    fontWeight: '900',
    fontFamily: 'SpaceGrotesk-Bold',
    marginVertical: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(47, 158, 110, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CedarColors.positive,
  },
  statusText: {
    color: CedarColors.positive,
    fontSize: 12,
    fontWeight: '700',
  },
  trackerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
  },
  stepCol: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  completedStep: {
    backgroundColor: CedarColors.gold500,
  },
  stepTitle: {
    color: CedarColors.bone,
    fontSize: 12,
    fontWeight: '700',
  },
  stepTime: {
    color: CedarColors.pine300,
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: CedarColors.gold500,
    marginHorizontal: 8,
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
  },
  actionBtnText: {
    color: CedarColors.bone,
    fontSize: 13,
    fontWeight: '700',
  },
  receiptBox: {
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
  },
  receiptTitle: {
    color: CedarColors.pine300,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 16,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  receiptLabel: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '500',
  },
  receiptValue: {
    color: CedarColors.bone,
    fontSize: 13,
    fontWeight: '700',
  },
  freeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  freeText: {
    color: CedarColors.positive,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(47, 158, 110, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
  },
});
