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
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
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
  Download,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react-native';
import {
  generateAntiFraudAmounts,
  validateRotationAmount,
  computeTotalRotationAmount,
} from '@credics/core';

export interface QRData {
  id: string;
  merchant_name: string;
  platform?: string;
  status?: string;
  upi_id?: string;
  settlement_time?: string;
  base_payment_link?: string | null;
  last_used_date?: string | null;
  qr_image_url?: string;
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
  const [amountStrings, setAmountStrings] = useState<string[]>(['1940']);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 120Hz Spring Feedback for buttons
  const generateScale = useSharedValue(1);
  const generateAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: generateScale.value }],
  }));

  const submitScale = useSharedValue(1);
  const submitAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: submitScale.value }],
  }));

  // Trigger Under-₹2,000 Anti-Fraud Generation Engine
  const handleGenerate = (mode: 'once' | 'multiple' = paymentMode, count: number = splitCount) => {
    const raw = generateAntiFraudAmounts(mode, count);
    setAmountStrings(raw.map((n) => String(n)));
  };

  useEffect(() => {
    if (visible) {
      if (cards.length > 0 && !selectedCardId) {
        setSelectedCardId(cards[0].id);
      }
      handleGenerate(paymentMode, splitCount);
    }
  }, [visible, cards]);

  const handleModeChange = (mode: 'once' | 'multiple') => {
    setPaymentMode(mode);
    handleGenerate(mode, splitCount);
  };

  const handleSplitCountChange = (count: number) => {
    setSplitCount(count);
    handleGenerate(paymentMode, count);
  };

  // Editable Amount Handler
  const handleAmountEdit = (index: number, text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const updated = [...amountStrings];
    updated[index] = cleaned;
    setAmountStrings(updated);
  };

  // Validation across all entries
  const validationResults = amountStrings.map((s) => {
    const num = Number(s);
    return validateRotationAmount(num);
  });
  const hasError = validationResults.some((v) => !v.isValid);
  const firstErrorMessage = validationResults.find((v) => !v.isValid)?.error;

  const numericAmounts = amountStrings.map((s) => Number(s) || 0);
  const grandTotal = computeTotalRotationAmount(numericAmounts);

  // Download / View QR Code
  const handleDownloadQr = async () => {
    if (!qr?.qr_image_url) {
      Alert.alert('Notice', 'No image URL available for this QR.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(qr.qr_image_url);
      if (supported) {
        await Linking.openURL(qr.qr_image_url);
      } else {
        Alert.alert('QR Image Link', qr.qr_image_url);
      }
    } catch {
      Alert.alert('Notice', 'Unable to open QR image.');
    }
  };

  // UPI Link generation matching Web canonical policy
  const getCleanPaymentLink = (amountVal?: number) => {
    if (!qr) return '#';
    // Web parity: If custom base_payment_link exists, do not corrupt it with query params
    if (qr.base_payment_link) {
      return qr.base_payment_link;
    }
    const upi = qr.upi_id || '';
    const name = encodeURIComponent(qr.merchant_name || 'Merchant');
    if (amountVal && amountVal > 0) {
      return `upi://pay?pa=${upi}&pn=${name}&am=${amountVal}&cu=INR`;
    }
    return `upi://pay?pa=${upi}&pn=${name}&cu=INR`;
  };

  const handleOpenUpi = async (amountVal?: number) => {
    const url = getCleanPaymentLink(amountVal);
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(`upi://pay?pa=${qr?.upi_id || ''}&cu=INR`);
      }
    } catch {
      Alert.alert('Payment Link', 'Unable to open UPI app directly. Please launch your payment app manually.');
    }
  };

  // Submit Rotation Record
  const handleSave = async () => {
    if (!qr || !selectedCardId || grandTotal <= 0 || hasError) {
      Alert.alert('Validation Error', firstErrorMessage || 'Please enter valid amounts under ₹2,000.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onRecordRotation({
        cardId: selectedCardId,
        qrId: qr.id,
        amount: grandTotal,
        remarks: 'Qr rotation withdraw',
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
    <SwipeDownDrawer visible={visible} onClose={onClose} heightPercent={0.92}>
      <View style={styles.container}>
        {/* Header Bar */}
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
          {/* ================= 1. QR CODE DISPLAY & DOWNLOAD ================= */}
          <View style={styles.qrVisualSection}>
            <View style={styles.qrVisualCard}>
              {qr.qr_image_url ? (
                <Image
                  source={{ uri: qr.qr_image_url }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.qrPlaceholderBox}>
                  <QrCode size={56} color="#A0B3A6" />
                  <Text style={styles.qrPlaceholderText}>Photo Not Available</Text>
                </View>
              )}
            </View>

            {qr.qr_image_url ? (
              <TouchableOpacity
                style={styles.downloadQrBtn}
                onPress={handleDownloadQr}
                activeOpacity={0.8}
              >
                <Download size={13} color="#0B3F28" />
                <Text style={styles.downloadQrBtnText}>Download QR Photo</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ================= 2. PAYMENT STRATEGY & ENGINE ================= */}
          <View style={styles.sectionBox}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.fieldLabel}>Payment Strategy</Text>
              <Text style={styles.engineBadge}>Under ₹2,000 Anti-Fraud</Text>
            </View>

            {/* Mode Selector */}
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

            {/* Split Count Selector */}
            {paymentMode === 'multiple' && (
              <View style={styles.splitRow}>
                {[2, 3].map((count) => {
                  const isActive = splitCount === count;
                  return (
                    <TouchableOpacity
                      key={count}
                      style={[styles.splitPill, isActive && styles.splitPillActive]}
                      onPress={() => handleSplitCountChange(count)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.splitPillText, isActive && styles.splitPillTextActive]}>
                        {count} Swipes
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Generate Amount Action Button */}
            <Animated.View style={generateAnimStyle}>
              <TouchableOpacity
                style={styles.generateBtn}
                onPress={() => {
                  generateScale.value = withSpring(0.96, { damping: 12, stiffness: 260 }, () => {
                    generateScale.value = withSpring(1, { damping: 12, stiffness: 260 });
                  });
                  handleGenerate();
                }}
                activeOpacity={0.88}
              >
                <View style={styles.generateBtnLeft}>
                  <Zap size={15} color="#0B3F28" />
                  <Text style={styles.generateBtnText}>Generate Random Amounts</Text>
                </View>
                <RefreshCw size={13} color="#4A6B56" />
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* ================= 3. EDITABLE AMOUNT INPUTS ================= */}
          <View style={styles.sectionBox}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.fieldLabel}>Generated Amounts (Editable)</Text>
              <Text style={styles.fieldSubLabel}>Max ₹1,999 per swipe</Text>
            </View>

            <View style={styles.amountsList}>
              {amountStrings.map((amtStr, idx) => {
                const num = Number(amtStr) || 0;
                const isInvalid = num <= 0 || num >= 2000;
                return (
                  <View key={idx} style={[styles.amountCardRow, isInvalid && styles.amountCardRowError]}>
                    <View style={styles.swipeBadge}>
                      <Text style={styles.swipeBadgeText}>
                        {amountStrings.length > 1 ? `Swipe ${idx + 1}` : 'Amount'}
                      </Text>
                    </View>

                    <View style={styles.amountInputWrap}>
                      <Text style={styles.currencyPrefix}>₹</Text>
                      <TextInput
                        style={styles.amountField}
                        value={amtStr}
                        onChangeText={(txt) => handleAmountEdit(idx, txt)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#A0B3A6"
                        maxLength={4}
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.quickPayBtn}
                      onPress={() => handleOpenUpi(num)}
                      activeOpacity={0.8}
                    >
                      <Send size={11} color="#FFFFFF" />
                      <Text style={styles.quickPayBtnText}>Pay</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* Error Message Notice if any amount exceeds ₹2000 */}
            {hasError && (
              <View style={styles.errorNoticeBox}>
                <AlertTriangle size={13} color="#D92D20" />
                <Text style={styles.errorNoticeText}>
                  {firstErrorMessage || 'Each amount must be strictly under ₹2,000'}
                </Text>
              </View>
            )}

            {/* ================= 4. AGGREGATE TOTAL SUMMARY ================= */}
            <View style={styles.aggregateSummaryCard}>
              <View style={styles.aggregateTopRow}>
                <Text style={styles.aggregateLabel}>TOTAL ROTATION WITHDRAWAL</Text>
                <Text style={styles.aggregateValue}>₹{grandTotal.toLocaleString('en-IN')}</Text>
              </View>
              {amountStrings.length > 1 && (
                <View style={styles.aggregateBreakdownRow}>
                  <Text style={styles.aggregateBreakdownText}>
                    Calculation: {amountStrings.map((a) => `₹${Number(a) || 0}`).join(' + ')}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ================= 5. PAYING CREDIT CARD ================= */}
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

          {/* ================= 6. LAUNCH UPI PAYMENT APP ================= */}
          <TouchableOpacity
            style={styles.upiLaunchBtn}
            onPress={() => handleOpenUpi()}
            activeOpacity={0.85}
          >
            <View style={styles.upiLaunchLeft}>
              <Send size={15} color="#0B3F28" />
              <View>
                <Text style={styles.upiLaunchBtnText}>Launch UPI Payment App</Text>
                <Text style={styles.upiLaunchBtnSub}>Enter amount manually in payment app</Text>
              </View>
            </View>
            <ArrowRight size={14} color="#0B3F28" />
          </TouchableOpacity>
        </DrawerScrollView>

        {/* ================= 7. FOOTER SUBMIT BUTTON ================= */}
        <View style={styles.footerContainer}>
          <Animated.View style={submitAnimStyle}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (isSubmitting || hasError || grandTotal <= 0) && styles.submitBtnDisabled,
              ]}
              onPress={() => {
                submitScale.value = withSpring(0.96, { damping: 12, stiffness: 260 }, () => {
                  submitScale.value = withSpring(1, { damping: 12, stiffness: 260 });
                });
                handleSave();
              }}
              disabled={isSubmitting || hasError || grandTotal <= 0}
              activeOpacity={0.88}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>
                    RECORD ROTATION (₹{grandTotal.toLocaleString('en-IN')})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
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
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 14,
  },
  qrVisualSection: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrVisualCard: {
    width: 168,
    height: 168,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  qrPlaceholderBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  qrPlaceholderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8CA394',
  },
  downloadQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  downloadQrBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B3F28',
  },
  sectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4A6B56',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  fieldSubLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8CA394',
  },
  engineBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  modeBtnActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
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
  },
  splitPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  splitPillActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
  },
  splitPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
  },
  splitPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E2ECE4',
    borderWidth: 1,
    borderColor: '#D4E2D7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  generateBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  generateBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0B3F28',
  },
  amountsList: {
    gap: 8,
  },
  amountCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF3EE',
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  amountCardRowError: {
    borderColor: '#FDA29B',
    backgroundColor: '#FEF3F2',
  },
  swipeBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  swipeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4A6B56',
    letterSpacing: 0.2,
  },
  amountInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: '#072C1C',
    marginRight: 4,
  },
  amountField: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#072C1C',
    padding: 0,
  },
  quickPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0B3F28',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickPayBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3F2',
    borderWidth: 1,
    borderColor: '#FECDCA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  errorNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D92D20',
  },
  aggregateSummaryCard: {
    backgroundColor: '#EFF8F2',
    borderWidth: 1.2,
    borderColor: '#D1E9D7',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  aggregateTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aggregateLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2B6E4A',
    letterSpacing: 0.5,
  },
  aggregateValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#072C1C',
  },
  aggregateBreakdownRow: {
    borderTopWidth: 1,
    borderTopColor: '#D1E9D7',
    paddingTop: 4,
    marginTop: 2,
  },
  aggregateBreakdownText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4A6B56',
  },
  cardScroll: {
    flexDirection: 'row',
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF3EE',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
  },
  cardItemActive: {
    backgroundColor: '#0B3F28',
    borderColor: '#072C1C',
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
    color: '#658270',
    marginTop: 1,
  },
  cardItemSubActive: {
    color: '#CAD6C9',
  },
  upiLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  upiLaunchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upiLaunchBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B3F28',
  },
  upiLaunchBtnSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#658270',
    marginTop: 1,
  },
  footerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#DFE8E0',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0B3F28',
    borderRadius: 14,
    paddingVertical: 14,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
