import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SwipeDownDrawer, DrawerScrollView } from './SwipeDownDrawer';
import { HapticButton } from './HapticButton';
import { CedarTypography } from '@credics/core';
import {
  Plus,
  CreditCard,
  Wallet,
  Receipt,
  Coins,
  Trash2,
} from 'lucide-react-native';

export interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  parent_card_id?: string;
  bill_gen_day?: number;
  bill_due_day?: number;
}

export interface ProfileData {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

export interface QRData {
  id: string;
  merchant_name: string;
  status: string;
}

export interface CashSourceRow {
  uid: string;
  cardId: string;
  amount: string;
}

export interface RecordEntrySubmitPayload {
  recordType: 'rotate' | 'spend' | 'bill';
  amount: number;
  finalDate: string;
  actingUserId: string;
  activeCardId: string;
  remarks: string;
  selectedQrId?: string;
  spendMethod?: 'credit_card' | 'cash_on_hand';
  billMethod?: 'cash_on_hand' | 'own_pocket';
  isDebtRepayment?: boolean;
  validCashSources: Array<{ cardId: string; amount: number }>;
}

interface RecordEntryDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSave: (payload: RecordEntrySubmitPayload) => Promise<void>;
  initialType?: 'rotate' | 'spend' | 'bill';
  allCards: CardData[];
  allProfiles: ProfileData[];
  allQrs: QRData[];
  currentUserId?: string;
  cardDueMap: Record<string, number>;
  userCardCashMap: Record<string, Record<string, number>>;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function RecordEntryDrawer({
  visible,
  onClose,
  onSave,
  initialType = 'bill',
  allCards,
  allProfiles,
  allQrs,
  currentUserId,
  cardDueMap,
  userCardCashMap,
}: RecordEntryDrawerProps) {
  const [recordType, setRecordType] = useState<'rotate' | 'spend' | 'bill'>(initialType);
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState('');
  const [selectedActorUserId, setSelectedActorUserId] = useState('');
  const [entryCardId, setEntryCardId] = useState('');
  const [billCardId, setBillCardId] = useState('');
  const [selectedQrId, setSelectedQrId] = useState('');
  const [spendMethod, setSpendMethod] = useState<'credit_card' | 'cash_on_hand'>('credit_card');
  const [billMethod, setBillMethod] = useState<'cash_on_hand' | 'own_pocket'>('cash_on_hand');
  const [isDebtRepayment, setIsDebtRepayment] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [cashSources, setCashSources] = useState<CashSourceRow[]>([
    { uid: uid(), cardId: '', amount: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setRecordType(initialType);
      setAmount('');
      setRemarks('');
      setTxDate(new Date().toISOString().slice(0, 10));
      if (!selectedActorUserId && currentUserId) {
        setSelectedActorUserId(currentUserId);
      }
      if (allCards.length > 0 && !entryCardId) {
        setEntryCardId(allCards[0].id);
      }
      const prims = allCards.filter((c) => c.is_primary);
      if (prims.length > 0 && !billCardId) {
        setBillCardId(prims[0].id);
      }
      if (allQrs.length > 0 && !selectedQrId) {
        setSelectedQrId(allQrs[0].id);
      }
    }
  }, [visible, initialType, currentUserId, allCards, allQrs]);

  const actingUserId = selectedActorUserId || currentUserId || allProfiles[0]?.id || '';
  const currentActorCashByCard = userCardCashMap[actingUserId] || {};

  const numAmount = Number(amount) || 0;

  const validCashSources = useMemo(
    () =>
      cashSources
        .filter((s) => s.cardId && Number(s.amount) > 0)
        .map((s) => ({ cardId: s.cardId, amount: Number(s.amount) })),
    [cashSources]
  );

  const cashAllocatedTotal = useMemo(
    () => validCashSources.reduce((sum, s) => sum + s.amount, 0),
    [validCashSources]
  );

  const isCashSourceMode =
    (recordType === 'bill' && billMethod === 'cash_on_hand') ||
    (recordType === 'spend' && spendMethod === 'cash_on_hand');

  const allocationValid = useMemo(() => {
    if (!isCashSourceMode) return true;
    if (numAmount <= 0) return false;
    if (cashAllocatedTotal !== numAmount) return false;
    for (const s of validCashSources) {
      const avail = currentActorCashByCard[s.cardId] || 0;
      if (s.amount > avail) return false;
    }
    return true;
  }, [isCashSourceMode, numAmount, cashAllocatedTotal, validCashSources, currentActorCashByCard]);

  const addCashSourceRow = () => {
    const unallocated = Math.max(0, numAmount - cashAllocatedTotal);
    const existingIds = cashSources.map((s) => s.cardId);
    const candidate =
      allCards.find(
        (c) =>
          !existingIds.includes(c.id) &&
          (currentActorCashByCard[c.id] || 0) > 0
      ) || allCards[0];

    const maxCanTake = Math.min(
      unallocated,
      currentActorCashByCard[candidate?.id || ''] || 0
    );

    setCashSources((prev) => [
      ...prev,
      {
        uid: uid(),
        cardId: candidate?.id || '',
        amount: maxCanTake > 0 ? String(maxCanTake) : '',
      },
    ]);
  };

  const removeCashSourceRow = (rowUid: string) => {
    if (cashSources.length <= 1) return;
    setCashSources((prev) => prev.filter((r) => r.uid !== rowUid));
  };

  const updateCashSourceCard = (rowUid: string, cardId: string) => {
    setCashSources((prev) =>
      prev.map((r) => {
        if (r.uid !== rowUid) return r;
        const avail = currentActorCashByCard[cardId] || 0;
        const curAmt = Number(r.amount) || 0;
        const finalAmt = curAmt > avail ? (avail > 0 ? String(avail) : '') : r.amount;
        return { ...r, cardId, amount: finalAmt };
      })
    );
  };

  const updateCashSourceAmount = (rowUid: string, amtText: string) => {
    const digitsOnly = amtText.replace(/[^0-9]/g, '');
    setCashSources((prev) =>
      prev.map((r) => (r.uid === rowUid ? { ...r, amount: digitsOnly } : r))
    );
  };

  const getCardLabel = useCallback(
    (cardId?: string | null) => {
      if (!cardId) return 'Select Card';
      const c = allCards.find((cc) => cc.id === cardId);
      return c ? `${c.card_name} (**${c.last_4_digits})` : 'Select Card';
    },
    [allCards]
  );

  const handleSubmit = async () => {
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }

    const activeCardId = recordType === 'bill' ? billCardId : entryCardId;
    if (!activeCardId) {
      Alert.alert('Card Required', 'Please select a card.');
      return;
    }

    if (isCashSourceMode && !allocationValid) {
      Alert.alert(
        'Allocation Incomplete',
        `Please allocate exactly ₹${numAmount.toLocaleString('en-IN')} across valid cards with sufficient cash balance.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        recordType,
        amount: numAmount,
        finalDate: txDate || new Date().toISOString().slice(0, 10),
        actingUserId,
        activeCardId,
        remarks: remarks.trim(),
        selectedQrId: recordType === 'rotate' ? selectedQrId : undefined,
        spendMethod: recordType === 'spend' ? spendMethod : undefined,
        billMethod: recordType === 'bill' ? billMethod : undefined,
        isDebtRepayment: recordType === 'bill' ? isDebtRepayment : undefined,
        validCashSources,
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Save Error', err?.message || 'Failed to record entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      title="Record Transaction"
      subtitle="Vault & Ledger Direct Entry"
      heightPercent={0.82}
    >
      <DrawerScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.drawerScrollBody}
      >
        {/* 3 Entry Type Tabs */}
        <View style={styles.entryTypeRow}>
          {(['bill', 'rotate', 'spend'] as const).map((t) => {
            const isSelected = recordType === t;
            const label =
              t === 'bill'
                ? 'Pay Bill'
                : t === 'rotate'
                ? 'Rotate QR'
                : 'Record Spend';
            return (
              <TouchableOpacity
                key={t}
                style={[
                  styles.entryTypeBtn,
                  isSelected && styles.entryTypeBtnActive,
                ]}
                onPress={() => setRecordType(t)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.entryTypeBtnText,
                    isSelected && styles.entryTypeBtnTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Amount Input */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Amount (₹)</Text>
          <View style={styles.amountInputRow}>
            <Text style={styles.currencySymbol}>₹</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor="#6B8272"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
          </View>
        </View>

        {/* Acting User Selection */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Acting User</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillsScroll}
          >
            {allProfiles.map((p) => {
              const isSelected = actingUserId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.userPill,
                    isSelected && styles.userPillActive,
                  ]}
                  onPress={() => setSelectedActorUserId(p.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.userPillText,
                      isSelected && styles.userPillTextActive,
                    ]}
                  >
                    {p.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Transaction Date */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Transaction Date</Text>
          <TextInput
            style={styles.textInput}
            value={txDate}
            onChangeText={setTxDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#6B8272"
          />
        </View>

        {/* 1. ROTATE FLOW */}
        {recordType === 'rotate' && (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Select Card</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
              >
                {allCards.map((c) => {
                  const isSelected = entryCardId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.cardPill,
                        isSelected && styles.cardPillActive,
                      ]}
                      onPress={() => setEntryCardId(c.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.cardPillText,
                          isSelected && styles.cardPillTextActive,
                        ]}
                      >
                        {c.card_name} (**{c.last_4_digits})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Select Merchant QR</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
              >
                {allQrs.map((q) => {
                  const isSelected = selectedQrId === q.id;
                  return (
                    <TouchableOpacity
                      key={q.id}
                      style={[
                        styles.qrPill,
                        isSelected && styles.qrPillActive,
                      ]}
                      onPress={() => setSelectedQrId(q.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.qrPillText,
                          isSelected && styles.qrPillTextActive,
                        ]}
                      >
                        {q.merchant_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </>
        )}

        {/* 2. SPEND FLOW */}
        {recordType === 'spend' && (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Select Card</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
              >
                {allCards.map((c) => {
                  const isSelected = entryCardId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.cardPill,
                        isSelected && styles.cardPillActive,
                      ]}
                      onPress={() => setEntryCardId(c.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.cardPillText,
                          isSelected && styles.cardPillTextActive,
                        ]}
                      >
                        {c.card_name} (**{c.last_4_digits})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Payment Method</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    spendMethod === 'credit_card' && styles.toggleBtnActive,
                  ]}
                  onPress={() => setSpendMethod('credit_card')}
                  activeOpacity={0.8}
                >
                  <CreditCard
                    size={14}
                    color={spendMethod === 'credit_card' ? '#FFFFFF' : '#34D399'}
                  />
                  <Text
                    style={[
                      styles.toggleBtnText,
                      spendMethod === 'credit_card' && styles.toggleBtnTextActive,
                    ]}
                  >
                    Credit Card
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    spendMethod === 'cash_on_hand' && styles.toggleBtnActive,
                  ]}
                  onPress={() => setSpendMethod('cash_on_hand')}
                  activeOpacity={0.8}
                >
                  <Wallet
                    size={14}
                    color={spendMethod === 'cash_on_hand' ? '#FFFFFF' : '#34D399'}
                  />
                  <Text
                    style={[
                      styles.toggleBtnText,
                      spendMethod === 'cash_on_hand' && styles.toggleBtnTextActive,
                    ]}
                  >
                    Cash on Hand
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* 3. BILL FLOW */}
        {recordType === 'bill' && (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Target Bill Card (Primary Vault)</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
              >
                {allCards
                  .filter((c) => c.is_primary)
                  .map((c) => {
                    const isSelected = billCardId === c.id;
                    const due = cardDueMap[c.id] || 0;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.cardPill,
                          isSelected && styles.cardPillActive,
                        ]}
                        onPress={() => setBillCardId(c.id)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.cardPillText,
                            isSelected && styles.cardPillTextActive,
                          ]}
                        >
                          {c.card_name}
                        </Text>
                        {due > 0 && (
                          <Text style={styles.cardPillDue}>
                            Due: ₹{due.toLocaleString('en-IN')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Bill Fund Source</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    billMethod === 'cash_on_hand' && styles.toggleBtnActive,
                  ]}
                  onPress={() => setBillMethod('cash_on_hand')}
                  activeOpacity={0.8}
                >
                  <Coins
                    size={14}
                    color={billMethod === 'cash_on_hand' ? '#FFFFFF' : '#34D399'}
                  />
                  <Text
                    style={[
                      styles.toggleBtnText,
                      billMethod === 'cash_on_hand' && styles.toggleBtnTextActive,
                    ]}
                  >
                    Cash on Hand
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    billMethod === 'own_pocket' && styles.toggleBtnActive,
                  ]}
                  onPress={() => setBillMethod('own_pocket')}
                  activeOpacity={0.8}
                >
                  <Wallet
                    size={14}
                    color={billMethod === 'own_pocket' ? '#FFFFFF' : '#34D399'}
                  />
                  <Text
                    style={[
                      styles.toggleBtnText,
                      billMethod === 'own_pocket' && styles.toggleBtnTextActive,
                    ]}
                  >
                    Own Pocket
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Clear Personal Debt Toggle */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Clear Personal Debt</Text>
                <Text style={styles.switchSub}>
                  Marks this bill payment as personal debt repayment
                </Text>
              </View>
              <Switch
                value={isDebtRepayment}
                onValueChange={setIsDebtRepayment}
                trackColor={{ false: 'rgba(255, 255, 255, 0.1)', true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </>
        )}

        {/* Multi-Source Cash Allocation Rows */}
        {isCashSourceMode && (
          <View style={styles.cashSourceContainer}>
            <View style={styles.cashSourceHeader}>
              <View>
                <Text style={styles.cashSourceTitle}>Multi-Card Cash Allocation</Text>
                <Text style={styles.cashSourceSub}>
                  Allocated: ₹{cashAllocatedTotal.toLocaleString('en-IN')} / ₹
                  {numAmount.toLocaleString('en-IN')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addSourceBtn}
                onPress={addCashSourceRow}
                activeOpacity={0.8}
              >
                <Plus size={13} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.addSourceBtnText}>Add Card</Text>
              </TouchableOpacity>
            </View>

            {cashSources.map((row) => {
              const cardBal = currentActorCashByCard[row.cardId] || 0;
              return (
                <View key={row.uid} style={styles.sourceRowBox}>
                  <View style={styles.sourceRowTop}>
                    <Text style={styles.sourceRowCardTitle}>
                      {getCardLabel(row.cardId)}
                    </Text>
                    <Text style={styles.sourceRowBal}>
                      Avail: ₹{cardBal.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.sourceCardsScroll}
                  >
                    {allCards.map((c) => {
                      const isSel = row.cardId === c.id;
                      const cBal = currentActorCashByCard[c.id] || 0;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.sourceCardChip,
                            isSel && styles.sourceCardChipActive,
                          ]}
                          onPress={() => updateCashSourceCard(row.uid, c.id)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.sourceCardChipText,
                              isSel && styles.sourceCardChipTextActive,
                            ]}
                          >
                            {c.card_name} (₹{cBal.toLocaleString('en-IN')})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.sourceInputRow}>
                    <Text style={styles.sourceInputSymbol}>₹</Text>
                    <TextInput
                      style={styles.sourceInput}
                      placeholder="Amount to take"
                      placeholderTextColor="#6B8272"
                      keyboardType="numeric"
                      value={row.amount}
                      onChangeText={(val) => updateCashSourceAmount(row.uid, val)}
                    />
                    {cashSources.length > 1 && (
                      <TouchableOpacity
                        style={styles.removeSourceBtn}
                        onPress={() => removeCashSourceRow(row.uid)}
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Remarks Input */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Remarks / Notes</Text>
          <TextInput
            style={[styles.textInput, { height: 64, textAlignVertical: 'top' }]}
            placeholder="e.g. Rent rotation, personal spend, bill cleared"
            placeholderTextColor="#6B8272"
            multiline
            value={remarks}
            onChangeText={setRemarks}
          />
        </View>

        {/* Submit Button */}
        <HapticButton
          style={[
            styles.submitBtn,
            (isSubmitting || (isCashSourceMode && !allocationValid)) && {
              opacity: 0.6,
            },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || (isCashSourceMode && !allocationValid)}
          feedbackType="rigid"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Confirm & Record Transaction</Text>
          )}
        </HapticButton>
      </DrawerScrollView>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  drawerScrollBody: {
    padding: 18,
    gap: 14,
  },
  entryTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  entryTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  entryTypeBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
  },
  entryTypeBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  entryTypeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  formGroup: {
    gap: 6,
  },
  formLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#34D399',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  currencySymbol: {
    fontSize: 22,
    fontFamily: CedarTypography.display,
    color: '#34D399',
    fontWeight: '900',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    color: '#F6F9F5',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: '#F6F9F5',
  },
  pillsScroll: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  userPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 8,
  },
  userPillActive: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
  },
  userPillText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  userPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  cardPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 8,
  },
  cardPillActive: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
  },
  cardPillText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  cardPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  cardPillDue: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: '#FCD34D',
    marginTop: 2,
  },
  qrPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 8,
  },
  qrPillActive: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
  },
  qrPillText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  qrPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  toggleBtnText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  toggleBtnTextActive: {
    color: '#34D399',
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  switchTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F6F9F5',
    fontWeight: '800',
  },
  switchSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#8EAA97',
    marginTop: 2,
  },
  // Cash Allocation
  cashSourceContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    padding: 12,
    gap: 10,
  },
  cashSourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashSourceTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cashSourceSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 1,
  },
  addSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  addSourceBtnText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sourceRowBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sourceRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceRowCardTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F6F9F5',
    fontWeight: '700',
  },
  sourceRowBal: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#F59E0B',
  },
  sourceCardsScroll: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  sourceCardChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 6,
  },
  sourceCardChipActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderColor: '#F59E0B',
  },
  sourceCardChipText: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  sourceCardChipTextActive: {
    color: '#F59E0B',
    fontWeight: '800',
  },
  sourceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceInputSymbol: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    color: '#F59E0B',
    fontWeight: '800',
  },
  sourceInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: '#F6F9F5',
  },
  removeSourceBtn: {
    padding: 6,
  },
  submitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
