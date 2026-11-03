import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { CedarTypography } from '@credics/core';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
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
  damping: 26,
  stiffness: 340,
  mass: 0.8,
};

const DRAWER_HEIGHT = 98; // Compact height for mini chips

export function FloatingBottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [navWidth, setNavWidth] = useState(0);

  const translateY = useSharedValue(0);
  const contextY = useSharedValue(0);

  // 120Hz Sliding Dark Green Selection Pill
  const indicatorX = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);

  // Individual Icon Pop Animations
  const scale0 = useSharedValue(1);
  const scale1 = useSharedValue(1);
  const scale2 = useSharedValue(1);
  const scale3 = useSharedValue(1);
  const scale4 = useSharedValue(1);
  const iconScales = useRef([scale0, scale1, scale2, scale3, scale4]).current;

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

  // 120Hz Worklet-Driven Pan Gesture across ANY point of the nav bar (No hint required)
  const panGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
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
      if (event.translationY < -12 || event.velocityY < -280) {
        openDrawer();
      } else if (event.translationY > 12 || event.velocityY > 280) {
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
      [0, -DRAWER_HEIGHT * 0.35, -DRAWER_HEIGHT],
      [0, 0.8, 1],
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

  // 5 Tab Items
  const visibleTabs = [
    { name: 'index', label: 'Home', icon: Home, slotIndex: 0 },
    { name: 'transactions', label: 'Trans', icon: ArrowDownLeft, slotIndex: 1 },
    { name: 'settlements', label: 'Scan', icon: QrCode, slotIndex: 2, isQr: true },
    { name: 'lents', label: 'Loans', icon: Users, slotIndex: 3 },
    { name: 'insights', label: 'Analytics', icon: BarChart3, slotIndex: 4 },
  ];

  const currentRouteName = state.routes[state.index]?.name;
  const activeTabItem = visibleTabs.find((t) => t.name === currentRouteName);
  const activeSlotIndex = activeTabItem ? activeTabItem.slotIndex : 0;

  // Slide pill smoothly when active tab changes or layout is measured
  useEffect(() => {
    if (navWidth > 0 && activeTabItem) {
      const tabWidth = navWidth / 5;
      const targetX = activeSlotIndex * tabWidth + 3;
      indicatorX.value = withSpring(targetX, SPRING_CONFIG);
      indicatorOpacity.value = withTiming(1, { duration: 150 });
    }
  }, [activeSlotIndex, navWidth, activeTabItem]);

  const indicatorAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    opacity: indicatorOpacity.value,
  }));

  const triggerIconPop = (slotIndex: number) => {
    'worklet';
    const s = iconScales[slotIndex];
    if (s) {
      s.value = withSequence(
        withTiming(0.78, { duration: 60 }),
        withSpring(1.28, { damping: 9, stiffness: 450 }),
        withSpring(1.0, { damping: 14, stiffness: 350 })
      );
    }
  };

  const handleNavigate = (routeKey: string, routeName: string, isFocused: boolean, slotIndex: number) => {
    // 120Hz Delightful icon pop animation
    triggerIconPop(slotIndex);

    // Smooth pill glide
    if (navWidth > 0) {
      const tabWidth = navWidth / 5;
      indicatorX.value = withSpring(slotIndex * tabWidth + 3, SPRING_CONFIG);
    }

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
    closeDrawer();
    navigation.navigate(path as any);
  };

  const onNavRowLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && width !== navWidth) {
      setNavWidth(width);
    }
  };

  const tabWidth = navWidth > 0 ? navWidth / 5 : 0;
  const pillWidth = Math.max(0, tabWidth - 6);

  return (
    <View style={styles.outerContainer} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Animated.View style={styles.capsule}>
          <View style={styles.blurContent}>
            {/* Swipe-Up Extra Options Drawer (Compact Micro-Chips without Shadows) */}
            <Animated.View style={[styles.drawerContent, drawerAnimStyle]}>
              <View style={styles.drawerGrid}>
                {/* 1. Cash on Hand */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerChip,
                    pressed && styles.drawerChipPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('ledgers')}
                >
                  <View style={[styles.chipIconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.16)' }]}>
                    <Banknote size={14} color="#0D532F" strokeWidth={2.4} />
                  </View>
                  <View style={styles.chipTextCol}>
                    <Text style={styles.chipTitle} numberOfLines={1}>Cash on Hand</Text>
                    <Text style={styles.chipSub} numberOfLines={1}>Vault</Text>
                  </View>
                </Pressable>

                {/* 2. Personal Spends */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerChip,
                    pressed && styles.drawerChipPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('ledgers')}
                >
                  <View style={[styles.chipIconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.16)' }]}>
                    <Receipt size={14} color="#B45309" strokeWidth={2.4} />
                  </View>
                  <View style={styles.chipTextCol}>
                    <Text style={styles.chipTitle} numberOfLines={1}>Personal Spends</Text>
                    <Text style={styles.chipSub} numberOfLines={1}>Cards & Logs</Text>
                  </View>
                </Pressable>

                {/* 3. Pocket Advances */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerChip,
                    pressed && styles.drawerChipPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('ledgers')}
                >
                  <View style={[styles.chipIconBadge, { backgroundColor: 'rgba(125, 90, 224, 0.16)' }]}>
                    <Coins size={14} color="#6D28D9" strokeWidth={2.4} />
                  </View>
                  <View style={styles.chipTextCol}>
                    <Text style={styles.chipTitle} numberOfLines={1}>Pocket Advance</Text>
                    <Text style={styles.chipSub} numberOfLines={1}>Reclaim</Text>
                  </View>
                </Pressable>

                {/* 4. Vault Cards */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerChip,
                    pressed && styles.drawerChipPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('cards')}
                >
                  <View style={[styles.chipIconBadge, { backgroundColor: 'rgba(14, 165, 233, 0.16)' }]}>
                    <CreditCard size={14} color="#0369A1" strokeWidth={2.4} />
                  </View>
                  <View style={styles.chipTextCol}>
                    <Text style={styles.chipTitle} numberOfLines={1}>My Cards</Text>
                    <Text style={styles.chipSub} numberOfLines={1}>Families</Text>
                  </View>
                </Pressable>
              </View>
            </Animated.View>

            {/* Primary Bottom Bar Tab Items Row */}
            <View style={styles.navRow} onLayout={onNavRowLayout}>
              {/* 120Hz Sliding Dark Green Selection Pill */}
              {tabWidth > 0 && (
                <Animated.View
                  style={[
                    styles.slidingSelectionPill,
                    { width: pillWidth },
                    indicatorAnimStyle,
                  ]}
                  pointerEvents="none"
                />
              )}

              {visibleTabs.map((item) => {
                const routeIndex = state.routes.findIndex((r) => r.name === item.name);
                const isFocused = currentRouteName === item.name;
                const route = routeIndex >= 0 ? state.routes[routeIndex] : null;
                const IconComponent = item.icon;
                const iconScale = iconScales[item.slotIndex];

                const iconPopStyle = useAnimatedStyle(() => ({
                  transform: [{ scale: iconScale.value }],
                }));

                // Special Circular Styling for QR button when not selected
                if (item.isQr && !isFocused) {
                  return (
                    <Pressable
                      key={item.name}
                      style={styles.tabButton}
                      onPress={() => {
                        if (route) handleNavigate(route.key, route.name, isFocused, item.slotIndex);
                        else navigation.navigate(item.name as any);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Animated.View style={[styles.specialQrCircle, iconPopStyle]}>
                        <QrCode size={19} color="#072C1C" strokeWidth={2.6} />
                      </Animated.View>
                      <Text style={styles.inactiveTabLabel}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                }

                return (
                  <Pressable
                    key={item.name}
                    style={styles.tabButton}
                    onPress={() => {
                      if (route) handleNavigate(route.key, route.name, isFocused, item.slotIndex);
                      else navigation.navigate(item.name as any);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Animated.View style={[styles.iconWrapper, iconPopStyle]}>
                      <IconComponent
                        size={19}
                        color={isFocused ? '#FFFFFF' : '#072C1C'}
                        strokeWidth={isFocused ? 2.6 : 2.2}
                      />
                    </Animated.View>
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
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 12 : 20,
    left: 14,
    right: 14,
    zIndex: 50,
    alignItems: 'center',
  },
  // Sleek, Compact Frosted Glassmorphism Capsule (No Hint Arrow)
  capsule: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(238, 247, 240, 0.82)', // Translucent Light Green Glass
    borderRadius: 26,
    borderWidth: 1.2,
    borderColor: 'rgba(46, 148, 75, 0.22)', // Subtle thin emerald border
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  blurContent: {
    paddingTop: 3,
    paddingBottom: Platform.OS === 'android' ? 4 : 3,
    paddingHorizontal: 8,
  },
  drawerContent: {
    overflow: 'hidden',
    paddingHorizontal: 2,
    marginTop: 2,
    marginBottom: 4,
  },
  drawerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
    paddingVertical: 2,
  },
  // Compact Mini Chips (No Heavy Shadows)
  drawerChip: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(46, 148, 75, 0.16)',
    minHeight: 40,
    elevation: 0, // No shadow
  },
  drawerChipPressed: {
    backgroundColor: '#FFFFFF',
    transform: [{ scale: 0.98 }],
  },
  chipIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTextCol: {
    flex: 1,
  },
  chipTitle: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#072C1C',
    fontWeight: '800',
  },
  chipSub: {
    fontSize: 9,
    fontFamily: CedarTypography.body,
    color: '#4A6B56',
    marginTop: 0.5,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    position: 'relative',
  },
  // 120Hz Gliding Dark Green Selection Pill
  slidingSelectionPill: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#072C1C', // Dark Green Pill
    zIndex: 1,
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    zIndex: 2,
    paddingVertical: 3,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Special Circular QR Button when not selected
  specialQrCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1.8,
    borderColor: '#072C1C',
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 1.5,
    letterSpacing: 0.2,
  },
  activeTabLabel: {
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#FFFFFF', // Crisp white on dark green pill
  },
  inactiveTabLabel: {
    fontFamily: CedarTypography.bodySemiBold,
    color: '#072C1C', // Deep green on frosted glass
    fontWeight: '700',
  },
});
