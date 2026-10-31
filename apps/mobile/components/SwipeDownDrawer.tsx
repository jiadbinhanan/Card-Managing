import React, { useEffect, createContext, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  ScrollViewProps,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
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

interface DrawerContextValue {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export const DrawerContext = createContext<DrawerContextValue>({
  onScroll: () => {},
  scrollEventThrottle: 16,
});

export const useDrawerScroll = () => useContext(DrawerContext);

export const DrawerScrollView: React.FC<ScrollViewProps> = ({ onScroll, ...props }) => {
  const { onScroll: drawerScroll, scrollEventThrottle } = useDrawerScroll();
  return (
    <ScrollView
      {...props}
      scrollEventThrottle={scrollEventThrottle}
      onScroll={(e) => {
        drawerScroll(e);
        onScroll?.(e);
      }}
    />
  );
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
  const isScrollAtTop = useSharedValue(true);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      isScrollAtTop.value = true;
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

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    isScrollAtTop.value = y <= 2;
  };

  // 1. Dedicated Pan gesture on the top handle and header area (always slides down)
  const handlePanGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 80 || event.velocityY > 450) {
        runOnJS(handleDismiss)();
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // 2. Pan gesture on inner body that only triggers when inner scroll is at top
  const contentPanGesture = Gesture.Pan()
    .activeOffsetY([18, 1000])
    .failOffsetY([-1000, -6])
    .onUpdate((event) => {
      if (isScrollAtTop.value && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (isScrollAtTop.value && (event.translationY > 90 || event.velocityY > 500)) {
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
    <DrawerContext.Provider value={{ onScroll: handleScroll, scrollEventThrottle: 16 }}>
      {/* Top Drag Handle & Header - Always interactive drag zone */}
      <GestureDetector gesture={handlePanGesture}>
        <View style={styles.handleAndHeaderZone}>
          <View style={styles.handleWrapper}>
            <View style={styles.handlePill} />
          </View>

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
        </View>
      </GestureDetector>

      {/* Inner Children (Scrollable content with top-check drag coordination) */}
      <GestureDetector gesture={contentPanGesture}>
        <View style={styles.innerBody}>
          {children}
        </View>
      </GestureDetector>
    </DrawerContext.Provider>
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
  handleAndHeaderZone: {
    backgroundColor: 'transparent',
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
