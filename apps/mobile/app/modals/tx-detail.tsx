import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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
        <HapticButton
          style={styles.backBtn}
          onPress={() => router.back()}
          feedbackType="light"
        >
          <ArrowLeft size={20} color={CedarColors.ink900} />
        </HapticButton>
        <Text style={styles.headerTitle}>Transaction</Text>
        <HapticButton style={styles.backBtn} feedbackType="light">
          <Share2 size={18} color={CedarColors.ink900} />
        </HapticButton>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Merchant Hero */}
        <View style={styles.heroSection}>
          <View style={styles.merchantLogo}>
            <Text style={styles.merchantInitial}>H</Text>
          </View>
          <Text style={styles.merchantName}>HDFC Credit Rotation</Text>
          <Text style={styles.categoryLabel}>• Card Rotation</Text>
          <Text style={styles.amountText}>-₹25,000.00</Text>

          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Completed • Today • 3:42 PM</Text>
          </View>
        </View>

        {/* 3-Step Progress Tracker */}
        <View style={styles.trackerContainer}>
          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.completedStep]}>
              <Check size={14} color="#FFFFFF" strokeWidth={3} />
            </View>
            <Text style={styles.stepTitle}>Authorized</Text>
            <Text style={styles.stepTime}>3:42:01</Text>
          </View>

          <View style={styles.stepLine} />

          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.completedStep]}>
              <Check size={14} color="#FFFFFF" strokeWidth={3} />
            </View>
            <Text style={styles.stepTitle}>Processing</Text>
            <Text style={styles.stepTime}>3:42:03</Text>
          </View>

          <View style={styles.stepLine} />

          <View style={styles.stepCol}>
            <View style={[styles.stepCircle, styles.completedStep]}>
              <Check size={14} color="#FFFFFF" strokeWidth={3} />
            </View>
            <Text style={styles.stepTitle}>Completed</Text>
            <Text style={styles.stepTime}>3:42:05</Text>
          </View>
        </View>

        {/* Action Row: Split, Receipt, Report */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn}>
            <Split size={18} color={CedarColors.forest800} />
            <Text style={styles.actionBtnText}>Split</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn}>
            <Receipt size={18} color={CedarColors.forest800} />
            <Text style={styles.actionBtnText}>Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn}>
            <Flag size={18} color={CedarColors.forest800} />
            <Text style={styles.actionBtnText}>Report</Text>
          </TouchableOpacity>
        </View>

        {/* Receipt Details Box */}
        <View style={styles.receiptBox}>
          <Text style={styles.receiptTitle}>TRANSACTION DETAILS</Text>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Amount</Text>
            <Text style={styles.receiptValue}>₹25,000.00</Text>
          </View>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Platform / Fee</Text>
            <Text style={styles.receiptValue}>₹0.00</Text>
          </View>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Payment Method</Text>
            <Text style={styles.receiptValue}>HDFC Regalia •••• 4921</Text>
          </View>

          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Reference ID</Text>
            <Text style={styles.receiptValue}>TXN-98421872</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CedarColors.canvas, // #F4F6F2
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: CedarColors.ink900,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  merchantLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: CedarColors.forest800,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  merchantInitial: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },
  merchantName: {
    color: CedarColors.ink900,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  categoryLabel: {
    color: CedarColors.ink700,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  amountText: {
    color: CedarColors.ink900,
    fontSize: 34,
    fontWeight: '900',
    fontFamily: 'SpaceGrotesk-Bold',
    marginVertical: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CedarColors.mint500,
  },
  statusText: {
    color: CedarColors.forest800,
    fontSize: 12,
    fontWeight: '600',
  },
  trackerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CedarColors.card,
    marginHorizontal: 18,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: CedarColors.border,
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
    backgroundColor: CedarColors.mint500,
  },
  stepTitle: {
    color: CedarColors.ink900,
    fontSize: 11,
    fontWeight: '700',
  },
  stepTime: {
    color: CedarColors.ink500,
    fontSize: 10,
    marginTop: 2,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: CedarColors.mint500,
    marginHorizontal: 8,
    top: -12,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnText: {
    color: CedarColors.ink900,
    fontSize: 13,
    fontWeight: '700',
  },
  receiptBox: {
    backgroundColor: CedarColors.card,
    marginHorizontal: 18,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  receiptTitle: {
    color: CedarColors.ink700,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F6F3',
  },
  receiptLabel: {
    color: CedarColors.ink700,
    fontSize: 13,
    fontWeight: '500',
  },
  receiptValue: {
    color: CedarColors.ink900,
    fontSize: 13,
    fontWeight: '700',
  },
});
