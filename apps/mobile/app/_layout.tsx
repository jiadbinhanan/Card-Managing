import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CedarColors } from '@credics/core';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  // 1. Initial Session Restoration & Auth Listener
  useEffect(() => {
    let isMounted = true;

    // Restore persisted session from AsyncStorage
    supabase.auth.getSession().then(({ data }: any) => {
      if (!isMounted) return;
      setSession(data?.session ?? null);
      setInitialized(true);
    });

    // Listen for explicit SIGNED_IN / SIGNED_OUT transitions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, currentSession: any) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (currentSession) {
          setSession(currentSession);
          setInitialized(true);
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

  // 2. Fresh Route Protection Guard
  useEffect(() => {
    if (!initialized) return;

    const inLoginScreen = segments[0] === 'login';

    if (!session && !inLoginScreen) {
      router.replace('/login');
    } else if (session && inLoginScreen) {
      router.replace('/(tabs)');
    }
  }, [session, initialized, segments]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: CedarColors.canvas, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={CedarColors.forest800} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: CedarColors.canvas }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={CedarColors.canvas} translucent={false} />
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

