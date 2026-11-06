import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { CedarColors } from '@credics/core';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import { HapticButton } from '../HapticButton';
import {
  CreditCard,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export interface CardItem {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary?: boolean;
}

export interface CashSourceRow {
  uid: string;
  cardId: string;
  amount: string;
}

interface CrossCardReclaimDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeUserId: string;
  cards: CardItem[];
  userCardCashMap: Record<string, number>;
  pocketBalances: Array<{ card_id: string; current_balance: number }>;
  onSuccess: () => void;
}

export function CrossCardReclaimDrawer({
  isOpen,
  onClose,
  activeUserId,
  cards,
  userCardCashMap,
  pocketBalances,
  onSuccess,
}: CrossCardReclaimDrawerProps) {
  const [selectedDebtCardId, setSelectedDebtCardId] = useState<string>('');
  const [reclaimSources, setReclaimSources] = useState<CashSourceRow[]>([]);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Cards with deficit (pocket_advances current_balance < 0)
  const debtCards = useMemo(() => {
    return cards.map((c) => {
      const balObj = pocketBalances.find((p) => p.card_id === c.id);
      const balance = balObj ? Number(balObj.current_balance) : 0;
      return {
        ...c,
        balance,
        deficit: balance < 0 ? Math.abs(balance) : 0,
      };
    });
  }, [cards, pocketBalances]);

  // Cards with available cash
  const cardsWithCash = useMemo(() => {
    return cards
      .map((c) => ({
        ...c,
        balance: Number(userCardCashMap[c.id] || 0),
      }))
      .filter((c) => c.balance > 0);
  }, [cards, userCardCashMap]);

  // Selected debt deficit
  const selectedDeficit = useMemo(() => {
    const card = debtCards.find((c) => c.id === selectedDebtCardId);
    return card?.deficit || 0;
  }, [debtCards, selectedDebtCardId]);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      const firstDebt = debtCards.find((c) => c.deficit > 0)?.id || debtCards[0]?.id || '';
      setSelectedDebtCardId(firstDebt);

      const firstCash = cardsWithCash[0]?.id || '';
      const firstCashBal = Number(userCardCashMap[firstCash] || 0);
      const firstDeficit = debtCards.find((c) => c.id === firstDebt)?.deficit || 0;
      const initialAmt = firstDeficit > 0 ? Math.min(firstDeficit, firstCashBal) : 0;

      setReclaimSources([
        {
          uid: `src-${Date.now()}`,
          cardId: firstCash,
          amount: initialAmt > 0 ? String(initialAmt) : '',
        },
      ]);
      setRemarks('');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, debtCards, cardsWithCash, userCardCashMap]);

  const totalAllocated = useMemo(() => {
    return reclaimSources.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [reclaimSources]);

  const remainingNeeded = Math.max(0, selectedDeficit - totalAllocated);
  const overAllocated = Math.max(0, totalAllocated - selectedDeficit);

  const isAllocationValid = useMemo(() => {
    if (totalAllocated <= 0) return false;
    if (selectedDeficit > 0 && totalAllocated > selectedDeficit) return false;
    for (const src of reclaimSources) {
      if (!src.cardId) return false;
      const amt = Number(src.amount) || 0;
      if (amt <= 0) return false;
      const avail = Number(userCardCashMap[src.cardId] || 0);
      if (amt > avail) return false;
    }
    return true;
  }, [totalAllocated, selectedDeficit, reclaimSources, userCardCashMap]);

  const addSourceRow = () => {
    const used = new Set(reclaimSources.map((s) => s.cardId));
    const nextCard = cardsWithCash.find((c) => !used.has(c.id));
    if (!nextCard) return;

    setReclaimSources((prev) => [
      ...prev,
      { uid: `src-${Date.now()}-${Math.random()}`, cardId: nextCard.id, amount: '' },
    ]);
  };

  const updateSourceRow = (index: number, patch: Partial<CashSourceRow>) => {
    setReclaimSources((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeSourceRow = (index: number) => {
    setReclaimSources((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMaxRow = (index: number) => {
    const src = reclaimSources[index];
    if (!src?.cardId) return;

    const avail = Number(userCardCashMap[src.cardId] || 0);
    const otherAllocated = reclaimSources
      .filter((_, i) => i !== index)
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const needed = Math.max(0, selectedDeficit - otherAllocated);
    const maxPossible = Math.min(avail, needed > 0 ? needed : avail);

    updateSourceRow(index, { amount: String(maxPossible) });
  };

  const handleConfirmReclaim = async () => {
    if (!selectedDebtCardId) {
      setErrorMsg('Please select a target debt card.');
      return;
    }

    const validSources = reclaimSources.filter((s) => s.cardId && Number(s.amount) > 0);
    if (validSources.length === 0) {
      setErrorMsg('Please enter a valid cash source amount.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const sourcesPayload = validSources.map((s) => ({
        card_id: s.cardId,
        amount: Number(s.amount),
      }));

      const { error } = await supabase.rpc('atomic_reclaim_pocket_advance', {
        p_user_id: activeUserId,
        p_target_card_id: selectedDebtCardId,
        p_total_amount: totalAllocated,
        p_sources: sourcesPayload,
        p_remarks: remarks.trim() || 'Cross-Card Pocket Advance Reclaim',
      });

      if (error) throw error;

      // Rule 4: Success haptics on submit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Cross-card reclaim failed:', err);
      setErrorMsg(err.message || 'Failed to complete cross-card reclaim.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer
      visible={isOpen}
      onClose={onClose}
      title="Reclaim Pocket Advance"
      subtitle="Reclaim your own pocket money using cash on hand"
    >
      <DrawerScrollView contentContainerStyle={styles.container}>
        {/* Step 1: Target Debt Card */}
        <Text style={styles.sectionLabel}>TARGET DEBT CARD (POCKET DEFICIT)</Text>
        <DrawerScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
          {debtCards.map((c) => {
            const isSelected = c.id === selectedDebtCardId;
            return (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.debtCardPill,
                  isSelected && styles.debtCardPillSelected,
                  c.deficit > 0 && styles.debtCardPillHasDeficit,
                ]}
                onPress={() => setSelectedDebtCardId(c.id)}
                activeOpacity={0.8}
              >
                <CreditCard size={14} color={isSelected ? '#FFFFFF' : CedarColors.forest800} />
                <View style={styles.pillTextCol}>
                  <Text style={[styles.pillTitle, isSelected && styles.pillTitleSelected]}>
                    {c.card_name} (••{c.last_4_digits})
                  </Text>
                  <Text style={[styles.pillDeficit, isSelected && styles.pillDeficitSelected]}>
                    {c.deficit > 0
                      ? `Deficit: ₹${c.deficit.toLocaleString('en-IN')}`
                      : 'No Deficit (₹0)'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </DrawerScrollView>

        {/* Selected Deficit Card Summary */}
        <View style={styles.summaryBanner}>
          <Text style={styles.summaryBannerLabel}>TOTAL REQUIRED TO RECLAIM</Text>
          <Text style={styles.summaryBannerAmount}>
            ₹{selectedDeficit.toLocaleString('en-IN')}
          </Text>
        </View>

        {/* Step 2: Source Cash Cards */}
        <View style={styles.sourceHeaderRow}>
          <Text style={styles.sectionLabel}>CASH ON HAND SOURCES</Text>
          {reclaimSources.length < cardsWithCash.length && (
            <TouchableOpacity onPress={addSourceRow} style={styles.addSourceBtn}>
              <Plus size={13} color={CedarColors.forest800} strokeWidth={2.4} />
              <Text style={styles.addSourceBtnText}>Add Source</Text>
            </TouchableOpacity>
          )}
        </View>

        {reclaimSources.map((src, index) => {
          const availCash = Number(userCardCashMap[src.cardId] || 0);
          const isOverRow = Number(src.amount) > availCash;

          return (
            <View key={src.uid} style={styles.sourceCard}>
              <View style={styles.sourceCardTop}>
                <DrawerScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourcePickerRow}>
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

                {reclaimSources.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeSourceRow(index)}
                    style={styles.deleteBtn}
                  >
                    <Trash2 size={16} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.amountInputWrap, isOverRow && styles.amountInputError]}>
                  <Text style={styles.currencyPrefix}>₹</Text>
                  <TextInput
                    style={styles.amountInput}
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
                  <Zap size={13} color={CedarColors.forest800} strokeWidth={2.4} />
                  <Text style={styles.maxBtnText}>MAX</Text>
                </TouchableOpacity>
              </View>

              {isOverRow && (
                <Text style={styles.rowErrorText}>
                  Exceeds card cash balance (Max: ₹{availCash.toLocaleString('en-IN')})
                </Text>
              )}
            </View>
          );
        })}

        {/* Dynamic Allocation Guidance Banners */}
        {selectedDeficit > 0 && remainingNeeded > 0 && (
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

        {selectedDeficit > 0 && remainingNeeded === 0 && overAllocated === 0 && (
          <View style={[styles.guidanceBanner, styles.guidanceBannerGreen]}>
            <CheckCircle2 size={14} color="#15803D" />
            <Text style={styles.guidanceTextGreen}>
              Total allocation exactly matches pocket deficit!
            </Text>
          </View>
        )}

        {/* Remarks Input */}
        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>REMARKS (OPTIONAL)</Text>
        <TextInput
          style={styles.remarksInput}
          value={remarks}
          onChangeText={setRemarks}
          placeholder="e.g. Reclaimed from HDFC cash on hand"
          placeholderTextColor="#9CA3AF"
        />

        {errorMsg ? <Text style={styles.formErrorText}>{errorMsg}</Text> : null}

        {/* Confirm Submit CTA */}
        <HapticButton
          style={[styles.submitBtn, (!isAllocationValid || isSubmitting) && styles.submitBtnDisabled]}
          onPress={handleConfirmReclaim}
          disabled={!isAllocationValid || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              Confirm Reclaim • ₹{totalAllocated.toLocaleString('en-IN')}
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cardScroll: {
    marginBottom: 12,
  },
  debtCardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  debtCardPillSelected: {
    backgroundColor: CedarColors.forest800,
    borderColor: CedarColors.forest800,
  },
  debtCardPillHasDeficit: {
    borderColor: '#FCA5A5',
  },
  pillTextCol: {
    marginLeft: 8,
  },
  pillTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  pillTitleSelected: {
    color: '#FFFFFF',
  },
  pillDeficit: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
  },
  pillDeficitSelected: {
    color: '#FECACA',
  },
  summaryBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    alignItems: 'center',
  },
  summaryBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
    letterSpacing: 0.5,
  },
  summaryBannerAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#DC2626',
    marginTop: 2,
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
  sourceCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourcePickerRow: {
    flex: 1,
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
  deleteBtn: {
    padding: 6,
    marginLeft: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  amountInputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  maxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 63, 40, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
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
  remarksInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#111827',
    marginBottom: 16,
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
