import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

export type HapticFeedbackType = 'rigid' | 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning';

interface HapticButtonProps {
  onPress?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  feedbackType?: HapticFeedbackType;
  activeScale?: number;
  disabled?: boolean;
}

/**
 * 120Hz Ultra-Smooth Haptic Button with Crisp "Khat-Khat" Tactile Feedback
 */
export function HapticButton({
  onPress,
  onLongPress,
  children,
  style,
  feedbackType = 'rigid',
  activeScale = 0.95,
  disabled = false,
}: HapticButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const triggerHaptic = () => {
    switch (feedbackType) {
      case 'rigid':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        break;
      case 'selection':
        Haptics.selectionAsync();
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'light':
      default:
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
  };

  const handlePressIn = () => {
    if (disabled) return;
    // 120Hz Optimized Responsive Spring
    scale.value = withSpring(activeScale, { damping: 18, stiffness: 450, mass: 0.6 });
    triggerHaptic();
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View style={[style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
