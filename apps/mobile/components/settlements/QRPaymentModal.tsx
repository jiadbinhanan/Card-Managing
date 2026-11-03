import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import {
  QrCode,
  CreditCard,
  Send,
  Zap,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react-native';

export interface QRData {
  id: string;
  merchant_name: string;
  platform?: string;
  status?: string;
  upi_id?: string;
  settlement_time?: string;
  base_payment_link?: string | null;
  last_used_date?: string | null;
}

export interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary: boolean;
  parent_card_id?: string;
  total_limit?: number;
}

interface QRPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  qr: QRData | null;
  cards: CardData[];
  cardAvailableMap: Record<string, number>;
  onRecordRotation: (params: {
    cardId: string;
    qrId: string;
    amount: number;
    remarks: string;
  }) => Promise<void>;
}

export function QRPaymentModal({
  visible,
  onClose,
  qr,
  cards,
  cardAvailableMap,
  onRecordRotation,
}: QRPaymentModalProps) {
  const [paymentMode, setPaymentMode] = useState<'once' | 'multiple'>('once');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [targetAmount, setTargetAmount] = useState<string>('5000');
  const [generatedAmounts, setGeneratedAmounts] = useState<number[]>([5000]);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (cards.length > 0 && !selectedCardId) {
        setSelectedCardId(cards[0].id);
      }
      generateAmounts(targetAmount, paymentMode, splitCount);
    }
  }, [visible, cards]);

  const generateSplits = (total: number, count: number): number[] => {
    if (count <= 1) return [total];
    let remaining = total;
    const splits: number[] = [];
    for (let i = 0; i < count - 1; i++) {
      const avg = remaining / (count - i);
      const min = Math.max(500, Math.floor(avg * 0.7));
      const max = Math.min(remaining - 500 * (count - i - 1), Math.floor(avg * 1.3));
      const val = Math.floor((Math.random() * (max - min) + min) / 100) * 100;
      splits.push(val);
      remaining -= val;
    }
    splits.push(remaining);
    return splits;
  };

  const generateAmounts = (totalStr: string, mode: 'once' | 'multiple', splits: number) => {
    const total = Number(totalStr) || 0;
    if (total <= 0) {
      setGeneratedAmounts([]);
      return;
    }
    if (mode === 'once') {
      setGeneratedAmounts([total]);
    } else {
      setGeneratedAmounts(generateSplits(total, splits));
    }
  };

  const handleAmountChange = (text: string) => {
    setTargetAmount(text);
    generateAmounts(text, paymentMode, splitCount);
  };

  const handleModeChange = (mode: 'once' | 'multiple') => {
    setPaymentMode(mode);
    generateAmounts(targetAmount, mode, splitCount);
  };

  const handleSplitCountChange = (count: number) => {
    setSplitCount(count);
    generateAmounts(targetAmount, paymentMode, count);
  };

  const getUpiUrl = (amountVal?: number): string => {
    if (!qr) return '#';
    if (qr.base_payment_link) return qr.base_payment_link;
    const upi = qr.upi_id || '';
    const name = encodeURIComponent(qr.merchant_name || 'Merchant');
    if (amountVal && amountVal > 0) {
      return `upi://pay?pa=${upi}&pn=${name}&am=${amountVal}&cu=INR`;
    }
    return `upi://pay?pa=${upi}&pn=${name}&cu=INR`;
  };

  const handleOpenUpi = async (amountVal?: number) => {
    const url = getUpiUrl(amountVal);
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // Fallback generic UPI intent
        await Linking.openURL(`upi://pay?pa=${qr?.upi_id || ''}&cu=INR`);
      }
    } catch (err: any) {
      Alert.alert('Unable to Open UPI', 'Please launch your payment app manually.');
    }
  };

  const handleSave = async () => {
    const totalAmt = Number(targetAmount);
    if (!qr || !selectedCardId || !totalAmt || totalAmt <= 0) {
      Alert.alert('Required Fields', 'Please ensure amount and card are selected.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onRecordRotation({
        cardId: selectedCardId,
        qrId: qr.id,
        amount: totalAmt,
        remarks: `QR Rotation • ${qr.merchant_name} (${paymentMode === 'multiple' ? `${splitCount} splits` : 'Single'})`,
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record rotation withdrawal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!qr) return null;

  return (
    <SwipeDownDrawer visible={visible} onClose={onClose} heightPercent={0.85}>
      <View style={styles.headerBox}>
        <View style={styles.qrIconSquare}>
          <QrCode size={22} color="#10B981" />
        </View>
        <View style={styles.headerDetailsCol}>
          <Text style={styles.merchantTitle} numberOfLines={1}>
            {qr.merchant_name}
          </Text>
          <Text style={styles.merchantUpi} numberOfLines={1}>
            {qr.upi_id || 'Static QR'} • {qr.platform || 'UPI QR'}
          </Text>
        </View>
        <View style={styles.settlementBadge}>
          <Clock size={11} color="#0B3F28" />
          <Text style={styles.settlementBadgeText}>{qr.settlement_time || 'T+0'}</Text>
        </View>
      </View>

      <DrawerScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
        {/* Payment Amount Input */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Total Swipe Amount (₹)</Text>
          <View style={styles.amountInputRow}>
            <Text style={styles.currencySymbol}>₹</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="numeric"
              placeholder="5000"
              placeholderTextColor="#8CA394"
              value={targetAmount}
              onChangeText={handleAmountChange}
            />
          </View>
        </View>

        {/* Payment Mode Selector */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Payment Mode</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, paymentMode === 'once' && styles.modeBtnActive]}
              onPress={() => handleModeChange('once')}
              activeOpacity={0.8}
            >
              <Zap size={14} color={paymentMode === 'once' ? '#FFFFFF' : '#4A6B56'} />
              <Text style={[styles.modeBtnText, paymentMode === 'once' && styles.modeBtnTextActive]}>
                Single Swipe
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, paymentMode === 'multiple' && styles.modeBtnActive]}
              onPress={() => handleModeChange('multiple')}
              activeOpacity={0.8}
            >
              <Layers size={14} color={paymentMode === 'multiple' ? '#FFFFFF' : '#4A6B56'} />
              <Text style={[styles.modeBtnText, paymentMode === 'multiple' && styles.modeBtnTextActive]}>
                Split Batches
              </Text>
            </TouchableOpacity>
          </View>

          {/* Split Count Pills */}
          {paymentMode === 'multiple' && (
            <View style={styles.splitRow}>
              {[2, 3, 4].map((count) => {
                const isActive = splitCount === count;
                return (
                  <TouchableOpacity
                    key={count}
                    style={[styles.splitPill, isActive && styles.splitPillActive]}
                    onPress={() => handleSplitCountChange(count)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.splitPillText, isActive && styles.splitPillTextActive]}>
                      {count} Transactions
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Generated Amounts Display */}
          {generatedAmounts.length > 0 && (
            <View style={styles.generatedBox}>
              <Text style={styles.generatedTitle}>
                {paymentMode === 'multiple' ? 'Split Amounts Generator' : 'Target Amount'}
              </Text>
              <View style={styles.generatedPillsWrap}>
                {generatedAmounts.map((amt, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.amountChip}
                    onPress={() => handleOpenUpi(amt)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.amountChipLeft}>
                      <Text style={styles.amountChipNum}>#{idx + 1}</Text>
                      <Text style={styles.amountChipVal}>₹{amt.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.amountChipPayBtn}>
                      <Send size={11} color="#0B3F28" />
                      <Text style={styles.amountChipPayText}>Pay</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Card Used for Withdrawal */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Paying Credit Card</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardScroll}>
            {cards.map((card) => {
              const isSelected = selectedCardId === card.id;
              const available = cardAvailableMap[card.id] || 0;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.cardItem, isSelected && styles.cardItemActive]}
                  onPress={() => setSelectedCardId(card.id)}
                  activeOpacity={0.8}
                >
                  <CreditCard size={15} color={isSelected ? '#FFFFFF' : '#0B3F28'} />
                  <View>
                    <Text style={[styles.cardItemName, isSelected && styles.cardItemNameActive]}>
                      {card.card_name}
                    </Text>
                    <Text style={[styles.cardItemSub, isSelected && styles.cardItemSubActive]}>
                      **{card.last_4_digits} • Avail: ₹{available.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Quick Launch Direct App Button */}
        <TouchableOpacity
          style={styles.upiLaunchBtn}
          onPress={() => handleOpenUpi()}
          activeOpacity={0.85}
        >
          <Send size={15} color="#0B3F28" />
          <Text style={styles.upiLaunchBtnText}>Launch UPI Payment App</Text>
          <ArrowRight size={14} color="#0B3F28" />
        </TouchableOpacity>
      </DrawerScrollView>

      {/* Footer Submit Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleSave}
          disabled={isSubmitting}
          activeOpacity={0.88}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <CheckCircle2 size={18} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Record Rotation Withdrawal</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#DFE8E0',
    gap: 12,
  },
  qrIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDetailsCol: {
    flex: 1,
  },
  merchantTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  merchantUpi: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 2,
  },
  settlementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E4ECE3',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  settlementBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0B3F28',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  sectionBox: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: 0.2,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DFE8E0',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0B3F28',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#072C1C',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
  },
  modeBtnActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A6B56',
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  splitRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  splitPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  splitPillActive: {
    backgroundColor: '#E4ECE3',
    borderColor: '#0B3F28',
  },
  splitPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  splitPillTextActive: {
    color: '#0B3F28',
    fontWeight: '800',
  },
  generatedBox: {
    backgroundColor: '#EFF3EE',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    marginTop: 6,
  },
  generatedTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#072C1C',
    marginBottom: 8,
  },
  generatedPillsWrap: {
    gap: 8,
  },
  amountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  amountChipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountChipNum: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8CA394',
  },
  amountChipVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
  },
  amountChipPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E4ECE3',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  amountChipPayText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B3F28',
  },
  cardScroll: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
  },
  cardItemActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
  },
  cardItemName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#072C1C',
  },
  cardItemNameActive: {
    color: '#FFFFFF',
  },
  cardItemSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 2,
  },
  cardItemSubActive: {
    color: '#CAD6C9',
  },
  upiLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF3EE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CAD6C9',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  upiLaunchBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0B3F28',
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#DFE8E0',
    backgroundColor: '#FFFFFF',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0B3F28',
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
