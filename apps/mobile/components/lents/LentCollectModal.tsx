import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import {
  ArrowDownLeft,
  Banknote,
  CreditCard,
  Wallet,
  Calendar,
  ShieldCheck,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CardData } from './LentGiveModal';

export interface LentCollectSubmitParams {
  amount: number;
  date: string;
  sourceType: 'cash_on_hand' | 'credit_card' | 'pocket';
  cardId?: string;
  remarks?: string;
}

interface LentCollectModalProps {
  visible: boolean;
  onClose: () => void;
  borrowerName: string;
  cards: CardData[];
  onSave: (params: LentCollectSubmitParams) => Promise<void>;
}

const getTodayIST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function LentCollectModal({
  visible,
  onClose,
  borrowerName,
  cards,
  onSave,
}: LentCollectModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayIST());
  const [sourceType, setSourceType] = useState<'cash_on_hand' | 'credit_card' | 'pocket'>(
    'cash_on_hand'
  );
  const [selectedCardId, setSelectedCardId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount('');
      setDate(getTodayIST());
      setSourceType('cash_on_hand');
      setRemarks('');
      if (cards.length > 0) {
        setSelectedCardId(cards[0].id);
      }
    }
  }, [visible, cards]);

  const numAmount = Number(amount) || 0;

  const handleSave = async () => {
    if (numAmount <= 0) {
      Alert.alert('Required', 'Please enter a valid recovery amount.');
      return;
    }
    if (!date) {
      Alert.alert('Required', 'Please specify a transaction date.');
      return;
    }
    if (sourceType !== 'pocket' && !selectedCardId) {
      Alert.alert('Required', 'Please select a destination card.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        amount: numAmount,
        date,
        sourceType,
        cardId: sourceType === 'pocket' ? undefined : selectedCardId,
        remarks: remarks.trim() || undefined,
      });

      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to record loan recovery');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer
      visible={visible}
      onClose={onClose}
      heightPercent={0.88}
      title="You Got Payment"
      subtitle={`Receiving recovery from ${borrowerName}`}
    >
      <View style={styles.container}>
        <DrawerScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount Input Hero */}
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>RECEIVED AMOUNT</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor="#A0B3A6"
                keyboardType="numeric"
                autoFocus
              />
            </View>
          </View>

          {/* Destination Selector */}
          <Text style={styles.sectionTitle}>DEPOSIT DESTINATION</Text>
          <View style={styles.sourceChoiceRow}>
            <TouchableOpacity
              style={[
                styles.sourceChoiceBtn,
                sourceType === 'cash_on_hand' && styles.sourceChoiceBtnActive,
              ]}
              onPress={() => setSourceType('cash_on_hand')}
              activeOpacity={0.8}
            >
              <Banknote
                size={18}
                color={sourceType === 'cash_on_hand' ? '#0E4426' : '#658270'}
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.sourceChoiceText,
                  sourceType === 'cash_on_hand' && styles.sourceChoiceTextActive,
                ]}
              >
                Cash on Hand
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sourceChoiceBtn,
                sourceType === 'credit_card' && styles.sourceChoiceBtnActive,
              ]}
              onPress={() => setSourceType('credit_card')}
              activeOpacity={0.8}
            >
              <CreditCard
                size={18}
                color={sourceType === 'credit_card' ? '#0E4426' : '#658270'}
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.sourceChoiceText,
                  sourceType === 'credit_card' && styles.sourceChoiceTextActive,
                ]}
              >
                Card Bill Pay
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sourceChoiceBtn,
                sourceType === 'pocket' && styles.sourceChoiceBtnActive,
              ]}
              onPress={() => setSourceType('pocket')}
              activeOpacity={0.8}
            >
              <Wallet
                size={18}
                color={sourceType === 'pocket' ? '#0E4426' : '#658270'}
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.sourceChoiceText,
                  sourceType === 'pocket' && styles.sourceChoiceTextActive,
                ]}
              >
                Pocket
              </Text>
            </TouchableOpacity>
          </View>

          {/* Destination Card Selector */}
          {sourceType !== 'pocket' && (
            <View style={styles.cardSection}>
              <Text style={styles.sectionTitle}>
                {sourceType === 'credit_card'
                  ? 'SELECT CARD TO PAY BILL'
                  : 'SELECT CARD CASH VAULT'}
              </Text>
              <View style={styles.cardList}>
                {cards.map((c) => {
                  const isSelected = selectedCardId === c.id;

                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.cardItem, isSelected && styles.cardItemActive]}
                      onPress={() => setSelectedCardId(c.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.cardItemTop}>
                        <CreditCard
                          size={15}
                          color={isSelected ? '#0E4426' : '#658270'}
                          strokeWidth={2.2}
                        />
                        <Text style={styles.cardItemName} numberOfLines={1}>
                          {c.card_name}
                        </Text>
                        <Text style={styles.cardItemDigits}>(**{c.last_4_digits})</Text>
                      </View>
                      <Text style={styles.cardSubText}>
                        {sourceType === 'credit_card'
                          ? 'Received amount will directly pay down this card bill'
                          : 'Deposits into cash on hand for this card'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Date & Remarks */}
          <Text style={styles.sectionTitle}>DETAILS</Text>
          <View style={styles.inputCard}>
            <View style={styles.inputRow}>
              <Calendar size={16} color="#658270" strokeWidth={2.2} />
              <TextInput
                style={styles.textInput}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#A0B3A6"
              />
            </View>

            <View style={styles.inputDivider} />

            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { marginLeft: 0 }]}
                value={remarks}
                onChangeText={setRemarks}
                placeholder="Remarks / Note (Optional)"
                placeholderTextColor="#A0B3A6"
              />
            </View>
          </View>
        </DrawerScrollView>

        {/* Submit Action Button */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (numAmount <= 0 || isSubmitting) && styles.submitBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={numAmount <= 0 || isSubmitting}
            activeOpacity={0.88}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <ArrowDownLeft size={17} color="#FFFFFF" strokeWidth={2.6} />
                <Text style={styles.submitBtnText}>
                  RECORD PAYMENT RECEIVED (₹{numAmount.toLocaleString('en-IN')})
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
    backgroundColor: '#F8FBF8',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 95,
  },
  amountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#658270',
    letterSpacing: 0.8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: '900',
    color: '#10B981',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 34,
    fontWeight: '900',
    color: '#072C1C',
    minWidth: 120,
    textAlign: 'center',
    padding: 0,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4A6B56',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  sourceChoiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  sourceChoiceBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    gap: 5,
  },
  sourceChoiceBtnActive: {
    borderColor: '#0E4426',
    backgroundColor: '#EBF4ED',
    borderWidth: 1.6,
  },
  sourceChoiceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#658270',
  },
  sourceChoiceTextActive: {
    color: '#0E4426',
    fontWeight: '800',
  },
  cardSection: {
    marginBottom: 14,
  },
  cardList: {
    gap: 8,
  },
  cardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
  },
  cardItemActive: {
    borderColor: '#0E4426',
    backgroundColor: '#F3F8F4',
    borderWidth: 1.6,
  },
  cardItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardItemName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#072C1C',
    flex: 1,
  },
  cardItemDigits: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8CA394',
  },
  cardSubText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#718C79',
    marginTop: 4,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    marginBottom: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#072C1C',
    padding: 0,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#F0F4F1',
    marginVertical: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.2,
    borderTopColor: '#DFE8E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  submitBtn: {
    backgroundColor: '#10B981',
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
});
