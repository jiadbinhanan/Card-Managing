import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { NumericKeypad } from '../../components/NumericKeypad';
import { HapticButton } from '../../components/HapticButton';
import { ArrowLeft, UserPlus, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function SendMoneyModal() {
  const router = useRouter();
  const [amount, setAmount] = useState('240');
  const [selectedRecipient, setSelectedRecipient] = useState('1');

  const recipients = [
    { id: '1', name: 'Noah B.', handle: '@noah' },
    { id: '2', name: 'Mia K.', handle: '@mia' },
    { id: '3', name: 'Theo R.', handle: '@theo' },
    { id: '4', name: 'Priya S.', handle: '@priya' },
  ];

  const handleKeyPress = (val: string) => {
    if (val === '.' && amount.includes('.')) return;
    if (amount === '0' && val !== '.') {
      setAmount(val);
    } else {
      setAmount((prev) => prev + val);
    }
  };

  const handleBackspace = () => {
    setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <HapticButton style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={CedarColors.bone} />
        </HapticButton>
        <Text style={styles.headerTitle}>Send money</Text>
        <Text style={styles.stepIndicator}>Step 1 of 2</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Recipient Avatars Row */}
        <View style={styles.recipientRow}>
          <HapticButton style={styles.addRecipientBtn} feedbackType="light">
            <UserPlus size={20} color={CedarColors.bone} />
            <Text style={styles.addText}>Add</Text>
          </HapticButton>

          {recipients.map((rec) => {
            const isSelected = selectedRecipient === rec.id;
            return (
              <HapticButton
                key={rec.id}
                style={[styles.recipientItem, isSelected && styles.selectedRecipientItem]}
                onPress={() => setSelectedRecipient(rec.id)}
                feedbackType="light"
              >
                <View style={[styles.avatarCircle, isSelected && styles.selectedAvatarCircle]}>
                  <Text style={styles.avatarInitial}>{rec.name.charAt(0)}</Text>
                </View>
                <Text style={styles.recipientName}>{rec.name}</Text>
              </HapticButton>
            );
          })}
        </View>

        {/* Live Amount Display */}
        <View style={styles.amountDisplayContainer}>
          <Text style={styles.currencySymbol}>₹</Text>
          <Text style={styles.amountNumber}>{amount || '0'}</Text>
          <Text style={styles.decimalPart}>.00</Text>
        </View>
        <Text style={styles.sourceAccountLabel}>From HDFC Regalia •••• 4921</Text>

        {/* Quick Amount Presets */}
        <View style={styles.presetsRow}>
          {['500', '1000', '2500', '5000'].map((val) => (
            <HapticButton
              key={val}
              style={styles.presetPill}
              onPress={() => setAmount(val)}
              feedbackType="light"
            >
              <Text style={styles.presetText}>₹{val}</Text>
            </HapticButton>
          ))}
        </View>

        {/* Numeric Keypad */}
        <NumericKeypad onKeyPress={handleKeyPress} onBackspace={handleBackspace} />

        {/* Primary CTA */}
        <View style={styles.ctaContainer}>
          <HapticButton
            style={styles.reviewBtn}
            onPress={() => router.back()}
            feedbackType="success"
          >
            <Text style={styles.reviewBtnText}>Review transfer →</Text>
          </HapticButton>
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
  stepIndicator: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '600',
  },
  recipientRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  addRecipientBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  addText: {
    color: CedarColors.pine300,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  recipientItem: {
    alignItems: 'center',
    width: 64,
  },
  selectedRecipientItem: {},
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CedarColors.pine800,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedAvatarCircle: {
    borderColor: CedarColors.gold500,
    backgroundColor: CedarColors.pine700,
  },
  avatarInitial: {
    color: CedarColors.bone,
    fontSize: 18,
    fontWeight: '700',
  },
  recipientName: {
    color: CedarColors.bone,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  amountDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 20,
    marginBottom: 6,
  },
  currencySymbol: {
    color: CedarColors.bone,
    fontSize: 32,
    fontWeight: '700',
    marginTop: 6,
    marginRight: 4,
  },
  amountNumber: {
    color: CedarColors.bone,
    fontSize: 54,
    fontWeight: '900',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  decimalPart: {
    color: CedarColors.pine300,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 10,
  },
  sourceAccountLabel: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  presetPill: {
    backgroundColor: CedarColors.pine800,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  presetText: {
    color: CedarColors.bone,
    fontSize: 13,
    fontWeight: '700',
  },
  ctaContainer: {
    paddingHorizontal: 24,
    marginTop: 10,
  },
  reviewBtn: {
    height: 56,
    backgroundColor: CedarColors.gold500,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: CedarColors.gold500,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  reviewBtnText: {
    color: CedarColors.pine900,
    fontSize: 16,
    fontWeight: '900',
  },
});
