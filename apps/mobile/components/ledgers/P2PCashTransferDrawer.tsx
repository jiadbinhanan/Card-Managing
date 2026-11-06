import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CedarColors } from '@credics/core';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import { HapticButton } from '../HapticButton';
import { CreditCard, User, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export interface CardItem {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary?: boolean;
}

export interface ProfileItem {
  id: string;
  name: string;
}

interface P2PCashTransferDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeUserId: string;
  profiles: ProfileItem[];
  cards: CardItem[];
  userCardCashMap: Record<string, Record<string, number>>; // userId -> cardId -> balance
  onSuccess: () => void;
}

export function P2PCashTransferDrawer({
  isOpen,
  onClose,
  activeUserId,
  profiles,
  cards,
  userCardCashMap,
  onSuccess,
}: P2PCashTransferDrawerProps) {
  const [senderCardId, setSenderCardId] = useState('');
  const [receiverUserId, setReceiverUserId] = useState('');
  const [receiverCardId, setReceiverCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const numAmount = Number(amount) || 0;

  // Sender's cash cards
  const senderCashMap = useMemo(() => {
    return userCardCashMap[activeUserId] || {};
  }, [userCardCashMap, activeUserId]);

  const senderCardsWithCash = useMemo(() => {
    return cards
      .map((c) => ({
        ...c,
        balance: Number(senderCashMap[c.id] || 0),
      }))
      .filter((c) => c.balance > 0);
  }, [cards, senderCashMap]);

  // Recipient users (excluding sender)
  const recipientProfiles = useMemo(() => {
    return profiles.filter((p) => p.id !== activeUserId);
  }, [profiles, activeUserId]);

  const selectedSenderCard = useMemo(() => {
    return senderCardsWithCash.find((c) => c.id === senderCardId);
  }, [senderCardsWithCash, senderCardId]);

  const availableSenderBalance = selectedSenderCard?.balance || 0;

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      const firstSrc = senderCardsWithCash[0]?.id || '';
      setSenderCardId(firstSrc);

      const firstRecUser = recipientProfiles[0]?.id || '';
      setReceiverUserId(firstRecUser);

      setReceiverCardId(cards[0]?.id || '');
      setAmount('');
      setRemarks('');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, activeUserId, senderCardsWithCash, recipientProfiles, cards]);

  const isFormValid = useMemo(() => {
    if (numAmount <= 0) return false;
    if (!senderCardId || !receiverUserId || !receiverCardId) return false;
    if (numAmount > availableSenderBalance) return false;
    return true;
  }, [numAmount, senderCardId, receiverUserId, receiverCardId, availableSenderBalance]);

  const handleSubmitTransfer = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const now = new Date().toISOString();
      const senderProfile = profiles.find((p) => p.id === activeUserId);
      const receiverProfile = profiles.find((p) => p.id === receiverUserId);
      const senderName = senderProfile?.name?.split(' ')[0] || 'User';
      const receiverName = receiverProfile?.name?.split(' ')[0] || 'User';

      // 1. Debit from sender's card in cash_on_hand_ledger
      const { error: debitErr } = await supabase.from('cash_on_hand_ledger').insert({
        user_id: activeUserId,
        card_id: senderCardId,
        amount: numAmount,
        transaction_type: 'debit',
        transaction_date: now,
        created_at: now,
        remarks: `Transferred to ${receiverName}${remarks ? ' — ' + remarks.trim() : ''}`,
      });
      if (debitErr) throw debitErr;

      // 2. Credit to receiver's card in cash_on_hand_ledger
      const { error: creditErr } = await supabase.from('cash_on_hand_ledger').insert({
        user_id: receiverUserId,
        card_id: receiverCardId,
        amount: numAmount,
        transaction_type: 'credit',
        transaction_date: now,
        created_at: now,
        remarks: `Received from ${senderName}${remarks ? ' — ' + remarks.trim() : ''}`,
      });
      if (creditErr) throw creditErr;

      // Rule 4: Success haptics on submit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('P2P cash transfer failed:', err);
      setErrorMsg(err.message || 'Failed to complete cash transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer
      visible={isOpen}
      onClose={onClose}
      title="Transfer Cash"
      subtitle="Send cash on hand directly to a family member's card"
    >
      <DrawerScrollView contentContainerStyle={styles.container}>
        {/* Step 1: Sender Card */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FROM SENDER CARD (YOUR CASH)</Text>
          {senderCardsWithCash.length === 0 ? (
            <Text style={styles.noCashWarnText}>
              You currently have ₹0 cash on hand across all cards.
            </Text>
          ) : (
            <DrawerScrollView horizontal showsHorizontalScrollIndicator={false}>
              {senderCardsWithCash.map((c) => {
                const isSelected = c.id === senderCardId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.cardPill, isSelected && styles.cardPillSelected]}
                    onPress={() => setSenderCardId(c.id)}
                  >
                    <CreditCard size={13} color={isSelected ? '#FFFFFF' : CedarColors.forest800} />
                    <Text style={[styles.cardPillText, isSelected && styles.cardPillTextSelected]}>
                      {c.card_name} (••{c.last_4_digits}) • ₹{c.balance.toLocaleString('en-IN')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </DrawerScrollView>
          )}
        </View>

        {/* Step 2: Recipient User */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECIPIENT USER</Text>
          <DrawerScrollView horizontal showsHorizontalScrollIndicator={false}>
            {recipientProfiles.map((p) => {
              const isSelected = p.id === receiverUserId;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.userPill, isSelected && styles.userPillSelected]}
                  onPress={() => setReceiverUserId(p.id)}
                >
                  <User size={13} color={isSelected ? '#FFFFFF' : CedarColors.forest800} />
                  <Text style={[styles.userPillText, isSelected && styles.userPillTextSelected]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </DrawerScrollView>
        </View>

        {/* Step 3: Recipient Destination Card */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECIPIENT DESTINATION CARD</Text>
          <DrawerScrollView horizontal showsHorizontalScrollIndicator={false}>
            {cards.map((c) => {
              const isSelected = c.id === receiverCardId;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.cardPill, isSelected && styles.cardPillSelected]}
                  onPress={() => setReceiverCardId(c.id)}
                >
                  <CreditCard size={13} color={isSelected ? '#FFFFFF' : CedarColors.forest800} />
                  <Text style={[styles.cardPillText, isSelected && styles.cardPillTextSelected]}>
                    {c.card_name} (••{c.last_4_digits})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </DrawerScrollView>
        </View>

        {/* Step 4: Transfer Amount */}
        <View style={styles.section}>
          <View style={styles.amountLabelRow}>
            <Text style={styles.sectionLabel}>TRANSFER AMOUNT</Text>
            {availableSenderBalance > 0 && (
              <TouchableOpacity onPress={() => setAmount(String(availableSenderBalance))}>
                <Text style={styles.maxText}>Use Max (₹{availableSenderBalance.toLocaleString('en-IN')})</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.amountInputWrap, numAmount > availableSenderBalance && styles.amountInputError]}>
            <Text style={styles.currencyPrefix}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(val) => setAmount(val.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />
          </View>

          {numAmount > availableSenderBalance && (
            <Text style={styles.errorSubText}>
              Exceeds available cash on card (Max: ₹{availableSenderBalance.toLocaleString('en-IN')})
            </Text>
          )}
        </View>

        {/* Step 5: Remarks */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>REMARKS (OPTIONAL)</Text>
          <TextInput
            style={styles.textInput}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="e.g. For bill payment, emergency cash"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {errorMsg ? <Text style={styles.formErrorText}>{errorMsg}</Text> : null}

        {/* Submit Button */}
        <HapticButton
          style={[styles.submitBtn, (!isFormValid || isSubmitting) && styles.submitBtnDisabled]}
          onPress={handleSubmitTransfer}
          disabled={!isFormValid || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              Complete Transfer • ₹{numAmount.toLocaleString('en-IN')}
            </Text>
          )}
        </HapticButton>
      </DrawerScrollView>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  amountLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  maxText: {
    fontSize: 11,
    fontWeight: '700',
    color: CedarColors.forest800,
  },
  noCashWarnText: {
    fontSize: 12,
    color: '#DC2626',
    fontStyle: 'italic',
  },
  cardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardPillSelected: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  cardPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 6,
  },
  cardPillTextSelected: {
    color: '#FFFFFF',
  },
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  userPillSelected: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  userPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 6,
  },
  userPillTextSelected: {
    color: '#FFFFFF',
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 54,
  },
  amountInputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  currencyPrefix: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  errorSubText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 4,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#111827',
  },
  formErrorText: {
    fontSize: 12,
    color: '#DC2626',
    marginBottom: 12,
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: CedarColors.forest800,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
