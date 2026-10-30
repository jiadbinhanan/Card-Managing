import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { CedarColors } from '@credics/core';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle | ViewStyle[];
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 12,
  style,
}: SkeletonProps) {
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true // reverse on repeat for smooth wave
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      shimmerProgress.value,
      [0, 1],
      ['rgba(20, 81, 59, 0.45)', 'rgba(46, 139, 99, 0.7)'] // Shimmer between Cedar pine700 and pine500
    );

    return {
      backgroundColor,
    };
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// ─── Screen Skeleton Presets ──────────────────────────────────────────────

export function HomeSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {/* Header Skeleton */}
      <View style={skeletonStyles.headerRow}>
        <View>
          <Skeleton width={130} height={22} borderRadius={8} />
          <Skeleton width={200} height={14} borderRadius={6} style={{ marginTop: 8 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Skeleton width={44} height={44} borderRadius={22} />
          <Skeleton width={44} height={44} borderRadius={22} />
        </View>
      </View>

      {/* Balance Card Skeleton */}
      <View style={skeletonStyles.cardPlaceholder}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <Skeleton width={110} height={16} borderRadius={6} />
          <Skeleton width={24} height={24} borderRadius={12} />
        </View>
        <Skeleton width={220} height={36} borderRadius={10} style={{ marginBottom: 12 }} />
        <Skeleton width={140} height={16} borderRadius={6} />
      </View>

      {/* Quick Actions Skeleton */}
      <View style={skeletonStyles.actionsRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ alignItems: 'center' }}>
            <Skeleton width={60} height={60} borderRadius={30} />
            <Skeleton width={40} height={12} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Transaction Items Skeleton */}
      <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
        <Skeleton width={160} height={20} borderRadius={6} style={{ marginBottom: 16 }} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={skeletonStyles.txItemPlaceholder}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Skeleton width={44} height={44} borderRadius={14} />
              <View>
                <Skeleton width={120} height={14} borderRadius={6} />
                <Skeleton width={70} height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Skeleton width={75} height={16} borderRadius={6} />
              <Skeleton width={50} height={10} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CardsSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {/* Header */}
      <View style={[skeletonStyles.headerRow, { marginBottom: 16 }]}>
        <Skeleton width={120} height={26} borderRadius={8} />
        <Skeleton width={95} height={34} borderRadius={18} />
      </View>

      {/* Tab Switcher Skeleton */}
      <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
        <Skeleton width="100%" height={44} borderRadius={14} />
      </View>

      {/* 3D Card Skeleton */}
      <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
        <Skeleton width="100%" height={215} borderRadius={24} />
      </View>

      {/* Quick Actions Row */}
      <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 20 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="22%" height={56} borderRadius={16} />
        ))}
      </View>

      {/* Limit Progress Card Skeleton */}
      <View style={{ marginHorizontal: 20 }}>
        <Skeleton width="100%" height={110} borderRadius={20} />
      </View>
    </View>
  );
}

export function InsightsSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      <View style={[skeletonStyles.headerRow, { marginBottom: 16 }]}>
        <Skeleton width={130} height={26} borderRadius={8} />
        <Skeleton width={44} height={44} borderRadius={22} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 20 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} width={90} height={38} borderRadius={20} />
        ))}
      </View>

      {/* Donut Chart Skeleton */}
      <View style={{ marginHorizontal: 20, alignItems: 'center', marginBottom: 20 }}>
        <Skeleton width={180} height={180} borderRadius={90} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 24, width: '100%' }}>
          <Skeleton width="45%" height={20} borderRadius={6} />
          <Skeleton width="45%" height={20} borderRadius={6} />
          <Skeleton width="45%" height={20} borderRadius={6} />
          <Skeleton width="45%" height={20} borderRadius={6} />
        </View>
      </View>

      {/* Tip Card Skeleton */}
      <View style={{ marginHorizontal: 20 }}>
        <Skeleton width="100%" height={74} borderRadius={20} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  cardPlaceholder: {
    backgroundColor: CedarColors.pine800,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 22,
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  txItemPlaceholder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CedarColors.pine800,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
});
