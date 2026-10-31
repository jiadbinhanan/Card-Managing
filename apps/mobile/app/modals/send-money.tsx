import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CedarColors } from '@credics/core';
import { NumericKeypad } from '../../components/NumericKeypad';
import { HapticButton } from '../../components/HapticButton';
import { ArrowLeft, UserPlus, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function SendMoneyModal() {
  const router = useRouter();
  const [amount, setAmount] = useState('2500');
  const [selectedRecipient, setSelectedRecipient] = useState('1');

  const recipients = [
    { id: '1', name: 'Rahim Khan', handle: '@rahim' },
    { id: '2', name: 'Tanvir H.', handle: '@tanvir' },
    { id: '3', name: 'Sabbir A.', handle: '@sabbir' },
    { id: '4', name: 'Farhan M.', handle: '@farhan' },
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

  const handleReviewPayment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Confirm Payment',
      `Send ₹${amount} to ${recipients.find((r) => r.id === selectedRecipient)?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Now',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          },
        },
      ]
    );
  };

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
        <Text style={styles.headerTitle}>Send Money</Text>
        <Text style={styles.stepIndicator}>Step 1 of 2</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Recipient Avatars Row */}
        <View style={styles.recipientRow}>
          <TouchableOpacity
            style={styles.addRecipientBtn}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          >
            <UserPlus size={18} color={CedarColors.forest800} />
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>

          {recipients.map((rec) => {
            const isSelected = selectedRecipient === rec.id;
            return (
              <TouchableOpacity
                key={rec.id}
                style={[styles.recipientItem, isSelected && styles.selectedRecipientItem]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedRecipient(rec.id);
                }}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.avatarCircle,
                    isSelected && styles.selectedAvatarCircle,
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarInitial,
                      isSelected && styles.selectedAvatarInitial,
                    ]}
                  >
                    {rec.name.charAt(0)}
                  </Text>
                </View>
                <Text style={styles.recipientName} numberOfLines={1}>
                  {rec.name}
                </Text>
              </TouchableOpacity>
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
            <TouchableOpacity
              key={val}
              style={[styles.presetPill, amount === val && styles.activePresetPill]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAmount(val);
              }}
            >
              <Text style={[styles.presetText, amount === val && styles.activePresetText]}>
                ₹{val}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Numeric Keypad */}
        <NumericKeypad onKeyPress={handleKeyPress} onBackspace={handleBackspace} />

        {/* Primary CTA */}
        <View style={styles.ctaContainer}>
          <HapticButton
            style={styles.reviewBtn}
            onPress={handleReviewPayment}
            feedbackType="heavy"
          >
            <Text style={styles.reviewBtnText}>Continue to Review</Text>
          </HapticButton>
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
  stepIndicator: {
    color: CedarColors.ink700,
    fontSize: 12,
    fontWeight: '600',
  },
  recipientRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  addRecipientBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: CedarColors.card,
    borderWidth: 1.5,
    borderColor: CedarColors.border,
    borderStyle: 'dashed',
  },
  addText: {
    color: CedarColors.forest800,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  recipientItem: {
    alignItems: 'center',
    width: 60,
  },
  selectedRecipientItem: {},
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedAvatarCircle: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  avatarInitial: {
    color: CedarColors.ink900,
    fontSize: 16,
    fontWeight: '800',
  },
  selectedAvatarInitial: {
    color: '#FFFFFF',
  },
  recipientName: {
    color: CedarColors.ink900,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  amountDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginTop: 24,
    marginBottom: 4,
  },
  currencySymbol: {
    color: CedarColors.ink700,
    fontSize: 28,
    fontWeight: '700',
    marginRight: 4,
  },
  amountNumber: {
    color: CedarColors.ink900,
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'SpaceGrotesk-Bold',
    letterSpacing: -1,
  },
  decimalPart: {
    color: CedarColors.ink500,
    fontSize: 22,
    fontWeight: '700',
    marginLeft: 2,
  },
  sourceAccountLabel: {
    color: CedarColors.ink700,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  presetPill: {
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  activePresetPill: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  presetText: {
    color: CedarColors.ink900,
    fontSize: 13,
    fontWeight: '700',
  },
  activePresetText: {
    color: '#FFFFFF',
  },
  ctaContainer: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  reviewBtn: {
    backgroundColor: CedarColors.forest800, // #0F382A
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: CedarColors.forest800,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  reviewBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
});
