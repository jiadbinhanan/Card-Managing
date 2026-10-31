import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Platform,
  Pressable,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CedarColors, CedarTypography } from '@credics/core';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
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
  ChevronDown,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 120Hz ProMotion Spring Physics
const SPRING_CONFIG = {
  damping: 30,
  stiffness: 380,
  mass: 0.8,
};

const DRAWER_HEIGHT = 160;

export function FloatingBottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const translateY = useSharedValue(0);
  const contextY = useSharedValue(0);

  const toggleExpand = useCallback((expand: boolean) => {
    setIsExpanded(expand);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
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

  // 120Hz Smooth Worklet-Driven Pan Gesture
  const panGesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      const nextY = contextY.value + event.translationY;
      // Clamp between expanded (-DRAWER_HEIGHT) and closed (0)
      if (nextY < -DRAWER_HEIGHT) {
        translateY.value = -DRAWER_HEIGHT + (nextY + DRAWER_HEIGHT) * 0.15; // subtle rubber band
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
        // Snap to closest state
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
      [0, -DRAWER_HEIGHT * 0.3, -DRAWER_HEIGHT],
      [0, 0.6, 1],
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
      [36, 48],
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

  const handleNavigate = (routeKey: string, routeName: string, isFocused: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    closeDrawer();
    navigation.navigate(path);
  };

  // 4 Standard Tabs + 1 Center FAB
  const visibleTabs = [
    { name: 'index', label: 'Home', icon: Home },
    { name: 'transactions', label: 'Trans', icon: ArrowDownLeft },
    { name: 'settlements', label: 'Settlement', icon: QrCode, isFab: true },
    { name: 'lents', label: 'Loans', icon: Users },
    { name: 'insights', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <>
      {/* Blurred Backdrop when Drawer is open */}
      <Animated.View style={[styles.backdrop, backdropAnimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            Haptics.selectionAsync();
            closeDrawer();
          }}
        />
      </Animated.View>

      {/* Floating Bottom Nav Container */}
      <View style={styles.outerContainer} pointerEvents="box-none">
        <GestureDetector gesture={panGesture}>
          <Animated.View style={styles.capsule}>
            {/* Top Drag Handle Indicator */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                if (isExpanded) closeDrawer();
                else openDrawer();
              }}
              hitSlop={12}
              style={styles.handleContainer}
            >
              <Animated.View style={[styles.handlePill, handleIndicatorStyle]} />
            </Pressable>

            {/* Swipe-Up Extra Options Drawer (Web App Ledgers Parity) */}
            <Animated.View style={[styles.drawerContent, drawerAnimStyle]}>
              <View style={styles.drawerGrid}>
                {/* 1. Cash on Hand */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerCard,
                    { backgroundColor: 'rgba(46, 148, 75, 0.08)' },
                    pressed && styles.drawerCardPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('ledgers')}
                >
                  <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(46, 148, 75, 0.16)' }]}>
                    <Banknote size={18} color="#2E944B" strokeWidth={2.4} />
                  </View>
                  <Text style={styles.drawerCardTitle}>Cash on Hand</Text>
                  <Text style={styles.drawerCardSub}>Ledger & Vault</Text>
                </Pressable>

                {/* 2. Personal Spends */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerCard,
                    { backgroundColor: 'rgba(217, 119, 6, 0.08)' },
                    pressed && styles.drawerCardPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('ledgers')}
                >
                  <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(217, 119, 6, 0.16)' }]}>
                    <Receipt size={18} color="#D97706" strokeWidth={2.4} />
                  </View>
                  <Text style={styles.drawerCardTitle}>Personal Spends</Text>
                  <Text style={styles.drawerCardSub}>Card & Cash Logs</Text>
                </Pressable>

                {/* 3. Pocket Advances */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerCard,
                    { backgroundColor: 'rgba(125, 90, 224, 0.08)' },
                    pressed && styles.drawerCardPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('ledgers')}
                >
                  <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(125, 90, 224, 0.16)' }]}>
                    <Coins size={18} color="#7D5AE0" strokeWidth={2.4} />
                  </View>
                  <Text style={styles.drawerCardTitle}>Pocket Advance</Text>
                  <Text style={styles.drawerCardSub}>Cross Reclaim</Text>
                </Pressable>

                {/* 4. Vault Cards */}
                <Pressable
                  style={({ pressed }) => [
                    styles.drawerCard,
                    { backgroundColor: 'rgba(10, 38, 28, 0.08)' },
                    pressed && styles.drawerCardPressed,
                  ]}
                  onPress={() => handleExtraOptionPress('cards')}
                >
                  <View style={[styles.drawerIconBadge, { backgroundColor: 'rgba(10, 38, 28, 0.16)' }]}>
                    <CreditCard size={18} color={CedarColors.forest800} strokeWidth={2.4} />
                  </View>
                  <Text style={styles.drawerCardTitle}>My Cards</Text>
                  <Text style={styles.drawerCardSub}>Limits & Dates</Text>
                </Pressable>
              </View>
            </Animated.View>

            {/* Primary Bottom Bar Tab Items */}
            <View style={styles.navRow}>
              {visibleTabs.map((item) => {
                const routeIndex = state.routes.findIndex((r) => r.name === item.name);
                const isFocused = state.index === routeIndex;
                const route = state.routes[routeIndex];

                if (item.isFab) {
                  // Central Elevated Green FAB navigating to 'settlement'
                  return (
                    <View key={item.name} style={styles.fabWrapper}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.fabButton,
                          pressed && styles.fabPressed,
                          isFocused && styles.fabActive,
                        ]}
                        onPress={() => {
                          if (route) handleNavigate(route.key, route.name, isFocused);
                          else navigation.navigate('settlements');
                        }}
                      >
                        <QrCode size={24} color="#F6F9F5" strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  );
                }

                const IconComponent = item.icon;
                return (
                  <Pressable
                    key={item.name}
                    style={({ pressed }) => [
                      styles.tabButton,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      if (route) handleNavigate(route.key, route.name, isFocused);
                      else navigation.navigate(item.name);
                    }}
                  >
                    <View style={[styles.iconWrapper, isFocused && styles.activeIconWrapper]}>
                      <IconComponent
                        size={21}
                        color={isFocused ? CedarColors.forest800 : CedarColors.ink500}
                        strokeWidth={isFocused ? 2.5 : 2}
                      />
                      {isFocused && <View style={styles.activePillDot} />}
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
        </GestureDetector>
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
    left: 18,
    right: 18,
    zIndex: 50,
    alignItems: 'center',
  },
  capsule: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: CedarColors.card, // Soft ambient off-white
    borderRadius: 32,
    borderWidth: 1.2,
    borderColor: CedarColors.border,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 10 : 8,
    paddingHorizontal: 10,
    // Luxury soft shadow
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 14,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 4,
  },
  handlePill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: CedarColors.ink500,
    opacity: 0.45,
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
    width: '48%',
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: CedarColors.border,
    alignItems: 'flex-start',
  },
  drawerCardPressed: {
    transform: [{ scale: 0.97 }],
  },
  drawerIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  drawerCardTitle: {
    fontSize: 12,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
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
    justifyContent: 'space-around',
    height: 52,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  activeIconWrapper: {
    backgroundColor: 'rgba(10, 38, 28, 0.08)',
  },
  activePillDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: CedarColors.forest800,
    marginTop: 2,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  activeTabLabel: {
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: CedarColors.forest800,
  },
  inactiveTabLabel: {
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
  },
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -14, // Elevated pop-up
  },
  fabButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CedarColors.forest800, // Deeper forest green
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3.5,
    borderColor: CedarColors.canvas, // Ring matching background canvas
    shadowColor: '#071A12',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
  },
  fabActive: {
    backgroundColor: CedarColors.forest900,
    borderColor: CedarColors.borderDark,
  },
});
