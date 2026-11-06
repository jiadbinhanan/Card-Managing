import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import {
  Banknote,
  CreditCard,
  QrCode,
  CheckCircle2,
  ChevronDown,
  Check,
  Clock,
  Layers,
} from 'lucide-react-native';
import { CardData, QRData } from './QRPaymentModal';

interface ManualRotationDrawerProps {
  visible: boolean;
  onClose: () => void;
  cards: CardData[];
  qrs: QRData[];
  cardAvailableMap: Record<string, number>;
  onSaveRotation: (params: {
    cardId: string;
    qrId?: string;
    amount: number;
    remarks: string;
  }) => Promise<void>;
}

export function ManualRotationDrawer({
  visible,
  onClose,
  cards,
  qrs,
  cardAvailableMap,
  onSaveRotation,
}: ManualRotationDrawerProps) {
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [selectedQrId, setSelectedQrId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (cards.length > 0 && !selectedCardId) {
        setSelectedCardId(cards[0].id);
      }
      setSelectedQrId('');
      setAmount('');
      setRemarks('');
      setIsSubmitting(false);
    }
  }, [visible, cards]);

  const selectedCard = useMemo(() => {
    return cards.find((c) => c.id === selectedCardId) || cards[0];
  }, [cards, selectedCardId]);

  const availableLimit = useMemo(() => {
    if (!selectedCard) return 0;
    return cardAvailableMap[selectedCard.id] || 0;
  }, [selectedCard, cardAvailableMap]);

  const numAmount = Number(amount) || 0;
  const isOverLimit = numAmount > availableLimit;

  const handleSave = async () => {
    if (!selectedCardId) {
      Alert.alert('Select Card', 'Please choose a credit card for this rotation.');
      return;
    }
    if (!numAmount || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid withdrawal amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveRotation({
        cardId: selectedCardId,
        qrId: selectedQrId || undefined,
        amount: numAmount,
        remarks: remarks.trim() || 'Manual Rotation Entry',
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Could not record manual rotation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      title="Manual Rotation"
      subtitle="Record off-QR liquidity withdrawal"
      heightPercent={0.82}
    >
      <View style={styles.container}>
        <DrawerScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Card Selection Box */}
          <View style={styles.sectionBox}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.fieldLabel}>Select Credit Card</Text>
              <Text style={styles.availText}>
                Avail: ₹{availableLimit.toLocaleString('en-IN')}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {cards.map((c) => {
                const isSelected = selectedCardId === c.id;
                const cardAvail = cardAvailableMap[c.id] || 0;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.cardChip, isSelected && styles.cardChipActive]}
                    onPress={() => setSelectedCardId(c.id)}
                    activeOpacity={0.8}
                  >
                    <CreditCard size={15} color={isSelected ? '#FFFFFF' : '#0B3F28'} />
                    <View>
                      <Text style={[styles.cardChipName, isSelected && styles.cardChipNameActive]}>
                        {c.card_name}
                      </Text>
                      <Text style={[styles.cardChipSub, isSelected && styles.cardChipSubActive]}>
                        **{c.last_4_digits} • ₹{cardAvail.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Amount Input */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Withdrawal Amount (₹)</Text>
            <View style={[styles.amountInputRow, isOverLimit && styles.amountInputRowOver]}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#8CA394"
                value={amount}
                onChangeText={setAmount}
              />
              {amount ? (
                <TouchableOpacity onPress={() => setAmount('')} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {isOverLimit && (
              <Text style={styles.overdraftWarning}>
                Amount exceeds available card limit of ₹{availableLimit.toLocaleString('en-IN')}
              </Text>
            )}
          </View>

          {/* Optional QR Linkage Selector */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Link to QR Terminal (Optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              <TouchableOpacity
                style={[styles.qrChip, !selectedQrId && styles.qrChipActive]}
                onPress={() => setSelectedQrId('')}
                activeOpacity={0.8}
              >
                <Banknote size={14} color={!selectedQrId ? '#FFFFFF' : '#4A6B56'} />
                <Text style={[styles.qrChipText, !selectedQrId && styles.qrChipTextActive]}>
                  None (Manual / POS / ATM)
                </Text>
              </TouchableOpacity>

              {qrs.map((q) => {
                const isSelected = selectedQrId === q.id;
                return (
                  <TouchableOpacity
                    key={q.id}
                    style={[styles.qrChip, isSelected && styles.qrChipActive]}
                    onPress={() => setSelectedQrId(q.id)}
                    activeOpacity={0.8}
                  >
                    <QrCode size={14} color={isSelected ? '#FFFFFF' : '#4A6B56'} />
                    <Text style={[styles.qrChipText, isSelected && styles.qrChipTextActive]}>
                      {q.merchant_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Remarks Input */}
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Remarks / Terminal Note</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Swiped at Petrol Pump / POS terminal"
              placeholderTextColor="#8CA394"
              value={remarks}
              onChangeText={setRemarks}
            />
          </View>
        </DrawerScrollView>

        {/* Footer Action Button */}
        <View style={styles.footerContainer}>
          <TouchableOpacity
            style={[styles.saveBtn, isSubmitting && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSubmitting}
            activeOpacity={0.88}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.saveBtnText}>
                  Record Rotation {numAmount > 0 ? `• ₹${numAmount.toLocaleString('en-IN')}` : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SwipeDownDrawer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF3EE',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 14,
  },
  sectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4A6B56',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  availText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  cardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    marginRight: 8,
  },
  cardChipActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
  },
  cardChipName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#072C1C',
  },
  cardChipNameActive: {
    color: '#FFFFFF',
  },
  cardChipSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#658270',
    marginTop: 1,
  },
  cardChipSubActive: {
    color: '#CAD6C9',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF3EE',
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    height: 48,
    marginTop: 6,
  },
  amountInputRowOver: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '800',
    color: '#072C1C',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#072C1C',
    padding: 0,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#DFE8E0',
    borderRadius: 6,
  },
  clearBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4A6B56',
  },
  overdraftWarning: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
    marginTop: 5,
  },
  qrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    marginRight: 8,
    marginTop: 6,
  },
  qrChipActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
  },
  qrChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  qrChipTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#EFF3EE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: '#072C1C',
    marginTop: 6,
  },
  footerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DFE8E0',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0B3F28',
    borderRadius: 14,
    paddingVertical: 14,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
