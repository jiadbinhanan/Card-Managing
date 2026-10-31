import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Modal, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { CedarColors, CedarTypography } from '@credics/core';
import { HapticButton } from './HapticButton';
import { AlertTriangle, X, ArrowRight, RefreshCw, ShieldAlert } from 'lucide-react-native';
import { requestOverlayPermission } from '../utils/overlayPermission';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.40;

interface UrgentBillBottomSheetProps {
  visible: boolean;
  cardName?: string;
  last4Digits?: string;
  dueAmount?: number;
  dueDate?: string;
  amountDue?: number;
  daysLeft?: number;
  onPayNow?: () => void;
  onRotateLimit?: () => void;
  onClose: () => void;
}

export function UrgentBillBottomSheet({
  visible,
  cardName = 'Primary Credit Vault',
  last4Digits = '••••',
  dueAmount,
  dueDate = 'Soon',
  amountDue,
  daysLeft = 1,
  onPayNow,
  onRotateLimit,
  onClose,
}: UrgentBillBottomSheetProps) {
  const translateY = useSharedValue(SHEET_HEIGHT);
  const displayAmount = dueAmount !== undefined ? dueAmount : (amountDue || 0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 350,
      });
    } else {
      translateY.value = SHEET_HEIGHT;
    }
  }, [visible]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => {
    const opacity = (1 - translateY.value / SHEET_HEIGHT) * 0.55;
    return {
      opacity: Math.max(0, Math.min(0.55, opacity)),
    };
  });

  const handleDismiss = () => {
    Haptics.selectionAsync();
    translateY.value = withSpring(SHEET_HEIGHT, { damping: 30, stiffness: 450, mass: 0.6 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.sheet, animatedSheetStyle]}>
              {/* Drag Handle */}
              <View style={styles.dragHandle} />

              {/* Alert Header */}
              <View style={styles.header}>
                <View style={styles.alertBadge}>
                  <AlertTriangle size={15} color="#F6F9F5" />
                  <Text style={styles.alertBadgeText}>
                    {daysLeft <= 1 ? 'BILL DUE IN 24 HOURS' : `BILL DUE IN ${daysLeft} DAYS`}
                  </Text>
                </View>
                <HapticButton onPress={handleDismiss} style={styles.closeBtn} feedbackType="rigid">
                  <X size={20} color={CedarColors.ink700} />
                </HapticButton>
              </View>

              {/* Card & Amount Row */}
              <View style={styles.amountContainer}>
                <View>
                  <Text style={styles.cardLabel}>{cardName} (•• {last4Digits})</Text>
                  <Text style={styles.dueSubLabel}>Due Date: {dueDate}</Text>
                </View>
                <Text style={styles.amountText}>₹{displayAmount.toLocaleString('en-IN')}</Text>
              </View>

              {/* Actions Row */}
              <View style={styles.actionsContainer}>
                <HapticButton
                  style={[styles.btn, styles.payBtn]}
                  onPress={onPayNow || handleDismiss}
                  feedbackType="rigid"
                >
                  <Text style={styles.payBtnText}>Pay Bill Now</Text>
                  <ArrowRight size={18} color="#F6F9F5" strokeWidth={2.4} />
                </HapticButton>

                <HapticButton
                  style={[styles.btn, styles.rotateBtn]}
                  onPress={onRotateLimit || handleDismiss}
                  feedbackType="rigid"
                >
                  <RefreshCw size={16} color={CedarColors.forest800} strokeWidth={2.2} />
                  <Text style={styles.rotateBtnText}>Rotate Limit</Text>
                </HapticButton>
              </View>

              {/* Background Overlay Permission Link */}
              <HapticButton
                style={styles.overlayPermBtn}
                onPress={requestOverlayPermission}
                feedbackType="rigid"
              >
                <ShieldAlert size={14} color="#2E944B" />
                <Text style={styles.overlayPermText}>
                  Enable "Display Over Other Apps" for background alert popups
                </Text>
              </HapticButton>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 26, 18, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: CedarColors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: CedarColors.negative,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 24,
  },
  dragHandle: {
    width: 44,
    height: 4,
    backgroundColor: CedarColors.borderDark,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CedarColors.negative,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  alertBadgeText: {
    color: '#F6F9F5',
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 6,
  },
  amountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.canvas,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CedarColors.border,
    marginBottom: 16,
  },
  cardLabel: {
    color: CedarColors.ink900,
    fontSize: 14,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  dueSubLabel: {
    color: CedarColors.ink500,
    fontSize: 11,
    fontFamily: CedarTypography.body,
    marginTop: 2,
  },
  amountText: {
    color: CedarColors.negative,
    fontSize: 20,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  payBtn: {
    backgroundColor: CedarColors.forest800,
  },
  payBtnText: {
    color: '#F6F9F5',
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  rotateBtn: {
    backgroundColor: CedarColors.canvas,
    borderWidth: 1,
    borderColor: CedarColors.border,
  },
  rotateBtnText: {
    color: CedarColors.forest800,
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
  },
  overlayPermBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  overlayPermText: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
});
