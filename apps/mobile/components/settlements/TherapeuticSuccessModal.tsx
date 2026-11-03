import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Check, ShieldCheck } from 'lucide-react-native';

interface TherapeuticSuccessModalProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  subtitle?: string;
  amount?: number;
}

export function TherapeuticSuccessModal({
  visible,
  onDismiss,
  title = 'Rotation Recorded',
  subtitle = 'Added to In-Transit liquidity queue',
  amount,
}: TherapeuticSuccessModalProps) {
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(0);
  const ripple1Scale = useSharedValue(1);
  const ripple1Opacity = useSharedValue(0.7);
  const ripple2Scale = useSharedValue(1);
  const ripple2Opacity = useSharedValue(0.5);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Reset values
      scale.value = 0.2;
      opacity.value = 0;
      ripple1Scale.value = 1;
      ripple1Opacity.value = 0.7;
      ripple2Scale.value = 1;
      ripple2Opacity.value = 0.5;
      checkScale.value = 0;

      // Card scale-in
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 14, stiffness: 180 });

      // Checkmark pop
      checkScale.value = withDelay(
        150,
        withSequence(
          withSpring(1.2, { damping: 10, stiffness: 220 }),
          withSpring(1.0, { damping: 14 })
        )
      );

      // Ripple 1
      ripple1Scale.value = withDelay(
        120,
        withTiming(2.2, { duration: 900 })
      );
      ripple1Opacity.value = withDelay(
        120,
        withTiming(0, { duration: 900 })
      );

      // Ripple 2
      ripple2Scale.value = withDelay(
        260,
        withTiming(2.4, { duration: 900 })
      );
      ripple2Opacity.value = withDelay(
        260,
        withTiming(0, { duration: 900 })
      );

      // Auto dismiss timer
      const timer = setTimeout(() => {
        onDismiss();
      }, 1900);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const checkAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const ripple1AnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ripple1Scale.value }],
    opacity: ripple1Opacity.value,
  }));

  const ripple2AnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ripple2Scale.value }],
    opacity: ripple2Opacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <Animated.View style={[styles.card, containerAnimStyle]}>
            {/* Concentric Therapeutic Ripple Rings */}
            <View style={styles.rippleContainer}>
              <Animated.View style={[styles.rippleCircle, ripple2AnimStyle]} />
              <Animated.View style={[styles.rippleCircle, ripple1AnimStyle]} />
              <View style={styles.checkCircle}>
                <Animated.View style={checkAnimStyle}>
                  <Check size={36} color="#FFFFFF" strokeWidth={3.2} />
                </Animated.View>
              </View>
            </View>

            {/* Content Details */}
            <Text style={styles.title}>{title}</Text>
            {amount !== undefined && (
              <Text style={styles.amountText}>₹{amount.toLocaleString('en-IN')}</Text>
            )}
            <Text style={styles.subtitle}>{subtitle}</Text>

            <View style={styles.verifiedRow}>
              <ShieldCheck size={14} color="#10B981" />
              <Text style={styles.verifiedText}>SECURED ON LIVE LEDGER</Text>
            </View>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 24, 15, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 1.5,
    borderColor: '#DFE8E0',
  },
  rippleContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  rippleCircle: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  checkCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#072C1C',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  amountText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A6B56',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF3EE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0B3F28',
    letterSpacing: 0.6,
  },
});
