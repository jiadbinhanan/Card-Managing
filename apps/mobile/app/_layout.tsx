import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { CedarColors } from '@credics/core';
import { supabase } from '../lib/supabase';
import { useDashboardStore } from '../lib/dashboardStore';
import { AnimatedVideoSplash } from '../components/AnimatedVideoSplash';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, queryPersister } from '../lib/queryClient';
import { useCentralizedRealtimeSync } from '../lib/realtimeSync';
import { OfflineSyncBadge } from '../components/OfflineSyncBadge';

// Prevent native splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppNavigationTree() {
  // Connect centralized realtime sync bus at root
  useCentralizedRealtimeSync();

  const [session, setSession] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const [isSplashActive, setIsSplashActive] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  // 1. Initial Session Restoration & Parallel Dashboard Prefetch
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }: any) => {
      if (!isMounted) return;
      const currentSession = data?.session ?? null;
      setSession(currentSession);
      setInitialized(true);

      if (currentSession?.user) {
        useDashboardStore.getState().fetchDashboardData('all').catch((err) => {
          console.error('Initial background prefetch error:', err);
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, currentSession: any) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (currentSession) {
          setSession(currentSession);
          setInitialized(true);
          useDashboardStore.getState().fetchDashboardData('all').catch(() => {});
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setInitialized(true);
      } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(currentSession);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 2. Route Protection Guard
  useEffect(() => {
    if (!initialized) return;

    const inLoginScreen = segments[0] === 'login';

    if (!session && !inLoginScreen) {
      router.replace('/login');
    } else if (session && inLoginScreen) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={CedarColors.canvas} translucent={false} />
      <OfflineSyncBadge />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: CedarColors.canvas },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
      {isSplashActive && (
        <AnimatedVideoSplash onFinish={() => setIsSplashActive(false)} />
      )}
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CedarColors.canvas }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        }}
      >
        <AppNavigationTree />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
