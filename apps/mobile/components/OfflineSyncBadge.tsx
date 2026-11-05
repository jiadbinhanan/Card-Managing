import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { CloudOff, RefreshCw, AlertTriangle } from 'lucide-react-native';
import { useOfflineQueueStore } from '../lib/offlineQueue';
import NetInfo from '@react-native-community/netinfo';

export function OfflineSyncBadge() {
  const insets = useSafeAreaInsets();
  const queue = useOfflineQueueStore((s) => s.queue);
  const isSyncing = useOfflineQueueStore((s) => s.isSyncing);
  const syncQueue = useOfflineQueueStore((s) => s.syncQueue);
  const [isOnline, setIsOnline] = useState(true);

  const pendingCount = queue.filter((i) => i.status === 'pending' || i.status === 'syncing').length;
  const conflictCount = queue.filter((i) => i.status === 'conflict').length;
  const failedCount = queue.filter((i) => i.status === 'failed').length;
  const errorCount = conflictCount + failedCount;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const spin = useSharedValue(0);
  useEffect(() => {
    if (isSyncing) {
      spin.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      spin.value = 0;
    }
  }, [isSyncing]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  // Hide badge if online and no pending or error items
  if (isOnline && pendingCount === 0 && errorCount === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => syncQueue()}
        style={[
          styles.badge,
          errorCount > 0 ? styles.badgeConflict : isSyncing ? styles.badgeSyncing : styles.badgeOffline,
        ]}
      >
        {errorCount > 0 ? (
          <AlertTriangle size={14} color="#DC2626" />
        ) : isSyncing ? (
          <Animated.View style={spinStyle}>
            <RefreshCw size={14} color="#2563EB" />
          </Animated.View>
        ) : (
          <CloudOff size={14} color="#D97706" />
        )}

        <Text
          style={[
            styles.text,
            errorCount > 0
              ? styles.textConflict
              : isSyncing
              ? styles.textSyncing
              : styles.textOffline,
          ]}
        >
          {errorCount > 0
            ? `${errorCount} unsynced item(s) • Tap to retry`
            : isSyncing
            ? `Syncing ${pendingCount} offline item(s)...`
            : !isOnline && pendingCount > 0
            ? `Offline: ${pendingCount} entry saved on disk`
            : 'Offline Mode'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  badgeOffline: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgeSyncing: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgeConflict: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  textOffline: {
    color: '#92400E',
  },
  textSyncing: {
    color: '#1E40AF',
  },
  textConflict: {
    color: '#991B1B',
  },
});
