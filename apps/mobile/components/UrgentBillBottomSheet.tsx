import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Modal, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { CedarColors } from '@credics/core';
import { HapticButton } from './HapticButton';
import { AlertTriangle, X, ArrowRight, RefreshCw, ShieldAlert } from 'lucide-react-native';
import { requestOverlayPermission } from '../utils/overlayPermission';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.38; // 38% screen height

interface UrgentBillBottomSheetProps {
  visible: boolean;
  cardName: string;
  last4Digits: string;
  dueAmount: number;
  dueDate: string;
  onPayNow: () => void;
  onRotateLimit: () => void;
  onClose: () => void;
}

export function UrgentBillBottomSheet({
  visible,
  cardName,
  last4Digits,
  dueAmount,
  dueDate,
  onPayNow,
  onRotateLimit,
  onClose,
}: UrgentBillBottomSheetProps) {
  const translateY = useSharedValue(SHEET_HEIGHT);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      translateY.value = withSpring(0, {
        damping: 18,
        stiffness: 180,
      });
    } else {
      translateY.value = SHEET_HEIGHT;
    }
  }, [visible]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleDismiss = () => {
    translateY.value = withSpring(SHEET_HEIGHT, { damping: 20 }, (finished) => {
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
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <Animated.View style={[styles.sheet, animatedSheetStyle]}>
              {/* Drag Handle */}
              <View style={styles.dragHandle} />

              {/* Alert Header */}
              <View style={styles.header}>
                <View style={styles.alertBadge}>
                  <AlertTriangle size={18} color="#FFF" />
                  <Text style={styles.alertBadgeText}>BILL DUE IN 24 HOURS</Text>
                </View>
                <HapticButton onPress={handleDismiss} style={styles.closeBtn}>
                  <X size={20} color={CedarColors.pine300} />
                </HapticButton>
              </View>

              {/* Card & Amount Row */}
              <View style={styles.amountContainer}>
                <View>
                  <Text style={styles.cardLabel}>{cardName} (•••• {last4Digits})</Text>
                  <Text style={styles.dueSubLabel}>Due Date: {dueDate}</Text>
                </View>
                <Text style={styles.amountText}>₹{dueAmount.toLocaleString()}</Text>
              </View>

              {/* Actions Row */}
              <View style={styles.actionsContainer}>
                <HapticButton
                  style={[styles.btn, styles.payBtn]}
                  onPress={onPayNow}
                  feedbackType="success"
                >
                  <Text style={styles.payBtnText}>Pay Bill Now</Text>
                  <ArrowRight size={18} color={CedarColors.pine900} />
                </HapticButton>

                <HapticButton
                  style={[styles.btn, styles.rotateBtn]}
                  onPress={onRotateLimit}
                  feedbackType="heavy"
                >
                  <RefreshCw size={16} color={CedarColors.bone} />
                  <Text style={styles.rotateBtnText}>Rotate Limit</Text>
                </HapticButton>
              </View>

              {/* Background Overlay Permission Link */}
              <HapticButton
                style={styles.overlayPermBtn}
                onPress={requestOverlayPermission}
                feedbackType="light"
              >
                <ShieldAlert size={14} color={CedarColors.gold500} />
                <Text style={styles.overlayPermText}>
                  Enable "Display Over Other Apps" for background alerts
                </Text>
              </HapticButton>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: CedarColors.pine900,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: CedarColors.gold500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 24,
  },
  dragHandle: {
    width: 44,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  closeBtn: {
    padding: 6,
  },
  amountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    padding: 16,
    borderRadius: 18,
    marginBottom: 20,
  },
  cardLabel: {
    color: CedarColors.bone,
    fontSize: 14,
    fontWeight: '700',
  },
  dueSubLabel: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  amountText: {
    color: CedarColors.gold500,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  payBtn: {
    backgroundColor: CedarColors.gold500,
    flex: 1.4,
  },
  payBtnText: {
    color: CedarColors.pine900,
    fontSize: 14,
    fontWeight: '800',
  },
  rotateBtn: {
    backgroundColor: CedarColors.pine700,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  rotateBtnText: {
    color: CedarColors.bone,
    fontSize: 13,
    fontWeight: '700',
  },
  overlayPermBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 6,
    paddingVertical: 6,
  },
  overlayPermText: {
    color: CedarColors.gold500,
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
