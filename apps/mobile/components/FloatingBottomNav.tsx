import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Platform,
  Pressable,
  LayoutChangeEvent,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CedarColors, CedarTypography } from '@credics/core';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  Home,
  ArrowDownLeft,
  QrCode,
  Users,
  BarChart3,
  Banknote,
  Receipt,
  Coins,
  CreditCard,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 120Hz ProMotion Ultra-Smooth Spring Physics
const SPRING_CONFIG = {
  damping: 28,
  stiffness: 340,
  mass: 0.8,
};

const DRAWER_HEIGHT = 215;

export function FloatingBottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const translateY = useSharedValue(0);
  const contextY = useSharedValue(0);

  // Tab Item Layouts for 120Hz Sliding Oval Indicator
  const [tabLayouts, setTabLayouts] = useState<{ [key: number]: { x: number; width: number } }>({});
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);

  const toggleExpand = useCallback((expand: boolean) => {
    setIsExpanded(expand);
  }, []);

  const openDrawer = useCallback(() => {
    'worklet';
    translateY.value = withSpring(-DRAWER_HEIGHT, SPRING_CONFIG);
    runOnJS(toggleExpand)(true);
  }, [toggleExpand]);

  const closeDrawer = useCallback(() => {
    'worklet';
    translateY.value = withSpring(0, SPRING_CONFIG);
    runOnJS(toggleExpand)(false);
  }, [toggleExpand]);

  // 120Hz Worklet-Driven Pan Gesture restricted to intentional drag
  const panGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-25, 25])
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      const nextY = contextY.value + event.translationY;
      if (nextY < -DRAWER_HEIGHT) {
        translateY.value = -DRAWER_HEIGHT + (nextY + DRAWER_HEIGHT) * 0.15;
      } else if (nextY > 0) {
        translateY.value = nextY * 0.1;
      } else {
        translateY.value = nextY;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -25 || event.velocityY < -400) {
        openDrawer();
      } else if (event.translationY > 25 || event.velocityY > 400) {
        closeDrawer();
      } else {
        if (translateY.value < -DRAWER_HEIGHT / 2) {
          openDrawer();
        } else {
          closeDrawer();
        }
      }
    });

  const drawerAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, -DRAWER_HEIGHT * 0.25, -DRAWER_HEIGHT],
      [0, 0.7, 1],
      Extrapolation.CLAMP
    );
    const height = interpolate(
      translateY.value,
      [0, -DRAWER_HEIGHT],
      [0, DRAWER_HEIGHT],
      Extrapolation.CLAMP
    );
    return {
      height,
      opacity,
    };
  });

  const handleIndicatorStyle = useAnimatedStyle(() => {
    const width = interpolate(
      translateY.value,
      [0, -DRAWER_HEIGHT],
      [36, 52],
      Extrapolation.CLAMP
    );
    return { width };
  });

  const backdropAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, -DRAWER_HEIGHT],
      [0, 0.45],
      Extrapolation.CLAMP
    );
    const pointerEvents = translateY.value < -20 ? 'auto' : 'none';
    return {
      opacity,
      pointerEvents,
    };
  });

  // FAB Sync Animation: Elevates in sync with drawer expansion
  const fabAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  // 4 Standard Tabs + 1 Center FAB slot
  const visibleTabs = [
    { name: 'index', label: 'Home', icon: Home, slotIndex: 0 },
    { name: 'transactions', label: 'Trans', icon: ArrowDownLeft, slotIndex: 1 },
    { name: 'settlements', label: 'Scan', icon: QrCode, isFab: true, slotIndex: 2 },
    { name: 'lents', label: 'Loans', icon: Users, slotIndex: 3 },
    { name: 'insights', label: 'Analytics', icon: BarChart3, slotIndex: 4 },
  ];

  // Update sliding oval position whenever active route or layouts change
  const activeRouteName = state.routes[state.index]?.name;
  const activeTabItem = visibleTabs.find((t) => t.name === activeRouteName);

  useEffect(() => {
    if (activeTabItem && !activeTabItem.isFab) {
      const layout = tabLayouts[activeTabItem.slotIndex];
      if (layout && layout.width > 0) {
        const ovalWidth = Math.min(layout.width, 68);
        const centerOffset = layout.x + (layout.width - ovalWidth) / 2;
        indicatorX.value = withSpring(centerOffset, SPRING_CONFIG);
        indicatorWidth.value = withSpring(ovalWidth, SPRING_CONFIG);
        indicatorOpacity.value = withTiming(1, { duration: 160 });
      }
    } else {
      indicatorOpacity.value = withTiming(0, { duration: 120 });
    }
  }, [state.index, activeTabItem, tabLayouts]);

  const indicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
    opacity: indicatorOpacity.value,
  }));

  const handleNavigate = (routeKey: string, routeName: string, isFocused: boolean) => {
    Haptics.selectionAsync();
    if (isExpanded) {
      closeDrawer();
    }
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const handleExtraOptionPress = (path: string) => {
    Haptics.selectionAsync();
    closeDrawer();
    navigation.navigate(path);
  };

  const handleTabLayout = (slotIndex: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setTabLayouts((prev) => ({
      ...prev,
      [slotIndex]: { x, width },
    }));
  };

  return (
    <>
      {/* Blurred Backdrop when Drawer is open */}
      <Animated.View style={[styles.backdrop, backdropAnimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeDrawer}
        />
      </Animated.View>

      {/* Floating Bottom Nav Outer Wrapper */}
      <View style={styles.outerContainer} pointerEvents="box-none">
        {/* Detached Center QR Button - Positioned in the notch, elevates synchronously with drawer */}
        <Animated.View style={[styles.floatingFabWrapper, fabAnimStyle]} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [
              styles.fabButton,
              pressed && styles.fabPressed,
              state.routes[state.index]?.name === 'settlements' && styles.fabActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              if (isExpanded) closeDrawer();
              navigation.navigate('settlements');
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <QrCode size={25} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        </Animated.View>

        {/* Pill Shaped Navigation Capsule */}
        <Animated.View style={styles.capsule}>
          {/* Top Notch Cradle Dip in the center */}
          <View style={styles.notchCradleCutout} pointerEvents="none" />

          {/* Top Drag Handle Indicator - Equipped with Pan Gesture */}
          <GestureDetector gesture={panGesture}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                if (isExpanded) closeDrawer();
                else openDrawer();
              }}
              hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
              style={styles.handleContainer}
            >
              <Animated.View style={[styles.handlePill, handleIndicatorStyle]} />
            </Pressable>
          </GestureDetector>

          {/* Swipe-Up Extra Options Drawer (Web App Ledgers Parity) */}
          <Animated.View style={[styles.drawerContent, drawerAnimStyle]}>
            <View style={styles.drawerGrid}>
              {/* 1. Cash on Hand */}
              <Pressable
                style={({ pressed }) => [
                  styles.drawerCard,
                  pressed && styles.drawerCardPressed,
                ]}
                onPress={() => handleExtraOptionPress('ledgers')}
              >
                <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(46, 148, 75, 0.15)' }]}>
                  <Banknote size={15} color="#2E944B" strokeWidth={2.4} />
                </View>
                <Text style={styles.drawerCardTitle}>Cash on Hand</Text>
                <Text style={styles.drawerCardSub}>Ledger & Vault</Text>
              </Pressable>

              {/* 2. Personal Spends */}
              <Pressable
                style={({ pressed }) => [
                  styles.drawerCard,
                  pressed && styles.drawerCardPressed,
                ]}
                onPress={() => handleExtraOptionPress('ledgers')}
              >
                <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(217, 119, 6, 0.15)' }]}>
                  <Receipt size={15} color="#D97706" strokeWidth={2.4} />
                </View>
                <Text style={styles.drawerCardTitle}>Personal Spends</Text>
                <Text style={styles.drawerCardSub}>Card & Cash Logs</Text>
              </Pressable>

              {/* 3. Pocket Advances */}
              <Pressable
                style={({ pressed }) => [
                  styles.drawerCard,
                  pressed && styles.drawerCardPressed,
                ]}
                onPress={() => handleExtraOptionPress('ledgers')}
              >
                <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(125, 90, 224, 0.15)' }]}>
                  <Coins size={15} color="#7D5AE0" strokeWidth={2.4} />
                </View>
                <Text style={styles.drawerCardTitle}>Pocket Advance</Text>
                <Text style={styles.drawerCardSub}>Cross Reclaim</Text>
              </Pressable>

              {/* 4. Vault Cards */}
              <Pressable
                style={({ pressed }) => [
                  styles.drawerCard,
                  pressed && styles.drawerCardPressed,
                ]}
                onPress={() => handleExtraOptionPress('cards')}
              >
                <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(10, 38, 28, 0.15)' }]}>
                  <CreditCard size={15} color={CedarColors.forest800} strokeWidth={2.4} />
                </View>
                <Text style={styles.drawerCardTitle}>My Cards</Text>
                <Text style={styles.drawerCardSub}>Limits & Dates</Text>
              </Pressable>
            </View>
          </Animated.View>

          {/* Primary Bottom Bar Tab Items Row */}
          <View style={styles.navRow}>
            {/* 120Hz Reanimated Sliding Oval Indicator */}
            <Animated.View
              style={[styles.slidingOvalIndicator, indicatorAnimStyle]}
              pointerEvents="none"
            />

            {visibleTabs.map((item) => {
              if (item.isFab) {
                // Central spacer slot for the detached circular FAB
                return (
                  <View
                    key={item.name}
                    style={styles.fabSpacerSlot}
                    pointerEvents="none"
                  >
                    <Text style={styles.fabLabel}>Scan</Text>
                  </View>
                );
              }

              const routeIndex = state.routes.findIndex((r) => r.name === item.name);
              const isFocused = state.index === routeIndex;
              const route = state.routes[routeIndex];
              const IconComponent = item.icon;

              return (
                <Pressable
                  key={item.name}
                  onLayout={(e) => handleTabLayout(item.slotIndex, e)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => {
                    if (route) handleNavigate(route.key, route.name, isFocused);
                    else navigation.navigate(item.name);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <View style={styles.iconWrapper}>
                    <IconComponent
                      size={20}
                      color={isFocused ? CedarColors.forest800 : CedarColors.ink500}
                      strokeWidth={isFocused ? 2.6 : 2}
                    />
                  </View>
                  <Text
                    style={[
                      styles.tabLabel,
                      isFocused ? styles.activeTabLabel : styles.inactiveTabLabel,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#071A12',
    zIndex: 40,
  },
  outerContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 16 : 24,
    left: 16,
    right: 16,
    zIndex: 50,
    alignItems: 'center',
  },
  // Pill Shaped Navigation Capsule with ambient luxury shadow
  capsule: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF', // Soft clean luxury elevated surface
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: '#DFE7DE',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 8 : 6,
    paddingHorizontal: 8,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 16,
    overflow: 'visible',
  },
  // Center Top Notch Cradle Cutout
  notchCradleCutout: {
    position: 'absolute',
    top: -2,
    left: '50%',
    transform: [{ translateX: -36 }],
    width: 72,
    height: 18,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: '#EFF3EE', // Blends with screen canvas creating contoured dip
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: '#DFE7DE',
    zIndex: 2,
  },
  // Detached Floating Center QR FAB
  floatingFabWrapper: {
    position: 'absolute',
    top: -26,
    left: '50%',
    transform: [{ translateX: -30 }],
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#071A12', // Deep luxury forest
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#2E944B', // Vivid emerald contour highlight
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 18,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
  },
  fabActive: {
    backgroundColor: '#0A261C',
    borderColor: '#34D399',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 2,
    zIndex: 10,
  },
  handlePill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: CedarColors.forest800,
    opacity: 0.35,
  },
  drawerContent: {
    overflow: 'hidden',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  drawerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
  },
  drawerCard: {
    width: '48.5%',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#DCE7DD',
    alignItems: 'flex-start',
    minHeight: 80,
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  drawerCardPressed: {
    transform: [{ scale: 0.97 }],
  },
  drawerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  drawerCardTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '800',
  },
  drawerCardSub: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 1,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    position: 'relative',
  },
  // 120Hz Sliding Oval Highlight Pill
  slidingOvalIndicator: {
    position: 'absolute',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2F1E6', // Soft mint oval background matching screenshot
    borderWidth: 1,
    borderColor: 'rgba(46, 148, 75, 0.22)',
    zIndex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    zIndex: 2,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  activeTabLabel: {
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: CedarColors.forest800,
  },
  inactiveTabLabel: {
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  fabSpacerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 48,
    paddingBottom: 2,
  },
  fabLabel: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    letterSpacing: 0.2,
  },
});
