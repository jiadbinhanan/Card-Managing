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
import NetInfo from '@react-native-community/netinfo';
import { CedarColors, deductCashFromSources } from '@credics/core';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import { HapticButton } from '../HapticButton';
import {
  CreditCard,
  Wallet,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useOfflineQueueStore } from '../../lib/offlineQueue';

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

export interface CashSourceRow {
  uid: string;
  cardId: string;
  amount: string;
}

interface SpendEntryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeUserId: string;
  profiles: ProfileItem[];
  cards: CardItem[];
  userCardCashMap: Record<string, Record<string, number>>; // userId -> cardId -> balance
  onSuccess: () => void;
}

export function SpendEntryDrawer({
  isOpen,
  onClose,
  activeUserId,
  profiles,
  cards,
  userCardCashMap,
  onSuccess,
}: SpendEntryDrawerProps) {
  const [selectedUserId, setSelectedUserId] = useState(activeUserId);
  const [selectedCardId, setSelectedCardId] = useState(cards[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [spendMethod, setSpendMethod] = useState<'credit_card' | 'cash_on_hand'>('credit_card');
  const [spendDate, setSpendDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [cashSources, setCashSources] = useState<CashSourceRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const numAmount = Number(amount) || 0;

  // Cash cards for selected user
  const currentUserCash = useMemo(() => {
    return userCardCashMap[selectedUserId] || {};
  }, [userCardCashMap, selectedUserId]);

  const cardsWithCash = useMemo(() => {
    return cards
      .map((c) => ({
        ...c,
        balance: Number(currentUserCash[c.id] || 0),
      }))
      .filter((c) => c.balance > 0);
  }, [cards, currentUserCash]);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setSelectedUserId(activeUserId);
      setSelectedCardId(cards[0]?.id || '');
      setAmount('');
      setSpendMethod('credit_card');
      setSpendDate(new Date().toISOString().slice(0, 10));
      setRemarks('');
      setErrorMsg('');
      setIsSubmitting(false);

      const firstCashCard = cardsWithCash[0]?.id || cards[0]?.id || '';
      setCashSources([
        { uid: `src-${Date.now()}`, cardId: firstCashCard, amount: '' },
      ]);
    }
  }, [isOpen, activeUserId, cards, cardsWithCash]);

  const totalCashAllocated = useMemo(() => {
    return cashSources.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [cashSources]);

  const remainingNeeded = Math.max(0, numAmount - totalCashAllocated);
  const overAllocated = Math.max(0, totalCashAllocated - numAmount);

  const isFormValid = useMemo(() => {
    if (numAmount <= 0) return false;
    if (spendMethod === 'credit_card') {
      return !!selectedCardId;
    }
    // Cash on Hand mode
    if (totalCashAllocated !== numAmount) return false;
    for (const src of cashSources) {
      if (!src.cardId) return false;
      const amt = Number(src.amount) || 0;
      if (amt <= 0) return false;
      const avail = Number(currentUserCash[src.cardId] || 0);
      if (amt > avail) return false;
    }
    return true;
  }, [numAmount, spendMethod, selectedCardId, totalCashAllocated, cashSources, currentUserCash]);

  const addSourceRow = () => {
    const used = new Set(cashSources.map((s) => s.cardId));
    const nextCard = cardsWithCash.find((c) => !used.has(c.id));
    if (!nextCard) return;

    setCashSources((prev) => [
      ...prev,
      { uid: `src-${Date.now()}-${Math.random()}`, cardId: nextCard.id, amount: '' },
    ]);
  };

  const updateSourceRow = (index: number, patch: Partial<CashSourceRow>) => {
    setCashSources((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeSourceRow = (index: number) => {
    setCashSources((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMaxRow = (index: number) => {
    const src = cashSources[index];
    if (!src?.cardId) return;

    const avail = Number(currentUserCash[src.cardId] || 0);
    const otherAllocated = cashSources
      .filter((_, i) => i !== index)
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const needed = Math.max(0, numAmount - otherAllocated);
    const maxPossible = Math.min(avail, needed > 0 ? needed : avail);

    updateSourceRow(index, { amount: String(maxPossible) });
  };

  const handleSubmitSpend = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    setErrorMsg('');

    const originalCreatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const validSources = cashSources
      .filter((s) => s.cardId && Number(s.amount) > 0)
      .map((s) => ({ cardId: s.cardId, amount: Number(s.amount) }));

    const breakdownForInsert =
      spendMethod === 'cash_on_hand' ? validSources.map((s) => ({ card_id: s.cardId, amount: s.amount })) : null;

    const netState = await NetInfo.fetch();
    const isOnline = !!netState.isConnected;

    if (!isOnline) {
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'spend',
        payload: {
          actingUserId: selectedUserId,
          numAmount,
          spendMethod,
          remarks: remarks.trim() || 'Personal Spend',
          activeCardId: selectedCardId,
          breakdownForInsert,
          validCashSources: validSources,
        },
        original_created_at: originalCreatedAt,
        transaction_date: spendDate,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
      onClose();
      return;
    }

    try {
      const { error: spendErr } = await supabase.from('spends').insert({
        user_id: selectedUserId,
        card_id: selectedCardId || null,
        amount: numAmount,
        spend_type: 'personal',
        payment_method: spendMethod,
        remarks: remarks.trim() || 'Personal Spend',
        spend_date: spendDate,
        created_at: originalCreatedAt,
        cash_source_breakdown: breakdownForInsert,
      });

      if (spendErr) throw spendErr;

      if (spendMethod === 'cash_on_hand' && validSources.length > 0) {
        await deductCashFromSources(supabase, {
          userId: selectedUserId,
          sources: validSources,
          note: `Personal spend ${remarks ? '- ' + remarks.trim() : ''}`,
          txDate: spendDate,
          createdAt: originalCreatedAt,
        });
      }

      // Rule 4: Success haptics on submit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Online spend failed, queueing offline:', err);
      useOfflineQueueStore.getState().enqueueMutation({
        type: 'spend',
        payload: {
          actingUserId: selectedUserId,
          numAmount,
          spendMethod,
          remarks: remarks.trim() || 'Personal Spend',
          activeCardId: selectedCardId,
          breakdownForInsert,
          validCashSources: validSources,
        },
        original_created_at: originalCreatedAt,
        transaction_date: spendDate,
        timeStr,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer
      visible={isOpen}
      onClose={onClose}
      title="Record Spend Entry"
      subtitle="Log direct personal spend with credit card or cash"
    >
      <DrawerScrollView contentContainerStyle={styles.container}>
        {/* User Selector */}
        {profiles.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SPENT BY USER</Text>
            <DrawerScrollView horizontal showsHorizontalScrollIndicator={false}>
              {profiles.map((p) => {
                const isSelected = p.id === selectedUserId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.userPill, isSelected && styles.userPillSelected]}
                    onPress={() => setSelectedUserId(p.id)}
                  >
                    <Text style={[styles.userPillText, isSelected && styles.userPillTextSelected]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </DrawerScrollView>
          </View>
        )}

        {/* Spend Amount */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SPEND AMOUNT</Text>
          <View style={styles.amountInputWrap}>
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
        </View>

        {/* Payment Method Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
          <View style={styles.methodToggleRow}>
            <TouchableOpacity
              style={[styles.methodBtn, spendMethod === 'credit_card' && styles.methodBtnActive]}
              onPress={() => setSpendMethod('credit_card')}
            >
              <CreditCard size={15} color={spendMethod === 'credit_card' ? '#FFFFFF' : CedarColors.forest800} />
              <Text style={[styles.methodBtnText, spendMethod === 'credit_card' && styles.methodBtnTextActive]}>
                Credit Card
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.methodBtn, spendMethod === 'cash_on_hand' && styles.methodBtnActive]}
              onPress={() => setSpendMethod('cash_on_hand')}
            >
              <Wallet size={15} color={spendMethod === 'cash_on_hand' ? '#FFFFFF' : CedarColors.forest800} />
              <Text style={[styles.methodBtnText, spendMethod === 'cash_on_hand' && styles.methodBtnTextActive]}>
                Cash on Hand
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card Selector (for Credit Card Mode) */}
        {spendMethod === 'credit_card' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SELECT CARD</Text>
            <DrawerScrollView horizontal showsHorizontalScrollIndicator={false}>
              {cards.map((c) => {
                const isSelected = c.id === selectedCardId;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.cardPill, isSelected && styles.cardPillSelected]}
                    onPress={() => setSelectedCardId(c.id)}
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
        )}

        {/* Multi-Source Cash (for Cash on Hand Mode) */}
        {spendMethod === 'cash_on_hand' && (
          <View style={styles.section}>
            <View style={styles.sourceHeaderRow}>
              <Text style={styles.sectionLabel}>ALLOCATE FROM CASH CARDS</Text>
              {cashSources.length < cardsWithCash.length && (
                <TouchableOpacity onPress={addSourceRow} style={styles.addSourceBtn}>
                  <Plus size={13} color={CedarColors.forest800} strokeWidth={2.4} />
                  <Text style={styles.addSourceBtnText}>Add Source</Text>
                </TouchableOpacity>
              )}
            </View>

            {cashSources.map((src, index) => {
              const availCash = Number(currentUserCash[src.cardId] || 0);
              const isOverRow = Number(src.amount) > availCash;

              return (
                <View key={src.uid} style={styles.sourceCard}>
                  <DrawerScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.miniPillScroll}>
                    {cardsWithCash.map((c) => {
                      const isSelected = c.id === src.cardId;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.miniPill, isSelected && styles.miniPillSelected]}
                          onPress={() => updateSourceRow(index, { cardId: c.id })}
                        >
                          <Text style={[styles.miniPillText, isSelected && styles.miniPillTextSelected]}>
                            {c.card_name} (••{c.last_4_digits}) • ₹{c.balance.toLocaleString('en-IN')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </DrawerScrollView>

                  <View style={styles.sourceInputRow}>
                    <View style={[styles.amountInputWrapMini, isOverRow && styles.amountInputError]}>
                      <Text style={styles.currencyPrefixMini}>₹</Text>
                      <TextInput
                        style={styles.amountInputMini}
                        value={src.amount}
                        onChangeText={(val) => updateSourceRow(index, { amount: val.replace(/[^0-9]/g, '') })}
                        placeholder="0"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numeric"
                      />
                    </View>

                    <TouchableOpacity
                      onPress={() => handleMaxRow(index)}
                      style={styles.maxBtn}
                      activeOpacity={0.8}
                    >
                      <Zap size={12} color={CedarColors.forest800} strokeWidth={2.4} />
                      <Text style={styles.maxBtnText}>MAX</Text>
                    </TouchableOpacity>

                    {cashSources.length > 1 && (
                      <TouchableOpacity onPress={() => removeSourceRow(index)} style={styles.deleteBtn}>
                        <Trash2 size={16} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {isOverRow && (
                    <Text style={styles.rowErrorText}>
                      Exceeds card cash balance (Max: ₹{availCash.toLocaleString('en-IN')})
                    </Text>
                  )}
                </View>
              );
            })}

            {/* Dynamic Allocation Guidance */}
            {numAmount > 0 && remainingNeeded > 0 && (
              <View style={styles.guidanceBanner}>
                <AlertCircle size={14} color="#D97706" />
                <Text style={styles.guidanceTextAmber}>
                  Remaining to allocate: ₹{remainingNeeded.toLocaleString('en-IN')}
                </Text>
              </View>
            )}

            {overAllocated > 0 && (
              <View style={[styles.guidanceBanner, styles.guidanceBannerRed]}>
                <AlertCircle size={14} color="#DC2626" />
                <Text style={styles.guidanceTextRed}>
                  Over-allocated by: ₹{overAllocated.toLocaleString('en-IN')}
                </Text>
              </View>
            )}

            {numAmount > 0 && remainingNeeded === 0 && overAllocated === 0 && (
              <View style={[styles.guidanceBanner, styles.guidanceBannerGreen]}>
                <CheckCircle2 size={14} color="#15803D" />
                <Text style={styles.guidanceTextGreen}>
                  Total cash allocation exactly matches spend amount!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Remarks Input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>REMARKS (OPTIONAL)</Text>
          <TextInput
            style={styles.textInput}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="e.g. Grocery, fuel, restaurant"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {errorMsg ? <Text style={styles.formErrorText}>{errorMsg}</Text> : null}

        {/* Submit Button */}
        <HapticButton
          style={[styles.submitBtn, (!isFormValid || isSubmitting) && styles.submitBtnDisabled]}
          onPress={handleSubmitSpend}
          disabled={!isFormValid || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              Record Spend • ₹{numAmount.toLocaleString('en-IN')}
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
  userPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
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
  methodToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  methodBtnActive: {
    backgroundColor: CedarColors.forest800,
  },
  methodBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    marginLeft: 6,
  },
  methodBtnTextActive: {
    color: '#FFFFFF',
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
    marginLeft: 5,
  },
  cardPillTextSelected: {
    color: '#FFFFFF',
  },
  sourceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(11, 63, 40, 0.08)',
  },
  addSourceBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: CedarColors.forest800,
    marginLeft: 4,
  },
  sourceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  miniPillScroll: {
    marginBottom: 8,
  },
  miniPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
  },
  miniPillSelected: {
    backgroundColor: CedarColors.forest800,
  },
  miniPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
  },
  miniPillTextSelected: {
    color: '#FFFFFF',
  },
  sourceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInputWrapMini: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  amountInputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  currencyPrefixMini: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
    marginRight: 4,
  },
  amountInputMini: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  maxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 63, 40, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(11, 63, 40, 0.15)',
  },
  maxBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: CedarColors.forest800,
    marginLeft: 3,
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 6,
  },
  rowErrorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 4,
  },
  guidanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  guidanceBannerRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  guidanceBannerGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  guidanceTextAmber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
    marginLeft: 6,
  },
  guidanceTextRed: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    marginLeft: 6,
  },
  guidanceTextGreen: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
    marginLeft: 6,
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
