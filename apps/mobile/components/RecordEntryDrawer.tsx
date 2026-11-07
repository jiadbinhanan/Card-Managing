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
  Modal,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { SwipeDownDrawer, DrawerScrollView } from './SwipeDownDrawer';
import { HapticButton } from './HapticButton';
import { CedarTypography, CardData } from '@credics/core';
export { CardData };
import {
  Plus,
  CreditCard,
  Wallet,
  Receipt,
  Coins,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  User as UserIcon,
  Banknote,
  QrCode,
} from 'lucide-react-native';

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
  cardId: string; // card id or 'own_pocket'
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
  billMethod?: 'cash_on_hand' | 'own_pocket' | 'hybrid';
  ownPocketAmount?: number;
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
  userFamilySpendMap?: Record<string, number>;
  userCardSpendMap?: Record<string, Record<string, number>>;
  userTotalSpendMap?: Record<string, number>;
  cardAvailableMap?: Record<string, number>;
  cardDueDateMap?: Record<string, string>;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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
  userFamilySpendMap,
  userCardSpendMap,
  userTotalSpendMap,
  cardAvailableMap,
  cardDueDateMap,
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
  const [cashSources, setCashSources] = useState<CashSourceRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sub-Modals
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isActorModalOpen, setIsActorModalOpen] = useState(false);
  const [sourcePickerRowUid, setSourcePickerRowUid] = useState<string | null>(null);

  // Calendar State
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());

  // 120Hz Modal Tab Switcher Animation (Critically damped 50% bounciness reduction)
  const tabProgress = useSharedValue(initialType === 'bill' ? 0 : initialType === 'rotate' ? 1 : 2);

  useEffect(() => {
    const targetIdx = recordType === 'bill' ? 0 : recordType === 'rotate' ? 1 : 2;
    tabProgress.value = withSpring(targetIdx, {
      damping: 30,
      stiffness: 260,
    });
  }, [recordType]);

  const tabIndicatorStyle = useAnimatedStyle(() => {
    return {
      left: `${(tabProgress.value * 100) / 3}%`,
      width: '33.333%',
    };
  });

  const actingUserId = selectedActorUserId || currentUserId || allProfiles[0]?.id || '';
  const currentActorCashByCard = userCardCashMap[actingUserId] || {};

  // Auto-default initial state on open
  useEffect(() => {
    if (visible) {
      setRecordType(initialType);
      setAmount('');
      setRemarks('');
      setTxDate(new Date().toISOString().slice(0, 10));

      const actor = selectedActorUserId || currentUserId || allProfiles[0]?.id || '';
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

      // Auto-default initial row to a card with cash or first card (never blank!)
      const actorCash = userCardCashMap[actor] || {};
      const cardWithCash = allCards.find((c) => (actorCash[c.id] || 0) > 0) || allCards[0];
      setCashSources([
        { uid: uid(), cardId: cardWithCash?.id || '', amount: '' },
      ]);

      const now = new Date();
      setCalendarYear(now.getFullYear());
      setCalendarMonth(now.getMonth());
    }
  }, [visible, initialType, currentUserId, allCards, allQrs]);

  const numAmount = Number(amount) || 0;

  // Breakdown Calculations
  const validCashSources = useMemo(
    () =>
      cashSources
        .filter((s) => s.cardId && s.cardId !== 'own_pocket' && Number(s.amount) > 0)
        .map((s) => ({ cardId: s.cardId, amount: Number(s.amount) })),
    [cashSources]
  );

  const cardCashAllocated = useMemo(
    () => validCashSources.reduce((sum, s) => sum + s.amount, 0),
    [validCashSources]
  );

  const ownPocketAllocated = useMemo(
    () =>
      cashSources
        .filter((s) => s.cardId === 'own_pocket')
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0),
    [cashSources]
  );

  const totalAllocated = cardCashAllocated + ownPocketAllocated;

  const isMultiSourceActive =
    (recordType === 'bill' && billMethod === 'cash_on_hand') ||
    (recordType === 'spend' && spendMethod === 'cash_on_hand');

  const allocationValid = useMemo(() => {
    if (!isMultiSourceActive) return true;
    if (numAmount <= 0) return false;
    if (totalAllocated !== numAmount) return false;
    for (const s of validCashSources) {
      const avail = currentActorCashByCard[s.cardId] || 0;
      if (s.amount > avail) return false;
    }
    return true;
  }, [isMultiSourceActive, numAmount, totalAllocated, validCashSources, currentActorCashByCard]);

  // Add Row
  const addCashSourceRow = () => {
    const unallocated = Math.max(0, numAmount - totalAllocated);
    const existingIds = cashSources.map((s) => s.cardId);
    const candidate =
      allCards.find(
        (c) =>
          !existingIds.includes(c.id) &&
          (currentActorCashByCard[c.id] || 0) > 0
      ) ||
      allCards.find((c) => !existingIds.includes(c.id)) ||
      (!existingIds.includes('own_pocket') ? { id: 'own_pocket', card_name: 'Own Pocket', last_4_digits: '' } as CardData : null) ||
      allCards[0];

    const maxCanTake = candidate?.id === 'own_pocket'
      ? unallocated
      : Math.min(unallocated, currentActorCashByCard[candidate?.id || ''] || 0);

    setCashSources((prev) => [
      ...prev,
      {
        uid: uid(),
        cardId: candidate?.id || '',
        amount: maxCanTake > 0 ? String(maxCanTake) : '',
      },
    ]);
  };

  const handleMaxRow = (rowUid: string, cardId: string) => {
    if (!cardId) return;
    const otherAllocated = cashSources
      .filter((s) => s.uid !== rowUid)
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const unallocated = Math.max(0, numAmount - otherAllocated);

    let maxAmt = unallocated;
    if (cardId !== 'own_pocket') {
      const cardBal = currentActorCashByCard[cardId] || 0;
      maxAmt = Math.min(unallocated, cardBal);
    }
    updateCashSourceAmount(rowUid, maxAmt > 0 ? String(maxAmt) : '');
  };

  const removeCashSourceRow = (rowUid: string) => {
    if (cashSources.length <= 1) return;
    setCashSources((prev) => prev.filter((r) => r.uid !== rowUid));
  };

  const selectSourceForRow = (rowUid: string, cardId: string) => {
    setCashSources((prev) =>
      prev.map((r) => {
        if (r.uid !== rowUid) return r;
        if (cardId === 'own_pocket') {
          return { ...r, cardId };
        }
        const avail = currentActorCashByCard[cardId] || 0;
        const curAmt = Number(r.amount) || 0;
        const finalAmt = curAmt > avail ? (avail > 0 ? String(avail) : '') : r.amount;
        return { ...r, cardId, amount: finalAmt };
      })
    );
    setSourcePickerRowUid(null);
  };

  const updateCashSourceAmount = (rowUid: string, amtText: string) => {
    const digitsOnly = amtText.replace(/[^0-9]/g, '');
    setCashSources((prev) =>
      prev.map((r) => (r.uid === rowUid ? { ...r, amount: digitsOnly } : r))
    );
  };

  const getSourceDisplay = useCallback(
    (cardId?: string | null) => {
      if (!cardId) return 'Select Source';
      if (cardId === 'own_pocket') {
        return 'Own Pocket (Personal Funds)';
      }
      const c = allCards.find((cc) => cc.id === cardId);
      return c ? `${c.card_name} (••${c.last_4_digits})` : 'Select Card';
    },
    [allCards]
  );

  // Calendar Helpers
  const daysInMonth = useMemo(() => {
    return new Date(calendarYear, calendarMonth + 1, 0).getDate();
  }, [calendarYear, calendarMonth]);

  const firstDayOffset = useMemo(() => {
    return new Date(calendarYear, calendarMonth, 1).getDay();
  }, [calendarYear, calendarMonth]);

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mStr = String(calendarMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    setTxDate(`${calendarYear}-${mStr}-${dStr}`);
    setIsCalendarOpen(false);
  };

  // Submit Handler
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

    if (isMultiSourceActive && !allocationValid) {
      Alert.alert(
        'Allocation Incomplete',
        `Please allocate exactly ₹${numAmount.toLocaleString('en-IN')} across valid cards/pocket with sufficient balance.`
      );
      return;
    }

    let resolvedBillMethod: 'cash_on_hand' | 'own_pocket' | 'hybrid' | undefined = undefined;
    if (recordType === 'bill') {
      if (billMethod === 'own_pocket') {
        resolvedBillMethod = 'own_pocket';
      } else {
        const hasCardCash = validCashSources.length > 0;
        const hasOwnPocket = ownPocketAllocated > 0;
        if (hasCardCash && hasOwnPocket) {
          resolvedBillMethod = 'hybrid';
        } else if (hasOwnPocket) {
          resolvedBillMethod = 'own_pocket';
        } else {
          resolvedBillMethod = 'cash_on_hand';
        }
      }
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
        selectedQrId:
          recordType === 'rotate'
            ? selectedQrId === 'manual'
              ? undefined
              : selectedQrId || undefined
            : undefined,
        spendMethod: recordType === 'spend' ? spendMethod : undefined,
        billMethod: resolvedBillMethod,
        ownPocketAmount: ownPocketAllocated > 0 ? ownPocketAllocated : undefined,
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

  const selectedBillCard = allCards.find((c) => c.id === billCardId);
  const selectedBillCardDue = billCardId ? cardDueMap[billCardId] || 0 : 0;

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      title="Record Transaction"
      subtitle="Vault & Ledger Direct Entry"
      heightPercent={0.84}
    >
      <DrawerScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.drawerScrollBody}
      >
        {/* 120Hz Sliding Tabs */}
        <View style={styles.entryTypeContainer}>
          <Animated.View style={[styles.slidingIndicator, tabIndicatorStyle]} />
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
                style={styles.entryTypeBtn}
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
          <Text style={styles.formLabel}>AMOUNT (₹)</Text>
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

        {/* Compact 2-Column Row: Acting User & Transaction Date */}
        <View style={styles.compactRow}>
          {/* Left Column: Acting User */}
          <View style={styles.compactCol}>
            <Text style={styles.formLabel}>ACTING USER</Text>
            <TouchableOpacity
              style={styles.actorSelectBox}
              onPress={() => setIsActorModalOpen(true)}
              activeOpacity={0.8}
            >
              <View style={styles.actorIconCircle}>
                <UserIcon size={13} color="#10B981" />
              </View>
              <Text style={styles.actorSelectText} numberOfLines={1}>
                {allProfiles.find((p) => p.id === actingUserId)?.name?.split(' ')[0] || 'Select User'}
              </Text>
              <ChevronDown size={14} color="#6B8272" />
            </TouchableOpacity>
          </View>

          {/* Right Column: Date Input with Presets & Calendar Button */}
          <View style={styles.compactCol}>
            <View style={styles.dateLabelRow}>
              <Text style={styles.formLabel}>DATE</Text>
              <View style={styles.quickPresetRow}>
                <TouchableOpacity
                  style={[
                    styles.quickPresetChip,
                    txDate === new Date().toISOString().slice(0, 10) && styles.quickPresetChipActive,
                  ]}
                  onPress={() => setTxDate(new Date().toISOString().slice(0, 10))}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.quickPresetText,
                      txDate === new Date().toISOString().slice(0, 10) && styles.quickPresetTextActive,
                    ]}
                  >
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.quickPresetChip,
                    (() => {
                      const y = new Date();
                      y.setDate(y.getDate() - 1);
                      return txDate === y.toISOString().slice(0, 10);
                    })() && styles.quickPresetChipActive,
                  ]}
                  onPress={() => {
                    const y = new Date();
                    y.setDate(y.getDate() - 1);
                    setTxDate(y.toISOString().slice(0, 10));
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.quickPresetText,
                      (() => {
                        const y = new Date();
                        y.setDate(y.getDate() - 1);
                        return txDate === y.toISOString().slice(0, 10);
                      })() && styles.quickPresetTextActive,
                    ]}
                  >
                    Y’day
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.dateInputBox}>
              <TextInput
                style={styles.dateInputField}
                value={txDate}
                onChangeText={setTxDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#6B8272"
              />
              <TouchableOpacity
                style={styles.calendarTriggerBtn}
                onPress={() => setIsCalendarOpen(true)}
                activeOpacity={0.8}
              >
                <CalendarIcon size={15} color="#34D399" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 1. BILL FLOW */}
        {recordType === 'bill' && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.flowSection}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>TARGET BILL CARD (PRIMARY VAULT)</Text>
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
                          styles.billCardChip,
                          isSelected && styles.billCardChipActive,
                        ]}
                        onPress={() => setBillCardId(c.id)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.billChipTopRow}>
                          <Text
                            style={[
                              styles.billChipName,
                              isSelected && styles.billChipNameActive,
                            ]}
                            numberOfLines={1}
                          >
                            {c.card_name}
                          </Text>
                          <Text style={styles.billChipLast4}>
                            (••{c.last_4_digits})
                          </Text>
                        </View>
                        <Text style={styles.billChipDue}>
                          Due: ₹{due.toLocaleString('en-IN')}
                        </Text>
                        <Text style={styles.billChipDueDate}>
                          Due Date: {cardDueDateMap?.[c.id] || 'Not set'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>

            {/* Prominent Red Due Summary Banner matching Web Styling */}
            {selectedBillCardDue > 0 && (
              <View style={styles.billDueSummaryBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.billDueSummaryTitle}>TOTAL STATEMENT DUE</Text>
                  <Text style={styles.billDueSummaryDate}>
                    Due Date: {cardDueDateMap?.[billCardId] || 'Pending Cycle'}
                  </Text>
                </View>
                <Text style={styles.billDueSummaryAmount}>
                  ₹{selectedBillCardDue.toLocaleString('en-IN')}
                </Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>BILL FUND SOURCE</Text>
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
                    Cash on Hand / Multi
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
                    Own Pocket Only
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

            {isDebtRepayment && (() => {
              const selectedBillCard = allCards.find((c) => c.id === billCardId);
              const billPrimaryId = selectedBillCard?.is_primary
                ? selectedBillCard.id
                : (selectedBillCard?.parent_card_id || billCardId);

              const cardPersonalDebt = billPrimaryId
                ? userCardSpendMap?.[actingUserId]?.[billPrimaryId] ?? (userFamilySpendMap?.[actingUserId] || 0)
                : (userFamilySpendMap?.[actingUserId] || 0);

              const totalPersonalDebt = userTotalSpendMap?.[actingUserId] ?? (userFamilySpendMap?.[actingUserId] || 0);

              return (
                <View style={styles.familyDebtBox}>
                  <Receipt size={14} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.familyDebtTitle}>
                      Debt on {selectedBillCard?.card_name || 'Card'}: ₹
                      {Math.max(0, cardPersonalDebt).toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.familyDebtSub}>
                      {totalPersonalDebt > cardPersonalDebt
                        ? `(Total debt across all cards: ₹${Math.max(0, totalPersonalDebt).toLocaleString('en-IN')})`
                        : 'This payment will offset personal spend debt on this card.'}
                    </Text>
                  </View>
                </View>
              );
            })()}
          </Animated.View>
        )}

        {/* 2. ROTATE FLOW */}
        {recordType === 'rotate' && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.flowSection}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>SELECT CARD</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
              >
                {allCards.map((c) => {
                  const isSelected = entryCardId === c.id;
                  const avail = cardAvailableMap ? cardAvailableMap[c.id] || 0 : undefined;
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
                        {c.card_name} (••{c.last_4_digits})
                      </Text>
                      {avail !== undefined && (
                        <Text
                          style={[
                            styles.cardPillSub,
                            isSelected && styles.cardPillSubActive,
                          ]}
                        >
                          Avail: ₹{avail.toLocaleString('en-IN')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>SELECT MERCHANT QR</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.qrPill,
                    selectedQrId === 'manual' && styles.qrPillActive,
                  ]}
                  onPress={() => setSelectedQrId('manual')}
                  activeOpacity={0.8}
                >
                  <Banknote
                    size={13}
                    color={selectedQrId === 'manual' ? '#FFFFFF' : '#8CA394'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.qrPillText,
                      selectedQrId === 'manual' && styles.qrPillTextActive,
                    ]}
                  >
                    Manual (No QR / POS / ATM)
                  </Text>
                </TouchableOpacity>

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
                      <QrCode
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#8CA394'}
                        style={{ marginRight: 5 }}
                      />
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
          </Animated.View>
        )}

        {/* 3. SPEND FLOW */}
        {recordType === 'spend' && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.flowSection}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>SELECT CARD</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsScroll}
              >
                {allCards.map((c) => {
                  const isSelected = entryCardId === c.id;
                  const avail = cardAvailableMap ? cardAvailableMap[c.id] || 0 : undefined;
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
                        {c.card_name} (••{c.last_4_digits})
                      </Text>
                      {avail !== undefined && (
                        <Text
                          style={[
                            styles.cardPillSub,
                            isSelected && styles.cardPillSubActive,
                          ]}
                        >
                          Avail: ₹{avail.toLocaleString('en-IN')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {entryCardId ? (() => {
                const selectedCard = allCards.find((c) => c.id === entryCardId);
                const primaryId = selectedCard?.is_primary
                  ? selectedCard.id
                  : (selectedCard?.parent_card_id || entryCardId);
                const cardPersonalSpend = userCardSpendMap?.[actingUserId]?.[primaryId] || 0;
                const avail = cardAvailableMap?.[entryCardId] || 0;

                return (
                  <View style={styles.spendMetricsBanner}>
                    <View style={styles.spendMetricCol}>
                      <Text style={styles.spendMetricLabel}>CARD AVAILABLE</Text>
                      <Text style={styles.spendMetricValue}>
                        ₹{avail.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <View style={styles.spendMetricDivider} />
                    <View style={styles.spendMetricCol}>
                      <Text style={styles.spendMetricLabel}>YOUR PERSONAL SPEND</Text>
                      <Text style={styles.spendMetricDebtValue}>
                        ₹{Math.max(0, cardPersonalSpend).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                );
              })() : null}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>PAYMENT METHOD</Text>
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
          </Animated.View>
        )}

        {/* Multi-Source Cash Allocation Rows (Includes Own Pocket Hybrid) */}
        {isMultiSourceActive && (
          <View style={styles.cashSourceContainer}>
            <View style={styles.cashSourceHeader}>
              <View>
                <Text style={styles.cashSourceTitle}>MULTI-SOURCE CASH ALLOCATION</Text>
                <Text style={styles.cashSourceSub}>
                  Allocated: ₹{totalAllocated.toLocaleString('en-IN')} / ₹{numAmount.toLocaleString('en-IN')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.addSourceBtn}
                onPress={addCashSourceRow}
                activeOpacity={0.8}
              >
                <Plus size={13} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.addSourceBtnText}>Add Source</Text>
              </TouchableOpacity>
            </View>

            {/* Dynamic Allocation Guidance Banner */}
            {numAmount > 0 && (
              <View
                style={[
                  styles.allocationBanner,
                  totalAllocated === numAmount
                    ? styles.allocationBannerSuccess
                    : totalAllocated > numAmount
                    ? styles.allocationBannerError
                    : styles.allocationBannerWarning,
                ]}
              >
                {totalAllocated === numAmount ? (
                  <CheckCircle2 size={13} color="#10B981" />
                ) : (
                  <AlertCircle
                    size={13}
                    color={totalAllocated > numAmount ? '#EF4444' : '#F59E0B'}
                  />
                )}
                <Text
                  style={[
                    styles.allocationBannerText,
                    totalAllocated === numAmount
                      ? styles.bannerTextSuccess
                      : totalAllocated > numAmount
                      ? styles.bannerTextError
                      : styles.bannerTextWarning,
                  ]}
                >
                  {totalAllocated === numAmount
                    ? `Fully allocated: ₹${numAmount.toLocaleString('en-IN')}`
                    : totalAllocated > numAmount
                    ? `Over-allocated by: ₹${(totalAllocated - numAmount).toLocaleString('en-IN')}`
                    : `Remaining to allocate: ₹${(numAmount - totalAllocated).toLocaleString('en-IN')}`}
                </Text>
              </View>
            )}

            {cashSources.map((row) => {
              const isPocket = row.cardId === 'own_pocket';
              const cardBal = isPocket ? Infinity : currentActorCashByCard[row.cardId] || 0;
              const rowAmt = Number(row.amount) || 0;
              const isOverDraft = !isPocket && rowAmt > cardBal;

              return (
                <View key={row.uid} style={styles.sourceRowBox}>
                  {/* Source Picker Trigger */}
                  <TouchableOpacity
                    style={styles.sourcePickerTrigger}
                    onPress={() => setSourcePickerRowUid(row.uid)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.sourcePickerLeft}>
                      {isPocket ? (
                        <Wallet size={14} color="#F59E0B" />
                      ) : (
                        <CreditCard size={14} color="#10B981" />
                      )}
                      <Text style={styles.sourcePickerText} numberOfLines={1}>
                        {getSourceDisplay(row.cardId)}
                      </Text>
                    </View>
                    <View style={styles.sourcePickerRight}>
                      <Text
                        style={[
                          styles.sourceRowBal,
                          isOverDraft && { color: '#EF4444', fontWeight: '800' },
                        ]}
                      >
                        {isPocket
                          ? 'Personal Pocket'
                          : `Avail: ₹${cardBal.toLocaleString('en-IN')}`}
                      </Text>
                      <ChevronDown size={14} color="#6B8272" />
                    </View>
                  </TouchableOpacity>

                  {/* Amount Input Row with MAX and Delete */}
                  <View
                    style={[
                      styles.sourceInputRow,
                      isOverDraft && styles.sourceInputRowError,
                    ]}
                  >
                    <Text style={styles.sourceInputSymbol}>₹</Text>
                    <TextInput
                      style={styles.sourceInput}
                      placeholder="Amount to take"
                      placeholderTextColor="#6B8272"
                      keyboardType="numeric"
                      value={row.amount}
                      onChangeText={(val) => updateCashSourceAmount(row.uid, val)}
                    />
                    <TouchableOpacity
                      style={styles.maxBtn}
                      onPress={() => handleMaxRow(row.uid, row.cardId)}
                      activeOpacity={0.7}
                    >
                      <Zap size={10} color="#F59E0B" />
                      <Text style={styles.maxBtnText}>MAX</Text>
                    </TouchableOpacity>
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
          <Text style={styles.formLabel}>REMARKS / NOTES</Text>
          <TextInput
            style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
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
            (isSubmitting || (isMultiSourceActive && !allocationValid)) && {
              opacity: 0.6,
            },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || (isMultiSourceActive && !allocationValid)}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Confirm & Record Transaction</Text>
          )}
        </HapticButton>
      </DrawerScrollView>

      {/* ================= CALENDAR PICKER MODAL ================= */}
      <Modal
        visible={isCalendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCalendarOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsCalendarOpen(false)}
          />
          <View style={styles.calendarModalCard}>
            {/* Calendar Header with Prev/Next Navigation */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={handlePrevMonth}
                hitSlop={8}
              >
                <ChevronLeft size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>
                {MONTH_NAMES[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={handleNextMonth}
                hitSlop={8}
              >
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Days of Week Header */}
            <View style={styles.calendarWeekRow}>
              {DAYS_OF_WEEK.map((d) => (
                <Text key={d} style={styles.calendarWeekText}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {Array.from({ length: firstDayOffset }).map((_, idx) => (
                <View key={`empty-${idx}`} style={styles.calendarCell} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const mStr = String(calendarMonth + 1).padStart(2, '0');
                const dStr = String(dayNum).padStart(2, '0');
                const isSelected = txDate === `${calendarYear}-${mStr}-${dStr}`;
                const isToday =
                  new Date().toISOString().slice(0, 10) === `${calendarYear}-${mStr}-${dStr}`;

                return (
                  <TouchableOpacity
                    key={`day-${dayNum}`}
                    style={[
                      styles.calendarCell,
                      isSelected && styles.calendarCellSelected,
                      isToday && !isSelected && styles.calendarCellToday,
                    ]}
                    onPress={() => handleSelectDay(dayNum)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.calendarCellText,
                        isSelected && styles.calendarCellTextSelected,
                        isToday && !isSelected && styles.calendarCellTextToday,
                      ]}
                    >
                      {dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.calendarCloseBtn}
              onPress={() => setIsCalendarOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.calendarCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================= ACTING USER MODAL ================= */}
      <Modal
        visible={isActorModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsActorModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsActorModalOpen(false)}
          />
          <View style={styles.selectionModalCard}>
            <View style={styles.selectionModalHeader}>
              <Text style={styles.selectionModalTitle}>Select Acting User</Text>
              <TouchableOpacity
                onPress={() => setIsActorModalOpen(false)}
                hitSlop={8}
              >
                <X size={18} color="#CAD6C9" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {allProfiles.map((p) => {
                const isSelected = actingUserId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.selectionModalItem,
                      isSelected && styles.selectionModalItemActive,
                    ]}
                    onPress={() => {
                      setSelectedActorUserId(p.id);
                      setIsActorModalOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.selectionModalItemLeft}>
                      <View style={styles.actorAvatarCircle}>
                        <Text style={styles.actorAvatarText}>
                          {p.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.selectionModalItemText,
                          isSelected && styles.selectionModalItemTextActive,
                        ]}
                      >
                        {p.name}
                      </Text>
                    </View>
                    {isSelected && (
                      <CheckCircle2 size={16} color="#10B981" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= SOURCE SELECTOR MODAL (CARDS + OWN POCKET) ================= */}
      <Modal
        visible={sourcePickerRowUid !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSourcePickerRowUid(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSourcePickerRowUid(null)}
          />
          <View style={styles.selectionModalCard}>
            <View style={styles.selectionModalHeader}>
              <Text style={styles.selectionModalTitle}>Select Fund Source</Text>
              <TouchableOpacity
                onPress={() => setSourcePickerRowUid(null)}
                hitSlop={8}
              >
                <X size={18} color="#CAD6C9" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={styles.sourceGroupTitle}>CARDS WITH CASH ON HAND</Text>
              {allCards.map((c) => {
                const cBal = currentActorCashByCard[c.id] || 0;
                const isSelected =
                  sourcePickerRowUid !== null &&
                  cashSources.find((s) => s.uid === sourcePickerRowUid)?.cardId === c.id;

                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.selectionModalItem,
                      isSelected && styles.selectionModalItemActive,
                    ]}
                    onPress={() => {
                      if (sourcePickerRowUid) {
                        selectSourceForRow(sourcePickerRowUid, c.id);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.selectionModalItemLeft}>
                      <CreditCard size={15} color="#10B981" />
                      <View>
                        <Text
                          style={[
                            styles.selectionModalItemText,
                            isSelected && styles.selectionModalItemTextActive,
                          ]}
                        >
                          {c.card_name} (••{c.last_4_digits})
                        </Text>
                        <Text style={styles.sourceModalItemSub}>
                          Available Cash: ₹{cBal.toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>
                    {isSelected && (
                      <CheckCircle2 size={16} color="#10B981" />
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Own Pocket Option for Hybrid Fund Source */}
              <Text style={[styles.sourceGroupTitle, { marginTop: 12 }]}>
                PERSONAL ADVANCES
              </Text>
              <TouchableOpacity
                style={[
                  styles.selectionModalItem,
                  sourcePickerRowUid !== null &&
                    cashSources.find((s) => s.uid === sourcePickerRowUid)?.cardId === 'own_pocket' &&
                    styles.selectionModalItemActive,
                ]}
                onPress={() => {
                  if (sourcePickerRowUid) {
                    selectSourceForRow(sourcePickerRowUid, 'own_pocket');
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={styles.selectionModalItemLeft}>
                  <Wallet size={15} color="#F59E0B" />
                  <View>
                    <Text
                      style={[
                        styles.selectionModalItemText,
                        sourcePickerRowUid !== null &&
                          cashSources.find((s) => s.uid === sourcePickerRowUid)?.cardId === 'own_pocket' &&
                          styles.selectionModalItemTextActive,
                      ]}
                    >
                      Own Pocket (Personal Funds)
                    </Text>
                    <Text style={styles.sourceModalItemSub}>
                      Advance payment from your personal pocket
                    </Text>
                  </View>
                </View>
                {sourcePickerRowUid !== null &&
                  cashSources.find((s) => s.uid === sourcePickerRowUid)?.cardId === 'own_pocket' && (
                    <CheckCircle2 size={16} color="#10B981" />
                  )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  drawerScrollBody: {
    padding: 18,
    gap: 14,
  },
  entryTypeContainer: {
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  slidingIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#10B981',
    borderRadius: 13,
  },
  entryTypeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
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
  compactRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compactCol: {
    flex: 1,
    gap: 6,
  },
  actorSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
  },
  actorIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorSelectText: {
    flex: 1,
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
  },
  dateLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickPresetRow: {
    flexDirection: 'row',
    gap: 4,
  },
  quickPresetChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickPresetChipActive: {
    backgroundColor: '#10B981',
  },
  quickPresetText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  quickPresetTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dateInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dateInputField: {
    flex: 1,
    fontSize: 12,
    fontFamily: CedarTypography.body,
    color: '#F6F9F5',
    paddingVertical: 6,
  },
  calendarTriggerBtn: {
    padding: 6,
  },
  flowSection: {
    gap: 12,
  },
  pillsScroll: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  billCardChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: 10,
    minWidth: 150,
  },
  billCardChipActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#EF4444',
  },
  billChipTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  billChipName: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  billChipNameActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  billChipLast4: {
    fontSize: 11,
    color: '#8CA394',
  },
  billChipDue: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#EF4444',
    fontWeight: '800',
    marginTop: 4,
  },
  billChipDueDate: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#8CA394',
    marginTop: 2,
  },
  billDueSummaryBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1.2,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  billDueSummaryTitle: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#EF4444',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  billDueSummaryDate: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  billDueSummaryAmount: {
    fontSize: 17,
    fontFamily: CedarTypography.display,
    color: '#EF4444',
    fontWeight: '900',
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
  cardPillSub: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: '#8CA394',
    marginTop: 2,
  },
  cardPillSubActive: {
    color: '#E6F4EA',
  },
  qrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  toggleBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#34D399',
  },
  toggleBtnText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  switchTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
  },
  switchSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#8CA394',
    marginTop: 2,
  },
  familyDebtBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  familyDebtTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F59E0B',
    fontWeight: '700',
  },
  familyDebtSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
    marginTop: 2,
  },
  spendMetricsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  spendMetricCol: {
    flex: 1,
  },
  spendMetricLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  spendMetricValue: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#34D399',
  },
  spendMetricDebtValue: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FBBF24',
  },
  spendMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    marginHorizontal: 12,
  },
  cashSourceContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  cashSourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashSourceTitle: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#34D399',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cashSourceSub: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
    marginTop: 2,
  },
  addSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addSourceBtnText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  allocationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  allocationBannerSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  allocationBannerWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  allocationBannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  allocationBannerText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
  },
  bannerTextSuccess: {
    color: '#10B981',
  },
  bannerTextWarning: {
    color: '#F59E0B',
  },
  bannerTextError: {
    color: '#EF4444',
  },
  sourceRowBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  sourcePickerTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sourcePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sourcePickerText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    flex: 1,
  },
  sourcePickerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceRowBal: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  sourceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    gap: 6,
  },
  sourceInputRowError: {
    borderColor: '#EF4444',
  },
  sourceInputSymbol: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    color: '#34D399',
    fontWeight: '800',
  },
  sourceInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F6F9F5',
    paddingVertical: 6,
  },
  maxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  maxBtnText: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#F59E0B',
    fontWeight: '800',
  },
  removeSourceBtn: {
    padding: 6,
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
  submitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0E432A',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    padding: 18,
    gap: 12,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calendarNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  calendarMonthTitle: {
    fontSize: 15,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  calendarWeekText: {
    width: 38,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#8CA394',
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  calendarCellSelected: {
    backgroundColor: '#10B981',
  },
  calendarCellToday: {
    borderWidth: 1,
    borderColor: '#34D399',
  },
  calendarCellText: {
    fontSize: 13,
    fontFamily: CedarTypography.body,
    color: '#CAD6C9',
  },
  calendarCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarCellTextToday: {
    color: '#34D399',
    fontWeight: '700',
  },
  calendarCloseBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 4,
  },
  calendarCloseBtnText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  selectionModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0E432A',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    padding: 16,
    gap: 10,
  },
  selectionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectionModalTitle: {
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sourceGroupTitle: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#34D399',
    fontWeight: '800',
    letterSpacing: 0.5,
    marginVertical: 6,
  },
  selectionModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  selectionModalItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  selectionModalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  selectionModalItemText: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#CAD6C9',
  },
  selectionModalItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  sourceModalItemSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#8CA394',
    marginTop: 2,
  },
  actorAvatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorAvatarText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
