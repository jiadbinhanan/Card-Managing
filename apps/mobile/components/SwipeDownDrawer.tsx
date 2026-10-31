import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CedarColors, CedarTypography } from '@credics/core';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SPRING_CONFIG = {
  damping: 28,
  stiffness: 350,
  mass: 0.8,
};

interface SwipeDownDrawerProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  heightPercent?: number; // e.g. 0.85
  gradientColors?: [string, string, ...string[]];
  headerRight?: React.ReactNode;
  headerAccentColor?: string;
}

export function SwipeDownDrawer({
  visible,
  onClose,
  children,
  title,
  subtitle,
  heightPercent = 0.85,
  gradientColors,
  headerRight,
  headerAccentColor = CedarColors.ink900,
}: SwipeDownDrawerProps) {
  const SHEET_HEIGHT = SCREEN_HEIGHT * heightPercent;
  const translateY = useSharedValue(SHEET_HEIGHT);
  const isDragging = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      translateY.value = SHEET_HEIGHT;
    }
  }, [visible, SHEET_HEIGHT]);

  const handleDismiss = () => {
    translateY.value = withSpring(
      SHEET_HEIGHT,
      { damping: 30, stiffness: 400 },
      (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      }
    );
  };

  // Pan gesture for dragging down to dismiss (after internal scroll reaches top)
  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      isDragging.value = false;
      if (event.translationY > 90 || event.velocityY > 500) {
        runOnJS(handleDismiss)();
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, translateY.value) }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SHEET_HEIGHT],
      [0.65, 0],
      Extrapolation.CLAMP
    ),
  }));

  if (!visible) return null;

  const contentContainer = (
    <>
      {/* Top Drag Handle */}
      <View style={styles.handleWrapper}>
        <View style={styles.handlePill} />
      </View>

      {/* Header if title provided */}
      {title && (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: headerAccentColor }]}>{title}</Text>
            {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
          {headerRight}
          <Pressable onPress={handleDismiss} style={styles.closeBtn} hitSlop={10}>
            <X size={20} color={headerAccentColor === '#F6F9F5' ? '#F6F9F5' : CedarColors.ink700} />
          </Pressable>
        </View>
      )}

      {/* Inner Children (Scrollable content) */}
      <View style={styles.innerBody}>
        {children}
      </View>
    </>
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Backdrop (separate sibling view) */}
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
        </Animated.View>

        {/* Bottom Drawer Container */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              { height: SHEET_HEIGHT },
              animatedSheetStyle,
            ]}
          >
            {gradientColors ? (
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
              >
                {contentContainer}
              </LinearGradient>
            ) : (
              contentContainer
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#040D09',
  },
  sheet: {
    width: '100%',
    backgroundColor: '#F8FAF8',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 24,
    borderTopWidth: 1.5,
    borderTopColor: '#DCE8DE',
    overflow: 'hidden',
  },
  handleWrapper: {
    alignItems: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  handlePill: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(126, 145, 133, 0.4)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  innerBody: {
    flex: 1,
  },
});
