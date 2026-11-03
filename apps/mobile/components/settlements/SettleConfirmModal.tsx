import React, { useState, useEffect } from 'react';
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
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import { CheckCircle2, User, CreditCard, Banknote } from 'lucide-react-native';
import { InTransitTransaction } from './InTransitTab';

export interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  phone?: string;
}

export interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  is_primary: boolean;
  parent_card_id?: string;
  total_limit?: number;
}

interface SettleConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  tx: InTransitTransaction | null;
  profiles: Profile[];
  cards: CardData[];
  currentUserId?: string;
  defaultCardId?: string;
  onConfirm: (params: {
    tx: InTransitTransaction;
    amtToSettle: number;
    cashReceiverId: string;
    settleTargetCardId: string;
    remarks: string;
  }) => Promise<void>;
}

export function SettleConfirmModal({
  visible,
  onClose,
  tx,
  profiles,
  cards,
  currentUserId,
  defaultCardId,
  onConfirm,
}: SettleConfirmModalProps) {
  const [settlementType, setSettlementType] = useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = useState('');
  const [cashReceiverId, setCashReceiverId] = useState('');
  const [settleTargetCardId, setSettleTargetCardId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && tx) {
      setSettlementType('full');
      setPartialAmount('');
      setRemarks('');
      setCashReceiverId(currentUserId || (profiles.length > 0 ? profiles[0].id : ''));
      setSettleTargetCardId(
        defaultCardId !== 'all' && defaultCardId
          ? defaultCardId
          : tx.card_id || (cards.length > 0 ? cards[0].id : '')
      );
    }
  }, [visible, tx, currentUserId, defaultCardId, cards, profiles]);

  if (!tx) return null;

  const currentDue =
    tx.settlement_details?.total_due !== undefined
      ? Number(tx.settlement_details.total_due)
      : Number(tx.amount);

  const handleConfirm = async () => {
    if (!cashReceiverId || !settleTargetCardId) {
      Alert.alert('Required Fields', 'Please select cash receiver and target card.');
      return;
    }

    let amt = currentDue;
    if (settlementType === 'partial') {
      const p = Number(partialAmount);
      if (!p || isNaN(p) || p <= 0) {
        Alert.alert('Invalid Amount', 'Please enter a valid partial amount.');
        return;
      }
      if (p > currentDue) {
        Alert.alert('Exceeds Due', `Amount cannot exceed current due of ₹${currentDue.toLocaleString('en-IN')}`);
        return;
      }
      amt = p;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        tx,
        amtToSettle: amt,
        cashReceiverId,
        settleTargetCardId,
        remarks: remarks.trim(),
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to complete settlement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer visible={visible} onClose={onClose} heightPercent={0.8}>
      <View style={styles.headerBox}>
        <View style={styles.iconSquare}>
          <Banknote size={22} color="#10B981" />
        </View>
        <View style={styles.headerDetailsCol}>
          <Text style={styles.title}>Confirm Settlement</Text>
          <Text style={styles.subTitle} numberOfLines={1}>
            Crediting Cash on Hand from {tx.merchant_name || 'Rotation'}
          </Text>
        </View>
      </View>

      <DrawerScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
        {/* Full vs Partial Toggle */}
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeBtn, settlementType === 'full' && styles.typeBtnActive]}
            onPress={() => setSettlementType('full')}
            activeOpacity={0.8}
          >
            <Text style={[styles.typeBtnText, settlementType === 'full' && styles.typeBtnTextActive]}>
              Full Settle (₹{currentDue.toLocaleString('en-IN')})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeBtn, settlementType === 'partial' && styles.typeBtnActive]}
            onPress={() => setSettlementType('partial')}
            activeOpacity={0.8}
          >
            <Text style={[styles.typeBtnText, settlementType === 'partial' && styles.typeBtnTextActive]}>
              Partial Settlement
            </Text>
          </TouchableOpacity>
        </View>

        {/* Partial Amount Input */}
        {settlementType === 'partial' && (
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Partial Received Amount (₹)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholder={`Max ₹${currentDue.toLocaleString('en-IN')}`}
              placeholderTextColor="#8CA394"
              value={partialAmount}
              onChangeText={setPartialAmount}
            />
          </View>
        )}

        {/* Cash Receiver Selector */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Cash Receiver</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {profiles.map((p) => {
              const isSelected = cashReceiverId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.userChip, isSelected && styles.userChipActive]}
                  onPress={() => setCashReceiverId(p.id)}
                  activeOpacity={0.8}
                >
                  <User size={13} color={isSelected ? '#FFFFFF' : '#0B3F28'} />
                  <Text style={[styles.userChipText, isSelected && styles.userChipTextActive]}>
                    {p.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Target Card Destination */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Target Card (Cash Ledger Destination)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {cards.map((c) => {
              const isSelected = settleTargetCardId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.cardChip, isSelected && styles.cardChipActive]}
                  onPress={() => setSettleTargetCardId(c.id)}
                  activeOpacity={0.8}
                >
                  <CreditCard size={14} color={isSelected ? '#FFFFFF' : '#0B3F28'} />
                  <View>
                    <Text style={[styles.cardChipName, isSelected && styles.cardChipNameActive]}>
                      {c.card_name}
                    </Text>
                    <Text style={[styles.cardChipSub, isSelected && styles.cardChipSubActive]}>
                      **{c.last_4_digits}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Remarks Input */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Settlement Note (Optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Received via GPay"
            placeholderTextColor="#8CA394"
            value={remarks}
            onChangeText={setRemarks}
          />
        </View>
      </DrawerScrollView>

      {/* Footer Confirm Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={isSubmitting}
          activeOpacity={0.88}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.confirmBtnText}>Confirm Settlement</Text>
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
  iconSquare: {
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
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  subTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 2,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
  },
  typeBtnActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A6B56',
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 13,
    color: '#072C1C',
    fontWeight: '700',
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  userChipActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
  },
  userChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#072C1C',
  },
  userChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  cardChip: {
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
  cardChipActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
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
    color: '#4A6B56',
    marginTop: 2,
  },
  cardChipSubActive: {
    color: '#CAD6C9',
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#DFE8E0',
    backgroundColor: '#FFFFFF',
  },
  confirmBtn: {
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
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
