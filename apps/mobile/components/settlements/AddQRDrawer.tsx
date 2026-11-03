import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SwipeDownDrawer, DrawerScrollView } from '../SwipeDownDrawer';
import { QrCode, ShieldCheck, CheckCircle2 } from 'lucide-react-native';
import { CardData } from './QRPaymentModal';

interface AddQRDrawerProps {
  visible: boolean;
  onClose: () => void;
  cards: CardData[];
  onSaveQR: (params: {
    merchant_name: string;
    upi_id: string;
    platform: string;
    settlement_time: string;
    base_payment_link?: string;
    is_static: boolean;
    card_id?: string;
  }) => Promise<void>;
}

const PLATFORMS = ['PhonePe', 'Paytm', 'GooglePay', 'BharatPe', 'AmazonPay', 'BHIM'];
const SETTLEMENT_TIMES = ['T+0 Instant', 'T+1 Morning', 'T+1 Evening'];

export function AddQRDrawer({ visible, onClose, cards, onSaveQR }: AddQRDrawerProps) {
  const [isStatic, setIsStatic] = useState(false);
  const [merchantName, setMerchantName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [platform, setPlatform] = useState('PhonePe');
  const [settlementTime, setSettlementTime] = useState('T+0 Instant');
  const [basePaymentLink, setBasePaymentLink] = useState('');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsStatic(false);
      setMerchantName('');
      setUpiId('');
      setPlatform('PhonePe');
      setSettlementTime('T+0 Instant');
      setBasePaymentLink('');
      if (cards.length > 0) setSelectedCardId(cards[0].id);
    }
  }, [visible, cards]);

  const handleSave = async () => {
    if (!merchantName.trim()) {
      Alert.alert('Required', 'Please enter Merchant Name.');
      return;
    }

    if (!isStatic && !upiId.trim()) {
      Alert.alert('Required', 'Please enter UPI ID for Dynamic QR.');
      return;
    }

    setIsSubmitting(true);
    try {
      const generatedStaticUpi = `static_${merchantName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
      await onSaveQR({
        merchant_name: merchantName.trim(),
        upi_id: isStatic ? generatedStaticUpi : upiId.trim(),
        platform: isStatic ? 'Static' : platform,
        settlement_time: isStatic ? 'N/A' : settlementTime,
        base_payment_link: basePaymentLink.trim() || undefined,
        is_static: isStatic,
        card_id: selectedCardId || (cards.length > 0 ? cards[0].id : undefined),
      });
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add QR.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SwipeDownDrawer visible={visible} onClose={onClose} heightPercent={0.85}>
      <View style={styles.headerBox}>
        <View style={styles.iconSquare}>
          <QrCode size={22} color="#10B981" />
        </View>
        <View style={styles.headerDetailsCol}>
          <Text style={styles.title}>Add New Merchant QR</Text>
          <Text style={styles.subTitle}>Register liquidity rotation endpoint</Text>
        </View>
      </View>

      <DrawerScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
        {/* Dynamic vs Static Toggle */}
        <View style={styles.switchBox}>
          <View style={styles.switchLeft}>
            <Text style={styles.switchTitle}>Static Vault Standee QR</Text>
            <Text style={styles.switchSub}>
              Enable for offline standees without UPI intent links
            </Text>
          </View>
          <Switch
            value={isStatic}
            onValueChange={setIsStatic}
            trackColor={{ false: '#DFE8E0', true: '#10B981' }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Merchant Name */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Merchant / Business Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Maa Tara Enterprise"
            placeholderTextColor="#8CA394"
            value={merchantName}
            onChangeText={setMerchantName}
          />
        </View>

        {/* UPI ID (Hidden if Static) */}
        {!isStatic && (
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>UPI ID (VPA)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. merchant@icici"
              placeholderTextColor="#8CA394"
              value={upiId}
              onChangeText={setUpiId}
              autoCapitalize="none"
            />
          </View>
        )}

        {/* Platform Selection */}
        {!isStatic && (
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Provider Platform</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
              {PLATFORMS.map((p) => {
                const isSelected = platform === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.pill, isSelected && styles.pillActive]}
                    onPress={() => setPlatform(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Settlement Time */}
        {!isStatic && (
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Expected Settlement Speed</Text>
            <View style={styles.settleRow}>
              {SETTLEMENT_TIMES.map((st) => {
                const isSelected = settlementTime === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.settleBtn, isSelected && styles.settleBtnActive]}
                    onPress={() => setSettlementTime(st)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.settleBtnText, isSelected && styles.settleBtnTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Base Payment Link (Optional) */}
        {!isStatic && (
          <View style={styles.sectionBox}>
            <Text style={styles.fieldLabel}>Base UPI Payment Link (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. upi://pay?pa=... or PhonePe Link"
              placeholderTextColor="#8CA394"
              value={basePaymentLink}
              onChangeText={setBasePaymentLink}
              autoCapitalize="none"
            />
          </View>
        )}

        {/* Owning Card Link */}
        <View style={styles.sectionBox}>
          <Text style={styles.fieldLabel}>Link to Vault Card</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
            {cards.map((c) => {
              const isSelected = selectedCardId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.cardPill, isSelected && styles.cardPillActive]}
                  onPress={() => setSelectedCardId(c.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cardPillText, isSelected && styles.cardPillTextActive]}>
                    {c.card_name} (**{c.last_4_digits})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </DrawerScrollView>

      {/* Footer Save Button */}
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
              <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.saveBtnText}>Save Merchant QR to Vault</Text>
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
  switchBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF3EE',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  switchLeft: {
    flex: 1,
    marginRight: 12,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
  },
  switchSub: {
    fontSize: 10,
    fontWeight: '500',
    color: '#4A6B56',
    marginTop: 2,
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
  pillsScroll: {
    flexDirection: 'row',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  settleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  settleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
  },
  settleBtnActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
  },
  settleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  settleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  cardPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    marginRight: 8,
  },
  cardPillActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#0B3F28',
  },
  cardPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#072C1C',
  },
  cardPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#DFE8E0',
    backgroundColor: '#FFFFFF',
  },
  saveBtn: {
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
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
